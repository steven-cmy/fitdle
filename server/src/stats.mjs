import { now, statement } from './db.mjs';
import { shiftDateKey } from '../../js/game.js';

function ensureStat(targetKillId, gameplay, mode) {
  statement(`INSERT INTO target_stats(target_kill_id, gameplay, mode, exposures, runs, wins, losses, attempts_sum, duration_sum, rounds_sum, guesses, correct, updated_at)
    VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)
    ON CONFLICT(target_kill_id, gameplay, mode) DO NOTHING`)
    .run(Number(targetKillId), gameplay, mode, now());
}

export function recordExposure({ source, mode, gameplay, targetKillId, targetShipId, gameDay }) {
  const t = now();
  statement(`INSERT INTO target_exposures(source, mode, gameplay, target_kill_id, target_ship_id, game_day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(source, mode, gameplay, Number(targetKillId), Number(targetShipId), gameDay, t);
  ensureStat(targetKillId, gameplay, mode);
  statement(`UPDATE target_stats SET exposures = exposures + 1, updated_at = ?
    WHERE target_kill_id = ? AND gameplay = ? AND mode = ?`)
    .run(t, Number(targetKillId), gameplay, mode);
}

export function recordRunFinish(run) {
  const t = now();
  const mode = 'online';
  ensureStat(run.target_kill_id, run.gameplay, mode);
  const won = run.status === 'won' ? 1 : 0;
  statement(`UPDATE target_stats SET
      runs = runs + 1,
      wins = wins + ?,
      losses = losses + ?,
      attempts_sum = attempts_sum + ?,
      duration_sum = duration_sum + ?,
      updated_at = ?
    WHERE target_kill_id = ? AND gameplay = ? AND mode = ?`)
    .run(won, won ? 0 : 1, Number(run.attempts) || 0, Number(run.elapsed_ms) || 0, t,
      Number(run.target_kill_id), run.gameplay, mode);
}

export function recordArbitrationRound({ matchId, round, dealerNameKey, published, guesses, correct, dealerScore }) {
  statement(`INSERT INTO arbitration_rounds(match_id, round, dealer_name_key, published_json, guesses, correct, dealer_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(matchId, Number(round), dealerNameKey, JSON.stringify(published), Number(guesses) || 0,
      Number(correct) || 0, Number(dealerScore) || 0, now());
}

export function recordRoomMatch({ id, roomCode, rule, targetKillId, targetShipId, result }) {
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
