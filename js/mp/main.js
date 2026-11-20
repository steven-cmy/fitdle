/**
 * FITDLE multiplayer shell.
 *
 * Race rooms reuse the whole single-player puzzle in an iframe and only
 * synchronise the shared killmail, results and scores. Dealer rooms keep the
 * answer on the dealer client and publish clues through the host relay.
 */
import { createI18n, detectLocale, LOCALES, LOCALE_META } from '../i18n.js';
import { icon } from '../icons.js';
import { freeKillToken, normalizeText, buildSearchIndex, searchShips } from '../game.js';
import {
  createHost, joinHost, randomRoomCode, SignalingError,
} from './net.js';
import {
  clueForWire, decodeMessage, encodeMessage, normalizeName, RateLimiter, sanitizeName,
  sanitizeText, validClueForWire, validName, PROTOCOL_VERSION,
} from './protocol.js';
import {
  DEFAULT_DEAL_MS, DEFAULT_RACE_ROUND_MS, DEFAULT_SCORE_TARGET, MAX_PLAYERS,
  pvpRoundScores, raceRoundScores, raceTargetReached, rankPoints, rankPlayers, score,
  unpublishedWeight,
} from './rules.js';
import { pickDealerRound, pickRaceTarget, KbUnavailableError } from './target.js';
import { esc, renderClueList } from './clue-view.js';

const TYPES = new Set(['race', 'dealer']);
const MODES = new Set(['standard', 'abyss', 'timed']);
const RACE_POINTS = [10, 8, 6, 4, 2, 1, 1, 1];

const state = {
  locale: 'en',
  i18n: null,
  manifest: null,
  catalog: null,
  catalogMap: new Map(),
  refs: null,
  refsEn: null,
  searchAliases: null,
  searchIndex: null,
  type: 'race',
  role: null,
  selfId: null,
  selfName: '',
  password: '',
  code: '',
  host: null,
  guest: null,
  roomCode: '',
  room: null,
  players: new Map(),
  settings: null,
  phase: 'boot',
  round: 0,
  cycle: 0,
  dealerId: null,
  target: null,
  published: new Set(),
  publishedClues: [],
  solves: [],
  clues: null,
  dealerTarget: null,
  accepted: new Set(),
  results: [],
  roundActive: [],
  scores: {},
  solvesByPlayer: {},
  iframeReady: false,
  iframeTimer: null,
  roundTimer: null,
  tickTimer: null,
  endsAt: 0,
  remainingMs: 0,
  usedKillIds: new Set(),
  usedShipIds: new Set(),
  failedDealers: new Set(),
  dealerOrder: [],
  dealIndex: 0,
  rateLimiter: new RateLimiter(),
  busy: false,
  notice: '',
  error: '',
  errorCode: '',
  spectator: false,
  feed: [],
  guess: '',
  roomType: null,
  lastResult: null,
};

function q(selector) {
  return document.querySelector(selector);
}

function T(key, fallback, vars = {}) {
  const value = state.i18n?.t(key, vars);
  return value && value !== key ? value : (fallback ?? key);
}

function tag(text, className = 'tag') {
  return `<span class="${className}">${esc(text)}</span>`;
}

function playerArray() {
  return [...state.players.values()].filter((player) => player.admitted !== false);
}

function selfPlayer() {
  return state.players.get(state.selfId) || null;
}

function activePlayers() {
  return playerArray().filter((player) => player.connected && !player.spectator);
}

function activeIds() {
  return activePlayers().map((player) => String(player.id));
}

function isHost() {
  return state.role === 'host';
}

function isDealer() {
  return state.dealerId != null && String(state.dealerId) === String(state.selfId);
}

function playerName(id) {
  return state.players.get(String(id))?.name || '—';
}

function ctxClue() {
  return {
    t: (key, vars) => state.i18n.t(key, vars),
    refs: state.refs,
    locale: state.locale,
    int: (value) => state.i18n.integer(value),
    dec: (value, digits) => state.i18n.decimal(value, digits),
    compact: (value) => state.i18n.compact(value),
    isk: (value) => state.i18n.isk(value),
    percent: (value) => state.i18n.percent(value),
  };
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'default' });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

function setHash(value) {
  const url = new URL(location.href);
  url.hash = value;
  history.replaceState(null, '', url);
}

function roomLink() {
  const url = new URL(location.href);
  url.hash = `room=${state.code}&type=${state.type}`;
  return url.toString();
}

