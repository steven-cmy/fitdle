import crypto from 'node:crypto';
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
  last_login_at INTEGER NOT NULL,
  owner_hash TEXT
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

// Added in 1.0.59: the service keeps the puzzle of a run and how a Timed run ended.
{
  const columns = db.prepare('PRAGMA table_info(online_runs)').all().map((column) => column.name);
  if (!columns.includes('puzzle_json')) db.exec('ALTER TABLE online_runs ADD COLUMN puzzle_json TEXT');
  if (!columns.includes('end_reason')) db.exec('ALTER TABLE online_runs ADD COLUMN end_reason TEXT');
}

// Accounts of earlier releases learn their owner hash at the next sign-in.
if (!db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'owner_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN owner_hash TEXT');
}

/** Sessions made under a longer lifetime end when the current one would have. */
export function capSessions() {
  db.prepare('UPDATE sessions SET expires_at = created_at + ? WHERE expires_at > created_at + ?')
    .run(config.sessionTtlMs, config.sessionTtlMs);
}
capSessions();

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

/**
 * Put an account and everything recorded for it under a key no sign-in can
 * reach, and end its sessions. Nothing is deleted but the sessions.
 */
function archiveAccount(nameKey) {
  const archived = `${nameKey}#${crypto.randomBytes(12).toString('hex')}`;
  statement('UPDATE users SET name_key = ? WHERE name_key = ?').run(archived, nameKey);
  statement('UPDATE online_runs SET name_key = ? WHERE name_key = ?').run(archived, nameKey);
  statement('UPDATE arbitration_rounds SET dealer_name_key = ? WHERE dealer_name_key = ?').run(archived, nameKey);
  statement('DELETE FROM sessions WHERE name_key = ?').run(nameKey);
}

/**
 * The account of a verified sign-in. The name starts over when the character
 * moved to another EVE account (another owner hash) or another character holds
 * the name now (another character ID). A value missing on either side proves
 * nothing and never replaces a stored one. `onReplace` runs before the old
 * account is archived, so that it can still finish what that account was doing.
 */
export function signInUser(nameKey, displayName, { characterId = null, ownerHash = null, onReplace = null } = {}) {
  const t = now();
  const numericCharacterId = Number(characterId);
  const safeCharacterId = Number.isSafeInteger(numericCharacterId) && numericCharacterId > 0
    ? numericCharacterId
    : null;
  const known = getUser(nameKey);
  const differs = (stored, seen) => stored != null && seen != null && stored !== seen;
  const replaced = Boolean(known) && (
    differs(known.owner_hash, ownerHash)
    || differs(known.character_id == null ? null : Number(known.character_id), safeCharacterId)
  );
  if (replaced) onReplace?.(nameKey);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (replaced) archiveAccount(nameKey);
    statement(`INSERT INTO users(name_key, display_name, character_id, owner_hash, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(name_key) DO UPDATE SET display_name = excluded.display_name,
        character_id = COALESCE(excluded.character_id, users.character_id),
        owner_hash = COALESCE(excluded.owner_hash, users.owner_hash),
        last_login_at = excluded.last_login_at`)
      .run(nameKey, displayName, safeCharacterId, ownerHash, t, t);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getUser(nameKey);
}
