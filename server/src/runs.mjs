import crypto from 'node:crypto';
import { gameDateKey, killHasFittedModules, msUntilNextDowntime } from '../../js/game.js';
import { config } from './config.mjs';
import { getSessionUser } from './auth.mjs';
import { now, statement } from './db.mjs';
import { withinLimit } from './limits.mjs';
import { getDailyTarget, getRandomTarget, TargetUnavailable } from './targets.mjs';
import { recordPlay, profileStats } from './stats.mjs';
import {
  boardView, buildPuzzle, guessFeedback, markShown, parsePuzzle, releasedClues, TIMED_RELEASE_MS, timedExhaustedAt,
} from './puzzle.mjs';
import { RUN_PROTOCOL_HEADER, RUN_PROTOCOL_VERSION } from '../../js/run-sync.js';

const GAMEPLAYS = new Set(['standard', 'audit', 'timed']);
const ATTEMPT_LIMIT = 6;
// A started run that stays unfinished this long is lost.
const RUN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_TIMED_GUESSES = 500;
const START_LIMIT = 30;
const START_WINDOW_MS = 60 * 1000;
const ELAPSED_TOLERANCE_MS = 2000;
const shipIds = new Set(config.catalogShips.map((ship) => Number(ship.id)));
// Gameplays whose answer and clues stay on the service until the run ends.
const MASKED_GAMEPLAYS = new Set(['daily', 'standard', 'audit', 'timed']);
// A finished run keeps its puzzle this long for the review; later it is rebuilt on demand.
const PUZZLE_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

function currentDay() {
  return gameDateKey(new Date(), config.gameDayStartMinutes);
}

function nextReset() {
  return new Date(Date.now() + msUntilNextDowntime(new Date(), config.gameDayStartMinutes)).toISOString();
}

function targetPayload(target) {
  return {
    killId: Number(target.killId),
    shipId: Number(target.shipId),
    killmail: target.killmail,
  };
}

function runRow(id) {
  return statement('SELECT * FROM online_runs WHERE id = ?').get(id) || null;
}

function runGuesses(row) {
  try {
    const guesses = JSON.parse(row.guesses_json || '[]');
    return Array.isArray(guesses) ? guesses.map(Number) : [];
  } catch {
    return [];
  }
}

function targetOf(row) {
  try {
    return JSON.parse(row.target_json);
  } catch {
    return null;
  }
}

const isMasked = (row) => MASKED_GAMEPLAYS.has(row.gameplay);

function savePuzzle(row, puzzle) {
  statement('UPDATE online_runs SET puzzle_json = ? WHERE id = ?').run(JSON.stringify(puzzle), row.id);
}

/** The run's puzzle; a run of an older release or a pruned one gets it here. */
async function puzzleOf(row) {
  const stored = parsePuzzle(row.puzzle_json);
  if (stored) return stored;
  const puzzle = await buildPuzzle({ target: targetOf(row), gameplay: row.gameplay, gameDay: row.game_day });
  savePuzzle(row, puzzle);
  return puzzle;
}

/** Timed releases so far: one every 30 s of the run's clock. */
function timedReleases(row) {
  if (row.begun_at == null) return 0;
  const end = row.status === 'playing' ? now() : Number(row.started_at) + (Number(row.elapsed_ms) || 0);
  return Math.max(0, Math.floor((end - Number(row.started_at)) / TIMED_RELEASE_MS));
}

function baseResponse(row) {
  return {
    runId: row.id,
    kind: row.kind,
    gameplay: row.gameplay,
    gameDay: row.game_day,
    status: row.status,
    attempts: Number(row.attempts) || 0,
    elapsedMs: Number(row.elapsed_ms) || 0,
    answerId: row.answer_id == null ? null : Number(row.answer_id),
    guesses: runGuesses(row),
    begun: isStarted(row),
    startedAt: Number(row.started_at),
    now: now(),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
    completed: row.status !== 'playing',
    endReason: row.end_reason || null,
    nextReset: nextReset(),
    dataVersion: String(config.manifest?.dataVersion || ''),
    protocol: RUN_PROTOCOL_VERSION,
  };
}

/**
 * The run as its player may see it. While a masked run is open this is the
 * board alone: released clues, the kinds of the open-board ones and the match of
 * each guess. The target and every clue follow once it has ended.
 */