function parseHash() {
  const raw = String(location.hash || '').replace(/^#/, '');
  const params = new URLSearchParams(raw);
  const room = params.get('room') || '';
  const type = params.get('type') || 'race';
  if (!TYPES.has(type)) return { action: 'hub', type: 'race', code: '' };
  if (room === 'create') return { action: 'create', type, code: '' };
  if (room) return { action: 'join', type, code: room.toUpperCase() };
  return { action: 'hub', type: 'race', code: '' };
}

function randomCode() {
  return randomRoomCode(8);
}

function shuffle(list) {
  const values = [...list];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function defaultSettings(type) {
  if (type === 'dealer') {
    return { cycles: 2, dealMs: DEFAULT_DEAL_MS };
  }
  return {
    mode: 'standard',
    scoreTarget: DEFAULT_SCORE_TARGET,
    rounds: 3,
    durationMs: DEFAULT_RACE_ROUND_MS,
  };
}

function roomSnapshot() {
  return {
    v: PROTOCOL_VERSION,
    t: 'room',
    room: {
      code: state.code,
      type: state.type,
      hostId: 'h',
      phase: state.phase,
      round: state.round,
      cycle: state.cycle,
      dealerId: state.dealerId,
      settings: state.settings,
      scores: state.scores,
      solves: state.solvesByPlayer,
      error: state.error || '',
      errorCode: state.errorCode || '',
      target: state.type === 'race' ? state.target : null,
      published: state.type === 'dealer' ? [...state.published] : [],
      publishedClues: state.type === 'dealer' ? state.publishedClues : [],
      players: playerArray().map((player) => ({
        id: player.id,
        name: player.name,
        connected: player.connected,
        spectator: player.spectator,
        score: Number(state.scores[player.id]) || 0,
      })),
    },
  };
}

function hostBroadcast(message, exceptId = null) {
  state.host?.broadcast(message, exceptId);
}

function hostSend(id, message) {
  return state.host?.send(String(id), message) || false;
}

function guestSend(message) {
  return state.guest?.send(message) || false;
}

function applyScores(scores = {}) {
  for (const [id, value] of Object.entries(scores)) {
    state.scores[String(id)] = score(value);
  }
}

function applyRoom(room) {
  if (!room || typeof room !== 'object') return;
  state.code = String(room.code || state.code);
  state.roomCode = state.code;
  state.type = TYPES.has(room.type) ? room.type : state.type;
  state.phase = ['lobby', 'playing', 'result', 'ended'].includes(room.phase) ? room.phase : state.phase;
  state.round = Number(room.round) || 0;
  state.cycle = Number(room.cycle) || 0;
  state.dealerId = room.dealerId ?? null;
  state.settings = room.settings || state.settings;
  state.errorCode = room.errorCode ? String(room.errorCode) : '';
  if (state.errorCode) {
    const errorKey = {
      kb: 'mp.error.kb',
      data: 'mp.error.data',
      minPlayers: 'mp.error.minPlayers',
      full: 'mp.error.full',
    }[state.errorCode];
    state.error = errorKey
      ? T(errorKey, room.error || 'Room error')
      : String(room.error || '');
  } else {
    state.error = '';
  }
  state.scores = room.scores && typeof room.scores === 'object' ? { ...room.scores } : state.scores;
  state.solvesByPlayer = room.solves && typeof room.solves === 'object' ? { ...room.solves } : state.solvesByPlayer;
  if (Array.isArray(room.players)) {
    const next = new Map();
    for (const player of room.players) {
      if (!player?.id) continue;
      const previous = state.players.get(String(player.id)) || {};
      next.set(String(player.id), {
        ...previous,
        ...player,
        id: String(player.id),
        name: sanitizeName(player.name || previous.name || '—'),
        score: Number(player.score ?? state.scores[String(player.id)]) || 0,
      });
    }
    state.players = next;
  }
  if (room.target) state.target = room.target;
  if (Array.isArray(room.published)) state.published = new Set(room.published.map(Number));
  if (Array.isArray(room.publishedClues)) {
    state.publishedClues = room.publishedClues
      .map((clue) => ({ ...clue, i: Number(clue.i) }))
      .filter((clue) => Number.isInteger(clue.i));
  }
  state.spectator = Boolean(selfPlayer()?.spectator);
  if (state.phase === 'lobby') {
    stopRoundTimer();
  }
  render();
}

function roomDirty() {
  if (isHost()) hostBroadcast(roomSnapshot());
  render();
}

function render() {
  if (!state.room && !state.players.size) return;
  if (state.phase === 'lobby') {
    renderLobby();
    return;
  }
  if (state.phase === 'playing') {
    if (state.type === 'race') {
      if (q('#mp-frame')) {
        updateHud();
        updateRaceScores();
        return;
      }
      renderRaceGame();
      return;
    }
    renderDealerGame();
    return;
  }
  if (state.phase === 'result' || state.phase === 'ended') {
    if (state.lastResult?.final) {
      renderFinal();
      return;
    }
    if (state.lastResult) {
      if (state.type === 'race') renderRoundResult(state.lastResult);
      else renderDealerResult(state.lastResult);
      return;
    }
    renderLobby();
  }
}

// ---------------------------------------------------------------------------
// Boot and static data
// ---------------------------------------------------------------------------

async function boot() {
  state.locale = detectLocale();
  state.i18n = createI18n(state.locale);
  document.documentElement.lang = state.locale;
  try {
    state.manifest = await fetchJson('data/manifest.json');
  } catch (error) {
    state.error = String(error?.message || error);
  }
  const route = parseHash();
  state.type = route.type;
  state.roomType = route.type;
  if (route.action === 'create') {
    renderCreate(route.type);
  } else if (route.action === 'join') {
    state.code = route.code;
    renderJoin(route.type);
  } else {
    renderHub();
  }
  window.addEventListener('hashchange', () => {
    const next = parseHash();
    if (next.action === 'join' && next.code) {
      state.type = next.type;
      state.code = next.code;
      renderJoin(next.type);
    }
  });
}

async function ensureDealerData() {
  if (state.catalog && state.refs) return;
  const [catalog, refs, refsEn, aliases] = await Promise.all([
    fetchJson('data/catalog.json'),
    fetchJson(`data/refs/${state.locale}.json`),
    state.locale === 'en' ? null : fetchJson('data/refs/en.json'),
    fetchJson('data/search.json').catch(() => null),
  ]);
  state.catalog = catalog.ships;
  state.catalogMap = new Map(state.catalog.map((ship) => [Number(ship.id), ship]));
  state.refs = refs;
  state.refsEn = refsEn || refs;
  state.searchAliases = aliases;
  state.searchIndex = buildSearchIndex(state.catalog, refs.groups, {
    races: refs.races,
    factions: refs.factions,
    locale: state.locale,
    aliases,
  });
}

// ---------------------------------------------------------------------------
// Hub and forms
// ---------------------------------------------------------------------------

function shell(content) {
  return `<div class="mp-hub" id="mp-view">
    <div class="mp-topbar">
      <a class="mp-brand" href="multiplayer.html">${icon('radar')}<div><strong>FITDLE</strong><span>${esc(T('mp.kicker', 'P2P // MULTIPLAYER'))}</span></div></a>
      <label class="mp-field" style="max-width:12rem">
        <span>${esc(T('header.language', 'LANGUAGE'))}</span>
        <select id="mp-lang">${LOCALES.map((locale) => `<option value="${locale}" ${locale === state.locale ? 'selected' : ''}>${esc(LOCALE_META[locale]?.label || locale)}</option>`).join('')}</select>
      </label>
    </div>
    ${content}
  </div>`;
}

function renderHub() {
  state.phase = 'hub';
  q('#mp-app').innerHTML = shell(`
    <div class="mp-kicker">${esc(T('mp.kicker', 'P2P // MULTIPLAYER'))}</div>
    <h1>${esc(T('mp.title', 'MULTIPLAYER'))}</h1>
    <p class="mp-hub-sub">${esc(T('mp.subtitle', 'Create a room, share one link, and play FITDLE with friends. Game data stays peer to peer; the room directory uses a public signaling service.'))}</p>
    <div class="mp-cards">
      <article class="mp-card">
        <div class="mp-icon">${icon('radar')}</div>
        <h2>${esc(T('mp.race.title', 'RACE ROOM'))}</h2>
        <p>${esc(T('mp.race.body', 'Standard, Abyss or Timed. Everyone fetches the same killmail and plays the single-player puzzle. Correct guesses score by finish order.'))}</p>
        <div class="mp-actions"><button class="mp-button primary" type="button" data-action="create" data-type="race">${esc(T('mp.race.create', 'CREATE RACE ROOM'))}</button></div>
      </article>
      <article class="mp-card">
        <div class="mp-icon">${icon('crosshair')}</div>
        <h2>${esc(T('mp.dealer.title', 'DEALER ROOM'))}</h2>
        <p>${esc(T('mp.dealer.body', 'Take turns holding the answer. The dealer reveals any clues; everyone else guesses. Published and unpublished clue weight decides the score.'))}</p>
        <div class="mp-actions"><button class="mp-button primary" type="button" data-action="create" data-type="dealer">${esc(T('mp.dealer.create', 'CREATE DEALER ROOM'))}</button></div>
      </article>
    </div>
    <div class="mp-panel" style="margin-top:1rem">
      <h2>${esc(T('mp.join.title', 'JOIN A ROOM'))}</h2>
      <p>${esc(T('mp.join.body', 'Open the room link from the host, or enter the code and choose the room type.'))}</p>
      <form class="mp-form" data-form="join-code">
        <label class="mp-field"><span>${esc(T('mp.join.code', 'ROOM CODE'))}</span><input name="code" maxlength="12" autocomplete="off" required></label>
        <label class="mp-field"><span>${esc(T('mp.join.type', 'ROOM TYPE'))}</span>
          <select name="type">
            <option value="race">${esc(T('mp.race.title', 'RACE ROOM'))}</option>
            <option value="dealer">${esc(T('mp.dealer.title', 'DEALER ROOM'))}</option>
          </select>
        </label>
        <div class="mp-actions"><button class="mp-button" type="submit">${esc(T('mp.join.continue', 'CONTINUE'))}</button></div>
      </form>
      <p id="mp-form-error" class="mp-status mp-error" hidden></p>
    </div>
    <div class="mp-actions"><a class="mp-button" href="index.html">${esc(T('mp.back', 'BACK TO FITDLE'))}</a></div>
  `);
}

function renderCreate(type) {
  state.type = type;
  state.phase = 'create';
  const dealer = type === 'dealer';
  q('#mp-app').innerHTML = shell(`
    <div class="mp-kicker">${esc(T('mp.create.kicker', 'ROOM SETUP'))}</div>
    <h1>${esc(dealer ? T('mp.dealer.create', 'CREATE DEALER ROOM') : T('mp.race.create', 'CREATE RACE ROOM'))}</h1>
    <div class="mp-panel" style="margin-top:1.2rem">
      <form class="mp-form" data-form="create">
        <label class="mp-field"><span>${esc(T('mp.name', 'PILOT NAME'))}</span><input name="name" maxlength="24" autocomplete="nickname" required></label>
        <label class="mp-field"><span>${esc(T('mp.password', 'ROOM PASSWORD (OPTIONAL)'))}</span><input name="password" maxlength="64" type="password" autocomplete="off"></label>
        ${dealer ? `
          <label class="mp-field"><span>${esc(T('mp.settings.cycles', 'ROUNDS (EVERYONE DEALS ONCE PER ROUND)'))}</span>
            <select name="cycles"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option></select>
          </label>
          <label class="mp-field"><span>${esc(T('mp.settings.dealMs', 'TIME PER DEAL (SECONDS)'))}</span>
            <select name="dealMs"><option value="90">90</option><option value="120" selected>120</option><option value="180">180</option></select>
          </label>
        ` : `
          <label class="mp-field"><span>${esc(T('mp.settings.mode', 'GAMEPLAY'))}</span>
            <select name="mode">
              <option value="standard">${esc(T('mp.mode.standard', 'STANDARD'))}</option>
              <option value="abyss">${esc(T('mp.mode.abyss', 'ABYSS'))}</option>
              <option value="timed">${esc(T('mp.mode.timed', 'TIMED'))}</option>
            </select>
          </label>
          <label class="mp-field"><span>${esc(T('mp.settings.target', 'SCORE TARGET'))}</span>
            <select name="scoreTarget"><option value="10">10</option><option value="20" selected>20</option><option value="30">30</option><option value="50">50</option></select>
          </label>
          <label class="mp-field"><span>${esc(T('mp.settings.rounds', 'ROUNDS'))}</span>
            <select name="rounds"><option value="1">1</option><option value="3" selected>3</option><option value="5">5</option></select>
          </label>
          <label class="mp-field"><span>${esc(T('mp.settings.duration', 'ROUND TIME (SECONDS)'))}</span>
            <select name="duration"><option value="120">120</option><option value="180" selected>180</option><option value="240">240</option></select>
          </label>
        `}
        <div class="mp-actions">
          <button class="mp-button primary" type="submit">${esc(T('mp.create.go', 'CREATE ROOM'))}</button>
          <a class="mp-button" href="multiplayer.html">${esc(T('mp.cancel', 'CANCEL'))}</a>
        </div>
      </form>
      <p id="mp-form-error" class="mp-status mp-error" hidden></p>
    </div>
  `);
}

function renderJoin(type, code = state.code) {
  state.type = type;
  state.code = code;
  state.phase = 'join';
  q('#mp-app').innerHTML = shell(`
    <div class="mp-kicker">${esc(T('mp.join.kicker', 'ROOM HANDSHAKE'))}</div>
    <h1>${esc(T('mp.join.heading', 'JOIN {code}', { code }))}</h1>
    <div class="mp-panel" style="margin-top:1.2rem">
      <div class="mp-room-meta"><span>${esc(type === 'dealer' ? T('mp.dealer.title', 'DEALER ROOM') : T('mp.race.title', 'RACE ROOM'))}</span><span>${esc(T('mp.join.code', 'ROOM CODE'))}: ${esc(code)}</span></div>
      <form class="mp-form" data-form="join">
        <label class="mp-field"><span>${esc(T('mp.name', 'PILOT NAME'))}</span><input name="name" maxlength="24" autocomplete="nickname" required></label>
        <label class="mp-field"><span>${esc(T('mp.password', 'ROOM PASSWORD'))}</span><input name="password" maxlength="64" type="password" autocomplete="off"></label>
        <div class="mp-actions">
          <button class="mp-button primary" type="submit">${esc(T('mp.join.go', 'JOIN ROOM'))}</button>
          <a class="mp-button" href="multiplayer.html">${esc(T('mp.cancel', 'CANCEL'))}</a>
        </div>
      </form>
      <p id="mp-form-error" class="mp-status mp-error" hidden></p>
    </div>
  `);
}

function formError(message) {
  const node = q('#mp-form-error');
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
}

// ---------------------------------------------------------------------------
// Room creation and joining
// ---------------------------------------------------------------------------

async function createRoom(form) {
  const name = sanitizeName(form.get('name'));
  if (!validName(name)) {
    formError(T('mp.error.name', 'Enter a pilot name (2–24 characters).'));
    return;
  }
  const password = String(form.get('password') || '').slice(0, 64);
  const type = state.type;
  const settings = defaultSettings(type);
  if (type === 'dealer') {
    settings.cycles = Math.max(1, Math.min(3, Number(form.get('cycles')) || 2));
    settings.dealMs = Math.max(30, Number(form.get('dealMs')) || 120) * 1000;
  } else {
    settings.mode = MODES.has(form.get('mode')) ? form.get('mode') : 'standard';
    settings.scoreTarget = Math.max(1, Number(form.get('scoreTarget')) || DEFAULT_SCORE_TARGET);
    settings.rounds = Math.max(1, Math.min(5, Number(form.get('rounds')) || 3));
    settings.durationMs = Math.max(30, Number(form.get('duration')) || 180) * 1000;
    settings.endType = settings.mode === 'timed' ? 'rounds' : 'score';
  }
  state.selfName = name;
  state.password = password;
  state.settings = settings;
  state.busy = true;
  let host = null;
  for (let attempt = 0; attempt < 5 && !host; attempt++) {
    const code = randomCode();
    try {
      host = await createHost(code);
      state.code = code;
    } catch (error) {
      if (error?.code !== 'unavailable-id') throw error;
    }
  }
  state.busy = false;
  if (!host) {
    formError(T('mp.error.room', 'Could not allocate a room code. Try again.'));
    return;
  }
  state.host = host;
  state.role = 'host';
  state.selfId = 'h';
  state.error = '';
  state.errorCode = '';
  state.players = new Map();
  state.scores = {};
  state.solvesByPlayer = {};
  state.phase = 'lobby';
  state.scores.h = 0;
  state.players.set('h', {
    id: 'h', name, connected: true, spectator: false, admitted: true, score: 0,
  });
  state.usedKillIds = new Set();
  state.usedShipIds = new Set();
  setHash(`room=${state.code}&type=${state.type}`);
  host.on('connection', ({ id }) => onHostConnection(id));
  host.on('data', ({ id, data }) => onHostData(id, data));
  host.on('close', ({ id }) => onHostPeerClose(id));
  host.on('error', () => {});
  if (type === 'dealer') {
    try {
      await ensureDealerData();
    } catch (error) {
      state.error = String(error?.message || error);
    }
  }
  renderLobby();
}

async function joinRoom(form) {
  const name = sanitizeName(form.get('name'));
  if (!validName(name)) {
    formError(T('mp.error.name', 'Enter a pilot name (2–24 characters).'));
    return;
  }
  const password = String(form.get('password') || '').slice(0, 64);
  state.selfName = name;
  state.password = password;
  state.busy = true;
  try {
    const guest = await joinHost(state.code);
    state.guest = guest;
    state.role = 'guest';
    guest.on('data', (data) => onGuestData(data));
    guest.on('close', () => {
      state.error = T('mp.error.host', 'The host closed the room.');
      state.phase = 'ended';
      render();
    });
    guest.on('error', () => {});
    guest.send({ v: PROTOCOL_VERSION, t: 'hello', name, password, locale: state.locale });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('welcome timeout')), 20000);
      state.pendingWelcome = { resolve, reject, timer };
    });
    if (state.type === 'dealer') await ensureDealerData();
    renderLobby();
  } catch (error) {
    const code = error?.code || '';
    const message = code === 'peer-unavailable' || code === 'room'
      ? T('mp.error.room', 'Room not found. Check the link or code.')
      : code === 'name-taken'
        ? T('mp.error.nameTaken', 'That pilot name is already in the room.')
        : code === 'password'
          ? T('mp.error.password', 'Wrong room password.')
          : code === 'full'
            ? T('mp.error.full', 'The room is full.')
            : code === 'signaling-timeout' || code === 'connect-timeout'
              ? T('mp.error.connection', 'Could not reach the room. Try again.')
              : T('mp.error.connection', 'Could not reach the room. Try again.');
    formError(message);
  } finally {
    state.busy = false;
  }
}

