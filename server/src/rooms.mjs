import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildSearchIndex, normalizeText } from '../../js/game.js';
import { buildClues } from '../../js/clues.js';
import { clueForWire, sanitizeChatText, sanitizeText } from '../../js/mp/protocol.js';
import {
  rankPoints,
  endlessRoundScore,
  ROOM_SCORE_PER_KB,
  ARBITRATION_SCORING,
  arbitrationShare,
  arbitrationSolvePoints,
  arbitrationDealerRoundRaw,
  arbitrationEndBonusRaw,
  arbitrationDealerCredit,
} from '../../js/mp/rules.js';
import { pickDealerRound } from '../../js/mp/target.js';
import { calculateDogmaFit, calculateDogmaBaseline } from '../../js/dogma.js';
import { buildRevealPlan } from '../../js/reveal.js';
import { config } from './config.mjs';
import { getSessionUser } from './auth.mjs';
import { now, statement } from './db.mjs';
import { withinLimit } from './limits.mjs';
import { getRandomTarget, TargetUnavailable } from './targets.mjs';
import { zkillFetch } from './zkill.mjs';
import { recordPlays, recordArbitrationRound, recordRoomMatch } from './stats.mjs';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RULES = new Set(['standard', 'audit', 'timed', 'arbitration']);
const ROOMS = new Map();
const scrypt = promisify(crypto.scrypt);

/** Close code for a socket taken over by a newer connection of that player. */
export const CLOSE_REPLACED = 4001;
const MESSAGE_WINDOW_MS = 10_000;
const MESSAGE_LIMIT = 120;
const PASSWORD_WINDOW_MS = 10 * 60 * 1000;
const PASSWORD_LIMIT = 8;
const CREATE_WINDOW_MS = 10 * 60 * 1000;
const CREATE_LIMIT = 10;
const passwordFailures = new Map();
const RACE_ATTEMPT_LIMIT = 6;
const RACE_COOLDOWN_MS = 5000;
// Network delay may shorten the gap between two guesses a client kept apart.
const RACE_COOLDOWN_TOLERANCE_MS = 500;

export function normalizeRoomSettings(current = {}, incoming = {}) {
  const next = { ...current };
  if (incoming.bigRounds != null) {
    const bigRounds = Number(incoming.bigRounds);
    if (Number.isInteger(bigRounds) && bigRounds >= 1 && bigRounds <= config.roomArbitrationMaxBigRounds) {
      next.bigRounds = bigRounds;
    }
  }
  if (typeof incoming.allowEmpty === 'boolean') next.allowEmpty = incoming.allowEmpty;
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

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(String(password), salt, 32)).toString('hex');
  return `${salt}:${hash}`;
}

