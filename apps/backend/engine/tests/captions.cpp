#include "captions.h"
#include <iostream>
void require(bool v, const char *message) { if (!v) throw std::runtime_error(message); }
int main() {
  DB db(":memory:");
  // Existing libraries acquire derived annotations without replacing originals or vectors.
  db.exec("CREATE TABLE photos(id INTEGER PRIMARY KEY, original TEXT); INSERT INTO photos VALUES(1,'original.jpg'),(2,'riders.jpg');");
  migrate_captions(db);
  require(db.query("SELECT * FROM descriptions").size()==2,"backfill existing photos");
  db.run("UPDATE descriptions SET caption=?,depicted=?,status='ready',manual=1 WHERE photo_id=1",
    {"A phone rests on stacked laptops.", "A person appears on the phone screen."});
  db.run("UPDATE descriptions SET caption=?,status='ready' WHERE photo_id=2", {"Two riders sit on horses in a field."});
  auto search = [&](std::string q, bool depicted=false) {
    return db.query("SELECT rowid FROM scene_fts WHERE scene_fts MATCH ? ORDER BY bm25(scene_fts)", {scene_query(q, depicted)});
  };
  require(search("phone").size()==1,"physical phone is searchable");
  auto people=search("person");
  require(people.size()==1 && people[0]["rowid"]==2,"depicted person excluded; physical riders included");
  require(search("person on a phone screen",true).size()==1,"explicit depicted-content search");
  require(search("phone horse").empty(),"all meaningful query terms required");
  require(search("phone OR horse").empty(),"query operators treated literally");
  require(scene_query("the image of a",false).empty(),"stopword-only query safe");
  // A late automatic result must not overwrite a correction made while inference runs.
  db.run("UPDATE descriptions SET caption='wrong' WHERE photo_id=1 AND manual=0 AND status='processing'");
  require(search("laptops").size()==1,"manual correction retained");
  migrate_captions(db);
  require(search("laptops").size()==1,"restart preserves searchable annotation");
  require(db.query("SELECT original FROM photos WHERE id=1")[0]["original"]=="original.jpg","original preserved");
  db.run("DELETE FROM photos WHERE id=1");
  require(search("phone",true).empty(),"cascade removes both FTS fields");
  require(db.query("SELECT * FROM descriptions").size()==1,"cascade removes derived annotation");
  require(short_caption("\n A dog lies beside a bicycle. Extra unsupported details.") == "A dog lies beside a bicycle.","only complete first sentence indexed");
  bool rejected=false;
  try { short_caption("A dog lies beside a"); } catch (...) { rejected=true; }
  require(rejected,"unfinished text rejected");
  std::cout << "Caption migration and scene search passed\n";
}