function onHostConnection(id) {
  if (state.players.size >= MAX_PLAYERS) {
    hostSend(id, { v: PROTOCOL_VERSION, t: 'error', code: 'full' });
    state.host?.disconnect(id);
    return;
  }
  state.players.set(String(id), {
    id: String(id),
    name: '',
    connected: true,
    spectator: false,
    admitted: false,
    score: 0,
  });
  setTimeout(() => {
    const player = state.players.get(String(id));
    if (player && !player.admitted) {
      state.players.delete(String(id));
      state.host?.disconnect(id);
    }
  }, 25000);
}

function onHostPeerClose(id) {
  const player = state.players.get(String(id));
  if (!player) return;
  if (state.type === 'race' && state.phase === 'playing' && state.roundActive.includes(String(id))) {
    recordRaceResult(String(id), 'lost', 0, 0);
  }
  state.players.delete(String(id));
  if (String(state.dealerId) === String(id)) {
    skipDealer('disconnect');
  }
  roomDirty();
}

function hostReply(id, message) {
  hostSend(id, {
    v: PROTOCOL_VERSION,
    ...message,
  });
}

function onHostHello(id, message) {
  const player = state.players.get(String(id));
  if (!player) return;
  const name = sanitizeName(message.name);
  if (!validName(name)) {
    hostReply(id, { t: 'error', code: 'name' });
    return;
  }
  if (player.admitted && normalizeName(player.name) === normalizeName(name)) {
    hostReply(id, { t: 'welcome', playerId: player.id, room: roomSnapshot().room });
    return;
  }
  const duplicate = playerArray().some((other) => (
    other.id !== String(id) && other.admitted && normalizeName(other.name) === normalizeName(name)
  ));
  if (duplicate) {
    hostReply(id, { t: 'error', code: 'name-taken' });
    return;
  }
  if (state.password && String(message.password || '') !== state.password) {
    hostReply(id, { t: 'error', code: 'password' });
    return;
  }
  player.name = name;
  player.admitted = true;
  player.locale = String(message.locale || 'en');
  player.spectator = state.phase === 'playing';
  player.connected = true;
  state.scores[player.id] = Number(state.scores[player.id]) || 0;
  hostReply(id, { t: 'welcome', playerId: player.id, room: roomSnapshot().room });
  if (state.phase === 'playing' && state.type === 'race' && state.target) {
    hostSend(id, { v: PROTOCOL_VERSION, t: 'target', ...state.target, spectator: Boolean(player.spectator) });
  }
  roomDirty();
}

function onHostData(id, raw) {
  const message = decodeMessage(raw);
  if (!message) return;
  const player = state.players.get(String(id));
  if (!player) return;
  if (message.t === 'hello') {
    onHostHello(id, message);
    return;
  }
  if (!player.admitted) return;
  if (!state.rateLimiter.allow(id, message.t === 'guess' ? 'guess' : 'message')) return;
  if (message.t === 'bye') {
    state.players.delete(String(id));
    roomDirty();
    return;
  }
  if (message.t === 'pong') return;
  if (message.t === 'result') {
    if (state.type !== 'race' || state.phase !== 'playing') return;
    const status = message.status === 'lost' ? 'lost' : 'solved';
    recordRaceResult(String(id), status, message.attempts, message.elapsedMs);
    return;
  }
  if (message.t === 'guess') {
    if (state.type !== 'dealer' || state.phase !== 'playing' || !state.dealerId) return;
    const text = sanitizeText(message.text);
    if (!text) return;
    if (isDealer()) handleDealerGuess(String(id), text);
    else hostSend(state.dealerId, { v: PROTOCOL_VERSION, t: 'guess', from: String(id), text });
    return;
  }
  if (!isHost()) return;
  if (message.t === 'clue') {
    if (state.type !== 'dealer' || state.phase !== 'playing') return;
    if (String(state.dealerId) !== String(id)) return;
    if (!validClueForWire(message.clue)) return;
    publishIncomingClue(message.clue, String(id));
    return;
  }
  if (message.t === 'solved') {
    if (state.type !== 'dealer' || state.phase !== 'playing') return;
    if (String(state.dealerId) !== String(id)) return;
    applyDealerSolved(String(message.playerId), Number(message.snapshot) || 0);
    return;
  }
  if (message.t === 'chat') {
    if (state.type !== 'dealer' || state.phase !== 'playing') return;
    if (String(state.dealerId) !== String(id)) return;
    const text = sanitizeText(message.text);
    if (!text) return;
    hostBroadcast({ v: PROTOCOL_VERSION, t: 'chat', from: String(id), text });
    addFeed(`${playerName(id)}: ${text}`);
    renderDealerGame();
    return;
  }
  if (message.t === 'dealerResult') {
    if (state.type !== 'dealer' || state.phase !== 'playing') return;
    if (String(state.dealerId) !== String(id)) return;
    applyDealerResult(message);
    return;
  }
  if (message.t === 'dealerError') {
    if (state.type !== 'dealer' || state.phase !== 'playing') return;
    if (String(state.dealerId) !== String(id)) return;
    skipDealer('kb');
  }
}

