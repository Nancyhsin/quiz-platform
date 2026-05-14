// SQLite database setup and helpers
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'quiz.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS activities (
  activity_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_name TEXT NOT NULL,
  start_date   TEXT,
  end_date     TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS question_sets (
  set_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id  INTEGER NOT NULL,
  day_label    TEXT,
  set_name     TEXT,
  sort_order   INTEGER DEFAULT 0,
  FOREIGN KEY (activity_id) REFERENCES activities(activity_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
  question_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id          INTEGER NOT NULL,
  question_no     INTEGER,
  question_type   TEXT DEFAULT 'single',
  question_text   TEXT,
  option_a        TEXT,
  option_b        TEXT,
  option_c        TEXT,
  option_d        TEXT,
  correct_answer  TEXT,
  explanation     TEXT,
  base_score      INTEGER DEFAULT 1000,
  time_limit_sec  INTEGER DEFAULT 20,
  FOREIGN KEY (set_id) REFERENCES question_sets(set_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT PRIMARY KEY,
  activity_id   INTEGER NOT NULL,
  status        TEXT DEFAULT 'waiting',
  current_set_id    INTEGER,
  current_question_id INTEGER,
  question_phase TEXT DEFAULT 'idle', -- idle / question / reveal / explain / leaderboard
  question_started_at INTEGER,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (activity_id) REFERENCES activities(activity_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS players (
  player_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  nickname      TEXT NOT NULL,
  department    TEXT,
  joined_at     TEXT DEFAULT (datetime('now')),
  last_seen_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, employee_id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS answers (
  answer_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT NOT NULL,
  player_id      INTEGER NOT NULL,
  question_id    INTEGER NOT NULL,
  set_id         INTEGER NOT NULL,
  day_label      TEXT,
  selected_answer TEXT,
  is_correct     INTEGER DEFAULT 0,
  response_ms    INTEGER,
  score          INTEGER DEFAULT 0,
  answered_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, player_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_player  ON answers(player_id);
CREATE INDEX IF NOT EXISTS idx_players_session ON players(session_id);
CREATE INDEX IF NOT EXISTS idx_qs_activity     ON question_sets(activity_id);
CREATE INDEX IF NOT EXISTS idx_q_set           ON questions(set_id);
`);

module.exports = db;
