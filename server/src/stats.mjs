import { db, now, statement } from './db.mjs';
import { shiftDateKey } from '../../js/game.js';

const DIFFICULTY_GAMEPLAYS = new Set(['daily', 'standard', 'audit', 'timed', 'arbitration']);
const DIFFICULTY_OUTCOMES = new Set(['won', 'lost', 'abandoned']);

/**
 * Count one finished play of a killmail in the anonymous difficulty tables.
 * outcome: won, lost (out of guesses, gave up or ran out of time) or abandoned
 * (took another target, left the room, or let the run expire). Nothing says who
 * played; guesses and time are only added up over won plays.
 */
export function recordPlay(play) {
  recordPlays([play]);
}

/** Several plays in one transaction: one disk sync instead of two per play. */
export function recordPlays(list) {
  const rows = list.map(normalizePlay).filter(Boolean);
  if (!rows.length) return;
  // Statistics are best effort: a full disk or a locked database must never
  // stop a round, so a failure is logged without any ids and the plays are lost.
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) addPlay(row);
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw error;
    }
  } catch (error) {
    console.warn(`difficulty statistics were not written: ${error.code || error.message}`);
  }
}

function normalizePlay({
  killId, shipId, gameplay, outcome, attempts = 0, elapsedMs = 0, plays = 1,
}) {
  const kill = Number(killId);
  const ship = Number(shipId);
  const count = Math.floor(Number(plays));
  if (!Number.isSafeInteger(kill) || kill <= 0 || !Number.isSafeInteger(ship) || ship <= 0) return null;
  if (!DIFFICULTY_GAMEPLAYS.has(gameplay) || !DIFFICULTY_OUTCOMES.has(outcome) || !(count > 0)) return null;
  const won = outcome === 'won' ? count : 0;
  const lost = outcome === 'lost' ? count : 0;
  const abandoned = outcome === 'abandoned' ? count : 0;
  const guesses = won ? Math.max(0, Math.floor(Number(attempts) || 0)) * won : 0;
  // Only a timed round measures time; elsewhere the figure would mean nothing.
  const ms = won && gameplay === 'timed' ? Math.max(0, Math.floor(Number(elapsedMs) || 0)) * won : 0;
  return { kill, ship, gameplay, won, lost, abandoned, guesses, ms };
}

function addPlay({
  kill, ship, gameplay, won, lost, abandoned, guesses, ms,
}) {
  const t = now();
  // Whole days only: an exact time could be matched against other logs.
  const day = Math.floor(t / 86400000) * 86400000;
  statement(`INSERT INTO kill_difficulty(kill_id, gameplay, ship_id, won, lost, abandoned, won_guesses_sum, won_ms_sum, first_at, last_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(kill_id, gameplay) DO UPDATE SET
      won = won + excluded.won, lost = lost + excluded.lost, abandoned = abandoned + excluded.abandoned,
      won_guesses_sum = won_guesses_sum + excluded.won_guesses_sum,
      won_ms_sum = won_ms_sum + excluded.won_ms_sum, last_at = excluded.last_at`)
    .run(kill, gameplay, ship, won, lost, abandoned, guesses, ms, day, day);
  statement(`INSERT INTO ship_difficulty(ship_id, gameplay, won, lost, abandoned, won_guesses_sum, won_ms_sum, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ship_id, gameplay) DO UPDATE SET
      won = won + excluded.won, lost = lost + excluded.lost, abandoned = abandoned + excluded.abandoned,
      won_guesses_sum = won_guesses_sum + excluded.won_guesses_sum,
      won_ms_sum = won_ms_sum + excluded.won_ms_sum, updated_at = excluded.updated_at`)
    .run(ship, gameplay, won, lost, abandoned, guesses, ms, t);
}

export function recordArbitrationRound({
  matchId, round, dealerNameKey, published, guesses, correct, dealerScore, publishedShare = 0, unsolved = 0,
}) {
  try {
    insertArbitrationRound({
      matchId, round, dealerNameKey, published, guesses, correct, dealerScore, publishedShare, unsolved,
    });
  } catch (error) {
    console.warn(`arbitration statistics were not written: ${error.code || error.message}`);
  }
}

function insertArbitrationRound({
  matchId, round, dealerNameKey, published, guesses, correct, dealerScore, publishedShare, unsolved,
}) {
  statement(`INSERT INTO arbitration_rounds(match_id, round, dealer_name_key, published_json, guesses, correct, dealer_score, published_share, unsolved, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(matchId, Number(round), dealerNameKey, JSON.stringify(published), Number(guesses) || 0,
      Number(correct) || 0, Number(dealerScore) || 0, Number(publishedShare) || 0, Number(unsolved) || 0, now());
}

export function recordRoomMatch({ id, roomCode, rule, targetKillId, targetShipId, result }) {
  try {
    insertRoomMatch({ id, roomCode, rule, targetKillId, targetShipId, result });
  } catch (error) {
    console.warn(`room match statistics were not written: ${error.code || error.message}`);
  }
}

function insertRoomMatch({ id, roomCode, rule, targetKillId, targetShipId, result }) {
  statement(`INSERT INTO room_matches(id, room_code, rule, target_kill_id, target_ship_id, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, roomCode, rule, Number(targetKillId) || null, Number(targetShipId) || null,
      JSON.stringify(result || {}), now());
}

/**
 * The only login-profile record: daily wins, consecutive winning game days,
 * and the current winning streak in each non-arbitration gameplay.
 */
export function profileStats(nameKey, gameDay) {
  const key = String(nameKey || '');
  const dailyWins = Number(statement(`SELECT COUNT(*) AS count FROM online_runs
    WHERE name_key = ? AND kind = 'daily' AND status = 'won'`).get(key)?.count || 0);
  const winDays = statement(`SELECT DISTINCT game_day FROM online_runs
    WHERE name_key = ? AND status = 'won' AND kind != 'custom' ORDER BY game_day DESC`).all(key)
    .map((row) => String(row.game_day))
    .filter(Boolean);
  const today = String(gameDay || '');
  const yesterday = today ? shiftDateKey(today, -1) : '';
  let winStreak = 0;
  if (winDays.length) {
    const latest = winDays[0];
    if (!today || latest === today || latest === yesterday) {
      let expected = latest;
      for (const day of winDays) {
        if (day !== expected) break;
        winStreak += 1;
        expected = shiftDateKey(expected, -1);
      }
    }
  }
  const streaks = {};
  for (const gameplay of ['standard', 'audit', 'timed']) {
    // Wins since the last loss; the history before it is not read.
    const loss = statement(`SELECT finished_at, started_at FROM online_runs
      WHERE name_key = ? AND gameplay = ? AND status = 'lost' AND kind != 'custom'
      ORDER BY finished_at DESC, started_at DESC LIMIT 1`).get(key, gameplay);
    streaks[gameplay] = Number(statement(`SELECT COUNT(*) AS count FROM online_runs
      WHERE name_key = ? AND gameplay = ? AND status = 'won' AND kind != 'custom'
        AND (finished_at, started_at) > (?, ?)`)
      .get(key, gameplay, loss?.finished_at ?? -1, loss?.started_at ?? -1).count);
  }
  return { dailyWins, winStreak, streaks };
}