function onGuestData(raw) {
  const message = decodeMessage(raw);
  if (!message) return;
  if (message.t === 'welcome') {
    state.selfId = String(message.playerId);
    state.role = 'guest';
    if (message.room) applyRoom(message.room);
    if (state.pendingWelcome) {
      clearTimeout(state.pendingWelcome.timer);
      state.pendingWelcome.resolve();
      state.pendingWelcome = null;
    }
    return;
  }
  if (message.t === 'error') {
    const code = message.code || '';
    const text = code === 'name-taken'
      ? T('mp.error.nameTaken', 'That pilot name is already in the room.')
      : code === 'password'
        ? T('mp.error.password', 'Wrong room password.')
        : code === 'full'
          ? T('mp.error.full', 'The room is full.')
          : T('mp.error.connection', 'The room rejected the connection.');
    if (state.pendingWelcome) {
      clearTimeout(state.pendingWelcome.timer);
      const error = new Error(code || 'connection');
      error.code = code;
      state.pendingWelcome.reject(error);
      state.pendingWelcome = null;
      return;
    }
    if (state.phase === 'join') formError(text);
    else {
      state.error = text;
      render();
    }
    return;
  }
  if (message.t === 'room') {
    applyRoom(message.room);
    return;
  }
  if (message.t === 'target') {
    const spectator = message.spectator != null
      ? Boolean(message.spectator)
      : Boolean(selfPlayer()?.spectator);
    state.target = {
      round: Number(message.round) || 0,
      killId: Number(message.killId),
      shipId: Number(message.shipId) || null,
      mode: message.mode || state.settings?.mode || 'standard',
      durationMs: Number(message.durationMs) || 0,
    };
    applyRaceTarget(state.target, spectator);
    return;
  }
  if (message.t === 'start') {
    state.phase = 'playing';
    state.round = Number(message.round) || state.round;
    state.cycle = Number(message.cycle) || state.cycle;
    state.dealerId = message.dealerId;
    state.published = new Set();
    state.publishedClues = [];
    state.solves = [];
    state.clues = null;
    state.dealerTarget = null;
    state.endsAt = 0;
    state.remainingMs = 0;
    addFeed(T('mp.feed.dealStart', 'Deal started.'));
    if (isDealer()) prepareDealerRound();
    render();
    return;
  }
  if (message.t === 'clue') {
    if (!validClueForWire(message.clue)) return;
    applyPublishedClue(message.clue);
    return;
  }
  if (message.t === 'solved') {
    if (state.type === 'race') {
      const solved = message.status !== 'lost';
      addFeed(solved
        ? T('mp.feed.solved', '{name} solved it.', { name: playerName(message.playerId) })
        : T('mp.feed.lost', '{name} is out of attempts.', { name: playerName(message.playerId) }), solved);
      updateHud();
      updateFeed();
      return;
    }
    applyDealerSolved(String(message.playerId), Number(message.snapshot) || 0);
    return;
  }
  if (message.t === 'chat') {
    const text = sanitizeText(message.text);
    if (text) {
      addFeed(`${playerName(message.from)}: ${text}`);
      render();
    }
    return;
  }
  if (message.t === 'tick') {
    state.remainingMs = Math.max(0, Number(message.remainingMs) || 0);
    updateHud();
    return;
  }
  if (message.t === 'settle') {
    if (isDealer()) settleDealer();
    return;
  }
  if (message.t === 'roundResult') {
    if (state.type === 'dealer') {
      stopRoundTimer();
      state.phase = message.gameOver ? 'ended' : 'result';
      state.scores = message.totals || state.scores;
      state.lastResult = message;
      if (message.gameOver) renderFinal(message);
      else renderDealerResult(message);
    } else {
      applyRoundResult(message);
    }
    return;
  }
  if (message.t === 'guess') {
    if (isDealer()) handleDealerGuess(String(message.from), sanitizeText(message.text));
    return;
  }
  if (message.t === 'gameEnd') {
    state.phase = 'ended';
    state.scores = message.scores || state.scores;
    state.lastResult = { final: true };
    renderFinal(message);
    return;
  }
  if (message.t === 'ping') {
    guestSend({ v: PROTOCOL_VERSION, t: 'pong' });
  }
}

function onGuestSend(message) {
  if (isHost()) {
    // Host-local path uses the same handlers as a remote guest.
    const id = state.selfId;
    if (message.t === 'clue') publishIncomingClue(message.clue, id);
    if (message.t === 'solved') applyDealerSolved(String(message.playerId), Number(message.snapshot) || 0);
    if (message.t === 'chat') {
      addFeed(`${playerName(id)}: ${sanitizeText(message.text)}`);
      render();
    }
    if (message.t === 'dealerResult') applyDealerResult(message);
    if (message.t === 'dealerError') skipDealer('kb');
    return;
  }
  guestSend(message);
}

// ---------------------------------------------------------------------------
// Lobby and shared HUD
// ---------------------------------------------------------------------------

function renderLobby() {
  state.phase = state.phase === 'hub' ? 'lobby' : state.phase;
  const host = isHost();
  const settings = state.settings || defaultSettings(state.type);
  const players = playerArray();
  const startDisabled = players.filter((player) => player.connected).length < 2;
  q('#mp-app').innerHTML = shell(`
    <div class="mp-kicker">${esc(state.type === 'dealer' ? T('mp.dealer.title', 'DEALER ROOM') : T('mp.race.title', 'RACE ROOM'))}</div>
    <div class="mp-room-head">
      <div>
        <h1>${esc(T('mp.lobby.title', 'ROOM LOBBY'))}</h1>
        <div class="mp-room-meta">
          <span>${esc(T('mp.join.code', 'ROOM CODE'))}: <strong class="mp-code">${esc(state.code)}</strong></span>
          <span>${esc(T('mp.room.players', 'PLAYERS'))}: ${players.length}/${MAX_PLAYERS}</span>
        </div>
      </div>
      <div class="mp-actions">
        <button class="mp-button" type="button" data-action="copy-link">${esc(T('mp.copy', 'COPY LINK'))}</button>
        <a class="mp-button" href="multiplayer.html">${esc(T('mp.leave', 'LEAVE'))}</a>
      </div>
    </div>
    ${state.error ? `<p class="mp-status mp-error">${esc(state.error)}</p>` : ''}
    <div class="mp-layout">
      <div class="mp-main">
        <div class="mp-panel">
          <h2>${esc(T('mp.players', 'PILOTS'))}</h2>
          <div class="mp-players">${players.map((player) => `
            <div class="mp-player ${player.id === state.selfId ? 'is-self' : ''}">
              <span>${esc(player.name || '—')} ${player.id === state.selfId ? tag(T('mp.you', 'YOU')) : ''} ${player.id === 'h' ? tag(T('mp.host', 'HOST')) : ''}</span>
              <span class="tag">${player.connected === false ? esc(T('mp.offline', 'OFFLINE')) : ''}</span>
            </div>`).join('')}</div>
        </div>
        <div class="mp-link-box">
          <input id="mp-room-link" readonly value="${esc(roomLink())}">
          <button class="mp-button" type="button" data-action="copy-link">${esc(T('mp.copy', 'COPY LINK'))}</button>
        </div>
      </div>
      <aside class="mp-side">
        <div class="mp-panel">
          <h2>${esc(T('mp.settings', 'SETTINGS'))}</h2>
          ${state.type === 'race' ? `
            <div class="mp-room-meta"><span>${esc(T('mp.settings.mode', 'GAMEPLAY'))}: ${esc(settings.mode || 'standard')}</span></div>
            <div class="mp-room-meta"><span>${esc(T('mp.settings.end', 'END CONDITION'))}: ${esc(settings.mode === 'timed' ? `${settings.rounds} ${T('mp.settings.rounds', 'ROUNDS')}` : `${settings.scoreTarget} ${T('mp.score', 'POINTS')}`)}</span></div>
            ${settings.mode === 'timed' ? `<div class="mp-room-meta"><span>${esc(T('mp.settings.duration', 'ROUND TIME'))}: ${esc(Math.round((settings.durationMs || DEFAULT_RACE_ROUND_MS) / 1000))}s</span></div>` : ''}
          ` : `
            <div class="mp-room-meta"><span>${esc(T('mp.settings.cycles', 'ROUNDS'))}: ${esc(settings.cycles)}</span></div>
            <div class="mp-room-meta"><span>${esc(T('mp.settings.dealMs', 'TIME PER DEAL'))}: ${esc(Math.round((settings.dealMs || DEFAULT_DEAL_MS) / 1000))}s</span></div>
          `}
          ${host ? `<div class="mp-actions"><button class="mp-button primary" type="button" data-action="start" ${startDisabled ? 'disabled' : ''}>${esc(T('mp.start', 'START'))}</button></div>` : `<p class="mp-status">${esc(T('mp.waitingHost', 'Waiting for the host to start.'))}</p>`}
        </div>
      </aside>
    </div>
  `);
}

function addFeed(text, correct = false) {
  state.feed.push({ text: String(text || ''), correct: Boolean(correct) });
  if (state.feed.length > 60) state.feed.shift();
}

