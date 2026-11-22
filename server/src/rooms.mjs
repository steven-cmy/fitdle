import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildSearchIndex, gameDateKey, normalizeText } from '../../js/game.js';
import { clueForWire, sanitizeChatText, sanitizeText } from '../../js/mp/protocol.js';
import { rankPoints } from '../../js/mp/rules.js';
import { pickDealerRound } from '../../js/mp/target.js';
import { config } from './config.mjs';
import { getSessionUser } from './auth.mjs';
import { db, now } from './db.mjs';
import { getRandomTarget, TargetUnavailable } from './targets.mjs';
import { recordExposure, recordArbitrationRound, recordRoomMatch } from './stats.mjs';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RULES = new Set(['standard', 'audit', 'timed', 'arbitration']);
const ROOMS = new Map();

export function normalizeRoomSettings(current = {}, incoming = {}) {
  const next = { ...current };
  if (incoming.bigRounds != null) {
    const bigRounds = Number(incoming.bigRounds);
    if (Number.isInteger(bigRounds) && bigRounds >= 1 && bigRounds <= config.roomArbitrationMaxBigRounds) {
      next.bigRounds = bigRounds;
    }
  }
  if (incoming.raceDurationMs != null) {
    const duration = Number(incoming.raceDurationMs);
    if (Number.isFinite(duration)) {
      next.raceDurationMs = Math.max(60_000, Math.min(
        config.roomTimedMaxDurationMinutes * 60_000,
        Math.round(duration),
      ));
    }
  }
  return next;
}

const refsEn = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'refs', 'en.json'), 'utf8'));
const searchAliases = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(config.dataDir, 'search.json'), 'utf8'));
  } catch {
    return null;
  }
})();
const SEARCH_INDEX = buildSearchIndex(config.catalogShips, refsEn.groups || {}, {
  races: refsEn.races || {},
  factions: refsEn.factions || {},
  locale: 'en',
  aliases: searchAliases,
});

export function nextBigRoundStep(round) {
  if (!round || !Array.isArray(round.order) || !round.order.length) return { kind: 'done' };
  if (round.index + 1 < round.order.length) {
    return { kind: 'dealer', index: round.index + 1, number: round.number };
  }
  if (round.number < round.total) {
    return { kind: 'big', index: 0, number: round.number + 1 };
  }
  return { kind: 'done' };
}

function randomCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
  return code;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, value) {
  if (!value) return true;
  const [salt, expected] = String(value).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function snapshotPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    characterId: player.characterId || null,
    connected: player.connected,
    spectator: player.spectator,
    score: player.score,
  };
}

function roomState(room) {
  return {
    code: room.code,
    ownerId: room.ownerId,
    phase: room.phase,
    gameplay: room.gameplay,
    settings: room.settings,
    maxPlayers: config.roomMaxPlayers,
    players: [...room.players.values()].map(snapshotPlayer),
    matchNo: room.matchNo,
    bigRound: room.bigRound ? {
      number: room.bigRound.number,
      total: room.bigRound.total,
      index: room.bigRound.index,
      count: room.bigRound.order.length,
    } : null,
    match: room.match ? publicMatch(room.match) : null,
    createdAt: room.createdAt,
  };
}

function publicMatch(match) {
  if (match.rule === 'arbitration') {
    return {
      id: match.id,
      rule: 'arbitration',
      dealerId: match.dealerId,
      round: match.round,
      published: [...match.published],
      publishedClues: match.publishedClues.map(clueForWire).filter(Boolean),
      solved: [...match.solved],
      acceptingGuesses: match.acceptingGuesses,
      totalRounds: Number(match.totalRounds) || 6,
      startedAt: match.startedAt,
    };
  }
  return {
    id: match.id,
    rule: 'race',
    gameplay: match.gameplay,
    target: match.target,
    startedAt: match.startedAt,
    endsAt: match.endsAt,
  };
}

