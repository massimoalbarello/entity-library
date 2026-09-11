#pragma once
#include "db.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cctype>
#include <csignal>
#include <cerrno>
#include <fcntl.h>
#include <set>
#include <sstream>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>
#ifdef __linux__
#include <sys/prctl.h>
#include <malloc.h>
#endif

inline std::string short_caption(std::string text) {
  auto first = text.find_first_not_of(" \r\n\t");
  if (first == std::string::npos) throw std::runtime_error("No description generated");
  text.erase(0, first);
  // Keep the first complete sentence; never index a truncated token stream.
  auto end = text.find_first_of(".!?\n");
  if (end == std::string::npos || end > 600)
    throw std::runtime_error("Description was incomplete. Retry or write a description.");
  text.resize(end + 1);
  (void)json(text).dump();
  if (text.size() < 8) throw std::runtime_error("No useful description generated");
  return text;
}

inline std::string caption_process(const std::vector<std::string> &args) {
  std::vector<char *> argv;
  for (const auto &a : args) argv.push_back(const_cast<char *>(a.c_str()));
  argv.push_back(nullptr);
  int pipes[2];
  if (pipe(pipes)) throw std::runtime_error("Cannot start caption worker");
  int nullfd = open("/dev/null", O_RDWR);
  const auto parent = getpid();
  pid_t pid = fork();
  if (pid == 0) {
#ifdef __linux__
    prctl(PR_SET_PDEATHSIG, SIGKILL);
    if (getppid() != parent) _exit(127);
#endif
    dup2(pipes[1], STDOUT_FILENO);
    dup2(nullfd, STDERR_FILENO);
    dup2(nullfd, STDIN_FILENO);
    close(pipes[0]); close(pipes[1]); close(nullfd);
    execv(argv[0], argv.data());
    _exit(127);
  }
  close(pipes[1]); close(nullfd);
  if (pid < 0) { close(pipes[0]); throw std::runtime_error("Cannot start caption worker"); }
  fcntl(pipes[0], F_SETFL, O_NONBLOCK);
  std::string out;
  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(180);
  int status = 0;
  bool timeout = false;
  for (;;) {
    char buffer[4096];
    ssize_t n;
    while ((n = read(pipes[0], buffer, sizeof(buffer))) > 0) out.append(buffer, n);
    if (out.size() > 65536 || std::chrono::steady_clock::now() > deadline) {
      kill(pid, SIGKILL); waitpid(pid, &status, 0); timeout = true; break;
    }
    auto done = waitpid(pid, &status, WNOHANG);
    if (done == pid) {
      while ((n = read(pipes[0], buffer, sizeof(buffer))) > 0) out.append(buffer, n);
      break;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }
  close(pipes[0]);
  if (timeout || !WIFEXITED(status) || WEXITSTATUS(status))
    throw std::runtime_error("Description generation failed. Retry or write a description.");
  return short_caption(out);
}

inline void migrate_captions(DB &db) {
  db.exec("CREATE TABLE IF NOT EXISTS descriptions(photo_id INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE, model_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'queued', caption TEXT NOT NULL DEFAULT '', depicted TEXT NOT NULL DEFAULT '', manual INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '');"
    "CREATE VIRTUAL TABLE IF NOT EXISTS scene_fts USING fts5(caption,depicted,tokenize='porter unicode61');"
    "CREATE TRIGGER IF NOT EXISTS description_delete AFTER DELETE ON descriptions BEGIN DELETE FROM scene_fts WHERE rowid=old.photo_id; END;"
    "CREATE TRIGGER IF NOT EXISTS description_update AFTER UPDATE ON descriptions BEGIN DELETE FROM scene_fts WHERE rowid=old.photo_id; INSERT INTO scene_fts(rowid,caption,depicted) SELECT new.photo_id,new.caption,new.depicted WHERE new.status='ready'; END;"
    "CREATE TRIGGER IF NOT EXISTS description_insert AFTER INSERT ON descriptions WHEN new.status='ready' BEGIN INSERT INTO scene_fts(rowid,caption,depicted) VALUES(new.photo_id,new.caption,new.depicted); END;");
  db.exec("INSERT OR IGNORE INTO descriptions(photo_id) SELECT id FROM photos; UPDATE descriptions SET status='queued' WHERE status='processing';");
}

inline std::string scene_query(const std::string &input, bool depicted) {
  if (input.size() > 960) throw std::runtime_error("Search is too long");
  // User text is always quoted, never evaluated as FTS operators.
  const std::set<std::string> stop = {"a","an","the","of","in","on","at","to","and","with","by","is","are","photo","picture","image","show","me"};
  std::vector<std::string> words;
  std::string word;
  for (unsigned char c : input + " ") {
    if (std::isalnum(c) || c >= 128) word += char(std::tolower(c));
    else if (!word.empty()) {
      if (!stop.count(word)) words.push_back(word);
      word.clear();
    }
  }
  std::string out;
  for (auto &w : words) {
    if (!out.empty()) out += " AND ";
    if (w == "person" || w == "people")
      out += "(\"person\" OR \"people\" OR \"man\" OR \"woman\" OR \"men\" OR \"women\" OR \"child\" OR \"children\" OR \"boy\" OR \"girl\" OR \"rider\")";
    else out += "\"" + w + "\"";
  }
  return out.empty() ? "" : (depicted ? "{caption depicted}: (" : "caption: (") + out + ")";
}