function renderHud() {
  const players = playerArray();
  const seconds = Math.ceil((state.remainingMs || 0) / 1000);
  const timer = (state.endsAt || state.remainingMs > 0)
    ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : '—';
  return `<div class="mp-hud">
    <div class="mp-hud-main">
      <strong>${esc(T('mp.round', 'ROUND'))} ${esc(state.round || 0)}</strong>
      <span>${esc(state.type === 'dealer' ? T('mp.cycle', 'CYCLE') : T('mp.settings.mode', 'MODE'))}: ${esc(state.type === 'dealer' ? state.cycle : state.settings?.mode || 'standard')}</span>
      ${state.type === 'dealer' ? `<span>${esc(T('mp.dealer', 'DEALER'))}: ${esc(playerName(state.dealerId))}</span>` : ''}
      <span>${esc(T('mp.time', 'TIME'))}: <strong>${esc(timer)}</strong></span>
    </div>
    <div class="mp-actions">
      ${isHost() ? `<button class="mp-button" type="button" data-action="finish">${esc(T('mp.finishRound', 'END ROUND'))}</button>` : ''}
      <span class="mp-status">${esc(T('mp.score', 'SCORE'))}: ${players.map((player) => `${player.name} ${Number(state.scores[player.id]) || 0}`).join(' · ')}</span>
    </div>
  </div>`;
}

function updateHud() {
  const hud = q('.mp-hud');
  if (hud) hud.outerHTML = renderHud();
}

function updateRaceScores() {
  const hud = q('.mp-hud');
  if (hud) hud.outerHTML = renderHud();
  updateFeed();
}

function updateFeed() {
  const feed = q('.mp-feed');
  if (feed) {
    feed.innerHTML = state.feed
      .map((line) => `<div class="mp-feed-line${line.correct ? ' is-correct' : ''}">${esc(line.text)}</div>`)
      .join('');
  }
}

function lockIframe() {
  try {
    q('#mp-frame')?.contentWindow?.postMessage({ type: 'mp-lock' }, location.origin);
  } catch {
    // iframe may be gone
  }
}

// ---------------------------------------------------------------------------
// Race mode
// ---------------------------------------------------------------------------

function stopRoundTimer() {
  if (state.roundTimer) clearTimeout(state.roundTimer);
  if (state.prepTimer) clearTimeout(state.prepTimer);
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.roundTimer = null;
  state.prepTimer = null;
  state.tickTimer = null;
  state.endsAt = 0;
  state.remainingMs = 0;
}

function startRaceTimer(durationMs) {
  stopRoundTimer();
  if (!isHost()) return;
  const duration = Number(durationMs) || 0;
  if (!duration) {
    state.endsAt = Date.now() + 10 * 60 * 1000;
  } else {
    state.endsAt = Date.now() + duration;
  }
  state.remainingMs = state.endsAt - Date.now();
  state.tickTimer = setInterval(() => {
    state.remainingMs = Math.max(0, state.endsAt - Date.now());
    hostBroadcast({ v: PROTOCOL_VERSION, t: 'tick', remainingMs: state.remainingMs });
    updateHud();
    if (state.remainingMs <= 0) {
      stopRoundTimer();
      finishRaceRound();
    }
  }, 1000);
}

async function hostStartRace() {
  if (!isHost() || state.busy) return;
  state.busy = true;
  state.phase = 'playing';
  state.error = '';
  state.errorCode = '';
  state.results = [];
  state.feed = [];
  state.iframeReady = false;
  state.round += 1;
  for (const player of state.players.values()) player.spectator = false;
  state.roundActive = activeIds();
  try {
    const mode = state.settings.mode || 'standard';
    const target = await pickRaceTarget({
      manifest: state.manifest,
      mode,
      usedKillIds: state.usedKillIds,
      usedShipIds: state.usedShipIds,
    });
    state.usedKillIds.add(Number(target.killId));
    state.usedShipIds.add(Number(target.shipId));
    state.target = {
      round: state.round,
      killId: Number(target.killId),
      shipId: Number(target.shipId),
      mode,
      durationMs: mode === 'timed' ? state.settings.durationMs : 0,
    };
    hostBroadcast({ v: PROTOCOL_VERSION, t: 'target', ...state.target, spectator: false });
    applyRaceTarget(state.target, false);
    startRaceTimer(mode === 'timed' ? state.settings.durationMs : 0);
    roomDirty();
  } catch (error) {
    state.phase = 'lobby';
    state.error = T('mp.error.kb', 'Killboard unavailable. No round was started; try again.');
    state.errorCode = 'kb';
    roomDirty();
  } finally {
    state.busy = false;
  }
}

function applyRaceTarget(target, spectator) {
  state.target = target;
  state.round = Number(target.round) || state.round;
  state.phase = 'playing';
  state.spectator = Boolean(spectator);
  const self = state.players.get(String(state.selfId));
  if (self) self.spectator = Boolean(spectator);
  state.iframeReady = false;
  state.feed = [];
  renderRaceGame();
}

function raceIframeUrl(target, spectator) {
  const url = new URL('index.html', location.href);
  url.searchParams.set('kb', freeKillToken(Number(target.killId)));
  url.searchParams.set('mp', '1');
  if (target.mode === 'abyss') url.searchParams.set('rule', 'abyss');
  if (target.mode === 'timed') url.searchParams.set('rule', 'timed');
  if (spectator) url.searchParams.set('spectator', '1');
  url.searchParams.set('round', String(target.round || state.round || 1));
  return url.toString();
}

function renderRaceGame() {
  const target = state.target;
  if (!target) {
    renderLobby();
    return;
  }
  state.phase = 'playing';
  const spectator = Boolean(state.spectator || selfPlayer()?.spectator);
  q('#mp-app').innerHTML = `
    <div class="mp-topbar">
      <a class="mp-brand" href="multiplayer.html">${icon('radar')}<div><strong>FITDLE</strong><span>${esc(T('mp.race.title', 'RACE ROOM'))}</span></div></a>
      <div class="mp-top-actions"><span class="mp-code">${esc(state.code)}</span></div>
    </div>
    ${renderHud()}
    ${state.error ? `<p class="mp-status mp-error">${esc(state.error)}</p>` : ''}
    <div class="mp-frame-wrap">
      <iframe id="mp-frame" class="mp-frame" title="${esc(T('mp.race.frameTitle', 'FITDLE puzzle'))}" src="${esc(raceIframeUrl(target, spectator))}" allow="clipboard-write"></iframe>
      ${spectator ? `<div class="mp-overlay"><div class="mp-panel"><h2>${esc(T('mp.watchOnly', 'WATCHING ONLY'))}</h2><p>${esc(T('mp.watchOnlyBody', 'You joined mid-round. You can read the current puzzle but cannot guess until the next round.'))}</p></div></div>` : ''}
    </div>
    ${renderFeedPanel()}
  `;
  window.setTimeout(() => {
    if (!state.iframeReady) {
      // The iframe will normally report ready; this only catches a silent hang.
      state.notice = T('mp.notice.loading', 'Waiting for the puzzle…');
    }
  }, 15000);
}

function renderFeedPanel() {
  return `<div class="mp-panel" style="margin-top:1rem">
    <h2>${esc(T('mp.feed.title', 'ROOM FEED'))}</h2>
    <div class="mp-status">${esc(state.target?.mode ? T('mp.race.feedBody', 'Everyone is solving the same killmail. Finish order decides the points.') : '')}</div>
    <div class="mp-feed">${state.feed.map((line) => `<div class="mp-feed-line${line.correct ? ' is-correct' : ''}">${esc(line.text)}</div>`).join('')}</div>
  </div>`;
}

function recordRaceResult(playerId, status, attempts = 0, elapsedMs = 0) {
  if (!isHost() || state.type !== 'race' || state.phase !== 'playing') return;
  if (!state.roundActive.includes(String(playerId))) return;
  if (state.results.some((entry) => entry.playerId === String(playerId))) return;
  state.results.push({
    playerId: String(playerId),
    status: status === 'solved' ? 'solved' : 'lost',
    at: Date.now(),
    attempts: Number(attempts) || 0,
    elapsedMs: Number(elapsedMs) || 0,
  });
  hostBroadcast({
    v: PROTOCOL_VERSION,
    t: 'solved',
    round: state.round,
    playerId: String(playerId),
    status: status === 'solved' ? 'solved' : 'lost',
  });
  addFeed(status === 'solved'
    ? T('mp.feed.solved', '{name} solved it.', { name: playerName(playerId) })
    : T('mp.feed.lost', '{name} is out of attempts.', { name: playerName(playerId) }), status === 'solved');
  const all = state.roundActive.every((id) => state.results.some((entry) => entry.playerId === id));
  updateHud();
  updateFeed();
  if (all) finishRaceRound();
}

function finishRaceRound() {
  if (!isHost() || state.type !== 'race' || state.phase !== 'playing') return;
  stopRoundTimer();
  const { scores, ranks } = raceRoundScores(state.roundActive, state.results);
  applyScores(scores);
  for (const [id, points] of Object.entries(scores)) {
    if (points > 0) state.solvesByPlayer[id] = (Number(state.solvesByPlayer[id]) || 0) + 1;
  }
  let gameOver = false;
  if (state.settings.mode === 'timed') {
    gameOver = state.round >= Number(state.settings.rounds || 3);
  } else {
    gameOver = raceTargetReached(state.scores, state.settings.scoreTarget);
  }
  state.phase = gameOver ? 'ended' : 'result';
  const result = {
    round: state.round,
    answerId: Number(state.target?.shipId) || null,
    scores,
    ranks,
    totals: state.scores,
    gameOver,
  };
  state.lastResult = result;
  lockIframe();
  updateHud();
  hostBroadcast({
    v: PROTOCOL_VERSION,
    t: 'roundResult',
    ...result,
  });
  renderRoundResult(result);
}