async function verifyPassword(password, value) {
  if (!value) return true;
  const [salt, expected] = String(value).split(':');
  if (!salt || !expected) return false;
  const actual = await scrypt(String(password), salt, 32);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function passwordBlocked(key) {
  const entry = passwordFailures.get(key);
  if (!entry) return false;
  if (now() >= entry.resetAt) {
    passwordFailures.delete(key);
    return false;
  }
  return entry.count >= PASSWORD_LIMIT;
}

function recordPasswordFailure(key) {
  const entry = passwordFailures.get(key);
  if (entry && now() < entry.resetAt) entry.count += 1;
  else passwordFailures.set(key, { count: 1, resetAt: now() + PASSWORD_WINDOW_MS });
}

function messageAllowed(player) {
  const at = now();
  if (at - (player.messageWindowStart || 0) > MESSAGE_WINDOW_MS) {
    player.messageWindowStart = at;
    player.messageCount = 0;
  }
  player.messageCount = (player.messageCount || 0) + 1;
  return player.messageCount <= MESSAGE_LIMIT;
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
      finished: [...new Set(match.results.map((result) => result.playerId))].filter((id) => match.activeIds.includes(id)),
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
      share: arbitrationMatchShare(match),
      playerCount: Number(match.playerCount) || 0,
      scoring: ARBITRATION_SCORING,
      dealerPoints: Number(match.dealerPoints) || 0,
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
  return null;
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

function prunePasswordFailures(at) {
  for (const [key, entry] of passwordFailures) {
    if (at >= entry.resetAt) passwordFailures.delete(key);
  }
}

/** Drop rooms that outlived their TTL and have nobody connected. */
export function evictExpiredRooms(at = now()) {
  let evicted = 0;
  prunePasswordFailures(at);
  for (const [code, room] of ROOMS) {
    if (room.expiresAt > at) continue;
    if ([...room.players.values()].some((player) => player.connected)) continue;
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

/** Full names only: clients complete abbreviations before they submit a guess. */
export function acceptedNames(shipId) {
  return new Set(SEARCH_BY_SHIP.get(Number(shipId))?.names || []);
}

function arbitrationMatchShare(match) {
  return arbitrationShare(match.clues, match.published);
}

function arbitrationClueWire(match, clue, index) {
  return {
    ...clueForWire(clue),
    i: index,
    p: arbitrationShare(match.clues, [index]),
    ...(match.autoIndices?.has(index) ? { auto: true } : {}),
  };
}

/** Players who started the stint and have not solved; a leaver stays unsolved. */
function arbitrationUnsolvedCount(match) {
  return match.nonDealerIds.filter((id) => !match.solved.has(id)).length;
}

/** Add raw dealer points and credit the rounded difference to the dealer. */
function creditArbitrationDealer(room, match, raw) {
  match.dealerRaw = (Number(match.dealerRaw) || 0) + Math.max(0, Number(raw) || 0);
  const credit = arbitrationDealerCredit({
    raw: match.dealerRaw,
    players: match.playerCount,
    credited: match.dealerPoints,
  });
  match.dealerPoints += credit;
  const dealer = room.players.get(match.dealerId);
  if (dealer) dealer.score += credit;
  return credit;
}

/** The dealer's settlement for the current round, once per round. */
function settleArbitrationDealerRound(room, match) {
  match.settledRounds ||= new Set();
  if (match.settledRounds.has(match.round)) return 0;
  match.settledRounds.add(match.round);
  return creditArbitrationDealer(room, match, arbitrationDealerRoundRaw({
    share: arbitrationMatchShare(match),
    unsolved: arbitrationUnsolvedCount(match),
  }));
}

/** The dealer's end bonus, once per stint. */
function applyArbitrationEndBonus(room, match) {
  if (match.endBonusApplied) return match.endBonus || 0;
  match.endBonusApplied = true;
  match.endBonus = creditArbitrationDealer(room, match, arbitrationEndBonusRaw({
    share: arbitrationMatchShare(match),
    players: match.playerCount,
  }));
  return match.endBonus;
}

/** Players still in the room who started this stint. */
function presentArbitrationPlayers(room, match) {
  return match.nonDealerIds.filter((id) => room.players.has(id));
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
  const endBonus = applyArbitrationEndBonus(room, match);
  const result = {
    matchId: match.id,
    rule: 'arbitration',
    dealerId: match.dealerId,
    round: match.round,
    totalRounds: match.totalRounds,
    target: { shipId: match.target.shipId, killId: match.target.killId },
    dealerPoints: match.dealerPoints,
    endBonus,
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
  const dealerRoundPoints = settleArbitrationDealerRound(room, match);
  recordArbitrationRoundOnce(room, match);
  match.acceptingGuesses = false;
  broadcast(room, {
    t: 'arbitrationRoundResult',
    matchId: match.id,
    round: match.round,
    dealerPoints: dealerRoundPoints,
    scores: arbitrationScores(room),
  });
  const present = presentArbitrationPlayers(room, match);
  const allSolved = present.length > 0
    && present.every((playerId) => match.solved.has(playerId));
  if (allSolved || match.round >= (Number(match.totalRounds) || 6)) {
    match.allSolved = allSolved;
    revealArbitrationStint(room, match);
    return;
  }
  match.round += 1;
  beginArbitrationDealerTurn(room, match, 'next-round');
}

/**
 * Resolve a guessing phase that nobody can continue: called after a player left
 * for good and after the dealer returned. A short drop keeps the turn open.
 */
function checkArbitrationProgress(room) {
  const match = room.match;
  if (!match || match.rule !== 'arbitration') return false;
  if (match.phase === 'reveal') {
    const active = [...room.players.values()].filter((item) => item.connected && !item.spectator);
    if (!active.length || !active.every((item) => match.prepared.has(item.id))) return false;
    finishArbitrationReveal(room);
    return true;
  }
  if (!match.nonDealerIds.some((id) => room.players.has(id))) {
    endArbitration(room);
    return true;
  }
  if (match.phase !== 'player' || !match.acceptingGuesses || match.dealerDisconnected) return false;
  const pending = match.nonDealerIds.filter((id) => (
    room.players.has(id) && !match.solved.has(id) && !match.guessed.has(id)
  ));
  if (pending.length) return false;
  advanceArbitrationRound(room);
  return true;
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

/**
 * Run one asynchronous load for a room. `current()` turns false when the load was
 * cancelled or superseded, so late results and errors cannot touch a newer match.
 */
function loadMatch(room, work) {
  const token = {};
  room.loadToken = token;
  const current = () => ROOMS.get(room.code) === room && room.loadToken === token;
  return work(current)
    .catch((error) => { if (current()) failRoom(room, error?.code === 'need-players' ? 'need-players' : 'target'); })
    .finally(() => { if (room.loadToken === token) room.loadToken = null; });
}

function cancelLoad(room) {
  room.loadToken = null;
}

function connectedPilots(room) {
  return [...room.players.values()].filter((player) => player.connected && !player.spectator);
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

async function prepareEndlessRound(room, roundNo, current) {
  const match = room.match;
  if (!match || match.rule !== 'endless') return;
  clearTimeout(match.startTimer);
  clearTimeout(match.roundTimer);
  const target = await getRandomTarget(match.gameplay, { allowEmpty: room.settings?.allowEmpty !== false });
  const built = await buildEndlessClues(room, target, roundNo);
  if (!current() || room.match !== match) return;
  match.roundId = crypto.randomUUID();
  match.roundNo = roundNo;
  match.target = target;
  match.seed = `room:${room.code}:${roundNo}:${target.killId}`;
  match.clues = built.clues;
  match.sampleKill = built.sampleKill;
  match.fittedKills = built.fittedKills;
  match.fitDelta = built.fitDelta;
  match.phase = 'loading';
  match.ready.clear();
  match.prepared.clear();
  match.results = [];
  match.guesses = new Map();
  match.lastGuessAt = new Map();
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

function startEndlessSession(room) {
  const active = connectedPilots(room).map((player) => player.id);
  if (active.length < 2) return;
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
    guesses: new Map(),
    lastGuessAt: new Map(),
    history: [],
    startAt: null,
    endsAt: null,
    startTimer: null,
    roundTimer: null,
    startedAt: now(),
  };
  changed(room);
  loadMatch(room, (current) => prepareEndlessRound(room, 1, current));
}

/** Every remaining player loaded the round. Timed rooms still ask for a ready. */
function finishEndlessLoading(room) {
  const match = room.match;
  if (match.gameplay !== 'timed') {
    startEndlessRound(room);
    return;
  }
  match.phase = 'ready';
  broadcast(room, {
    t: 'endlessLoaded',
    roundId: match.roundId,
    roundNo: match.roundNo,
    activeCount: match.activeIds.length,
  });
  changed(room);
}

/** Every remaining player asked for the next step. */
function finishEndlessPrepare(room) {
  const match = room.match;
  if (match.phase === 'ready') {
    startEndlessRound(room);
    return;
  }
  if (room.loadToken) return;
  loadMatch(room, (current) => prepareEndlessRound(room, match.roundNo + 1, current));
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
      match.roundTimer.unref?.();
    }
  }, Math.max(0, startAt - now()));
  match.startTimer.unref?.();
}

/**
 * Add the round's results to the anonymous difficulty counters. A player counts
 * from the first guess (a timed round from its start); one who left the room
 * mid-round counts as abandoned, but only after a guess.
 */
function recordRacePlays(match) {
  recordPlays(match.results.flatMap((result) => {
    const guessed = Number(result.attempts) > 0;
    if (result.forfeit ? !guessed : !guessed && match.gameplay !== 'timed') return [];
    return [{
      killId: match.target.killId,
      shipId: match.target.shipId,
      gameplay: match.gameplay,
      outcome: result.status === 'won' ? 'won' : (result.forfeit ? 'abandoned' : 'lost'),
      attempts: result.attempts,
      elapsedMs: result.elapsedMs,
    }];
  }));
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
        match.results.push(raceResult(match, playerId, 'lost'));
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
  recordRacePlays(match);
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
  cancelLoad(room);
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

function raceGuesses(match, playerId) {
  return [...(match.guesses?.get(playerId) || [])];
}

function raceResult(match, playerId, status) {
  return {
    playerId,
    status,
    attempts: raceGuesses(match, playerId).length,
    elapsedMs: match.startAt ? Math.max(0, now() - match.startAt) : 0,
    at: now(),
  };
}

/** The player's open part in this round, or null once it is decided. */
function openRace(room, player, message) {
  const match = room.match;
  if (!match || match.rule !== 'endless') return null;
  if (match.phase !== 'starting' && match.phase !== 'playing') return null;
  if (!match.roundId || String(message.roundId) !== String(match.roundId)) return null;
  return match.activeIds.includes(player.id) ? match : null;
}

/** Tell one player what the server has recorded for them in this round. */
function sendRaceGuesses(player, match, extra = {}) {
  const result = match.results.find((item) => item.playerId === player.id);
  send(player, {
    t: 'raceGuesses',
    roundId: match.roundId,
    guesses: raceGuesses(match, player.id),
    status: result?.status || 'playing',
    ...extra,
  });
}

function recordRaceResult(room, player, status, extra = {}) {
  const match = room.match;
  match.results.push({ ...raceResult(match, player.id, status), ...extra });
  broadcast(room, {
    t: 'endlessFinished',
    roundId: match.roundId,
    playerId: player.id,
    status,
    ...extra,
  });
}

function raceComplete(match) {
  return match.activeIds.every((id) => match.results.some((result) => result.playerId === id));
}

function handleRaceGuess(room, player, message) {
  const match = openRace(room, player, message);
  const shipId = Number(message.shipId);
  if (!match || !SHIPS_BY_ID.has(shipId)) return;
  const decided = match.results.some((result) => result.playerId === player.id);
  const guesses = raceGuesses(match, player.id);
  if (decided || guesses.includes(shipId)) {
    // A resent guess after a lost answer must not count twice.
    sendRaceGuesses(player, match);
    return;
  }
  const at = now();
  const lastAt = match.lastGuessAt.get(player.id) || 0;
  const notBefore = Math.max(match.startAt || 0, match.gameplay === 'timed' && lastAt
    ? lastAt + RACE_COOLDOWN_MS - RACE_COOLDOWN_TOLERANCE_MS
    : 0);
  if (at < notBefore) {
    sendRaceGuesses(player, match, { retryMs: notBefore - at });
    return;
  }
  match.guesses.set(player.id, [...guesses, shipId]);
  match.lastGuessAt.set(player.id, at);
  const won = shipId === Number(match.target.shipId);
  const lost = !won && match.gameplay !== 'timed' && guesses.length + 1 >= RACE_ATTEMPT_LIMIT;
  if (won || lost) recordRaceResult(room, player, won ? 'won' : 'lost');
  sendRaceGuesses(player, match);
  if (!won && !lost) return;
  if (raceComplete(match)) finishEndlessRound(room);
  else changed(room);
}

/** Only a timed round can end without the answer: given up or out of clues. */
function handleRaceLoss(room, player, message) {
  const match = openRace(room, player, message);
  if (!match || match.gameplay !== 'timed' || message.status !== 'lost') return;
  if (match.startAt && now() < match.startAt) return;
  if (match.results.some((result) => result.playerId === player.id)) return;
  recordRaceResult(room, player, 'lost');
  sendRaceGuesses(player, match);
  if (raceComplete(match)) finishEndlessRound(room);
  else changed(room);
}

/** Leaving for good during a running round counts as a loss of that round. */
function forfeitRound(room, player) {
  const match = room.match;
  if (match.phase !== 'starting' && match.phase !== 'playing') return;
  if (!match.activeIds.includes(player.id)) return;
  if (match.results.some((result) => result.playerId === player.id)) return;
  recordRaceResult(room, player, 'lost', { forfeit: true, name: player.name });
}

/**
 * The dealer whose turn it is, or, when that pilot is gone, the next pilot in
 * the big-round order who is still connected.
 */
function substituteDealerId(room, active, wantedDealerId) {
  const ids = new Set(active.map((player) => player.id));
  if (ids.has(wantedDealerId)) return wantedDealerId;
  const order = room.bigRound?.order || [];
  const at = order.indexOf(wantedDealerId);
  if (at >= 0) {
    for (let step = 1; step < order.length; step += 1) {
      const id = order[(at + step) % order.length];
      if (ids.has(id)) return id;
    }
  }
  return active[0].id;
}

async function startArbitration(room, wantedDealerId, current) {
  const round = await pickDealerRound({
    manifest: config.manifest,
    catalog: config.catalogShips,
    refsEn,
    fetchImpl: zkillFetch,
    allowEmpty: room.settings?.allowEmpty !== false,
    mode: 'audit',
    moduleFallbacks,
    weaponUpgradeGroups: config.manifest?.weaponUpgradeGroups || null,
    weaponGroups: config.manifest?.weaponGroups || null,
    simulate: async (ship, target) => ({
      fittedAttrs: await calculateDogmaFit(ship, target.killmail),
      baselineAttrs: await calculateDogmaBaseline(ship),
    }),
  });
  if (!current()) return;
  // Players may have left while the target loaded.
  const active = connectedPilots(room);
  if (active.length < 2) throw Object.assign(new Error('not enough players'), { code: 'need-players' });
  const dealerId = substituteDealerId(room, active, wantedDealerId);
  const accepted = acceptedNames(round.ship.id);
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
    playerCount: 0,
    dealerRaw: 0,
    settledRounds: new Set(),
    endBonusApplied: false,
    endBonus: 0,
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
  match.playerCount = match.nonDealerIds.length;
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
    publishedShare: arbitrationMatchShare(match),
    unsolved: arbitrationUnsolvedCount(match),
  });
}

function recordArbitrationMatch(room, match, result) {
  if (match.recordedMatch) return;
  match.recordedMatch = true;
  // Players who never got to guess tell nothing about the target. A leaver stays
  // unsolved, as in the scoring. Only counts are kept: the clues were chosen by
  // the dealer, so these rows must not be mixed with the other gameplays.
  if (match.guesses > 0 || match.solved.size > 0) {
    const solved = Math.min(match.solved.size, match.playerCount);
    const base = { killId: match.target.killId, shipId: match.target.shipId, gameplay: 'arbitration' };
    recordPlays([
      { ...base, outcome: 'won', plays: solved },
      { ...base, outcome: 'lost', plays: match.playerCount - solved },
    ]);
  }
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
  // Settle what was played before the stint ends: the current round only
  // counts once the dealer has published in it.
  if (match.phase === 'player') settleArbitrationDealerRound(room, match);
  const endBonus = applyArbitrationEndBonus(room, match);
  recordArbitrationRoundOnce(room, match);
  const result = {
    matchId: match.id,
    rule: 'arbitration',
    dealerId: match.dealerId,
    target: { shipId: match.target.shipId, killId: match.target.killId },
    dealerPoints: match.dealerPoints,
    endBonus,
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
      endBonus: match.endBonus || 0,
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
  loadMatch(room, (current) => startArbitration(room, round.order[round.index], current));
}

function failRoom(room, reason) {
  cancelLoad(room);
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
    if (!owner || !['lobby', 'between_matches'].includes(room.phase)) return;
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
    const active = connectedPilots(room);
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
      // Reserve the room before the target loads, so it cannot start twice.
      room.phase = 'playing';
      changed(room);
      loadMatch(room, (current) => startArbitration(room, order[0], current));
    } else {
      startEndlessSession(room);
    }
    return;
  }
  if (message.t === 'ready') {
    const match = room.match;
    if (!match || match.rule !== 'endless' || match.phase !== 'loading') return;
    if (String(message.roundId || '') !== String(match.roundId)) return;
    if (!match.activeIds.includes(player.id)) return;
    match.ready.add(player.id);
    if (match.activeIds.every((id) => match.ready.has(id))) finishEndlessLoading(room);
    else changed(room);
    return;
  }
  if (message.t === 'prepare') {
    const match = room.match;
    if (!match) return;
    if (match.rule === 'endless') {
      if (match.phase !== 'finished' && !(match.phase === 'ready' && match.gameplay === 'timed')) return;
      if (!match.activeIds.includes(player.id)) return;
      match.prepared.add(player.id);
      if (match.activeIds.every((id) => match.prepared.has(id))) finishEndlessPrepare(room);
      else changed(room);
      return;
    }
    if (match.rule === 'arbitration' && match.phase === 'reveal') {
      if (player.spectator) return;
      match.prepared.add(player.id);
      if (!checkArbitrationProgress(room)) changed(room);
    }
    return;
  }
  if (message.t === 'end') {
    if (!owner || room.phase !== 'playing') return;
    if (room.match?.rule === 'endless') endEndlessSession(room);
    else if (room.match?.rule === 'arbitration') endArbitration(room);
    else if (room.loadToken) {
      // The next arbitration target is still loading.
      cancelLoad(room);
      room.phase = 'between_matches';
      room.bigRound = null;
      changed(room);
    }
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
    // Each round must publish some weight, so every round a player holds out
    // is worth more to the dealer. Only when nothing weighted is left may a
    // round publish weightless clues alone.
    const weighted = (index) => (Number(match.clues[index]?.w) || 0) > 0;
    const weightLeft = match.clues.some((clue, index) => (
      !match.published.has(index)
      && weighted(index)
      && ((clue.k !== 'equipment' && clue.k !== 'cargo') || match.autoIndices.has(index))
    ));
    if (weightLeft && !valid.some(weighted)) {
      send(player, { t: 'error', code: 'clue-weight-required' });
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
      const points = arbitrationSolvePoints({ share: arbitrationMatchShare(match), round: match.round });
      player.score += points;
      broadcast(room, { t: 'solved', playerId: player.id, points });
    } else {
      broadcast(room, { t: 'miss', playerId: player.id });
    }
    if (activeGuessers(room).every((p) => match.guessed.has(p.id))) {
      advanceArbitrationRound(room);
    } else {
      changed(room);
    }
    return;
  }
  if (message.t === 'raceGuess') {
    handleRaceGuess(room, player, message);
    return;
  }
  if (message.t === 'raceResult') {
    handleRaceLoss(room, player, message);
    return;
  }
  if (message.t === 'leave') {
    removePlayer(room, player, 'leave');
    return;
  }
  if (message.t === 'kick') {
    if (room.ownerId !== player.id) return;
    const target = room.players.get(String(message.playerId || ''));
    if (!target || target.id === player.id) return;
    send(target, { t: 'kicked', code: 'kicked' });
    removePlayer(room, target, 'kicked');
  }
}

/** The owner must be someone in the room; prefer a connected player. */
function ensureOwner(room) {
  if (room.players.has(room.ownerId)) return;
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
  ensureOwner(room);
  if (room.match?.rule === 'endless') {
    const match = room.match;
    if (reason !== 'kicked') forfeitRound(room, player);
    match.activeIds = match.activeIds.filter((id) => id !== player.id);
    match.ready.delete(player.id);
    match.prepared.delete(player.id);
    if (!match.activeIds.length) {
      endEndlessSession(room);
      return;
    }
    if (match.phase === 'loading' && match.target && match.activeIds.every((id) => match.ready.has(id))) {
      finishEndlessLoading(room);
      return;
    }
    if (['ready', 'finished'].includes(match.phase) && match.activeIds.every((id) => match.prepared.has(id))) {
      finishEndlessPrepare(room);
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
    // A leaver keeps counting as unsolved; points already earned stay.
    match.prepared.delete(player.id);
    if (checkArbitrationProgress(room)) return;
  }
  changed(room);
}

function scheduleDisconnect(room, player) {
  player.connected = false;
  player.disconnectedAt = now();
  if (room.match?.rule === 'arbitration' && room.match.dealerId === player.id) {
    room.match.dealerDisconnected = true;
  }
  startGrace(room, player);
  changed(room);
}

/** Remove the player unless they connect within the grace. */
function startGrace(room, player) {
  clearTimeout(player.reconnectTimer);
  player.reconnectUntil = now() + config.roomReconnectGraceMs;
  player.reconnectTimer = setTimeout(() => {
    player.reconnectTimer = null;
    if (ROOMS.get(room.code) !== room || player.removed || player.connected) return;
    removePlayer(room, player, 'timeout');
  }, config.roomReconnectGraceMs);
  player.reconnectTimer.unref?.();
}

/** Bring a (re)connected player to the point the endless round has reached. */
function resumeEndless(room, player) {
  const match = room.match;
  // The target is still loading; the regular broadcast follows.
  if (!match.target || !match.activeIds.includes(player.id)) return;
  const submitted = match.results.find((result) => result.playerId === player.id) || null;
  send(player, {
    t: 'endlessPrepare',
    roundId: match.roundId,
    roundNo: match.roundNo,
    gameplay: match.gameplay,
    target: match.target,
    seed: match.seed,
    clues: match.clues || [],
    sampleKill: match.sampleKill || null,
    fittedKills: match.fittedKills || [],
    fitDelta: match.fitDelta || null,
    activeIds: match.activeIds,
    guesses: raceGuesses(match, player.id),
    resumed: true,
    phase: match.phase,
    submitted: submitted ? { status: submitted.status, attempts: submitted.attempts } : null,
  });
  if (match.phase === 'finished') {
    const result = match.history.at(-1);
    if (result?.roundId === match.roundId) send(player, { t: 'endlessRoundResult', result });
    return;
  }
  if (match.phase === 'ready') {
    send(player, {
      t: 'endlessLoaded',
      roundId: match.roundId,
      roundNo: match.roundNo,
      activeCount: match.activeIds.length,
    });
    return;
  }
  if (match.startAt && !submitted) {
    send(player, {
      t: 'endlessStart',
      roundId: match.roundId,
      startAt: match.startAt,
      serverNow: now(),
      endsAt: match.endsAt,
      resumed: true,
    });
  }
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
  // Ping frames keep idle connections alive through proxies and expose dead peers.
  const heartbeat = setInterval(() => {
    for (const room of ROOMS.values()) {
      for (const player of room.players.values()) {
        const ws = player.ws;
        if (ws?.readyState !== 1) continue;
        ws.missedPongs = (ws.missedPongs || 0) + 1;
        if (ws.missedPongs > 2) ws.terminate();
        else ws.ping();
      }
    }
  }, config.roomHeartbeatMs);
  heartbeat.unref?.();
  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    flushRooms();
    persistClosed = true;
  });
  app.post('/api/v1/rooms', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    if (!withinLimit(`room:${user.name_key}`, CREATE_LIMIT, CREATE_WINDOW_MS)) {
      reply.code(429).send({ error: 'rate-limited' });
      return;
    }
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
      passwordHash: request.body?.password ? await hashPassword(String(request.body.password).slice(0, 128)) : '',
      ownerId: id,
      players: new Map([[id, player]]),
      phase: 'lobby',
      gameplay: null,
      settings: {
        bigRounds: config.roomArbitrationBigRounds,
        raceDurationMs: config.roomTimedDurationMinutes * 60 * 1000,
        allowEmpty: true,
      },
      match: null,
      bigRound: null,
      createdAt: now(),
      expiresAt: now() + config.roomTtlMs,
    };
    ROOMS.set(code, room);
    assignPlayerColor(room, player);
    startGrace(room, player);
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
    const seated = () => [...room.players.values()].find((p) => p.nameKey === user.name_key);
    if (room.passwordHash && !seated()) {
      const password = String(request.body?.password || '').slice(0, 128);
      if (!password) {
        // An invite link tries without a password first; that is no guess.
        reply.code(403).send({ error: 'wrong-password' });
        return;
      }
      // Per room, so a success elsewhere cannot reset the count here.
      const key = `${user.name_key}:${code}`;
      if (passwordBlocked(key)) {
        reply.code(429).send({ error: 'join-rate-limit' });
        return;
      }
      if (!await verifyPassword(password, room.passwordHash)) {
        recordPasswordFailure(key);
        reply.code(403).send({ error: 'wrong-password' });
        return;
      }
      passwordFailures.delete(key);
      // The room may have been evicted while the password was checked.
      if (ROOMS.get(code) !== room) {
        reply.code(404).send({ error: 'room-not-found' });
        return;
      }
    }
    const existing = seated();
    if (existing) {
      existing.name = user.display_name;
      existing.characterId = user.character_id == null ? existing.characterId : Number(user.character_id);
      assignPlayerColor(room, existing);
      if (!existing.connected && !existing.reconnectTimer) startGrace(room, existing);
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
    ensureOwner(room);
    startGrace(room, player);
    changed(room);
    return { code, playerId: id, room: roomState(room), wsPath: `/api/v1/rooms/${code}/ws?player=${id}` };
  });

  app.get('/api/v1/rooms/:code', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const room = ROOMS.get(String(request.params.code || '').toUpperCase());
    // Outsiders learn nothing about a room, not even that it exists.
    if (![...(room?.players.values() || [])].some((player) => player.nameKey === user.name_key)) {
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
    const previous = player.ws;
    player.ws = socket;
    if (previous && previous !== socket && previous.readyState <= 1) previous.close(CLOSE_REPLACED, 'replaced');
    const openedAt = now();
    let lastMessageAt = openedAt;
    socket.on('pong', () => { socket.missedPongs = 0; });
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
    if (room.match?.rule === 'endless') resumeEndless(room, player);
    if (!checkArbitrationProgress(room)) changed(room);
    socket.on('message', (raw) => {
      socket.missedPongs = 0;
      lastMessageAt = now();
      if (player.removed || player.ws !== socket || !messageAllowed(player)) return;
      try {
        onMessage(room, player, raw);
      } catch {
        // Ignore malformed room messages.
      }
    });
    socket.on('close', (closeCode) => {
      // Diagnostics for dropped connections; no names, chat or targets.
      app.log.info({
        event: 'room-socket-closed',
        closeCode,
        openMs: now() - openedAt,
        idleMs: now() - lastMessageAt,
        phase: room.phase,
        removed: Boolean(player.removed),
        replaced: Boolean(player.ws) && player.ws !== socket,
      }, 'room socket closed');
      if (player.removed || player.ws !== socket) return;
      player.ws = null;
      scheduleDisconnect(room, player);
    });
  });
}

export { ROOMS };
