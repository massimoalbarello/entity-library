#pragma once
#include "db.h"
#include "hnswlib/hnswlib.h"
#include "model.h"
#include <filesystem>
#include <map>
#include <memory>
constexpr size_t MAX_VIEWS = 10000;
struct ViewInfo {
  int64_t photo;
  int region;
};
class SearchIndex {
  hnswlib::InnerProductSpace space{MODEL["dimensions"].get<size_t>()};
  std::unique_ptr<hnswlib::HierarchicalNSW<float>> graph;

public:
  std::map<int64_t, ViewInfo> views;
  SearchIndex() { reset(); }
  void reset() {
    graph = std::make_unique<hnswlib::HierarchicalNSW<float>>(&space, 1024, 16,
                                                              120, 42);
    graph->setEf(160);
    views.clear();
  }
  void add(int64_t id, const Vector &v, ViewInfo info) {
    validate_vector(v);
    if (views.size() >= MAX_VIEWS)
      throw std::runtime_error("This instance supports 2,000 photos. Remove a "
                               "photo before adding more.");
    if (graph->cur_element_count >= graph->max_elements_)
      graph->resizeIndex(std::min(MAX_VIEWS, graph->max_elements_ * 2));
    graph->addPoint(v.data(), id);
    views[id] = info;
  }
  void load(DB &db) {
    reset();
    DB::Stmt st(db,
                "SELECT v.id,v.photo_id,v.region,e.vector FROM views v JOIN "
                "embeddings e ON e.view_id=v.id ORDER BY v.id",
                json::array());
    while (st.step() == SQLITE_ROW) {
      Vector v(MODEL["dimensions"].get<size_t>());
      if (sqlite3_column_bytes(st.s, 3) != int(v.size() * sizeof(float)))
        throw std::runtime_error("Stored vector dimension mismatch");
      std::memcpy(v.data(), sqlite3_column_blob(st.s, 3),
                  v.size() * sizeof(float));
      add(sqlite3_column_int64(st.s, 0), v,
          {sqlite3_column_int64(st.s, 1), sqlite3_column_int(st.s, 2)});
    }
  }
  json search(const Vector &query) {
    std::map<int64_t, std::pair<float, int64_t>> scores;
    if (views.empty())
      return json::array();
    auto hits =
        graph->searchKnn(query.data(), std::min<size_t>(200, views.size()));
    while (!hits.empty()) {
      auto [d, id] = hits.top();
      hits.pop();
      auto it = views.find(id);
      if (it == views.end())
        continue;
      float score = (1 - d) * (it->second.region ? 0.98f : 1.f);
      auto existing = scores.find(it->second.photo);
      if (existing == scores.end() || score > existing->second.first)
        scores[it->second.photo] = {score, int64_t(id)};
    }
    std::vector<std::pair<int64_t, std::pair<float, int64_t>>> ordered(
        scores.begin(), scores.end());
    std::sort(ordered.begin(), ordered.end(),
              [](auto &a, auto &b) { return a.second.first > b.second.first; });
    json rows = json::array();
    for (auto &[photo, result] : ordered) {
      if (result.first < .18f || rows.size() >= 60)
        break;
      rows.push_back(
          {{"id", photo}, {"score", result.first}, {"view_id", result.second}});
    }
    return rows;
  }
};