function applyRoundResult(message) {
  applyScores(message.scores || {});
  if (message.totals) state.scores = { ...message.totals };
  state.phase = message.gameOver ? 'ended' : 'result';
  state.lastResult = message;
  lockIframe();
  updateHud();
  renderRoundResult(message);
}

function renderRoundResult(message) {
  state.lastResult = message;
  const players = playerArray();
  const ranking = rankPlayers(players, state.scores, state.solvesByPlayer);
  const panel = `
    <div class="mp-panel">
      <h2>${esc(message.gameOver ? T('mp.gameOver', 'GAME OVER') : T('mp.roundResult', 'ROUND RESULT'))}</h2>
      ${message.answerId ? `<div class="mp-dealer-answer">
        <img src="${esc(`${state.manifest?.images?.baseUrl || ''}/types/${Number(message.answerId)}/render?size=256`)}" alt="" loading="lazy">
        <div><div class="mp-kicker">${esc(T('mp.answer', 'ANSWER'))}</div></div>
      </div>` : ''}
      <div class="mp-result-grid">
        <div class="mp-result-stat"><span>${esc(T('mp.round', 'ROUND'))}</span><strong>${esc(message.round || state.round)}</strong></div>
        <div class="mp-result-stat"><span>${esc(T('mp.score', 'SCORE'))}</span><strong>${esc(state.settings?.mode === 'timed' ? `${state.round}/${state.settings.rounds}` : `${state.settings?.scoreTarget || DEFAULT_SCORE_TARGET}`)}</strong></div>
      </div>
      <table class="mp-score-table"><thead><tr><th>#</th><th>${esc(T('mp.players', 'PILOT'))}</th><th>${esc(T('mp.score', 'SCORE'))}</th></tr></thead><tbody>
        ${ranking.map((player, index) => `<tr><td>${index + 1}</td><td>${esc(player.name)}</td><td>${esc(player.score)}</td></tr>`).join('')}
      </tbody></table>
      <div class="mp-actions">
        ${isHost() && !message.gameOver ? `<button class="mp-button primary" type="button" data-action="next-round">${esc(T('mp.nextRound', 'NEXT ROUND'))}</button>` : ''}
        ${isHost() && message.gameOver ? `<button class="mp-button primary" type="button" data-action="lobby">${esc(T('mp.playAgain', 'PLAY AGAIN'))}</button>` : ''}
        <a class="mp-button" href="multiplayer.html">${esc(T('mp.leave', 'LEAVE'))}</a>
      </div>
      ${!isHost() ? `<p class="mp-status">${esc(T('mp.waitingHost', 'Waiting for the host.'))}</p>` : ''}
    </div>`;
  if (q('#mp-frame')) {
    const wrap = q('.mp-frame-wrap');
    wrap?.querySelector('#mp-result-overlay')?.remove();
    wrap?.insertAdjacentHTML('beforeend', `<div id="mp-result-overlay" class="mp-overlay">${panel}</div>`);
    return;
  }
  q('#mp-app').innerHTML = `
    <div class="mp-topbar">
      <a class="mp-brand" href="multiplayer.html">${icon('radar')}<div><strong>FITDLE</strong><span>${esc(T('mp.roundResult', 'ROUND RESULT'))}</span></div></a>
      <div class="mp-top-actions"><span class="mp-code">${esc(state.code)}</span></div>
    </div>
    ${panel}
  `;
}

// ---------------------------------------------------------------------------
// Dealer mode
// ---------------------------------------------------------------------------

async function hostStartDealer() {
  if (!isHost() || state.busy) return;
  state.error = '';
  state.errorCode = '';
  try {
    await ensureDealerData();
  } catch (error) {
    state.error = T('mp.error.data', 'Could not load the hull catalog.');
    state.errorCode = 'data';
    roomDirty();
    renderLobby();
    return;
  }
  state.phase = 'playing';
  state.cycle = 1;
  state.round = 0;
  state.scores = state.scores || {};
  state.solvesByPlayer = state.solvesByPlayer || {};
  state.dealerOrder = shuffle(playerArray().filter((player) => player.connected).map((player) => player.id));
  state.dealIndex = 0;
  state.failedDealers = new Set();
  beginDeal();
}

function beginDeal() {
  if (!isHost() || state.type !== 'dealer') return;
  const players = playerArray().filter((player) => player.connected);
  if (players.length < 2) {
    state.phase = 'ended';
    state.lastResult = null;
    state.error = T('mp.error.minPlayers', 'At least two pilots are required.');
    state.errorCode = 'minPlayers';
    roomDirty();
    return;
  }
  if (!state.dealerOrder.length || state.dealerOrder.some((id) => !state.players.has(String(id)))) {
    state.dealerOrder = shuffle(players.map((player) => player.id));
    state.dealIndex = 0;
  }
  if (state.dealIndex >= state.dealerOrder.length) {
    state.cycle += 1;
    if (state.cycle > Number(state.settings.cycles || 2)) {
      state.phase = 'ended';
      state.lastResult = { final: true };
      hostBroadcast({ v: PROTOCOL_VERSION, t: 'gameEnd', scores: state.scores });
      roomDirty();
      renderFinal();
      return;
    }
    state.dealerOrder = shuffle(players.map((player) => player.id));
    state.dealIndex = 0;
    state.failedDealers = new Set();
  }
  const dealerId = state.dealerOrder[state.dealIndex];
  state.dealerId = dealerId;
  state.round += 1;
  for (const player of state.players.values()) {
    if (player.connected) player.spectator = false;
  }
  state.solves = [];
  state.published = new Set();
  state.publishedClues = [];
  state.clues = null;
  state.dealerTarget = null;
  state.feed = [];
  stopRoundTimer();
  state.prepTimer = setTimeout(() => {
    if (state.phase === 'playing' && !state.endsAt && String(state.dealerId) === String(dealerId)) {
      skipDealer('timeout');
    }
  }, 60000);  const start = {
    v: PROTOCOL_VERSION,
    t: 'start',
    round: state.round,
    cycle: state.cycle,
    dealerId,
    durationMs: state.settings.dealMs,
  };
  hostBroadcast(start);
  onDealerStart(start);
  roomDirty();
}

function onDealerStart(message) {
  state.phase = 'playing';
  state.round = Number(message.round) || state.round;
  state.cycle = Number(message.cycle) || state.cycle;
  state.dealerId = message.dealerId;
  state.solves = [];
  state.published = new Set();
  state.publishedClues = [];
  state.clues = null;
  state.dealerTarget = null;
  state.feed = [];
  state.endsAt = 0;
  state.remainingMs = 0;
  if (isDealer()) prepareDealerRound();
  renderDealerGame();
}

async function prepareDealerRound() {
  if (!isDealer()) return;
  try {
    await ensureDealerData();
    const round = await pickDealerRound({
      manifest: state.manifest,
      catalog: state.catalog,
      refsEn: state.refsEn,
      usedKillIds: state.usedKillIds,
      usedShipIds: state.usedShipIds,
    });
    state.usedKillIds.add(Number(round.killId));
    state.usedShipIds.add(Number(round.shipId));
    state.dealerTarget = round;
    state.clues = round.clues;
    const entry = state.searchIndex.find((candidate) => Number(candidate.ship.id) === Number(round.ship.id));
    const accepted = new Set([
      ...(entry?.names || []),
      ...(entry?.acronyms || []),
      ...(entry?.nameAliases || []),
    ]);
    state.accepted = accepted;
    addFeed(T('mp.feed.dealerReady', 'Intel is ready. Publish a clue to start the clock.'));
    renderDealerGame();
  } catch (error) {
    state.error = T('mp.error.kb', 'Killboard unavailable. No target could be loaded.');
    if (isHost()) skipDealer('kb');
    else state.guest?.send({ v: PROTOCOL_VERSION, t: 'dealerError', code: 'kb' });
    renderDealerGame();
  }
}

function publishClue(index) {
  if (!isDealer() || !state.clues) return;
  const clueIndex = Number(index);
  if (!Number.isInteger(clueIndex) || state.published.has(clueIndex)) return;
  const clue = state.clues[clueIndex];
  if (!clue) return;
  const payload = { v: PROTOCOL_VERSION, t: 'clue', round: state.round, clue: clueForWire(clue) };
  if (isHost()) {
    publishIncomingClue(payload.clue, state.selfId);
  } else {
    state.guest?.send(payload);
    applyPublishedClue(payload.clue);
    if (state.published.size === 1) startDealClock();
  }
}

function publishIncomingClue(clue, fromId) {
  if (state.type !== 'dealer' || state.phase !== 'playing') return;
  if (String(state.dealerId) !== String(fromId)) return;
  const index = Number(clue.i);
  if (!Number.isInteger(index)) return;
  applyPublishedClue(clue);
  hostBroadcast({ v: PROTOCOL_VERSION, t: 'clue', round: state.round, clue }, fromId);
  if (state.published.size === 1) startDealClock();
}

function applyPublishedClue(clue) {
  const index = Number(clue.i);
  if (!Number.isInteger(index) || state.published.has(index)) return;
  state.published.add(index);
  state.publishedClues = [...state.publishedClues, clue];
  renderDealerGame();
}

function startDealClock() {
  if (!isHost() || state.type !== 'dealer' || state.phase !== 'playing') return;
  if (state.endsAt) return;
  if (state.prepTimer) clearTimeout(state.prepTimer);
  state.prepTimer = null;
  const duration = Number(state.settings.dealMs || DEFAULT_DEAL_MS);
  state.endsAt = Date.now() + duration;
  state.remainingMs = duration;
  state.tickTimer = setInterval(() => {
    state.remainingMs = Math.max(0, state.endsAt - Date.now());
    hostBroadcast({ v: PROTOCOL_VERSION, t: 'tick', remainingMs: state.remainingMs });
    updateHud();
    if (state.remainingMs <= 0) {
      stopRoundTimer();
      requestSettle();
    }
  }, 1000);
}

