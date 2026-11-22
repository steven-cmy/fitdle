import crypto from 'node:crypto';
import { gameDateKey, msUntilNextDowntime } from '../../js/game.js';
import { config } from './config.mjs';
import { getSessionUser } from './auth.mjs';
import { db, now } from './db.mjs';
import { getCustomTarget, getDailyTarget, getRandomTarget, TargetUnavailable } from './targets.mjs';
import { recordExposure, recordRunFinish, profileStats } from './stats.mjs';

const GAMEPLAYS = new Set(['standard', 'audit', 'timed']);
const ATTEMPT_LIMIT = 6;

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
  return db.prepare('SELECT * FROM online_runs WHERE id = ?').get(id) || null;
}

function runResponse(row) {
  let target = null;
  try {
    target = JSON.parse(row.target_json);
  } catch {
    target = null;
  }
  return {
    runId: row.id,
    kind: row.kind,
    gameplay: row.gameplay,
    gameDay: row.game_day,
    target,
    status: row.status,
    attempts: Number(row.attempts) || 0,
    elapsedMs: Number(row.elapsed_ms) || 0,
    answerId: row.answer_id == null ? null : Number(row.answer_id),
    guesses: (() => {
      try {
        return JSON.parse(row.guesses_json || '[]');
      } catch {
        return [];
      }
    })(),
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
    completed: row.status !== 'playing',
    nextReset: nextReset(),
    dataVersion: String(config.manifest?.dataVersion || ''),
  };
}

function insertRun({ nameKey, kind, gameplay, gameDay, target }) {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO online_runs(id, name_key, kind, gameplay, game_day, target_kill_id, target_ship_id, target_json, status, attempts, elapsed_ms, guesses_json, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'playing', 0, 0, '[]', ?)`)
    .run(id, nameKey, kind, gameplay, gameDay, Number(target.killId), Number(target.shipId), JSON.stringify(targetPayload(target)), now());
  return runResponse(runRow(id));
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

export function registerRunRoutes(app) {
  app.get('/api/v1/online/daily', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const day = currentDay();
    const existing = db.prepare(`SELECT * FROM online_runs
      WHERE name_key = ? AND kind = 'daily' AND game_day = ? AND gameplay = 'daily'`)
      .get(user.name_key, day);
    if (existing) return runResponse(existing);
    try {
      const target = await getDailyTarget(day);
      return insertRun({
        nameKey: user.name_key,
        kind: 'daily',
        gameplay: 'daily',
        gameDay: day,
        target,
      });
    } catch (error) {
      errorReply(reply, error);
    }
  });

  app.get('/api/v1/online/runs/:id', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const row = runRow(String(request.params.id));
    if (!row || row.name_key !== user.name_key) {
      reply.code(404).send({ error: 'run-not-found' });
      return;
    }
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
    try {
      const target = await getRandomTarget(gameplay);
      const day = currentDay();
      return insertRun({
        nameKey: user.name_key,
        kind: 'random',
        gameplay,
        gameDay: day,
        target,
      });
    } catch (error) {
      request.log?.error?.({ err: error }, 'online start failed');
      errorReply(reply, error);
    }
  });

  app.post('/api/v1/online/custom', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const gameplay = String(request.body?.gameplay || '');
    const kb = String(request.body?.kb || '');
    if (!GAMEPLAYS.has(gameplay) || !kb) {
      reply.code(400).send({ error: 'invalid-custom-run' });
      return;
    }
    try {
      const target = await getCustomTarget(kb);
      return insertRun({
        nameKey: user.name_key,
        kind: 'custom',
        gameplay,
        gameDay: currentDay(),
        target,
      });
    } catch (error) {
      errorReply(reply, error);
    }
  });

  app.get('/api/v1/stats/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return profileStats(user.name_key, currentDay());
  });

  app.post('/api/v1/online/runs/:id/finish', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const row = runRow(String(request.params.id));
    if (!row || row.name_key !== user.name_key) {
      reply.code(404).send({ error: 'run-not-found' });
      return;
    }
    if (row.status !== 'playing') {
      reply.code(409).send({ error: 'run-already-finished' });
      return;
    }
    const status = request.body?.status === 'won' ? 'won' : request.body?.status === 'lost' ? 'lost' : '';
    if (!status) {
      reply.code(400).send({ error: 'invalid-status' });
      return;
    }
    const attempts = Math.max(0, Math.min(999, Math.floor(Number(request.body?.attempts) || 0)));
    const elapsedMs = Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.floor(Number(request.body?.elapsedMs) || 0)));
    const answerId = request.body?.answerId == null ? null : Math.floor(Number(request.body.answerId));
    const guesses = Array.isArray(request.body?.guesses)
      ? request.body.guesses.filter((id) => Number.isInteger(Number(id))).map(Number).slice(0, 50)
      : [];
    if (['daily', 'standard', 'audit'].includes(row.gameplay) && attempts > ATTEMPT_LIMIT) {
      reply.code(400).send({ error: 'too-many-attempts' });
      return;
    }
    if (status === 'won' && Number(answerId) !== Number(row.target_ship_id)) {
      reply.code(400).send({ error: 'answer-mismatch' });
      return;
    }
    if (row.kind === 'daily' && row.target_ship_id && answerId == null && status === 'won') {
      reply.code(400).send({ error: 'answer-required' });
      return;
    }
    const t = now();
    db.prepare(`UPDATE online_runs SET status = ?, attempts = ?, elapsed_ms = ?, answer_id = ?, guesses_json = ?, finished_at = ?
      WHERE id = ? AND status = 'playing'`)
      .run(status, attempts, elapsedMs, answerId, JSON.stringify(guesses), t, row.id);
    const updated = runRow(row.id);
    recordExposure({
      source: updated.kind,
      mode: 'online',
      gameplay: updated.gameplay,
      targetKillId: updated.target_kill_id,
      targetShipId: updated.target_ship_id,
      gameDay: updated.game_day,
    });
    recordRunFinish(updated);
    return runResponse(updated);
  });
}
