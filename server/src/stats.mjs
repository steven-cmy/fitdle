import { db, now } from './db.mjs';

function ensureStat(targetKillId, gameplay, mode) {
  db.prepare(`INSERT INTO target_stats(target_kill_id, gameplay, mode, exposures, runs, wins, losses, attempts_sum, duration_sum, rounds_sum, guesses, correct, updated_at)
    VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)
    ON CONFLICT(target_kill_id, gameplay, mode) DO NOTHING`)
    .run(Number(targetKillId), gameplay, mode, now());
}

export function recordExposure({ source, mode, gameplay, targetKillId, targetShipId, gameDay }) {
  const t = now();
  db.prepare(`INSERT INTO target_exposures(source, mode, gameplay, target_kill_id, target_ship_id, game_day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(source, mode, gameplay, Number(targetKillId), Number(targetShipId), gameDay, t);
  ensureStat(targetKillId, gameplay, mode);
  db.prepare(`UPDATE target_stats SET exposures = exposures + 1, updated_at = ?
    WHERE target_kill_id = ? AND gameplay = ? AND mode = ?`)
    .run(t, Number(targetKillId), gameplay, mode);
}

export function recordRunFinish(run) {
  const t = now();
  const mode = 'online';
  ensureStat(run.target_kill_id, run.gameplay, mode);
  const won = run.status === 'won' ? 1 : 0;
  db.prepare(`UPDATE target_stats SET
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
  db.prepare(`INSERT INTO arbitration_rounds(match_id, round, dealer_name_key, published_json, guesses, correct, dealer_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(matchId, Number(round), dealerNameKey, JSON.stringify(published), Number(guesses) || 0,
      Number(correct) || 0, Number(dealerScore) || 0, now());
}

export function recordRoomMatch({ id, roomCode, rule, targetKillId, targetShipId, result }) {
  db.prepare(`INSERT INTO room_matches(id, room_code, rule, target_kill_id, target_ship_id, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, roomCode, rule, Number(targetKillId) || null, Number(targetShipId) || null,
      JSON.stringify(result || {}), now());
}