function requestSettle() {
  if (!isHost() || state.type !== 'dealer' || state.phase !== 'playing') return;
  if (!state.published.size) {
    skipDealer('manual');
    return;
  }
  stopRoundTimer();
  if (isDealer()) {
    settleDealer();
  } else {
    hostSend(state.dealerId, { v: PROTOCOL_VERSION, t: 'settle', round: state.round });
  }
}

function handleDealerGuess(playerId, text) {
  if (!isDealer() || !state.dealerTarget) return;
  if (!state.published.size) return;
  const guess = normalizeText(text);
  if (!guess) return;
  if (state.solves.some((entry) => entry.playerId === playerId)) return;
  if (state.accepted.has(guess)) {
    const snapshot = unpublishedWeight(state.clues, [...state.published]);
    if (isHost()) {
      applyDealerSolved(playerId, snapshot);
    } else {
      state.solves.push({ playerId, snapshot });
      state.guest?.send({ v: PROTOCOL_VERSION, t: 'solved', round: state.round, playerId, snapshot });
      addFeed(T('mp.feed.aSolved', '{name} solved it.', { name: playerName(playerId) }), true);
      renderDealerGame();
    }
    return;
  }
  const chat = { v: PROTOCOL_VERSION, t: 'chat', round: state.round, from: playerId, text };
  if (isHost()) {
    addFeed(`${playerName(playerId)}: ${text}`);
    hostBroadcast(chat);
    renderDealerGame();
  } else {
    state.guest?.send(chat);
  }
}

function applyDealerSolved(playerId, snapshot) {
  if (state.phase !== 'playing' || state.type !== 'dealer') return;
  if (!playerId || state.solves.some((entry) => entry.playerId === String(playerId))) return;
  state.solves.push({ playerId: String(playerId), snapshot: Number(snapshot) || 0 });
  addFeed(T('mp.feed.aSolved', '{name} solved it.', { name: playerName(playerId) }), true);
  hostBroadcast({ v: PROTOCOL_VERSION, t: 'solved', round: state.round, playerId: String(playerId), snapshot });
  renderDealerGame();
  const guessers = activePlayers().filter((player) => player.id !== state.dealerId).map((player) => player.id);
  if (guessers.length && guessers.every((id) => state.solves.some((entry) => entry.playerId === id))) {
    requestSettle();
  }
}

function settleDealer() {
  if (!isDealer() || !state.dealerTarget) return;
  const result = pvpRoundScores({
    clues: state.clues,
    publishedIndices: [...state.published],
    solves: state.solves,
  });
  const message = {
    v: PROTOCOL_VERSION,
    t: 'dealerResult',
    round: state.round,
    answerId: Number(state.dealerTarget.ship.id),
    clues: state.clues.map((clue) => clueForWire(clue)),
    published: [...state.published],
    scores: result.playerScores,
    dealerScore: result.dealerScore,
    publishedWeight: result.publishedWeight,
    unpublishedWeight: result.unpublishedWeight,
    correctCount: result.correctCount,
  };
  if (isHost()) {
    applyDealerResult(message);
    hostBroadcast(message);
  } else {
    state.guest?.send(message);
  }
}

function applyDealerResult(message) {
  if (state.phase !== 'playing' || state.type !== 'dealer') return;
  stopRoundTimer();
  const dealerId = String(state.dealerId);
  state.scores[dealerId] = (Number(state.scores[dealerId]) || 0) + (Number(message.dealerScore) || 0);
  for (const [id, points] of Object.entries(message.scores || {})) {
    state.scores[String(id)] = (Number(state.scores[String(id)]) || 0) + (Number(points) || 0);
    state.solvesByPlayer[String(id)] = (Number(state.solvesByPlayer[String(id)]) || 0) + 1;
  }
  state.published = new Set((message.published || []).map(Number));
  state.clues = (message.clues || []).map((clue) => ({ ...clue }));
  state.phase = 'result';
  state.lastResult = {
    ...message,
    dealerId,
    dealerScore: message.dealerScore,
    publishedWeight: message.publishedWeight,
    unpublishedWeight: message.unpublishedWeight,
    totals: state.scores,
  };
  hostBroadcast({
    v: PROTOCOL_VERSION,
    t: 'roundResult',
    round: state.round,
    dealerId,
    answerId: message.answerId,
    clues: message.clues,
    published: message.published,
    dealerScore: message.dealerScore,
    publishedWeight: message.publishedWeight,
    unpublishedWeight: message.unpublishedWeight,
    playerScores: message.scores,
    totals: state.scores,
    roundScores: message.scores,
    gameOver: false,
  });
  renderDealerResult(message);
}

function skipDealer(reason) {
  if (!isHost() || state.type !== 'dealer') return;
  stopRoundTimer();
  const dealerId = String(state.dealerId || '');
  if (dealerId) state.failedDealers.add(dealerId);
  addFeed(T('mp.feed.dealerFailed', 'Dealer could not load intel. Skipping this turn.'));
  state.failedDealers.add(dealerId);
  const players = playerArray().filter((player) => player.connected);
  if (state.failedDealers.size >= players.length) {
    state.phase = 'ended';
    state.lastResult = null;
    state.error = T('mp.error.kb', 'Killboard unavailable. No round was started; try again.');
    state.errorCode = 'kb';
    roomDirty();
    return;
  }
  state.dealIndex += 1;
  setTimeout(() => beginDeal(), 800);
}

function renderDealerGame() {
  state.phase = 'playing';
  const dealer = isDealer();
  const target = state.dealerTarget;
  const players = playerArray();
  const spectator = Boolean(selfPlayer()?.spectator);
  const canGuess = !spectator && state.phase === 'playing' && state.published.size > 0;
  const ctx = ctxClue();
  const dealerClues = state.clues || [];
  const publishedSet = state.published;
  q('#mp-app').innerHTML = `
    <div class="mp-topbar">
      <a class="mp-brand" href="multiplayer.html">${icon('crosshair')}<div><strong>FITDLE</strong><span>${esc(T('mp.dealer.title', 'DEALER ROOM'))}</span></div></a>
      <div class="mp-top-actions"><span class="mp-code">${esc(state.code)}</span></div>
    </div>
    ${renderHud()}
    ${state.error ? `<p class="mp-status mp-error">${esc(state.error)}</p>` : ''}
    <div class="mp-layout">
      <div class="mp-main">
        <div class="mp-panel">
          <h2>${esc(dealer ? T('mp.dealer.allClues', 'YOUR INTEL — PUBLISH CLUES') : T('mp.dealer.published', 'PUBLISHED INTEL'))}</h2>
          ${dealer && target ? `<div class="mp-dealer-answer">
            <img src="${esc(`${state.manifest?.images?.baseUrl || ''}/types/${Number(target.ship.id)}/render?size=128`)}" alt="" loading="lazy">
            <div><div class="mp-kicker">${esc(T('mp.dealer.answer', 'ANSWER'))}</div><strong>${esc(target.ship.names?.[state.locale] || target.ship.names?.en || '')}</strong></div>
          </div>` : ''}
          <div class="mp-clue-list">
            ${dealer
              ? renderClueList(dealerClues, ctx, { published: publishedSet, dealer: true })
              : (state.publishedClues.length
                ? renderClueList(state.publishedClues, ctx, { published: new Set(state.publishedClues.map((clue) => Number(clue.i))), dealer: false })
                : `<p class="mp-status">${esc(T('mp.dealer.noClues', 'No clues published yet.'))}</p>`)}
          </div>
          ${dealer ? `<p class="mp-status">${esc(T('mp.dealer.publishHint', 'Each published clue increases your score but gives the table more information.'))}</p>` : ''}
        </div>
        ${!dealer ? `<div class="mp-panel" style="margin-top:1rem">
          <h2>${esc(T('mp.dealer.guessTitle', 'NAME THE HULL'))}</h2>
          <form class="mp-guess-row" data-form="guess">
            <input name="guess" maxlength="120" autocomplete="off" placeholder="${esc(T('mp.guess.placeholder', 'Type a ship name…'))}" ${canGuess ? '' : 'disabled'}>
            <button class="mp-button primary" type="submit" ${canGuess ? '' : 'disabled'}>${esc(T('mp.guess', 'GUESS'))}</button>
          </form>
          <div class="mp-feed">${state.feed.map((line) => `<div class="mp-feed-line${line.correct ? ' is-correct' : ''}">${esc(line.text)}</div>`).join('')}</div>
        </div>` : ''}
      </div>
      <aside class="mp-side">
        <div class="mp-panel">
          <h2>${esc(T('mp.players', 'PILOTS'))}</h2>
          <div class="mp-players">${players.map((player) => `
            <div class="mp-player ${player.id === state.selfId ? 'is-self' : ''} ${player.id === state.dealerId ? 'is-dealer' : ''}">
              <span>${esc(player.name)} ${player.id === state.dealerId ? tag(T('mp.dealer', 'DEALER')) : ''}</span>
              <span class="score">${esc(Number(state.scores[player.id]) || 0)}</span>
            </div>`).join('')}</div>
        </div>
        <div class="mp-panel">
          <h2>${esc(T('mp.dealer.status', 'DEAL STATUS'))}</h2>
          <div class="mp-room-meta"><span>${esc(T('mp.settings.cycles', 'ROUNDS'))}: ${esc(state.cycle)}/${esc(state.settings?.cycles || 2)}</span></div>
          <div class="mp-room-meta"><span>${esc(T('mp.dealer.published', 'PUBLISHED'))}: ${state.published.size}/${dealerClues.length || '?'}</span></div>
          ${dealer ? `<div class="mp-actions"><button class="mp-button" type="button" data-action="settle">${esc(T('mp.finishRound', 'END DEAL'))}</button></div>` : ''}
        </div>
      </aside>
    </div>
  `;
}

