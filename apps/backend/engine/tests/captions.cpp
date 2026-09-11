#include "captions.h"
#include <iostream>
void require(bool v, const char *message) { if (!v) throw std::runtime_error(message); }
int main() {
  DB db(":memory:");
  // Existing libraries acquire derived annotations without replacing originals or vectors.
  db.exec("CREATE TABLE photos(id INTEGER PRIMARY KEY, original TEXT); INSERT INTO photos VALUES(1,'original.jpg'),(2,'riders.jpg');");
  migrate_captions(db);
  require(db.query("SELECT * FROM descriptions").size()==2,"backfill existing photos");
  db.run("UPDATE descriptions SET caption=?,status='ready',manual=1 WHERE photo_id=1",
    {"A black phone rests on stacked silver laptops."});
  db.run("UPDATE descriptions SET caption=?,status='ready' WHERE photo_id=2", {"Two riders sit on horses in a field."});
  auto search = [&](std::string q) {
    return db.query("SELECT rowid FROM scene_fts WHERE scene_fts MATCH ? ORDER BY bm25(scene_fts)", {scene_query(q)});
  };
  require(search("phone").size()==1,"physical phone is searchable");
  auto people=search("person");
  require(people.size()==1 && people[0]["rowid"]==2,"person search matches riders, not the phone description");
  require(search("phone horse").empty(),"all meaningful query terms required");
  require(search("phone OR horse").empty(),"query operators treated literally");
  require(scene_query("the image of a").empty(),"stopword-only query safe");
  // A late automatic result must not overwrite a correction made while inference runs.
  db.run("UPDATE descriptions SET caption='wrong' WHERE photo_id=1 AND manual=0 AND status='processing'");
  require(search("laptops").size()==1,"manual correction retained");
  migrate_captions(db);
  require(search("laptops").size()==1,"restart preserves searchable annotation");
  require(db.query("SELECT original FROM photos WHERE id=1")[0]["original"]=="original.jpg","original preserved");
  db.run("DELETE FROM photos WHERE id=1");
  require(search("phone").empty(),"cascade removes description search entry");
  require(db.query("SELECT * FROM descriptions").size()==1,"cascade removes derived annotation");
  require(short_caption("\n A dog lies beside a bicycle. Extra unsupported details.") == "A dog lies beside a bicycle.","only complete first sentence indexed");
  require(short_caption("A picture of a small white dog on green grass.") == "A small white dog on green grass.", "picture preamble removed");
  require(short_caption("In this image, there is a young blonde man wearing a black T-shirt.") == "A young blonde man wearing a black T-shirt.", "nested preambles removed");
  require(short_caption("The photograph shows green grass with white flowers.") == "Green grass with white flowers.", "direct description retains adjectives");
  require(short_caption("A phone displaying a picture of a dog rests on a desk.") == "A phone displaying a picture of a dog rests on a desk.", "meaningful screen relationship retained");
  // Upgrade the actual former two-field schema, preserving manual edits and vectors.
  DB old(":memory:");
  old.exec("CREATE TABLE photos(id INTEGER PRIMARY KEY, original TEXT); INSERT INTO photos VALUES(1,'original.jpg'),(2,'auto.jpg');"
    "CREATE TABLE embeddings(view_id INTEGER PRIMARY KEY, vector BLOB); INSERT INTO embeddings VALUES(1,X'012345');"
    "CREATE TABLE descriptions(photo_id INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE, model_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'queued', caption TEXT NOT NULL DEFAULT '', depicted TEXT NOT NULL DEFAULT '', manual INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '');"
    "INSERT INTO descriptions VALUES(1,'old','ready','A black phone.','A person appears on its screen.',1,''),(2,'old','ready','A picture of a cat.','',0,'');"
    "CREATE VIRTUAL TABLE scene_fts USING fts5(caption,depicted,tokenize='porter unicode61');"
    "CREATE TRIGGER description_update AFTER UPDATE ON descriptions BEGIN DELETE FROM scene_fts WHERE rowid=old.photo_id; INSERT INTO scene_fts(rowid,caption,depicted) VALUES(new.photo_id,new.caption,new.depicted); END;");
  migrate_captions(old);
  require(old.query("SELECT caption FROM descriptions WHERE photo_id=1")[0]["caption"] == "A black phone. A person appears on its screen.", "both manual fields retained in one description");
  require(old.query("SELECT rowid FROM scene_fts WHERE scene_fts MATCH ?", {scene_query("person phone")}).size()==1, "merged manual text indexed");
  require(old.query("SELECT status FROM descriptions WHERE photo_id=2")[0]["status"]=="queued", "old automatic captions regenerate");
  old.exec("UPDATE descriptions SET status='ready',caption='A small white cat.',model_id='direct-v2' WHERE photo_id=2;");
  migrate_captions(old);
  require(old.query("SELECT status FROM descriptions WHERE photo_id=2")[0]["status"]=="ready", "restart does not regenerate again");
  require(old.query("SELECT rowid FROM scene_fts WHERE scene_fts MATCH ?", {scene_query("small white cat")}).size()==1, "adjectives searchable");
  require(old.query("SELECT hex(vector) AS value FROM embeddings")[0]["value"]=="012345", "embeddings unchanged by migration");
  require(old.query("SELECT original FROM photos WHERE id=1")[0]["original"]=="original.jpg", "legacy original preserved");
  for (const auto &column : old.query("PRAGMA table_info(descriptions)")) require(column["name"]!="depicted", "second field removed");
  require(short_caption("This is a photo of a small brown dog.") == "A small brown dog.", "nested photo opening removed");
  bool rejected=false;
  try { short_caption("A dog lies beside a"); } catch (...) { rejected=true; }
  require(rejected,"unfinished text rejected");
  std::cout << "Caption migration and scene search passed\n";
}