function broadcast(room, message, exceptId = null) {
  const text = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.id === exceptId) continue;
    const ws = player.ws;
    if (ws && ws.readyState === 1) ws.send(text);
  }
}

function send(player, message) {
  if (player?.ws && player.ws.readyState === 1) player.ws.send(JSON.stringify(message));
}

function persist(room) {
  const state = {
    ...roomState(room),
    passwordHash: room.passwordHash,
    bigRound: room.bigRound,
  };
  db.prepare(`INSERT INTO rooms(code, state_json, updated_at, expires_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at, expires_at = excluded.expires_at`)
    .run(room.code, JSON.stringify(state), now(), room.expiresAt);
}

function changed(room) {
  room.expiresAt = now() + config.roomTtlMs;
  persist(room);
  broadcast(room, { t: 'room', room: roomState(room) });
}

function activeGuessers(room) {
  const match = room.match;
  if (!match) return [];
  return [...room.players.values()].filter((player) => (
    player.connected
    && !player.spectator
    && player.id !== match.dealerId
    && !match.solved.has(player.id)
  ));
}

function acceptedNames(shipId) {
  const entry = SEARCH_INDEX.find((candidate) => Number(candidate.ship.id) === Number(shipId));
  return new Set([...(entry?.names || []), ...(entry?.acronyms || []), ...(entry?.nameAliases || [])]);
}

function publishedWeight(match) {
  return match.publishedClues.reduce((sum, clue) => sum + (Number(clue.w) || 0), 0);
}

function clearMatchTimer(room) {
  if (room.match?.timer) clearTimeout(room.match.timer);
}

async function startRace(room) {
  const target = await getRandomTarget(room.gameplay);
  recordExposure({
    source: 'room',
    mode: 'multiplayer',
    gameplay: room.gameplay,
    targetKillId: target.killId,
    targetShipId: target.shipId,
    gameDay: gameDateKey(new Date(), config.gameDayStartMinutes),
  });
  const raceDurationMs = room.gameplay === 'timed'
    ? (Number(room.settings.raceDurationMs) || config.roomTimedDurationMinutes * 60 * 1000)
    : 10 * 60 * 1000;
  const match = {
    id: crypto.randomUUID(),
    rule: 'race',
    gameplay: room.gameplay,
    target,
    results: [],
    solved: new Set(),
    startedAt: now(),
    endsAt: now() + raceDurationMs,
  };
  match.timer = setTimeout(() => endRace(room), Math.max(1000, match.endsAt - now()));
  room.match = match;
  room.phase = 'playing';
  broadcast(room, {
    t: 'target',
    matchId: match.id,
    gameplay: room.gameplay,
    target: match.target,
    endsAt: match.endsAt,
  });
  changed(room);
}

function endRace(room) {
  const match = room.match;
  if (!match || match.rule !== 'race') return;
  clearMatchTimer(room);
  const ordered = [...match.results];
  const scores = {};
  const solved = ordered.filter((result) => result.status === 'won');
  solved.forEach((result, index) => {
    const points = rankPoints(index + 1);
    scores[result.playerId] = points;
    const player = room.players.get(result.playerId);
    if (player) player.score += points;
  });
  const result = {
    matchId: match.id,
    rule: 'race',
    gameplay: match.gameplay,
    target: match.target,
    results: ordered,
    points: scores,
    scores: Object.fromEntries([...room.players.values()].map((player) => [player.id, player.score])),
  };
  recordRoomMatch({
    id: match.id,
    roomCode: room.code,
    rule: 'race',
    targetKillId: match.target.killId,
    targetShipId: match.target.shipId,
    result,
  });
  room.match = null;
  room.phase = 'between_matches';
  broadcast(room, { t: 'matchResult', result });
  changed(room);
}