async function runResponse(row) {
  const base = baseResponse(row);
  const target = targetOf(row);
  if (!isMasked(row)) return { ...base, target };
  const puzzle = await puzzleOf(row);
  const ended = row.status !== 'playing';
  const answerId = Number(row.target_ship_id);
  if (!ended) {
    const revealed = releasedClues(puzzle, {
      answerId,
      guesses: runGuesses(row),
      begun: row.begun_at != null,
      releases: timedReleases(row),
    });
    if (markShown(puzzle, revealed)) savePuzzle(row, puzzle);
  }
  const board = {
    ...boardView(puzzle, { answerId, ended }),
    feedback: guessFeedback(runGuesses(row), answerId),
    caseId: puzzle.caseId,
    ...(ended ? { sampleKill: puzzle.sampleKill, fittedKills: puzzle.fittedKills } : {}),
  };
  return {
    ...base,
    target: ended ? target : null,
    answerId: ended ? answerId : null,
    board,
  };
}

async function insertRun({ nameKey, kind, gameplay, gameDay, target }) {
  const id = crypto.randomUUID();
  // The puzzle is made before the run exists, so no answer is ever sent without it.
  const puzzle = MASKED_GAMEPLAYS.has(gameplay) ? JSON.stringify(await buildPuzzle({ target, gameplay, gameDay })) : null;
  statement(`INSERT INTO online_runs(id, name_key, kind, gameplay, game_day, target_kill_id, target_ship_id, target_json, status, attempts, elapsed_ms, guesses_json, started_at, puzzle_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'playing', 0, 0, '[]', ?, ?)
    ON CONFLICT DO NOTHING`)
    .run(id, nameKey, kind, gameplay, gameDay, Number(target.killId), Number(target.shipId), JSON.stringify(targetPayload(target)), now(), puzzle);
  return runRow(id);
}

function dailyRun(nameKey, day) {
  return statement(`SELECT * FROM online_runs
    WHERE name_key = ? AND kind = 'daily' AND game_day = ? AND gameplay = 'daily'`).get(nameKey, day) || null;
}

/** End a run once: later calls find it settled already and change nothing. */
function settleRun(row, status, { elapsedMs = Number(row.elapsed_ms) || 0, finishedAt = now(), abandoned = false, reason = null } = {}) {
  const { changes } = statement(`UPDATE online_runs SET status = ?, elapsed_ms = ?, answer_id = ?, finished_at = ?, end_reason = ?
    WHERE id = ? AND status = 'playing'`)
    .run(status, elapsedMs, status === 'won' ? Number(row.target_ship_id) : null, finishedAt, reason, row.id);
  const settled = runRow(row.id);
  // Databases may still hold custom runs of earlier releases; they never count.
  if (changes && settled.kind !== 'custom' && isStarted(settled)) {
    recordPlay({
      killId: settled.target_kill_id,
      shipId: settled.target_ship_id,
      gameplay: settled.gameplay,
      outcome: status === 'won' ? 'won' : (abandoned ? 'abandoned' : 'lost'),
      attempts: settled.attempts,
      elapsedMs: settled.elapsed_ms,
    });
  }
  return settled;
}

/** A run counts from its first guess; a timed one already from starting the clock. */
const isStarted = (row) => Number(row.attempts) > 0 || row.begun_at != null;

function settleIfExpired(row) {
  const deadline = Number(row.started_at) + RUN_LIFETIME_MS;
  if (row.status !== 'playing' || !isStarted(row) || deadline > now()) return row;
  return settleRun(row, 'lost', { finishedAt: deadline, abandoned: true, reason: 'expired' });
}

/**
 * Bring a run up to date before anything reads or changes it: a day-old one is
 * lost, and a masked Timed one whose clues have all been released is over.
 */
async function syncRun(row) {
  const current = settleIfExpired(row);
  if (current.status !== 'playing' || !isMasked(current) || current.gameplay !== 'timed' || current.begun_at == null) return current;
  const puzzle = await puzzleOf(current);
  const release = timedExhaustedAt(puzzle, {
    answerId: Number(current.target_ship_id),
    releases: timedReleases(current),
  });
  if (!release) return current;
  const elapsedMs = release * TIMED_RELEASE_MS;
  return settleRun(current, 'lost', {
    elapsedMs,
    finishedAt: Number(current.started_at) + elapsedMs,
    reason: 'exhausted',
  });
}

/** Lose every started run that was left unfinished for a day. */
export function expireRuns() {
  const rows = statement(`SELECT * FROM online_runs
    WHERE status = 'playing' AND (attempts > 0 OR begun_at IS NOT NULL) AND started_at <= ?`).all(now() - RUN_LIFETIME_MS);
  for (const row of rows) settleIfExpired(row);
  statement(`UPDATE online_runs SET puzzle_json = NULL
    WHERE status != 'playing' AND puzzle_json IS NOT NULL AND finished_at <= ?`).run(now() - PUZZLE_KEEP_MS);
  return rows.length;
}

