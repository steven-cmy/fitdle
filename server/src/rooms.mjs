import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildSearchIndex, gameDateKey, normalizeText } from '../../js/game.js';
import { buildClues } from '../../js/clues.js';
import { clueForWire, sanitizeChatText, sanitizeText } from '../../js/mp/protocol.js';
import { rankPoints, endlessRoundScore, allocatePlayerRoundScores, ROOM_SCORE_PER_KB } from '../../js/mp/rules.js';
import { pickDealerRound } from '../../js/mp/target.js';
import { calculateDogmaFit, calculateDogmaBaseline } from '../../js/dogma.js';
import { buildRevealPlan } from '../../js/reveal.js';
import { config } from './config.mjs';
import { getSessionUser } from './auth.mjs';
import { now, statement } from './db.mjs';
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
const moduleFallbacks = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(config.dataDir, 'module-fallback.json'), 'utf8'));
  } catch {
    return {};
  }
})();
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
const SHIPS_BY_ID = new Map(config.catalogShips.map((ship) => [Number(ship.id), ship]));
const SEARCH_BY_SHIP = new Map(SEARCH_INDEX.map((entry) => [Number(entry.ship.id), entry]));

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

const PLAYER_COLORS = Object.freeze([
  '#8fd3ff', '#ffb86b', '#c9a7ff', '#76e6b2',
  '#ff9f9f', '#f4e28a', '#8fe6e6', '#ff9ed2',
]);

function assignPlayerColor(room, player) {
  if (player.color) return player.color;
  const used = new Set([...room.players.values()].map((item) => item.color).filter(Boolean));
  const free = PLAYER_COLORS.filter((color) => !used.has(color));
  const pool = free.length ? free : PLAYER_COLORS;
  player.color = pool[crypto.randomInt(0, pool.length)];
  return player.color;
}

function snapshotPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    characterId: player.characterId || null,
    color: player.color || '',
    connected: player.connected,
    reconnecting: !player.connected && !player.removed && Boolean(player.reconnectTimer),
    reconnectUntil: player.reconnectUntil || null,
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
    reconnectGraceMs: config.roomReconnectGraceMs,
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
  if (match.rule === 'endless') {
    return {
      id: match.id,
      rule: 'endless',
      gameplay: match.gameplay,
      roundNo: match.roundNo,
      phase: match.phase,
      ready: [...match.ready],
      prepared: [...match.prepared],
      finished: [...new Set(match.results.map((result) => result.playerId))],
      activeCount: match.activeIds.length,
      startAt: match.startAt,
      endsAt: match.endsAt,
    };
  }
  if (match.rule === 'arbitration') {
    return {
      id: match.id,
      rule: 'arbitration',
      dealerId: match.dealerId,
      round: match.round,
      published: [...match.published],
      publishedClues: match.publishedClues,
      solved: [...match.solved],
      guessed: [...match.guessed],
      prepared: [...(match.prepared || [])],
      phase: match.phase || 'dealer',
      acceptingGuesses: Boolean(match.acceptingGuesses),
      dealerDisconnected: Boolean(match.dealerDisconnected),
      totalRounds: Number(match.totalRounds) || 6,
      clueCount: match.clues?.length || 0,
      clueMeta: (match.clues || []).map((clue, index) => ({
        i: index,
        k: clue.k,
        c: clue.c,
      })),
      decoyShipIds: match.decoyShipIds || [],
      revealResult: match.phase === 'reveal' ? match.revealResult : null,
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

const PERSIST_DELAY_MS = 250;
const pendingPersists = new Map();
let persistClosed = false;

/** Snapshot a room soon; bursts of changes collapse into one write. */
function persist(room) {
  if (persistClosed || pendingPersists.has(room)) return;
  const timer = setTimeout(() => {
    pendingPersists.delete(room);
    writeRoom(room);
  }, PERSIST_DELAY_MS);
  timer.unref?.();
  pendingPersists.set(room, timer);
}

export function flushRooms() {
  for (const [room, timer] of pendingPersists) {
    clearTimeout(timer);
    writeRoom(room);
  }
  pendingPersists.clear();
}

/** Drop rooms that outlived their TTL and have nobody connected. */
export function evictExpiredRooms(at = now()) {
  let evicted = 0;
  for (const [code, room] of ROOMS) {
    if (room.expiresAt > at) continue;
    if ([...room.players.values()].some((player) => player.connected)) continue;
    clearTimeout(room.match?.timer);
    clearTimeout(room.match?.startTimer);
    clearTimeout(room.match?.roundTimer);
    for (const player of room.players.values()) clearTimeout(player.reconnectTimer);
    clearTimeout(pendingPersists.get(room));
    pendingPersists.delete(room);
    ROOMS.delete(code);
    evicted += 1;
  }
  return evicted;
}

function writeRoom(room) {
  const state = {
    ...roomState(room),
    passwordHash: room.passwordHash,
    bigRound: room.bigRound,
  };
  statement(`INSERT INTO rooms(code, state_json, updated_at, expires_at) VALUES (?, ?, ?, ?)
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
  const entry = SEARCH_BY_SHIP.get(Number(shipId));
  return new Set([...(entry?.names || []), ...(entry?.acronyms || []), ...(entry?.nameAliases || [])]);
}

function publishedWeight(match) {
  return match.publishedClues.reduce((sum, clue) => sum + (Number(clue.w) || 0), 0);
}

function arbitrationScoreRow(match, playerId, index, round = match.round) {
  return Number(match.scoreData?.scores?.[playerId]?.[Math.max(0, round - 1)]?.[index] || 0);
}

function arbitrationClueWire(match, clue, index) {
  const scores = {};
  for (const playerId of match.nonDealerIds) {
    scores[playerId] = arbitrationScoreRow(match, playerId, index);
  }
  return {
    ...clueForWire(clue),
    i: index,
    ...(match.autoIndices?.has(index) ? { auto: true } : {}),
    scores,
  };
}

function pickDecoyShips(targetShipId) {
  const pool = config.catalogShips
    .map((ship) => Number(ship.id))
    .filter((id) => Number.isInteger(id) && id > 0 && id !== Number(targetShipId));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}

function selectArbitrationAuto(match) {
  match.autoIndices = new Set();
  if (!match.auditPlan) {
    match.auditPlan = buildRevealPlan({
      clues: match.clues,
      seed: `room:${match.id}:audit`,
      mode: 'audit',
      config: config.manifest.reveal,
    });
  }
  const plan = match.auditPlan;
  const cfg = plan.config;
  const cargoCount = match.clues.filter((clue) => clue.k === 'cargo').length;
  const equipmentTake = Math.max(0, Number(cfg.auditEquipmentPerMiss) || 1);
  const cargoTake = Math.max(1, Math.ceil(cargoCount / Math.max(1, Number(cfg.auditCargoDivisor) || 10)));
  const take = (queue, cursorKey, count) => {
    let cursor = Number(match[cursorKey]) || 0;
    let taken = 0;
    while (cursor < queue.length && taken < count) {
      const index = Number(queue[cursor]);
      cursor += 1;
      if (!Number.isInteger(index) || index < 0 || index >= match.clues.length) continue;
      if (match.published.has(index)) continue;
      match.autoIndices.add(index);
      taken += 1;
    }
    match[cursorKey] = cursor;
  };
  take(plan.queues.equipment, 'autoEquipmentCursor', equipmentTake);
  take(plan.queues.cargo, 'autoCargoCursor', cargoTake);
  match.roundAutoIndices = new Set(match.autoIndices);
}

function arbitrationScores(room) {
  return Object.fromEntries([...room.players.values()].map((player) => [player.id, player.score]));
}

function broadcastArbitrationTurn(room, match, reason) {
  broadcast(room, {
    t: 'arbitrationTurn',
    matchId: match.id,
    round: match.round,
    phase: match.phase,
    dealerId: match.dealerId,
    acceptingGuesses: Boolean(match.acceptingGuesses),
    reason,
  });
}

function sendDealerClues(room, match) {
  const dealer = room.players.get(match.dealerId);
  send(dealer, {
    t: 'dealerClues',
    matchId: match.id,
    gameplay: 'arbitration',
    dealerId: match.dealerId,
    clues: match.clues.map((clue, index) => arbitrationClueWire(match, clue, index)),
    autoIndices: [...match.autoIndices],
    round: match.round,
    totalRounds: match.totalRounds,
    phase: match.phase,
    dealerTarget: { shipId: match.target.shipId, killId: match.target.killId },
    decoyShipIds: match.decoyShipIds,
    scores: match.scoreData.scores,
  });
}

function hasSelectableArbitrationClues(match) {
  return match.clues.some((clue, index) => (
    !match.published.has(index)
    && clue.k !== 'equipment'
    && clue.k !== 'cargo'
  )) || [...match.autoIndices].some((index) => !match.published.has(index));
}

function beginArbitrationDealerTurn(room, match, reason = 'round') {
  match.phase = 'dealer';
  match.acceptingGuesses = false;
  match.prepared.clear();
  match.guessed.clear();
  selectArbitrationAuto(match);
  if (!hasSelectableArbitrationClues(match)) {
    match.phase = 'player';
    match.acceptingGuesses = true;
  }
  broadcast(room, {
    t: 'arbitrationRoundStart',
    matchId: match.id,
    round: match.round,
    totalRounds: match.totalRounds,
    phase: match.phase,
    autoIndices: [...match.autoIndices],
    acceptingGuesses: match.acceptingGuesses,
  });
  broadcastArbitrationTurn(room, match, reason);
  sendDealerClues(room, match);
  changed(room);
}

function revealArbitrationStint(room, match) {
  match.phase = 'reveal';
  match.acceptingGuesses = false;
  match.prepared.clear();
  const result = {
    matchId: match.id,
    rule: 'arbitration',
    dealerId: match.dealerId,
    round: match.round,
    totalRounds: match.totalRounds,
    target: { shipId: match.target.shipId, killId: match.target.killId },
    dealerPoints: match.dealerPoints,
    solved: [...match.solved],
    scores: arbitrationScores(room),
    nextDealer: null,
  };
  match.revealResult = result;
  recordArbitrationMatch(room, match, result);
  broadcast(room, { t: 'arbitrationReveal', result });
  broadcastArbitrationTurn(room, match, 'reveal');
  changed(room);
}

function settleArbitrationRound(room) {
  const match = room.match;
  if (!match || match.rule !== 'arbitration' || match.phase !== 'player') return;
  recordArbitrationRoundOnce(room, match);
  let dealerRoundPoints = 0;
  for (const playerId of match.nonDealerIds) {
    if (match.solved.has(playerId)) continue;
    for (const index of match.published) {
      dealerRoundPoints += arbitrationScoreRow(match, playerId, index);
    }
  }
  match.dealerPoints += dealerRoundPoints;
  const dealer = room.players.get(match.dealerId);
  if (dealer) dealer.score += dealerRoundPoints;
  match.acceptingGuesses = false;
  broadcast(room, {
    t: 'arbitrationRoundResult',
    matchId: match.id,
    round: match.round,
    dealerPoints: dealerRoundPoints,
    scores: arbitrationScores(room),
  });
  const allSolved = match.nonDealerIds.length > 0
    && match.nonDealerIds.every((playerId) => match.solved.has(playerId));
  if (allSolved || match.round >= (Number(match.totalRounds) || 6)) {
    match.allSolved = allSolved;
    revealArbitrationStint(room, match);
    return;
  }
  match.round += 1;
  beginArbitrationDealerTurn(room, match, 'next-round');
}

function advanceArbitrationRound(room) {
  const match = room.match;
  if (!match || match.rule !== 'arbitration' || match.phase !== 'player') return;
  if (match.dealerDisconnected) {
    changed(room);
    return;
  }
  settleArbitrationRound(room);
}

function clearMatchTimer(room) {
  if (room.match?.timer) clearTimeout(room.match.timer);
}

async function buildEndlessClues(room, target, roundNo) {
  const ship = SHIPS_BY_ID.get(Number(target.shipId));
  if (!ship) throw new TargetUnavailable('target hull missing');
  const audit = room.gameplay === 'audit';
  let fittedAttrs = null;
  let baselineAttrs = null;
  if (audit) {
    fittedAttrs = await calculateDogmaFit(ship, target.killmail);
    baselineAttrs = await calculateDogmaBaseline(ship);
  }
  const built = buildClues({
    ship,
    catalog: config.catalogShips,
    refs: refsEn,
    stats: null,
    losses: [target.killmail],
    dateKey: `room:${room.code}:${roundNo}`,
    dataVersion: config.manifest?.clueVersion || 'room',
    targetKillId: target.killId,
    mode: audit ? 'audit' : 'normal',
    fittedAttrs,
    baselineAttrs,
    moduleFallbacks,
    weaponUpgradeGroups: config.manifest?.weaponUpgradeGroups || null,
    weaponGroups: config.manifest?.weaponGroups || null,
  });
  return {
    clues: built.clues.map((clue, index) => {
      const entry = ship.bonusEntries?.[clue.v];
      const text = clue.k === 'bonus' && entry?.text ? entry.text : null;
      return { ...clue, i: index, ...(text ? { text } : {}) };
    }),
    sampleKill: built.sampleKill,
    fittedKills: built.fittedKills,
    fitDelta: built.fitDelta,
  };
}

async function prepareEndlessRound(room, roundNo) {
  const match = room.match;
  if (!match || match.rule !== 'endless') return;
  clearTimeout(match.startTimer);
  clearTimeout(match.roundTimer);
  const target = await getRandomTarget(match.gameplay);
  recordExposure({
    source: 'room',
    mode: 'multiplayer',
    gameplay: match.gameplay,
    targetKillId: target.killId,
    targetShipId: target.shipId,
    gameDay: gameDateKey(new Date(), config.gameDayStartMinutes),
  });
  match.roundId = crypto.randomUUID();
  match.roundNo = roundNo;
  match.target = target;
  match.seed = `room:${room.code}:${roundNo}:${target.killId}`;
  const built = await buildEndlessClues(room, target, roundNo);
  match.clues = built.clues;
  match.sampleKill = built.sampleKill;
  match.fittedKills = built.fittedKills;
  match.fitDelta = built.fitDelta;
  match.phase = 'loading';
  match.ready.clear();
  match.prepared.clear();
  match.results = [];
  match.startAt = null;
  match.endsAt = null;
  match.history ||= [];
  broadcast(room, {
    t: 'endlessPrepare',
    roundId: match.roundId,
    roundNo: match.roundNo,
    gameplay: match.gameplay,
    target: match.target,
    seed: match.seed,
    clues: built.clues,
    sampleKill: built.sampleKill,
    fittedKills: built.fittedKills,
    fitDelta: built.fitDelta,
    activeIds: match.activeIds,
  });
  changed(room);
}

async function startEndlessSession(room) {
  const active = [...room.players.values()]
    .filter((player) => player.connected && !player.spectator)
    .map((player) => player.id);
  if (active.length < 2) return false;
  room.phase = 'playing';
  room.match = {
    id: crypto.randomUUID(),
    rule: 'endless',
    gameplay: room.gameplay,
    roundId: '',
    roundNo: 1,
    phase: 'loading',
    target: null,
    seed: '',
    activeIds: active,
    ready: new Set(),
    prepared: new Set(),
    results: [],
    history: [],
    startAt: null,
    endsAt: null,
    startTimer: null,
    roundTimer: null,
    startedAt: now(),
  };
  await prepareEndlessRound(room, 1);
  return true;
}

function startEndlessRound(room) {
  const match = room.match;
  if (!match || match.rule !== 'endless' || !['loading', 'ready'].includes(match.phase)) return;
  const startAt = now() + 2000;
  match.phase = 'starting';
  match.ready.clear();
  match.prepared.clear();
  match.startAt = startAt;
  match.endsAt = match.gameplay === 'timed'
    ? startAt + (Number(room.settings.raceDurationMs) || config.roomTimedDurationMinutes * 60 * 1000)
    : null;
  broadcast(room, {
    t: 'endlessStart',
    roundId: match.roundId,
    startAt: match.startAt,
    serverNow: now(),
    endsAt: match.endsAt,
  });
  changed(room);
  match.startTimer = setTimeout(() => {
    if (room.match !== match || match.phase !== 'starting') return;
    match.phase = 'playing';
    match.ready.clear();
    match.prepared.clear();
    changed(room);
    if (match.endsAt) {
      match.roundTimer = setTimeout(() => finishEndlessRound(room, 'timeout'), Math.max(1000, match.endsAt - now()));
    }
  }, Math.max(0, startAt - now()));
  match.startTimer.unref?.();
}

function finishEndlessRound(room, reason = 'complete') {
  const match = room.match;
  if (!match || match.rule !== 'endless' || match.phase === 'finished') return;
  clearTimeout(match.startTimer);
  clearTimeout(match.roundTimer);
  match.startTimer = null;
  match.roundTimer = null;
  const known = new Set(match.results.map((result) => result.playerId));
  if (reason === 'timeout') {
    for (const playerId of match.activeIds) {
      if (!known.has(playerId)) {
        match.results.push({ playerId, status: 'lost', attempts: 0, elapsedMs: 0, at: now() });
      }
    }
  }
  const points = {};
  let timedRank = 0;
  for (const result of match.results) {
    const pointsForPlayer = match.gameplay === 'timed'
      ? (result.status === 'won' ? rankPoints(++timedRank) : 0)
      : endlessRoundScore({
        status: result.status,
        attempts: result.attempts,
        x: ROOM_SCORE_PER_KB,
      });
    points[result.playerId] = pointsForPlayer;
    const player = room.players.get(result.playerId);
    if (player) player.score += pointsForPlayer;
  }
  const result = {
    roundId: match.roundId,
    roundNo: match.roundNo,
    gameplay: match.gameplay,
    target: match.target,
    results: [...match.results],
    points,
    scores: Object.fromEntries([...room.players.values()].map((player) => [player.id, player.score])),
    reason,
  };
  match.history.push(result);
  match.phase = 'finished';
  match.ready.clear();
  match.prepared.clear();
  broadcast(room, { t: 'endlessRoundResult', result });
  changed(room);
}

function endEndlessSession(room) {
  const match = room.match;
  if (!match || match.rule !== 'endless') return;
  clearTimeout(match.startTimer);
  clearTimeout(match.roundTimer);
  const result = {
    id: match.id,
    rule: 'endless',
    gameplay: match.gameplay,
    history: [...match.history],
    scores: Object.fromEntries([...room.players.values()].map((player) => [player.id, player.score])),
  };
  room.match = null;
  room.phase = 'between_matches';
  broadcast(room, { t: 'matchResult', result });
  changed(room);
}

function finishEndlessRaceResult(room, player, message) {
  const match = room.match;
  if (!match || match.rule !== 'endless') return;
  if (match.phase !== 'starting' && match.phase !== 'playing') return;
  if (Number(message.roundId) !== Number(match.roundId) && String(message.roundId) !== String(match.roundId)) return;
  if (!match.activeIds.includes(player.id)) return;
  if (match.startAt && now() < match.startAt) return;
  if (match.results.some((result) => result.playerId === player.id)) return;
  const status = message.status === 'won' ? 'won' : 'lost';
  if (status === 'won' && Number(message.answerId) !== Number(match.target.shipId)) return;
  match.results.push({
    playerId: player.id,
    status,
    attempts: Math.max(0, Number(message.attempts) || 0),
    elapsedMs: Math.max(0, Number(message.elapsedMs) || 0),
    at: now(),
  });
  broadcast(room, {
    t: 'endlessFinished',
    roundId: match.roundId,
    playerId: player.id,
    status,
  });
  if (match.activeIds.every((id) => match.results.some((result) => result.playerId === id))) {
    finishEndlessRound(room);
  } else {
    changed(room);
  }
}

async function startArbitration(room, dealerId) {
  const round = await pickDealerRound({
    manifest: config.manifest,
    catalog: config.catalogShips,
    refsEn,
    fetchImpl: fetch,
    mode: 'audit',
    moduleFallbacks,
    weaponUpgradeGroups: config.manifest?.weaponUpgradeGroups || null,
    weaponGroups: config.manifest?.weaponGroups || null,
    simulate: async (ship, target) => ({
      fittedAttrs: await calculateDogmaFit(ship, target.killmail),
      baselineAttrs: await calculateDogmaBaseline(ship),
    }),
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
    acceptingGuesses: false,
    dealerDisconnected: false,
    phase: 'dealer',
    prepared: new Set(),
    nonDealerIds: [...room.players.values()]
      .filter((player) => player.connected && !player.spectator && player.id !== dealerId)
      .map((player) => player.id),
    scoreData: null,
    autoIndices: new Set(),
    autoEquipmentCursor: 0,
    autoCargoCursor: 0,
    auditPlan: null,
    startedAt: now(),
    dealerPoints: 0,
    guesses: 0,
    correct: 0,
    revealResult: null,
    decoyShipIds: pickDecoyShips(round.shipId),
  };
  match.scoreData = allocatePlayerRoundScores({
    clues: match.clues,
    players: match.nonDealerIds,
    rounds: match.totalRounds,
    x: ROOM_SCORE_PER_KB,
  });
  selectArbitrationAuto(match);
  room.match = match;
  room.phase = 'playing';
  broadcast(room, {
    t: 'start',
    matchId: match.id,
    rule: 'arbitration',
    dealerId,
    round: match.round,
    totalRounds: match.totalRounds,
    phase: match.phase,
    acceptingGuesses: false,
    clueCount: match.clues.length,
    decoyShipIds: match.decoyShipIds,
  });
  const dealer = room.players.get(dealerId);
  send(dealer, {
    t: 'dealerClues',
    matchId: match.id,
    gameplay: 'arbitration',
    dealerId,
    clues: match.clues.map((clue, index) => arbitrationClueWire(match, clue, index)),
    autoIndices: [...match.autoIndices],
    round: match.round,
    totalRounds: match.totalRounds,
    phase: match.phase,
    dealerTarget: { shipId: match.target.shipId, killId: match.target.killId },
    decoyShipIds: match.decoyShipIds,
    scores: match.scoreData.scores,
  });
  changed(room);
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

function recordArbitrationMatch(room, match, result) {
  if (match.recordedMatch) return;
  match.recordedMatch = true;
  recordRoomMatch({
    id: match.id,
    roomCode: room.code,
    rule: 'arbitration',
    targetKillId: match.target.killId,
    targetShipId: match.target.shipId,
    result: { ...result, clues: undefined },
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
    target: { shipId: match.target.shipId, killId: match.target.killId },
    dealerPoints: match.dealerPoints,
    solved: [...match.solved],
    scores: arbitrationScores(room),
  };
  recordArbitrationMatch(room, match, result);
  room.match = null;
  room.phase = 'between_matches';
  room.bigRound = null;
  broadcast(room, { t: 'matchResult', result });
  changed(room);
}

function finishArbitrationReveal(room) {
  const match = room.match;
  if (!match || match.rule !== 'arbitration' || match.phase !== 'reveal') return;
  const active = [...room.players.values()].filter((player) => player.connected && !player.spectator);
  if (!active.length || !active.every((player) => match.prepared.has(player.id))) return;
  const round = room.bigRound;
  const step = nextBigRoundStep(round);
  if (step.kind === 'done') {
    const result = match.revealResult || {
      matchId: match.id,
      rule: 'arbitration',
      dealerId: match.dealerId,
      target: { shipId: match.target.shipId, killId: match.target.killId },
      dealerPoints: match.dealerPoints,
      solved: [...match.solved],
      scores: arbitrationScores(room),
    };
    room.match = null;
    room.bigRound = null;
    room.phase = 'between_matches';
    broadcast(room, { t: 'matchResult', result });
    changed(room);
    return;
  }
  round.index = step.index;
  round.number = step.number;
  room.match = null;
  room.phase = 'playing';
  startNextArbitration(room, round.order[round.index]).catch(() => failRoom(room, 'target'));
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
      startEndlessSession(room).catch(() => failRoom(room, 'target'));
    }
    return;
  }
  if (message.t === 'ready') {
    const match = room.match;
    if (!match || match.rule !== 'endless' || match.phase !== 'loading') return;
    if (String(message.roundId || '') !== String(match.roundId)) return;
    if (!match.activeIds.includes(player.id)) return;
    match.ready.add(player.id);
    if (match.activeIds.every((id) => match.ready.has(id))) {
      if (match.gameplay === 'timed') {
        match.phase = 'ready';
        broadcast(room, {
          t: 'endlessLoaded',
          roundId: match.roundId,
          roundNo: match.roundNo,
          activeCount: match.activeIds.length,
        });
        changed(room);
      } else {
        startEndlessRound(room);
      }
    } else {
      changed(room);
    }
    return;
  }
  if (message.t === 'prepare') {
    const match = room.match;
    if (!match) return;
    if (match.rule === 'endless') {
      if (match.phase === 'ready' && match.gameplay === 'timed') {
        if (!match.activeIds.includes(player.id)) return;
        match.prepared.add(player.id);
        if (match.activeIds.every((id) => match.prepared.has(id))) {
          startEndlessRound(room);
        } else {
          changed(room);
        }
        return;
      }
      if (match.phase !== 'finished') return;
      if (!match.activeIds.includes(player.id)) return;
      match.prepared.add(player.id);
      if (match.activeIds.every((id) => match.prepared.has(id))) {
        prepareEndlessRound(room, match.roundNo + 1).catch(() => failRoom(room, 'target'));
      } else {
        changed(room);
      }
      return;
    }
    if (match.rule === 'arbitration' && match.phase === 'reveal') {
      if (!match || player.spectator) return;
      match.prepared.add(player.id);
      const active = [...room.players.values()].filter((item) => item.connected && !item.spectator);
      if (active.length && active.every((item) => match.prepared.has(item.id))) {
        finishArbitrationReveal(room);
      } else {
        changed(room);
      }
    }
    return;
  }
  if (message.t === 'end') {
    if (!owner || room.phase !== 'playing') return;
    if (room.match?.rule === 'endless') endEndlessSession(room);
    else if (room.match?.rule === 'arbitration') endArbitration(room);
    return;
  }
  if (message.t === 'publish') {
    const match = room.match;
    if (!match || match.rule !== 'arbitration' || player.id !== match.dealerId) return;
    if (match.phase !== 'dealer') return;
    const indices = Array.isArray(message.indices) ? message.indices.map(Number) : [];
    const manual = [...new Set(indices)].filter((index) => (
      Number.isInteger(index)
      && index >= 0
      && index < match.clues.length
      && match.clues[index]?.k !== 'equipment'
      && match.clues[index]?.k !== 'cargo'
      && !match.published.has(index)
    ));
    const all = new Set([...manual, ...match.autoIndices]);
    const valid = [...all].filter((index) => !match.published.has(index));
    if (!valid.length) {
      send(player, { t: 'error', code: 'clue-required' });
      return;
    }
    for (const index of valid) {
      match.published.add(index);
      const wire = arbitrationClueWire(match, match.clues[index], index);
      match.publishedClues.push(wire);
      broadcast(room, { t: 'clue', clue: wire });
    }
    match.phase = 'player';
    match.acceptingGuesses = true;
    broadcast(room, {
      t: 'arbitrationClueBatch',
      matchId: match.id,
      round: match.round,
      count: valid.length,
      indices: valid,
    });
    broadcastArbitrationTurn(room, match, 'publish');
    changed(room);
    return;
  }
  if (message.t === 'guess') {
    const match = room.match;
    if (!match || match.rule !== 'arbitration' || match.phase !== 'player' || !match.acceptingGuesses) return;
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
      const row = match.scoreData?.scores?.[player.id]?.[Math.max(0, match.round - 1)] || [];
      const unrevealed = row.reduce((sum, value, index) => (
        match.published.has(index) ? sum : sum + (Number(value) || 0)
      ), 0);
      const remaining = Math.max(0, (Number(match.totalRounds) || 6) - match.round + 1);
      player.score += remaining * unrevealed;
      broadcast(room, { t: 'solved', playerId: player.id, points: remaining * unrevealed });
    } else {
      const row = match.scoreData?.scores?.[player.id]?.[Math.max(0, match.round - 1)] || [];
      const points = [...match.published].reduce((sum, index) => sum + (Number(row[index]) || 0), 0);
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
    finishEndlessRaceResult(room, player, message);
    return;
  }
  if (message.t === 'leave') {
    removePlayer(room, player, 'leave');
  }
  if (message.t === 'kick') {
    if (room.ownerId !== player.id) return;
    const target = room.players.get(String(message.playerId || ''));
    if (!target || target.id === player.id) return;
    send(target, { t: 'kicked', code: 'kicked' });
    removePlayer(room, target, 'kicked');
  }
}

function transferOwner(room) {
  const current = room.players.get(room.ownerId);
  if (current?.connected) return;
  const next = [...room.players.values()].find((p) => p.connected) || room.players.values().next().value;
  if (next) room.ownerId = next.id;
}

function removePlayer(room, player, reason = 'leave') {
  if (!player || player.removed) return;
  player.removed = true;
  player.connected = false;
  clearTimeout(player.reconnectTimer);
  player.reconnectTimer = null;
  player.reconnectUntil = null;
  const ws = player.ws;
  player.ws = null;
  room.players.delete(player.id);
  if (ws?.readyState === 1) {
    try { ws.close(1008, reason); } catch { /* already closed */ }
  }
  if (room.ownerId === player.id) transferOwner(room);
  if (room.match?.rule === 'endless') {
    const match = room.match;
    match.activeIds = match.activeIds.filter((id) => id !== player.id);
    match.ready.delete(player.id);
    match.prepared.delete(player.id);
    if (match.phase === 'ready' || match.phase === 'finished') match.prepared.clear();
    if (!match.activeIds.length) {
      endEndlessSession(room);
      return;
    }
    if (match.phase === 'loading' && match.activeIds.every((id) => match.ready.has(id))) {
      startEndlessRound(room);
      return;
    }
    if (match.phase === 'starting' || match.phase === 'playing') {
      if (match.activeIds.every((id) => match.results.some((result) => result.playerId === id))) {
        finishEndlessRound(room);
        return;
      }
    }
    changed(room);
    return;
  }
  if (room.match?.rule === 'arbitration' && room.match.dealerId === player.id) {
    endArbitration(room);
    return;
  }
  if (room.match?.rule === 'arbitration') {
    const match = room.match;
    match.nonDealerIds = match.nonDealerIds.filter((id) => id !== player.id);
    match.prepared.delete(player.id);
    if (match.phase === 'reveal') {
      match.prepared.clear();
      const active = [...room.players.values()].filter((item) => item.connected && !item.spectator);
      if (active.length && active.every((item) => match.prepared.has(item.id))) {
        finishArbitrationReveal(room);
        return;
      }
    }
  }
  changed(room);
}

function scheduleDisconnect(room, player) {
  clearTimeout(player.reconnectTimer);
  player.connected = false;
  player.disconnectedAt = now();
  player.reconnectUntil = now() + config.roomReconnectGraceMs;
  if (room.match?.rule === 'arbitration' && room.match.dealerId === player.id) {
    room.match.dealerDisconnected = true;
  }
  player.reconnectTimer = setTimeout(() => {
    player.reconnectTimer = null;
    if (ROOMS.get(room.code) !== room || player.removed || player.connected) return;
    removePlayer(room, player, 'timeout');
  }, config.roomReconnectGraceMs);
  player.reconnectTimer.unref?.();
  changed(room);
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
  persistClosed = false;
  app.addHook('onClose', async () => {
    flushRooms();
    persistClosed = true;
  });
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
    assignPlayerColor(room, player);
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
      assignPlayerColor(room, existing);
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
    assignPlayerColor(room, player);
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
    player.removed = false;
    clearTimeout(player.reconnectTimer);
    player.reconnectTimer = null;
    player.reconnectUntil = null;
    assignPlayerColor(room, player);
    if (room.match?.rule === 'arbitration' && room.match.dealerId === player.id) {
      room.match.dealerDisconnected = false;
    }
    if (player.spectator && room.phase === 'between_matches') player.spectator = false;
    send(player, { t: 'welcome', selfId: player.id, room: roomState(room) });
    if (room.match?.rule === 'arbitration' && player.id === room.match.dealerId) {
      sendDealerClues(room, room.match);
    }
    if (room.match?.rule === 'endless' && room.match.activeIds.includes(player.id)) {
      send(player, {
        t: 'endlessPrepare',
        roundId: room.match.roundId,
        roundNo: room.match.roundNo,
        gameplay: room.match.gameplay,
        target: room.match.target,
        seed: room.match.seed,
        clues: room.match.clues || [],
        sampleKill: room.match.sampleKill || null,
        fittedKills: room.match.fittedKills || [],
        fitDelta: room.match.fitDelta || null,
        activeIds: room.match.activeIds,
        resumed: true,
      });
      if (room.match.startAt) {
        send(player, {
          t: 'endlessStart',
          roundId: room.match.roundId,
          startAt: room.match.startAt,
          serverNow: now(),
          endsAt: room.match.endsAt,
        });
      }
    }
    changed(room);
    socket.on('message', (raw) => {
      try {
        onMessage(room, player, raw);
      } catch {
        // Ignore malformed room messages.
      }
    });
    socket.on('close', () => {
      if (player.removed || player.ws !== socket) return;
      player.ws = null;
      scheduleDisconnect(room, player);
    });
  });
}

export { ROOMS };