async function startArbitration(room, dealerId) {
  const round = await pickDealerRound({
    manifest: config.manifest,
    catalog: config.catalogShips,
    refsEn,
    fetchImpl: fetch,
  });
  const accepted = acceptedNames(round.ship.id);
  recordExposure({
    source: 'room',
    mode: 'multiplayer',
    gameplay: 'arbitration',
    targetKillId: round.killId,
    targetShipId: round.shipId,
    gameDay: gameDateKey(new Date(), config.gameDayStartMinutes),
  });
  const match = {
    id: crypto.randomUUID(),
    rule: 'arbitration',
    dealerId,
    target: { killId: round.killId, shipId: round.shipId, killmail: round.killmail },
    ship: round.ship,
    clues: round.clues,
    accepted,
    published: new Set(),
    publishedClues: [],
    round: 1,
    totalRounds: 6,
    solved: new Set(),
    guessed: new Set(),
    acceptingGuesses: round.clues.length === 0,
    startedAt: now(),
    dealerPoints: 0,
    guesses: 0,
    correct: 0,
  };
  room.match = match;
  room.phase = 'playing';
  const dealer = room.players.get(dealerId);
  send(dealer, {
    t: 'dealerClues',
    matchId: match.id,
    gameplay: 'arbitration',
    dealerId,
    clues: match.clues.map((clue, index) => ({ ...clueForWire(clue), i: index })),
    round: match.round,
  });
  broadcast(room, {
    t: 'start',
    matchId: match.id,
    rule: 'arbitration',
    dealerId,
    round: match.round,
    totalRounds: match.totalRounds,
    acceptingGuesses: match.acceptingGuesses,
  });
  changed(room);
}

function advanceArbitrationRound(room) {
  const match = room.match;
  if (!match || match.rule !== 'arbitration') return;
  recordArbitrationRoundOnce(room, match);
  match.guessed.clear();
  const allSolved = [...room.players.values()]
    .filter((player) => !player.spectator && player.id !== match.dealerId)
    .every((player) => match.solved.has(player.id));
  if (match.round >= (Number(match.totalRounds) || 6) || allSolved) {
    endArbitration(room);
    return;
  }
  match.round += 1;
  match.acceptingGuesses = match.published.size >= match.clues.length;
  changed(room);
  if (match.acceptingGuesses) {
    broadcast(room, { t: 'tick', round: match.round, acceptingGuesses: true });
  }
}

function recordArbitrationRoundOnce(room, match) {
  match.recordedRounds ||= new Set();
  if (match.recordedRounds.has(match.round)) return;
  match.recordedRounds.add(match.round);
  recordArbitrationRound({
    matchId: match.id,
    round: match.round,
    dealerNameKey: room.players.get(match.dealerId)?.nameKey || '',
    published: [...match.published],
    guesses: match.guesses,
    correct: match.correct,
    dealerScore: match.dealerPoints,
  });
}

function endArbitration(room) {
  const match = room.match;
  if (!match || match.rule !== 'arbitration') return;
  clearMatchTimer(room);
  recordArbitrationRoundOnce(room, match);
  const result = {
    matchId: match.id,
    rule: 'arbitration',
    dealerId: match.dealerId,
    target: match.target,
    clues: match.clues.map((clue, index) => ({ ...clue, i: index })),
    dealerPoints: match.dealerPoints,
    solved: [...match.solved],
    scores: Object.fromEntries([...room.players.values()].map((player) => [player.id, player.score])),
  };
  recordRoomMatch({
    id: match.id,
    roomCode: room.code,
    rule: 'arbitration',
    targetKillId: match.target.killId,
    targetShipId: match.target.shipId,
    result: { ...result, clues: undefined },
  });
  room.match = null;
  const round = room.bigRound;
  const step = nextBigRoundStep(round);
  if (step.kind !== 'done') {
    round.index = step.index;
    round.number = step.number;
    room.phase = 'playing';
    broadcast(room, { t: 'matchResult', result });
    const nextDealer = round.order[round.index];
    setTimeout(() => {
      if (ROOMS.get(room.code) === room && room.phase === 'playing' && !room.match) {
        startNextArbitration(room, nextDealer).catch(() => failRoom(room, 'target'));
      }
    }, 1500);
  } else {
    room.phase = 'between_matches';
    room.bigRound = null;
    broadcast(room, { t: 'matchResult', result });
  }
  changed(room);
}