function renderDealerResult(message) {
  const ranking = rankPlayers(playerArray(), state.scores, state.solvesByPlayer);
  const dealerId = String(message.dealerId || state.dealerId);
  const answer = state.catalogMap.get(Number(message.answerId));
  q('#mp-app').innerHTML = `
    <div class="mp-topbar">
      <a class="mp-brand" href="multiplayer.html">${icon('crosshair')}<div><strong>FITDLE</strong><span>${esc(T('mp.roundResult', 'DEAL RESULT'))}</span></div></a>
      <div class="mp-top-actions"><span class="mp-code">${esc(state.code)}</span></div>
    </div>
    <div class="mp-panel" style="margin-top:1rem">
      <h2>${esc(T('mp.roundResult', 'DEAL RESULT'))}</h2>
      ${answer ? `<div class="mp-dealer-answer">
        <img src="${esc(`${state.manifest?.images?.baseUrl || ''}/types/${Number(answer.id)}/render?size=256`)}" alt="" loading="lazy">
        <div><div class="mp-kicker">${esc(T('mp.answer', 'ANSWER'))}</div><strong>${esc(answer.names?.[state.locale] || answer.names?.en || '')}</strong></div>
      </div>` : ''}
      <div class="mp-result-grid">
        <div class="mp-result-stat"><span>${esc(T('mp.dealer', 'DEALER'))}</span><strong>${esc(playerName(dealerId))}</strong></div>
        <div class="mp-result-stat"><span>${esc(T('mp.score', 'DEALER SCORE'))}</span><strong>${esc(message.dealerScore || 0)}</strong></div>
        <div class="mp-result-stat"><span>${esc(T('mp.publishedWeight', 'PUBLISHED WEIGHT'))}</span><strong>${esc(message.publishedWeight || 0)}</strong></div>
        <div class="mp-result-stat"><span>${esc(T('mp.unpublishedWeight', 'UNPUBLISHED WEIGHT'))}</span><strong>${esc(message.unpublishedWeight || 0)}</strong></div>
      </div>
      <table class="mp-score-table"><thead><tr><th>#</th><th>${esc(T('mp.players', 'PILOT'))}</th><th>${esc(T('mp.score', 'SCORE'))}</th></tr></thead><tbody>
        ${ranking.map((player, index) => `<tr><td>${index + 1}</td><td>${esc(player.name)}</td><td>${esc(player.score)}</td></tr>`).join('')}
      </tbody></table>
      <div class="mp-actions">
        ${isHost() ? `<button class="mp-button primary" type="button" data-action="next-deal">${esc(T('mp.nextRound', 'NEXT DEAL'))}</button>` : ''}
        <a class="mp-button" href="multiplayer.html">${esc(T('mp.leave', 'LEAVE'))}</a>
      </div>
    </div>
  `;
}

function nextDeal() {
  if (!isHost() || state.type !== 'dealer') return;
  state.dealIndex += 1;
  state.phase = 'playing';
  beginDeal();
}

function renderFinal(message = {}) {
  if (message.scores) state.scores = { ...message.scores };
  const ranking = rankPlayers(playerArray(), state.scores, state.solvesByPlayer);
  q('#mp-app').innerHTML = `
    <div class="mp-topbar">
      <a class="mp-brand" href="multiplayer.html">${icon('radar')}<div><strong>FITDLE</strong><span>${esc(T('mp.gameOver', 'GAME OVER'))}</span></div></a>
      <div class="mp-top-actions"><span class="mp-code">${esc(state.code)}</span></div>
    </div>
    <div class="mp-panel" style="margin-top:1rem">
      <h2>${esc(T('mp.finalScores', 'FINAL SCORES'))}</h2>
      <table class="mp-score-table"><thead><tr><th>#</th><th>${esc(T('mp.players', 'PILOT'))}</th><th>${esc(T('mp.score', 'SCORE'))}</th></tr></thead><tbody>
        ${ranking.map((player, index) => `<tr><td>${index + 1}</td><td>${esc(player.name)}</td><td>${esc(player.score)}</td></tr>`).join('')}
      </tbody></table>
      <div class="mp-actions">
        ${isHost() ? `<button class="mp-button primary" type="button" data-action="lobby">${esc(T('mp.playAgain', 'PLAY AGAIN'))}</button>` : ''}
        <a class="mp-button" href="multiplayer.html">${esc(T('mp.leave', 'LEAVE'))}</a>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// UI events
// ---------------------------------------------------------------------------

document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'create') {
    const type = event.target.closest('[data-action]').dataset.type;
    state.type = type;
    setHash(`room=create&type=${type}`);
    renderCreate(type);
  }
  if (action === 'copy-link') {
    const link = roomLink();
    navigator.clipboard?.writeText(link).then(() => {
      state.notice = T('mp.copied', 'Link copied.');
      if (state.phase === 'lobby') renderLobby();
      else updateHud();
    }).catch(() => {});
  }
  if (action === 'start') {
    if (state.type === 'race') hostStartRace();
    else hostStartDealer();
  }
  if (action === 'next-round') {
    state.phase = 'playing';
    hostStartRace();
  }
  if (action === 'next-deal') {
    nextDeal();
  }
  if (action === 'finish') {
    if (state.type === 'race') finishRaceRound();
    else requestSettle();
  }
  if (action === 'settle') {
    requestSettle();
  }
  if (action === 'lobby') {
    state.phase = 'lobby';
    state.scores = {};
    state.solvesByPlayer = {};
    state.round = 0;
    state.cycle = 0;
    state.target = null;
    state.clues = null;
    state.dealerTarget = null;
    state.published = new Set();
    state.publishedClues = [];
    state.dealIndex = 0;
    state.phase = 'lobby';
    roomDirty();
    renderLobby();
  }
});

document.addEventListener('change', (event) => {
  if (event.target?.id !== 'mp-lang') return;
  const locale = LOCALES.includes(event.target.value) ? event.target.value : 'en';
  try {
    localStorage.setItem('fitdle:v1:lang', locale);
  } catch {
    // best effort
  }
  location.reload();
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.dataset.form === 'join-code') {
    const code = String(data.get('code') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const type = TYPES.has(String(data.get('type'))) ? String(data.get('type')) : 'race';
    if (!code) {
      formError(T('mp.error.room', 'Enter a room code.'));
      return;
    }
    state.type = type;
    state.code = code;
    setHash(`room=${code}&type=${type}`);
    renderJoin(type, code);
    return;
  }
  if (form.dataset.form === 'create') {
    try {
      await createRoom(data);
    } catch (error) {
      formError(String(error?.message || error));
    }
    return;
  }
  if (form.dataset.form === 'join') {
    try {
      await joinRoom(data);
    } catch (error) {
      formError(String(error?.message || error));
    }
    return;
  }
  if (form.dataset.form === 'guess') {
    const text = sanitizeText(data.get('guess'));
    if (!text) return;
    if (state.type !== 'dealer' || state.phase !== 'playing') return;
    if (isDealer()) handleDealerGuess(state.selfId, text);
    else if (isHost()) {
      if (state.dealerId) {
        if (isDealer()) handleDealerGuess(state.selfId, text);
        else hostSend(state.dealerId, { v: PROTOCOL_VERSION, t: 'guess', from: state.selfId, text });
      }
    } else {
      guestSend({ v: PROTOCOL_VERSION, t: 'guess', text });
    }
    form.reset();
    return;
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-publish]');
  if (!button) return;
  if (!isDealer()) return;
  publishClue(Number(button.dataset.publish));
});

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'mp-ready') {
    state.iframeReady = true;
    const spectator = Boolean(selfPlayer()?.spectator);
    if (spectator) {
      try {
        q('#mp-frame')?.contentWindow?.postMessage({ type: 'mp-spectator', value: true }, location.origin);
      } catch {
        // iframe may have navigated
      }
    } else if (state.target?.mode === 'timed') {
      try {
        q('#mp-frame')?.contentDocument?.querySelector('[data-action="start-timed"]')?.click();
      } catch {
        // the timed start button may already be gone
      }
    }
    return;
  }
  if (data.type === 'mp-status') {
    const status = data.status === 'won' ? 'solved' : data.status === 'lost' ? 'lost' : 'playing';
    if (status !== 'playing') {
      if (isHost()) recordRaceResult(state.selfId, status, data.attempts, data.elapsedMs);
      else guestSend({ v: PROTOCOL_VERSION, t: 'result', status, attempts: data.attempts, elapsedMs: data.elapsedMs });
    }
    return;
  }
  if (data.type === 'mp-error') {
    if (isHost()) recordRaceResult(state.selfId, 'lost', 0, 0);
    else guestSend({ v: PROTOCOL_VERSION, t: 'result', status: 'lost', attempts: 0, elapsedMs: 0 });
  }
});

// Hash routing on first load.
const route = parseHash();
state.type = route.type;
if (route.action === 'create') {
  // boot() will render the form; this keeps the type stable.
  state.roomType = route.action;
}

boot();