function dropUnstartedRuns(nameKey, gameplay) {
  statement(`DELETE FROM online_runs
    WHERE name_key = ? AND kind = 'random' AND gameplay = ? AND status = 'playing' AND attempts = 0 AND begun_at IS NULL`)
    .run(nameKey, gameplay);
}

/** The random run this player has open in a gameplay, if it can still be played. */
function openRandomRun(nameKey, gameplay, allowEmpty) {
  const rows = statement(`SELECT * FROM online_runs
    WHERE name_key = ? AND kind = 'random' AND gameplay = ? AND status = 'playing'
    ORDER BY (attempts > 0 OR begun_at IS NOT NULL) DESC, started_at DESC, rowid DESC LIMIT 1`).all(nameKey, gameplay);
  const row = rows[0] && settleIfExpired(rows[0]);
  if (row?.status !== 'playing') return null;
  const target = targetOf(row);
  // A target the current data cannot show must not block the player forever.
  if (!target?.killmail?.victim || !shipIds.has(Number(row.target_ship_id))) {
    statement('DELETE FROM online_runs WHERE id = ?').run(row.id);
    return null;
  }
  if (isStarted(row)) return row;
  if (Number(row.started_at) + RUN_LIFETIME_MS <= now()) return null;
  return allowEmpty || killHasFittedModules(target.killmail) ? row : null;
}

/** Play time reported by the client, never longer than the run exists. */
function elapsedFrom(body, row) {
  const reported = Math.max(0, Math.floor(Number(body?.elapsedMs) || 0));
  return Math.min(reported, Math.max(0, now() - Number(row.started_at)) + ELAPSED_TOLERANCE_MS);
}

/** The player started the clock of a timed run. */
function beginRun(row, body) {
  if (isStarted(row)) return row;
  const at = now();
  const startedAt = Math.max(Number(row.started_at), at - elapsedFrom(body, row));
  statement("UPDATE online_runs SET begun_at = ?, started_at = ? WHERE id = ? AND status = 'playing'")
    .run(at, startedAt, row.id);
  return runRow(row.id);
}

/** Count and judge one guess. Returns the run, or an error code. */
function guessRun(row, shipId, body) {
  const guesses = runGuesses(row);
  // A retried submission after a lost answer must not count twice.
  if (guesses.includes(shipId)) return { row };
  if (row.status !== 'playing') return { row, error: 'run-already-finished' };
  if (row.gameplay === 'timed' && guesses.length >= MAX_TIMED_GUESSES) return { row, error: 'too-many-attempts' };
  const elapsedMs = row.gameplay === 'timed' ? elapsedFrom(body, row) : 0;
  guesses.push(shipId);
  // The game starts here unless the timed clock was reported before.
  const startedAt = isStarted(row)
    ? Number(row.started_at)
    : Math.max(Number(row.started_at), now() - elapsedMs);
  statement(`UPDATE online_runs SET attempts = ?, elapsed_ms = ?, guesses_json = ?, started_at = ?
    WHERE id = ? AND status = 'playing'`)
    .run(guesses.length, elapsedMs, JSON.stringify(guesses), startedAt, row.id);
  const updated = runRow(row.id);
  if (shipId === Number(row.target_ship_id)) return { row: settleRun(updated, 'won', { reason: 'solved' }) };
  if (row.gameplay !== 'timed' && guesses.length >= ATTEMPT_LIMIT) return { row: settleRun(updated, 'lost', { reason: 'attempts' }) };
  return { row: updated };
}

function errorReply(reply, error) {
  if (error instanceof TargetUnavailable) {
    reply.code(503).send({ error: 'target-unavailable', reason: error.reason });
    return;
  }
  reply.code(500).send({ error: 'internal-error' });
}

function requireUser(request, reply) {
  const user = getSessionUser(request);
  if (!user) {
    reply.code(401).send({ error: 'login-required' });
    return null;
  }
  return user;
}

/** A new target may cost requests to zKillboard, so each player gets a fair share. */
function startAllowed(user, reply) {
  if (withinLimit(`start:${user.name_key}`, START_LIMIT, START_WINDOW_MS)) return true;
  reply.code(429).send({ error: 'rate-limited' });
  return false;
}

/** A page of another run protocol would misread the answers; it has to reload first. */
function protocolMatches(request, reply) {
  if (String(request.headers[RUN_PROTOCOL_HEADER] || '') === String(RUN_PROTOCOL_VERSION)) return true;
  reply.code(426).send({ error: 'client-outdated', protocol: RUN_PROTOCOL_VERSION });
  return false;
}