async function startNextArbitration(room, dealerId) {
  if (!room.players.has(dealerId) || !room.players.get(dealerId).connected) {
    const next = [...room.players.values()].find((player) => player.connected && !player.spectator);
    if (!next) {
      room.phase = 'between_matches';
      room.bigRound = null;
      changed(room);
      return;
    }
    dealerId = next.id;
  }
  await startArbitration(room, dealerId);
}

function failRoom(room, reason) {
  room.phase = 'between_matches';
  room.match = null;
  room.bigRound = null;
  broadcast(room, { t: 'error', code: reason });
  changed(room);
}

function onMessage(room, player, raw) {
  let message;
  try {
    message = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (!message || typeof message !== 'object') return;
  const owner = room.ownerId === player.id;

  if (message.t === 'ping') {
    send(player, { t: 'pong' });
    return;
  }
  if (message.t === 'chat') {
    const id = String(message.id || '').slice(0, 64);
    const text = sanitizeChatText(message.text);
    if (!text) {
      send(player, { t: 'chat-error', id, code: 'chat-empty' });
      return;
    }
    const at = Date.now();
    if (at - (player.lastChatAt || 0) < 1500
      || (at - (player.chatWindowStart || 0) <= 10_000 && (player.chatCount || 0) >= 5)) {
      send(player, { t: 'chat-error', id, code: 'chat-rate-limit' });
      return;
    }
    if (at - (player.chatWindowStart || 0) > 10_000) {
      player.chatWindowStart = at;
      player.chatCount = 0;
    }
    player.lastChatAt = at;
    player.chatCount = (player.chatCount || 0) + 1;
    broadcast(room, { t: 'chat', from: player.id, text });
    send(player, { t: 'chat-ack', id });
    return;
  }
  if (message.t === 'settings') {
    if (!owner || !['lobby', 'between_matches'].includes(room.phase)) return;
    const gameplay = message.gameplay == null ? null : String(message.gameplay);
    if (gameplay != null && !RULES.has(gameplay)) return;
    room.gameplay = gameplay;
    const incoming = message.settings && typeof message.settings === 'object' ? message.settings : {};
    room.settings = normalizeRoomSettings(room.settings, incoming);
    changed(room);
    return;
  }
  if (message.t === 'reset') {
    if (!owner) return;
    for (const p of room.players.values()) p.score = 0;
    changed(room);
    return;
  }
  if (message.t === 'start') {
    if (!owner || !['lobby', 'between_matches'].includes(room.phase)) return;
    const requestedGameplay = message.gameplay == null ? room.gameplay : String(message.gameplay);
    if (!requestedGameplay || !RULES.has(requestedGameplay)) {
      send(player, { t: 'error', code: 'rule-required' });
      return;
    }
    room.gameplay = requestedGameplay;
    if (message.settings && typeof message.settings === 'object') {
      room.settings = normalizeRoomSettings(room.settings, message.settings);
    }
    for (const p of room.players.values()) {
      if (p.connected) p.spectator = false;
    }
    const active = [...room.players.values()].filter((p) => p.connected && !p.spectator);
    if (active.length < 2) {
      send(player, { t: 'error', code: 'need-players' });
      return;
    }
    if (room.gameplay === 'arbitration') {
      const order = active.map((p) => p.id);
      room.bigRound = {
        order,
        index: 0,
        number: 1,
        total: Math.max(1, Number(room.settings.bigRounds) || config.roomArbitrationBigRounds),
      };
      startArbitration(room, order[0]).catch(() => failRoom(room, 'target'));
    } else {
      startRace(room).catch(() => failRoom(room, 'target'));
    }
    return;
  }
  if (message.t === 'end') {
    if (!owner || room.phase !== 'playing') return;
    if (room.match?.rule === 'race') endRace(room);
    else if (room.match?.rule === 'arbitration') endArbitration(room);
    return;
  }
  if (message.t === 'publish') {
    const match = room.match;
    if (!match || match.rule !== 'arbitration' || player.id !== match.dealerId || match.acceptingGuesses) return;
    const indices = Array.isArray(message.indices) ? message.indices.map(Number) : [];
    const valid = [...new Set(indices)].filter((index) => (
      Number.isInteger(index)
      && index >= 0
      && index < match.clues.length
      && !match.published.has(index)
    ));
    if (!valid.length) {
      send(player, { t: 'error', code: 'clue-required' });
      return;
    }
    for (const index of valid) {
      match.published.add(index);
      const wire = { ...clueForWire(match.clues[index]), i: index };
      match.publishedClues.push(wire);
      broadcast(room, { t: 'clue', clue: wire });
    }
    match.acceptingGuesses = true;
    changed(room);
    return;
  }
  if (message.t === 'guess') {
    const match = room.match;
    if (!match || match.rule !== 'arbitration' || !match.acceptingGuesses) return;
    if (player.id === match.dealerId || player.spectator || match.solved.has(player.id)) return;
    if (match.guessed.has(player.id)) return;
    const text = sanitizeText(message.text);
    if (!text) return;
    match.guessed.add(player.id);
    match.guesses += 1;
    const guess = normalizeText(text);
    if (match.accepted.has(guess)) {
      match.correct += 1;
      match.solved.add(player.id);
      broadcast(room, { t: 'solved', playerId: player.id });
    } else {
      const points = publishedWeight(match);
      match.dealerPoints += points;
      const dealer = room.players.get(match.dealerId);
      if (dealer) dealer.score += points;
      broadcast(room, { t: 'chat', from: player.id, text });
      broadcast(room, { t: 'miss', playerId: player.id, points });
    }
    if (activeGuessers(room).every((p) => match.guessed.has(p.id))) {
      advanceArbitrationRound(room);
    } else {
      changed(room);
    }
    return;
  }
  if (message.t === 'raceResult') {
    const match = room.match;
    if (!match || match.rule !== 'race') return;
    if (match.results.some((r) => r.playerId === player.id)) return;
    const status = message.status === 'won' ? 'won' : 'lost';
    if (status === 'won' && Number(message.answerId) !== Number(match.target.shipId)) return;
    match.results.push({
      playerId: player.id,
      status,
      attempts: Math.max(0, Number(message.attempts) || 0),
      elapsedMs: Math.max(0, Number(message.elapsedMs) || 0),
      at: Date.now(),
    });
    const active = [...room.players.values()].filter((p) => p.connected && !p.spectator);
    if (active.every((p) => match.results.some((r) => r.playerId === p.id))) endRace(room);
    else changed(room);
    return;
  }
  if (message.t === 'leave') {
    player.connected = false;
    player.spectator = true;
    if (room.ownerId === player.id) {
      const next = [...room.players.values()].find((p) => p.connected && p.id !== player.id);
      if (next) room.ownerId = next.id;
    }
    changed(room);
  }
}

function transferOwner(room) {
  if (room.players.get(room.ownerId)?.connected) return;
  const next = [...room.players.values()].find((p) => p.connected);
  if (next) room.ownerId = next.id;
}

function requireUser(request, reply) {
  const user = getSessionUser(request);
  if (!user) {
    reply.code(401).send({ error: 'login-required' });
    return null;
  }
  return user;
}

export function registerRoomRoutes(app) {
  app.post('/api/v1/rooms', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    let code = randomCode();
    while (ROOMS.has(code)) code = randomCode();
    const id = crypto.randomUUID();
    const player = {
      id,
      name: user.display_name,
      nameKey: user.name_key,
      characterId: user.character_id == null ? null : Number(user.character_id),
      connected: false,
      spectator: false,
      score: 0,
      lastChatAt: 0,
      chatWindowStart: 0,
      chatCount: 0,
      ws: null,
    };
    const room = {
      code,
      passwordHash: request.body?.password ? hashPassword(request.body.password) : '',
      ownerId: id,
      players: new Map([[id, player]]),
      phase: 'lobby',
      gameplay: null,
      settings: {
        bigRounds: config.roomArbitrationBigRounds,
        raceDurationMs: config.roomTimedDurationMinutes * 60 * 1000,
      },
      matchNo: 0,
      match: null,
      bigRound: null,
      createdAt: now(),
      expiresAt: now() + config.roomTtlMs,
    };
    ROOMS.set(code, room);
    persist(room);
    return {
      code,
      playerId: id,
      room: roomState(room),
      wsPath: `/api/v1/rooms/${code}/ws?player=${id}`,
    };
  });

  app.post('/api/v1/rooms/:code/join', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const code = String(request.params.code || '').toUpperCase();
    const room = ROOMS.get(code);
    if (!room) {
      reply.code(404).send({ error: 'room-not-found' });
      return;
    }
    if (!verifyPassword(String(request.body?.password || ''), room.passwordHash)) {
      reply.code(403).send({ error: 'wrong-password' });
      return;
    }
    const existing = [...room.players.values()].find((p) => p.nameKey === user.name_key);
    if (existing) {
      existing.name = user.display_name;
      existing.characterId = user.character_id == null ? existing.characterId : Number(user.character_id);
      return { code, playerId: existing.id, room: roomState(room), wsPath: `/api/v1/rooms/${code}/ws?player=${existing.id}` };
    }
    if (room.players.size >= config.roomMaxPlayers) {
      reply.code(409).send({ error: 'room-full' });
      return;
    }
    const id = crypto.randomUUID();
    const player = {
      id,
      name: user.display_name,
      nameKey: user.name_key,
      characterId: user.character_id == null ? null : Number(user.character_id),
      connected: false,
      spectator: room.phase === 'playing',
      score: 0,
      lastChatAt: 0,
      chatWindowStart: 0,
      chatCount: 0,
      ws: null,
    };
    room.players.set(id, player);
    changed(room);
    return { code, playerId: id, room: roomState(room), wsPath: `/api/v1/rooms/${code}/ws?player=${id}` };
  });

  app.get('/api/v1/rooms/:code', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const room = ROOMS.get(String(request.params.code || '').toUpperCase());
    if (!room) {
      reply.code(404).send({ error: 'room-not-found' });
      return;
    }
    return roomState(room);
  });

  app.get('/api/v1/rooms/:code/ws', { websocket: true }, (socket, request) => {
    const user = getSessionUser(request);
    const code = String(request.params.code || '').toUpperCase();
    const playerId = String(request.query?.player || '');
    const room = ROOMS.get(code);
    const player = room?.players.get(playerId);
    if (!user || !room || !player || player.nameKey !== user.name_key) {
      socket.close(1008, 'unauthorized');
      return;
    }
    player.ws = socket;
    player.connected = true;
    if (player.spectator && room.phase === 'between_matches') player.spectator = false;
    send(player, { t: 'welcome', selfId: player.id, room: roomState(room) });
    if (room.match?.rule === 'arbitration' && player.id === room.match.dealerId) {
      send(player, {
        t: 'dealerClues',
        matchId: room.match.id,
        dealerId: player.id,
        clues: room.match.clues.map((clue, index) => ({ ...clueForWire(clue), i: index })),
        round: room.match.round,
      });
    }
    broadcast(room, { t: 'room', room: roomState(room) }, player.id);
    changed(room);
    socket.on('message', (raw) => {
      try {
        onMessage(room, player, raw);
      } catch {
        // Ignore malformed room messages.
      }
    });
    socket.on('close', () => {
      player.connected = false;
      player.ws = null;
      transferOwner(room);
      if (room.match?.rule === 'arbitration' && room.match.dealerId === player.id) {
        endArbitration(room);
      }
      changed(room);
    });
  });
}

export { ROOMS };
