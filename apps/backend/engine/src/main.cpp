#include "httplib.h"
#include "images.h"
#include "search.h"
#include <atomic>
#include <condition_variable>
#include <csignal>
#include <iostream>
#include <thread>
namespace fs = std::filesystem;
std::string env(const char *k, std::string fallback = "") {
  const char *v = std::getenv(k);
  return v && *v ? v : fallback;
}
void reply(httplib::Response &r, const json &j, int status = 200) {
  r.status = status;
  r.set_content(j.dump(), "application/json");
}
class App {
  fs::path root;
  DB db;
  std::mutex data_mutex;
  SearchIndex index;
  std::unique_ptr<Encoder> encoder;
  std::atomic<bool> stopping{false};
  std::condition_variable wake;
  std::thread worker;
  std::vector<std::pair<std::string, Vector>> labels;
  std::string token;
  httplib::Server server;
  json photo(int64_t id) {
    auto rows = db.query("SELECT * FROM photos WHERE id=?", {id});
    if (rows.empty())
      throw std::runtime_error("Photo not found");
    auto p = rows[0];
    p["tags"] = json::parse(p["tags"].get<std::string>());
    p.erase("original");
    return p;
  }
  void process(json p) {
    int64_t id = p["id"];
    try {
      auto bytes = read_file(root / p["original"].get<std::string>());
      auto im = decode_image(bytes);
      bytes.clear();
      bytes.shrink_to_fit();
      std::string thumb = "photos/" + std::to_string(id) + ".jpg";
      if (!cv::imwrite((root / thumb).string(), im,
                       {cv::IMWRITE_JPEG_QUALITY, 85}))
        throw std::runtime_error("Could not save preview");
      auto boxes = regions(im);
      std::vector<Vector> vectors;
      std::vector<std::pair<float, std::string>> tag_scores;
      {
        std::lock_guard<std::mutex> lock(encoder->mutex);
        for (auto &box : boxes)
          vectors.push_back(encoder->image(im(box)));
        for (auto &[name, v] : labels) {
          float best = -1;
          for (auto &image : vectors)
            best = std::max(best, similarity(v, image));
          tag_scores.emplace_back(best, name);
        }
      }
      int width = im.cols, height = im.rows;
      im.release();
      std::sort(tag_scores.rbegin(), tag_scores.rend());
      json tags = json::array();
      for (auto &[score, name] : tag_scores) {
        if (score < .25f || tags.size() == 3)
          break;
        tags.push_back(name);
      }
      std::lock_guard<std::mutex> lock(data_mutex);
      if (db.query("SELECT id FROM photos WHERE id=?", {id}).empty()) {
        fs::remove(root / thumb);
        return;
      }
      Transaction tx(db);
      for (size_t i = 0; i < vectors.size(); i++) {
        auto &box = boxes[i];
        auto view = db.run(
            "INSERT INTO views(photo_id,region,x,y,w,h) VALUES(?,?,?,?,?,?)",
            {id, i, double(box.x) / width, double(box.y) / height,
             double(box.width) / width, double(box.height) / height});
        db.embedding(view, vectors[i].data(), vectors[i].size());
      }
      db.run("UPDATE photos SET "
             "status='ready',error='',thumbnail=?,width=?,height=?,tags=? "
             "WHERE id=?",
             {thumb, width, height, tags.dump(), id});
      tx.commit();
      // SQLite is authoritative. Replaying the just-committed views recovers a
      // crash before this update.
      auto rows = db.query(
          "SELECT id,region FROM views WHERE photo_id=? ORDER BY region", {id});
      try {
        for (size_t i = 0; i < rows.size(); i++)
          index.add(rows[i]["id"], vectors[i], {id, rows[i]["region"]});
      } catch (...) {
        index.load(db);
        throw;
      }
    } catch (const std::exception &e) {
      std::lock_guard<std::mutex> lock(data_mutex);
      db.run("UPDATE photos SET status='error',error=? WHERE id=? AND "
             "status!='ready'",
             {std::string(e.what()).substr(0, 300), id});
      std::cerr << "Photo " << id << ": " << e.what() << "\n";
    }
  }
  void run() {
    while (!stopping) {
      json p;
      {
        std::unique_lock<std::mutex> lock(data_mutex);
        auto rows = db.query(
            "SELECT * FROM photos WHERE status='queued' ORDER BY id LIMIT 1");
        if (rows.empty()) {
          wake.wait_for(lock, std::chrono::milliseconds(500));
          continue;
        }
        p = rows[0];
        db.run("UPDATE photos SET status='processing' WHERE id=?", {p["id"]});
      }
      process(p);
    }
  }

public:
  explicit App(fs::path dir)
      : root(dir), db((dir / "library.sqlite").string()),
        token(env("ENTITY_CORE_TOKEN")) {
    if (token.size() < 32)
      throw std::runtime_error("Start through the authenticated gateway");
    for (auto name : {"originals", "photos"})
      fs::create_directories(root / name);
    cv::setNumThreads(1);
    db.exec(
        "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT "
        "NOT NULL); CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY "
        "AUTOINCREMENT,filename TEXT NOT NULL,original TEXT NOT NULL,thumbnail "
        "TEXT NOT NULL DEFAULT '',bytes INTEGER NOT NULL,status TEXT NOT NULL "
        "DEFAULT 'queued',error TEXT NOT NULL DEFAULT '',width INTEGER NOT "
        "NULL DEFAULT 0,height INTEGER NOT NULL DEFAULT 0,tags TEXT NOT NULL "
        "DEFAULT '[]'); CREATE TABLE IF NOT EXISTS views(id INTEGER PRIMARY "
        "KEY AUTOINCREMENT,photo_id INTEGER NOT NULL REFERENCES photos(id) ON "
        "DELETE CASCADE,region INTEGER NOT NULL,x REAL,y REAL,w REAL,h "
        "REAL,UNIQUE(photo_id,region)); CREATE TABLE IF NOT EXISTS "
        "embeddings(view_id INTEGER PRIMARY KEY REFERENCES views(id) ON DELETE "
        "CASCADE,vector BLOB NOT NULL); CREATE INDEX IF NOT EXISTS views_photo "
        "ON views(photo_id);");
    auto saved =
        db.query("SELECT value FROM settings WHERE key='embedding_space'");
    if (saved.empty())
      db.run("INSERT INTO settings VALUES('embedding_space',?)",
             {MODEL["space"]});
    else if (saved[0]["value"] != MODEL["space"])
      throw std::runtime_error(
          "This library uses another embedding model. Reindexing must be "
          "explicitly implemented before switching models.");
    db.run("UPDATE photos SET status='queued' WHERE status='processing'");
    index.load(db);
    encoder = std::make_unique<Encoder>(env("MODEL_FILE"));
    for (auto &l : json::parse(read_file(env("LABELS_FILE"))))
      labels.emplace_back(
          l["label"], encoder->text(l["tokens"].get<std::vector<int32_t>>()));
    server.set_payload_max_length(12 * 1024 * 1024);
    server.set_read_timeout(30);
    server.set_write_timeout(60);
    server.new_task_queue = [] { return new httplib::ThreadPool(3); };
    server.set_pre_routing_handler([this](const auto &q, auto &r) {
      if (q.get_header_value("Authorization") != "Bearer " + token) {
        reply(r, {{"error", "Unauthorized"}}, 401);
        return httplib::Server::HandlerResponse::Handled;
      }
      return httplib::Server::HandlerResponse::Unhandled;
    });
    server.set_exception_handler(
        [](const auto &, auto &r, std::exception_ptr ep) {
          try {
            if (ep)
              std::rethrow_exception(ep);
          } catch (const std::exception &e) {
            reply(r, {{"error", e.what()}}, 400);
          }
        });
    server.Get("/health",
               [](const auto &, auto &r) { reply(r, {{"ok", true}}); });
    server.Get("/api/status", [this](const auto &, auto &r) {
      std::lock_guard<std::mutex> lock(data_mutex);
      auto counts = db.query(
          "SELECT count(*) photos,coalesce(sum(status='ready'),0) "
          "ready,coalesce(sum(status IN ('queued','processing')),0) "
          "queued,coalesce(sum(status='error'),0) failed FROM photos")[0];
      counts["model"] = {{"phase", "ready"}, {"id", MODEL["id"]}};
      reply(r, counts);
    });
    server.Get("/api/photos", [this](const auto &q, auto &r) {
      std::lock_guard<std::mutex> lock(data_mutex);
      int64_t before = INT64_MAX;
      if (q.has_param("before"))
        before = std::stoll(q.get_param_value("before"));
      auto rows =
          db.query("SELECT id FROM photos WHERE id<? ORDER BY id DESC LIMIT 60",
                   {before});
      json out = json::array();
      for (auto &row : rows)
        out.push_back(photo(row["id"]));
      reply(r, {{"photos", out}});
    });
    server.Get(R"(/api/photos/(\d+))", [this](const auto &q, auto &r) {
      std::lock_guard<std::mutex> lock(data_mutex);
      auto id = std::stoll(q.matches[1]);
      auto p = photo(id);
      p["views"] = db.query("SELECT id,region,x,y,w,h FROM views WHERE "
                            "photo_id=? ORDER BY region",
                            {id});
      reply(r, p);
    });
    server.Post("/api/photos", [this](const auto &q, auto &r) {
      if (q.body.empty() || q.body.size() > 12 * 1024 * 1024)
        throw std::runtime_error("Choose an image smaller than 12 MiB");
      if (q.get_header_value("Content-Type") != "image/jpeg" &&
          q.get_header_value("Content-Type") != "image/png")
        throw std::runtime_error("Use JPEG or PNG");
      std::lock_guard<std::mutex> lock(data_mutex);
      if (db.query("SELECT count(*) n FROM photos")[0]["n"].get<int>() >= 2000)
        throw std::runtime_error("This instance supports 2,000 photos");
      if (fs::space(root).available < q.body.size() + 128 * 1024 * 1024)
        throw std::runtime_error(
            "The photo library is running out of disk space");
      auto name =
          q.has_param("filename") ? q.get_param_value("filename") : "Photo";
      if (name.size() > 240) {
        size_t end = 240;
        while (end && (static_cast<unsigned char>(name[end]) & 0xc0) == 0x80)
          --end;
        name.resize(end);
      }
      // Reject invalid UTF-8 before committing an unreadable filename.
      (void)json(name).dump();
      Transaction tx(db);
      auto id =
          db.run("INSERT INTO photos(filename,original,bytes) VALUES(?,'',?)",
                 {name, q.body.size()});
      std::string path =
          "originals/" + std::to_string(id) +
          (q.get_header_value("Content-Type") == "image/png" ? ".png" : ".jpg");
      try {
        std::ofstream out(root / path, std::ios::binary);
        out.write(q.body.data(), q.body.size());
        out.close();
        if (!out)
          throw std::runtime_error("Could not save photo");
        db.run("UPDATE photos SET original=? WHERE id=?", {path, id});
        tx.commit();
      } catch (...) {
        fs::remove(root / path);
        throw;
      }
      wake.notify_one();
      reply(r, {{"id", id}}, 201);
    });
    server.Post(R"(/api/photos/(\d+)/retry)", [this](const auto &q, auto &r) {
      std::lock_guard<std::mutex> lock(data_mutex);
      db.run("UPDATE photos SET status='queued',error='' WHERE id=? AND "
             "status='error'",
             {std::stoll(q.matches[1])});
      wake.notify_one();
      reply(r, {{"ok", true}});
    });
    server.Delete(R"(/api/photos/(\d+))", [this](const auto &q, auto &r) {
      std::lock_guard<std::mutex> lock(data_mutex);
      auto id = std::stoll(q.matches[1]);
      auto rows =
          db.query("SELECT original,thumbnail FROM photos WHERE id=?", {id});
      if (rows.empty()) {
        reply(r, {{"error", "Photo not found"}}, 404);
        return;
      }
      db.run("DELETE FROM photos WHERE id=?", {id});
      index.load(db);
      for (auto name : {"original", "thumbnail"}) {
        auto path = rows[0][name].template get<std::string>();
        if (!path.empty())
          fs::remove(root / path);
      }
      reply(r, {{"ok", true}});
    });
    server.Post("/api/search", [this](const auto &q, auto &r) {
      auto request = json::parse(q.body);
      if (request["space"] != MODEL["space"])
        throw std::runtime_error("Embedding space mismatch");
      Vector v;
      {
        std::lock_guard<std::mutex> lock(encoder->mutex);
        v = encoder->text(
            request["tokens"].template get<std::vector<int32_t>>());
      }
      std::lock_guard<std::mutex> lock(data_mutex);
      auto hits = index.search(v);
      json rows = json::array();
      for (auto &hit : hits) {
        auto p = photo(hit["id"]);
        p["score"] = hit["score"];
        auto region = db.query("SELECT x,y,w,h,region FROM views WHERE id=?",
                               {hit["view_id"]});
        if (!region.empty())
          p["match"] = region[0];
        rows.push_back(p);
      }
      reply(r, {{"photos", rows}});
    });
    server.Get(R"(/assets/(photos|originals)/(\d+))", [this](const auto &q,
                                                             auto &r) {
      std::string path, name;
      {
        std::lock_guard<std::mutex> lock(data_mutex);
        auto rows = db.query(
            "SELECT original,thumbnail,filename FROM photos WHERE id=?",
            {std::stoll(q.matches[2])});
        if (rows.empty()) {
          reply(r, {{"error", "Photo not found"}}, 404);
          return;
        }
        path = rows[0][q.matches[1] == "photos" ? "thumbnail" : "original"]
                   .template get<std::string>();
      }
      if (path.empty() || !fs::exists(root / path)) {
        reply(r, {{"error", "Preview is preparing"}}, 404);
        return;
      }
      r.set_file_content((root / path).string(),
                         path.ends_with(".png") ? "image/png" : "image/jpeg");
    });
    worker = std::thread([this] { run(); });
  }
  ~App() {
    stopping = true;
    wake.notify_all();
    if (worker.joinable())
      worker.join();
  }
  void serve(int port) {
    if (!server.listen("127.0.0.1", port))
      throw std::runtime_error("Cannot bind private engine port");
  }
};
int main() {
  try {
    auto root = fs::path(env("NIBRUN_DATA_DIR", env("DATA_DIR", "./data")));
    fs::create_directories(root);
    App app(root);
    app.serve(std::stoi(env("ENTITY_CORE_PORT", "3001")));
  } catch (const std::exception &e) {
    std::cerr << e.what() << "\n";
    return 1;
  }
}