export function registerRunRoutes(app) {
  app.addHook('onRequest', async (request, reply) => {
    const url = String(request.url || '');
    if (request.method === 'OPTIONS' || reply.sent || !url.startsWith('/api/v1/online/')) return undefined;
    if (!protocolMatches(request, reply)) return reply;
    return undefined;
  });

  app.get('/api/v1/online/daily', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const day = currentDay();
    const existing = dailyRun(user.name_key, day);
    try {
      if (existing) return await runResponse(await syncRun(existing));
      const target = await getDailyTarget(day);
      // Another page of the same player may have created the run meanwhile.
      const run = await insertRun({
        nameKey: user.name_key,
        kind: 'daily',
        gameplay: 'daily',
        gameDay: day,
        target,
      }) || dailyRun(user.name_key, day);
      return await runResponse(run);
    } catch (error) {
      request.log?.error?.({ err: error }, 'online daily failed');
      errorReply(reply, error);
    }
  });

  app.get('/api/v1/online/runs/:id', async (request, reply) => {
    const row = await ownRun(request, reply);
    if (!row) return;
    return runResponse(row);
  });

  app.post('/api/v1/online/start', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const gameplay = String(request.body?.gameplay || '');
    if (!GAMEPLAYS.has(gameplay)) {
      reply.code(400).send({ error: 'invalid-gameplay' });
      return;
    }
    if (!startAllowed(user, reply)) return;
    // Older clients do not send the setting; empty hulls stay allowed for them.
    const allowEmpty = request.body?.allowEmpty !== false;
    try {
      const open = openRandomRun(user.name_key, gameplay, allowEmpty);
      if (open) return await runResponse(await syncRun(open));
      const target = await getRandomTarget(gameplay, { allowEmpty });
      // Two pages may have asked at the same time: both play the same run.
      const raced = openRandomRun(user.name_key, gameplay, allowEmpty);
      if (raced) return await runResponse(raced);
      dropUnstartedRuns(user.name_key, gameplay);
      return await runResponse(await insertRun({
        nameKey: user.name_key,
        kind: 'random',
        gameplay,
        gameDay: currentDay(),
        target,
      }));
    } catch (error) {
      request.log?.error?.({ err: error }, 'online start failed');
      errorReply(reply, error);
    }
  });

  app.get('/api/v1/stats/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return profileStats(user.name_key, currentDay());
  });

  /** The player's run, brought up to date; replies 404 otherwise. */
  const ownRun = async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return null;
    const row = runRow(String(request.params.id));
    if (!row || row.name_key !== user.name_key) {
      reply.code(404).send({ error: 'run-not-found' });
      return null;
    }
    return syncRun(row);
  };

  app.post('/api/v1/online/runs/:id/begin', async (request, reply) => {
    const row = await ownRun(request, reply);
    if (!row) return;
    if (row.gameplay !== 'timed') {
      reply.code(400).send({ error: 'invalid-gameplay' });
      return;
    }
    if (row.status !== 'playing') {
      reply.code(409).send({ error: 'run-already-finished', run: await runResponse(row) });
      return;
    }
    return runResponse(beginRun(row, request.body));
  });

  app.post('/api/v1/online/runs/:id/guess', async (request, reply) => {
    const row = await ownRun(request, reply);
    if (!row) return;
    const shipId = Number(request.body?.shipId);
    if (!Number.isInteger(shipId) || !shipIds.has(shipId)) {
      reply.code(400).send({ error: 'invalid-ship' });
      return;
    }
    const { row: updated, error } = guessRun(row, shipId, request.body);
    if (error) {
      reply.code(409).send({ error, run: await runResponse(updated) });
      return;
    }
    return runResponse(updated);
  });

  // Guesses decide every result; only a timed run can also end by giving up.
  app.post('/api/v1/online/runs/:id/finish', async (request, reply) => {
    const row = await ownRun(request, reply);
    if (!row) return;
    if (request.body?.status !== 'lost' || row.gameplay !== 'timed') {
      reply.code(400).send({ error: 'invalid-status' });
      return;
    }
    if (row.status === 'won') {
      reply.code(409).send({ error: 'run-already-finished', run: await runResponse(row) });
      return;
    }
    return runResponse(settleRun(row, 'lost', { elapsedMs: elapsedFrom(request.body, row), reason: 'gave-up' }));
  });

  // Taking another target: a started run is lost, an unstarted one is forgotten.
  app.post('/api/v1/online/runs/:id/abandon', async (request, reply) => {
    const row = await ownRun(request, reply);
    if (!row) return;
    if (row.kind === 'daily') {
      reply.code(400).send({ error: 'daily-fixed' });
      return;
    }
    if (row.status === 'playing' && !isStarted(row)) {
      statement('DELETE FROM online_runs WHERE id = ?').run(row.id);
      return { status: 'dropped' };
    }
    return runResponse(settleRun(row, 'lost', { abandoned: true, reason: 'abandoned' }));
  });
}
