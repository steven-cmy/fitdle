import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.mjs';

let db;
try {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new DatabaseSync(config.databasePath);
} catch (error) {
  throw new Error(
    `Cannot open SQLite database at ${config.databasePath}. `
    + 'Ensure DATABASE_PATH points to a writable directory (containers should use /data). '
    + error.message,
  );
}
export { db };
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  name_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  character_id INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  name_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_name ON sessions(name_key);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_pins (
  day TEXT PRIMARY KEY,
  algorithm_version TEXT NOT NULL,
  data_version TEXT NOT NULL,
  seed TEXT NOT NULL,
  ship_id INTEGER NOT NULL,
  kill_id INTEGER NOT NULL,
  kill_hash TEXT,
  killmail_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- Prepared random targets: each row is handed out once and expires.
CREATE TABLE IF NOT EXISTS target_shelf (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ship_id INTEGER NOT NULL,
  kill_id INTEGER NOT NULL,
  has_fit INTEGER NOT NULL,
  killmail_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shelf_created ON target_shelf(created_at);
CREATE TABLE IF NOT EXISTS online_runs (
  id TEXT PRIMARY KEY,
  name_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  gameplay TEXT NOT NULL,
  game_day TEXT NOT NULL,
  target_kill_id INTEGER NOT NULL,
  target_ship_id INTEGER NOT NULL,
  target_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'playing',
  attempts INTEGER NOT NULL DEFAULT 0,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  answer_id INTEGER,
  guesses_json TEXT NOT NULL DEFAULT '[]',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  begun_at INTEGER
);
CREATE INDEX IF NOT EXISTS runs_user_day ON online_runs(name_key, game_day, gameplay);
CREATE UNIQUE INDEX IF NOT EXISTS runs_daily_unique
  ON online_runs(name_key, game_day, gameplay) WHERE kind = 'daily';
CREATE INDEX IF NOT EXISTS runs_result ON online_runs(name_key, gameplay, status, finished_at);
CREATE INDEX IF NOT EXISTS runs_open ON online_runs(status, started_at) WHERE status = 'playing';
CREATE INDEX IF NOT EXISTS runs_kill ON online_runs(target_kill_id);
-- Anonymous difficulty counters (1.0.59): no player, room or run is stored.
-- gameplay is daily, standard, audit, timed or arbitration.
CREATE TABLE IF NOT EXISTS kill_difficulty (
  kill_id INTEGER NOT NULL,
  gameplay TEXT NOT NULL,
  ship_id INTEGER NOT NULL,
  won INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  abandoned INTEGER NOT NULL DEFAULT 0,
  won_guesses_sum INTEGER NOT NULL DEFAULT 0,
  won_ms_sum INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY(kill_id, gameplay)
);
CREATE INDEX IF NOT EXISTS kill_difficulty_last ON kill_difficulty(last_at);
CREATE TABLE IF NOT EXISTS ship_difficulty (
  ship_id INTEGER NOT NULL,
  gameplay TEXT NOT NULL,
  won INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  abandoned INTEGER NOT NULL DEFAULT 0,
  won_guesses_sum INTEGER NOT NULL DEFAULT 0,
  won_ms_sum INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(ship_id, gameplay)
);
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_matches (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  rule TEXT NOT NULL,
  target_kill_id INTEGER,
  target_ship_id INTEGER,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS arbitration_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  dealer_name_key TEXT NOT NULL,
  published_json TEXT NOT NULL,
  guesses INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  dealer_score INTEGER NOT NULL,
  published_share REAL NOT NULL DEFAULT 0,
  unsolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

// Added in 1.0.57; arbitration rounds of earlier releases get the share columns here.
{
  const columns = db.prepare('PRAGMA table_info(arbitration_rounds)').all().map((column) => column.name);
  if (!columns.includes('published_share')) db.exec('ALTER TABLE arbitration_rounds ADD COLUMN published_share REAL NOT NULL DEFAULT 0');
  if (!columns.includes('unsolved')) db.exec('ALTER TABLE arbitration_rounds ADD COLUMN unsolved INTEGER NOT NULL DEFAULT 0');
}

// Added in 1.0.45; databases of earlier releases get it here.
if (!db.prepare('PRAGMA table_info(online_runs)').all().some((column) => column.name === 'begun_at')) {
  db.exec('ALTER TABLE online_runs ADD COLUMN begun_at INTEGER');
}

const statements = new Map();

/** Prepare each SQL text once and reuse the compiled statement. */
export function statement(sql) {
  let prepared = statements.get(sql);
  if (!prepared) {
    prepared = db.prepare(sql);
    statements.set(sql, prepared);
  }
  return prepared;
}

export function now() {
  return Date.now();
}

export function cleanupExpired() {
  const t = now();
  statement('DELETE FROM sessions WHERE expires_at <= ?').run(t);
  statement('DELETE FROM oauth_states WHERE expires_at <= ?').run(t);
  statement('DELETE FROM rooms WHERE expires_at <= ?').run(t);
  // Per-killmail counters are only useful while a killmail can come back; the
  // per-ship totals are kept for good.
  statement('DELETE FROM kill_difficulty WHERE last_at <= ?')
    .run(t - config.statsKillRetentionDays * 86400e3);
}

export function getUser(nameKey) {
  return statement('SELECT * FROM users WHERE name_key = ?').get(nameKey) || null;
}

export function upsertUser(nameKey, displayName, characterId = null) {
  const t = now();
  const numericCharacterId = Number(characterId);
  const safeCharacterId = Number.isSafeInteger(numericCharacterId) && numericCharacterId > 0
    ? numericCharacterId
    : null;
  statement(`INSERT INTO users(name_key, display_name, character_id, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name_key) DO UPDATE SET display_name = excluded.display_name,
      character_id = COALESCE(excluded.character_id, users.character_id),
      last_login_at = excluded.last_login_at`)
    .run(nameKey, displayName, safeCharacterId, t, t);
  return getUser(nameKey);
}
