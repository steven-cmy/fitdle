import {
  ATTEMPT_LIMIT,
  buildGuessResult,
  buildSearchIndex,
  freeKillIdFromToken,
  emptyStats,
  filterDailyKillPool,
  formatMass,
  freeKillToken,
  gameDateKey,
  KILL_HISTORY_START,
  killHasFittedModules,
  loadState,
  loadStats,
  modeFromLocation,
  msUntilNextDowntime,
  parseKillId,
  normalizeText,
  profileSimilarity,
  recordPlay,
  recordResult,
  saveState,
  saveStats,
  searchShips,
  selectDailyKillPair,
  settleStats,
  shareUrl,
  victimIsWatched,
  weightedHullOrder,
} from './game.js';
import { detectLocale, createI18n, isLocale, resolveLocale, LOCALES, LOCALE_META } from './i18n.js';
import { buildClues, getEquipment, selectAbyssFallbacks, EQUIPMENT_SLOT_ORDER } from './clues.js';
import { calculateDogmaBaseline, calculateDogmaFit } from './dogma.js';
import { computeRevealed, computeTimedRevealed, timedRevealTotal } from './reveal.js';
import { CATEGORY_ICON, icon } from './icons.js';
import { initStarfield } from './starfield.js';

const CATEGORIES = ['traits', 'hull', 'nav', 'defense', 'targeting', 'fitting', 'equipment', 'cargo', 'economy'];
const CATEGORY_ALIASES = { identity: 'hull', slots: 'fitting' };
const DEFENSE_ORDER = {
  shield: 0,
  shieldRecharge: 1,
  armor: 2,
  structure: 3,
  shieldResists: 4,
  armorResists: 5,
  structureResists: 6,
};
const FITTING_ORDER = {
  turretHardpoints: 0,
  launcherHardpoints: 1,
  hiSlots: 2,
  medSlots: 3,
  lowSlots: 4,
  rigSlots: 5,
  cpu: 6,
  pg: 7,
  capacitor: 8,
  cargo: 9,
  drones: 10,
  calibration: 11,
};

function groupCategory(clue) {
  const category = CATEGORY_ALIASES[clue?.c] || clue?.c;
  return CATEGORIES.includes(category) ? category : 'hull';
}

const state = {
  manifest: null,
  catalog: [],
  catalogMap: new Map(),
  refs: null,
  liveStats: null,
  liveLosses: [],
  liveError: false,
  liveFetched: false,
  moduleDetails: null,
  extraTypeNames: {},
  extraTypeNamesLocale: null,
  cargoFetchId: 0,
  dogmaAttrs: null,
  dogmaBaseline: null,
  dogmaError: false,
  victimInfo: null,
  victimInfoKey: null,
  victimInfoLoading: false,
  mode: 'normal',
  utcDate: '',
  watchlist: null,
  serverAnchor: null,
  monotonicAnchor: 0,
  timeVerified: false,
  index: [],
  locale: 'en',
  i18n: null,
  massUnit: 't',
  date: null,
  today: null,
  answerId: null,
  answerKillId: null,
  freeKillId: null,
  freeKillToken: null,
  freeKillmail: null,
  freeRequested: false,
  freeFromRefresh: false,
  freeRoundActive: false,
  freeStreaks: { standard: 0, abyss: 0, timed: 0 },
  freeStreakMode: 'standard',
  freeStreakBefore: 0,
  freeStreakEvent: null,
  answerShip: null,
  answerData: null,
  dataVersionKey: null,
  guesses: [],
  status: 'playing',
  visibleCount: 0,
  revealed: new Set(),
  fresh: new Set(),
  unseen: new Set(),
  hintRaf: 0,
  hintKey: '',
  latestIndex: -1,
  scanPulse: false,
  inputValue: '',
  selectedId: null,
  activeSuggestion: -1,
  suggestions: [],
  stats: null,
  modal: null,
  focusBeforeModal: null,
  localeLoading: false,
  newTargetAvailable: false,
  composing: false,
  allowEmptyKb: true,
  fontSize: 'normal',
  timed: false,
  timerStarted: false,
  timerStartAt: 0,
  timerElapsedMs: 0,
  timerHoldStart: 0,
  timedClueCount: 0,
  timedExpired: false,
  lockCooldownStart: 0,
  lockCooldownUntil: 0,
  cooldownHandle: null,
  timerHandle: null,
  gaveUp: false,
  booted: false,
  font: 'neue',
  fontClicks: 0,
  radarMosaicTimer: null,
  resetting: false,
};

const BASE = new URL('.', document.baseURI);
const JSON_CACHE = new Map();
const DEFAULT_STATS = emptyStats();

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function t(key, vars = {}) {
  return state.i18n ? state.i18n.t(key, vars) : key;
}

function int(n) {
  return state.i18n.integer(n);
}

function dec(n, digits = 1) {
  return state.i18n.decimal(n, digits);
}

function compact(n) {
  return state.i18n.compact(n);
}

function isk(n) {
  return state.i18n.isk(n);
}

function pct(n) {
  return state.i18n.percent(n);
}

function serverNow() {
  if (state.serverAnchor == null) return new Date();
  return new Date(state.serverAnchor + (performance.now() - state.monotonicAnchor));
}

function nextDowntime() {
  return state.i18n.duration(msUntilNextDowntime(serverNow(), state.manifest?.downtimeUtcHour || 11));
}

async function applyBootFlavor() {
  try {
    const data = await fetchJson('assets/boot-flavor.json');
    const sub = $('.boot-sub');
    if (!sub) return;
    const eggs = (data.eggs || []).filter((egg) => egg?.lang === state.locale && egg?.text);
    const normal = (data.flavor?.[state.locale] || []).filter(Boolean);
    const pool = eggs.length && Math.random() < 0.05
      ? eggs
      : normal.map((text) => ({ text }));
    if (!pool.length) return;
    sub.textContent = pool[Math.floor(Math.random() * pool.length)].text;
  } catch {
    // leave the localized static subtitle in place
  }
}

function isFree() {
  return Boolean(state.freeKillId);
}

function freeKillFromLocation(search) {
  const params = new URLSearchParams(search);
  const raw = params.get('kb') || params.get('killmail') || params.get('kill');
  const id = raw ? freeKillIdFromToken(raw) : null;
  return id ? { id, token: freeKillToken(id), legacy: /^\d+$/.test(raw) } : null;
}

function applyFont(mode, persist = false) {
  state.font = mode === 'classic' || mode === 'triglavian' ? mode : 'neue';
  document.documentElement.dataset.eveFont = state.font;
  if (state.font === 'triglavian') document.documentElement.dataset.theme = 'triglavian';
  else delete document.documentElement.dataset.theme;
  if (persist) {
    try {
      localStorage.setItem('fitdle:v1:font', state.font);
    } catch {
      // best effort
    }
  }
  syncFontControls();
}

function applyFontSize(size, persist = false) {
  state.fontSize = ['smallest', 'smaller', 'normal', 'larger', 'largest'].includes(size) ? size : 'normal';
  document.documentElement.dataset.fontSize = state.fontSize;
  if (persist) {
    try {
      localStorage.setItem('fitdle:v1:font-size', state.fontSize);
    } catch {
      // best effort
    }
  }
}

function readFontSize() {
  try {
    const value = localStorage.getItem('fitdle:v1:font-size');
    if (value === 'xlarge') return 'normal';
    if (value === 'large') return 'smaller';
    return ['smallest', 'smaller', 'normal', 'larger', 'largest'].includes(value) ? value : 'normal';
  } catch {
    return 'normal';
  }
}

function setFontStyle(mode) {
  applyFont(mode, true);
  renderManual();
}

function toggleFontFace() {
  state.fontClicks += 1;
  try {
    localStorage.setItem('fitdle:v1:font-clicks', String(state.fontClicks));
  } catch {
    // best effort
  }
  if (state.fontClicks % 10 === 0) {
    applyFont('triglavian', true);
    renderManual();
    showToast(t('font.triglavianToast'), t('font.triglavianSub'), 'info');
    return;
  }
  applyFont(state.font === 'classic' ? 'neue' : 'classic', true);
  renderManual();
}

function setFontSize(size) {
  applyFontSize(size, true);
  renderManual();
}

function syncFontControls() {
  const value = state.font === 'classic'
    ? t('font.classic')
    : state.font === 'triglavian'
      ? t('font.triglavian')
      : t('font.neue');
  for (const button of $$('[data-action="toggle-font"]')) {
    button.dataset.font = state.font;
    button.setAttribute('aria-pressed', String(state.font !== 'neue'));
    button.setAttribute('aria-label', t('font.switch'));
    button.setAttribute('title', `${t('font.label')}: ${value}`);
    const text = button.querySelector('.font-toggle-value');
    if (text) text.textContent = value;
  }
}

function readFontClicks() {
  try {
    return Number(localStorage.getItem('fitdle:v1:font-clicks') || 0) || 0;
  } catch {
    return 0;
  }
}

function readAllowEmptyKb() {
  try {
    return localStorage.getItem('fitdle:v1:allowEmptyKb') !== '0';
  } catch {
    return true;
  }
}

function setAllowEmptyKb(enabled) {
  state.allowEmptyKb = Boolean(enabled);
  try {
    localStorage.setItem('fitdle:v1:allowEmptyKb', state.allowEmptyKb ? '1' : '0');
  } catch {
    // ignore
  }
  const current = state.liveLosses?.[0];
  if (!state.allowEmptyKb && current && !killHasFittedModules(current)) {
    location.reload();
    return;
  }
  renderManual();
  showToast(t('manual.emptyKb'), t(state.allowEmptyKb ? 'manual.emptyKbOn' : 'manual.emptyKbOff'), 'info', 3200);
}

function secretFontClick() {
  state.fontClicks += 1;
  try {
    localStorage.setItem('fitdle:v1:font-clicks', String(state.fontClicks));
  } catch {
    // best effort
  }
  if (state.fontClicks % 10 !== 0) return;
  applyFont('triglavian', true);
  renderManual();
  showToast(t('font.triglavianToast'), t('font.triglavianSub'), 'info');
}

function toggleFont() {
  state.fontClicks += 1;
  const clicks = state.fontClicks;
  try {
    localStorage.setItem('fitdle:v1:font-clicks', String(clicks));
  } catch {
    // best effort
  }
  if (clicks % 10 === 0) {
    applyFont('triglavian', true);
    showToast(t('font.triglavianToast'), t('font.triglavianSub'), 'info');
    return;
  }
  applyFont(state.font === 'triglavian' ? 'neue' : state.font === 'neue' ? 'classic' : 'neue', true);
}

function isTimed() {
  return state.timed;
}

function usesSimulatedFit() {
  return state.mode === 'abyss' || isTimed();
}

function storageMode() {
  return isTimed() ? `${state.mode}:timed` : state.mode;
}

function timedFromLocation(search) {
  const params = new URLSearchParams(search);
  return params.get('rule') === 'timed'
    || params.get('timer') === '1'
    || params.get('timed') === '1'
    || params.get('mode') === 'timed';
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function currentElapsed() {
  if (!state.timerStarted || !state.timerStartAt) return state.timerElapsedMs;
  return Math.max(0, Date.now() - state.timerStartAt);
}

function updateTimedOrb() {
  if (!isTimed()) return;
  const orb = $('#dossier-orb');
  const text = $('#dossier-orb-text');
  if (!orb || !text) return;
  if (state.status !== 'playing' || !state.timerStarted) {
    orb.style.setProperty('--p', 0);
    orb.setAttribute('aria-valuenow', '0');
    text.textContent = state.status === 'playing' ? '?' : '—';
    return;
  }
  const cycle = currentElapsed() % 30000;
  const progress = (cycle / 30000) * 100;
  orb.style.setProperty('--p', String(progress));
  orb.setAttribute('aria-valuenow', String(Math.round(progress)));
  const frames = ['|', '/', '-', '\\'];
  text.textContent = frames[Math.floor(cycle / 100) % frames.length];
}

function updateTimedClock() {
  if (!isTimed()) return;
  const text = state.timerStarted ? formatElapsed(currentElapsed()) : '00:00';
  const board = $('#board-count-text');
  if (board) board.textContent = text;
  const hero = $('#hero-timed');
  if (hero) hero.textContent = text;
  updateTimedOrb();
  if (state.timerStarted && state.status === 'playing' && state.answerData) {
    const releases = Math.floor(currentElapsed() / 30000);
    if (releases > state.timedClueCount) {
      const remaining = state.answerData.clues.some((clue, index) => (
        (Number(clue?.w) || 0) > 0 && !state.revealed.has(index)
      ));
      if (!remaining) {
        failTimedRun();
        return;
      }
      const before = new Set(state.revealed);
      recomputeRevealed();
      state.fresh = new Set([...state.revealed].filter((index) => !before.has(index)));
      renderHero();
      renderDossier();
      rememberNewClues(state.fresh);
      if (state.fresh.size) showToast(t('toast.intel'), t('toast.clue', { n: state.fresh.size }), 'info');
    }
  }
}

function startTimedClock() {
  stopTimedClock();
  state.timerStartAt = Date.now();
  state.timerStarted = true;
  state.timerHandle = setInterval(updateTimedClock, 100);
  updateTimedClock();
}

function resumeTimedClock() {
  if (!isTimed() || !state.timerStarted) return;
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = setInterval(updateTimedClock, 100);
  updateTimedClock();
}

function markTimedForfeited() {
  const button = $('.timed-clock-button');
  if (button) button.classList.toggle('is-forfeited', isTimed() && Boolean(state.gaveUp));
}

function stopTimedClock() {
  clearLockCooldown();
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = null;
  if (state.timerStarted) state.timerElapsedMs = Math.max(0, Date.now() - state.timerStartAt);
  state.timerStarted = false;
}

function clearLockCooldown() {
  if (state.cooldownHandle) clearInterval(state.cooldownHandle);
  state.cooldownHandle = null;
  state.lockCooldownUntil = 0;
  const button = $('.lock-button');
  if (button) {
    button.classList.remove('is-cooling');
    button.style.removeProperty('--cd');
    button.disabled = !state.inputValue.trim();
  }
}

function syncLockCooldown() {
  const button = $('.lock-button');
  if (!button) return;
  const remaining = state.lockCooldownUntil - Date.now();
  if (!isTimed() || remaining <= 0) {
    button.classList.remove('is-cooling');
    button.style.removeProperty('--cd');
    button.disabled = !state.inputValue.trim();
    return;
  }
  button.classList.add('is-cooling');
  button.disabled = true;
  button.style.setProperty('--cd', `${Math.min(100, Math.max(0, (1 - remaining / 5000) * 100))}%`);
}

function updateLockCooldown() {
  const remaining = state.lockCooldownUntil - Date.now();
  if (remaining <= 0) {
    clearLockCooldown();
    return;
  }
  syncLockCooldown();
}

function startLockCooldown() {
  if (!isTimed()) return;
  state.lockCooldownStart = Date.now();
  state.lockCooldownUntil = state.lockCooldownStart + 5000;
  if (state.cooldownHandle) clearInterval(state.cooldownHandle);
  syncLockCooldown();
  state.cooldownHandle = setInterval(updateLockCooldown, 100);
}

function startTimedRun() {
  if (!isTimed() || state.timerStarted || state.status !== 'playing') return;
  recordDailyPlay();
  startTimedClock();
  state.timerHoldStart = 0;
  state.gaveUp = false;
  state.timedExpired = false;
  const before = new Set(state.revealed);
  recomputeRevealed();
  state.fresh = new Set([...state.revealed].filter((index) => !before.has(index)));
  renderAll();
  rememberNewClues(state.fresh);
  persist();
  setTimeout(() => $('#ship-input')?.focus(), 80);
}

function failTimedRun() {
  if (!isTimed() || !state.timerStarted || state.status !== 'playing') return;
  if (isFree()) finishFreeRound(false);
  state.timerElapsedMs = currentElapsed();
  state.timerStarted = false;
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = null;
  clearLockCooldown();
  state.gaveUp = false;
  state.timedExpired = true;
  state.status = 'lost';
  recordDailyResult();
  recomputeRevealed();
  renderAll();
  persist();
  setTimeout(() => renderDebrief(), 300);
}

function giveUpTimed() {
  if (!isTimed() || !state.timerStarted || state.status !== 'playing') return;
  if (isFree()) finishFreeRound(false);
  const holdMs = state.timerHoldStart ? Math.max(0, Date.now() - state.timerHoldStart) : 0;
  state.timerElapsedMs = Math.max(0, currentElapsed() - holdMs);
  state.timerHoldStart = 0;
  state.timerStarted = false;
  clearLockCooldown();
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = null;
  state.gaveUp = true;
  state.timedExpired = false;
  state.status = 'lost';
  recordDailyResult();
  recomputeRevealed();
  renderAll();
  markTimedForfeited();
  persist();
  setTimeout(() => renderDebrief(), 300);
}

function setMode(mode) {
  const nextTimed = mode === 'timed';
  const next = mode === 'abyss' ? 'abyss' : 'normal';
  if (next === state.mode && nextTimed === state.timed) return;
  const url = new URL(location.href);
  url.searchParams.delete('mode');
  url.searchParams.delete('timer');
  url.searchParams.delete('timed');
  if (nextTimed) url.searchParams.set('rule', 'timed');
  else if (next === 'abyss') url.searchParams.set('rule', 'abyss');
  else url.searchParams.delete('rule');
  location.assign(url.toString());
}

function displayName(ship) {
  return ship?.names?.[state.locale] || ship?.names?.en || 'UNKNOWN';
}

function zkillItemUrl(id) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  return base && Number(id) ? `${base}/item/${Number(id)}/` : '';
}

function zkillLinksEnabled() {
  return state.status !== 'playing';
}

function zkillItemLink(text, id) {
  const url = zkillItemUrl(id);
  if (!url || !zkillLinksEnabled()) return esc(text);
  return `<a class="zkb-item-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
}

function zkillShipLink(text, id) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base || !Number(id) || !zkillLinksEnabled()) return esc(text);
  return `<a class="zkb-item-link" href="${esc(`${base}/ship/${Number(id)}/`)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
}

function zkillEntityLink(kind, id, text) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base || !Number(id) || !zkillLinksEnabled()) return esc(text);
  return `<a class="zkb-item-link" href="${esc(`${base}/${kind}/${Number(id)}/`)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
}

function victimMetaHtml() {
  const victim = state.liveLosses?.[0]?.victim;
  if (!victim) return '';
  const info = state.victimInfo || {};
  const characterId = Number(victim.character_id) || null;
  const corporationId = Number(victim.corporation_id) || null;
  const allianceId = Number(victim.alliance_id) || null;
  const pilot = info.characterName || t('dossier.pilotFallback', { id: characterId || '?' });
  const corporation = info.corporationName || t('dossier.corpFallback', { id: corporationId || '?' });
  const alliance = info.allianceName || t('dossier.allianceFallback', { id: allianceId || '?' });
  const zkillBase = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  const watched = victimIsWatched(victim, state.watchlist);
  const portrait = characterId && imageBase() && zkillBase
    ? `<a class="victim-portrait zkb-item-link${watched ? ' is-watched' : ''}" href="${esc(`${zkillBase}/character/${characterId}/`)}" target="_blank" rel="noopener noreferrer"><img src="${esc(`${imageBase()}/characters/${characterId}/portrait?size=64`)}" alt="${esc(t('dossier.victimAlt'))}" onerror="this.parentElement.remove()"></a>`
    : '';
  const corpIcon = corporationId && imageBase()
    ? `<img class="victim-org-icon" src="${esc(`${imageBase()}/corporations/${corporationId}/logo?size=32`)}" alt="" onerror="this.remove()">`
    : '';
  const allianceIcon = allianceId && imageBase()
    ? `<img class="victim-org-icon" src="${esc(`${imageBase()}/alliances/${allianceId}/logo?size=32`)}" alt="" onerror="this.remove()">`
    : '';
  return `<div class="victim-card">
    <div class="victim-body">
      ${zkillEntityLink('character', characterId, pilot)}
      <div class="victim-lines">
        ${corporationId ? `<span class="victim-org">${corpIcon}${zkillEntityLink('corporation', corporationId, corporation)}</span>` : ''}
        ${allianceId ? `<span class="victim-org">${allianceIcon}${zkillEntityLink('alliance', allianceId, alliance)}</span>` : ''}
      </div>
    </div>
    ${portrait}
  </div>`;
}

function zkillGroupTextLink(text, groupID) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  const id = Number(groupID);
  if (!base || !id || !zkillLinksEnabled()) return esc(text);
  return `<a class="zkb-item-link" href="${esc(`${base}/group/${id}/`)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
}

function groupName(ship) {
  return state.refs?.groups?.[ship?.groupID] || `Group ${ship?.groupID ?? '?'}`;
}

function raceName(ship) {
  return state.refs?.races?.[ship?.raceID] || '';
}

function factionName(ship) {
  return state.refs?.factions?.[ship?.factionID] || raceName(ship);
}

function imageBase() {
  return (state.manifest?.images?.baseUrl || '').replace(/\/$/, '');
}

function shipIconPath(ship) {
  return `${imageBase()}/types/${Number(ship.id)}/icon?size=64`;
}

function renderPath(id) {
  return `${imageBase()}/types/${Number(id)}/render?size=512`;
}

function moduleIconPath(moduleID) {
  return `${imageBase()}/types/${Number(moduleID)}/icon?size=32`;
}

function weightPips(weight) {
  const numeric = Number(weight) || 0;
  const lit = numeric <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil(numeric / 2)));
  const zero = numeric <= 0 && state.status === 'playing';
  const shown = String(Number(numeric.toFixed(2)));
  return `<span class="weight${zero ? ' is-zero' : ''}" title="${esc(t('dossier.signal'))} ${esc(shown)}/10" aria-label="${esc(t('dossier.signal'))} ${esc(shown)}/10">${Array.from({ length: 5 }, (_, i) => `<i class="${i < lit ? 'on' : ''}"></i>`).join('')}</span>`;
}

function categoryLabel(category) {
  return t(`cat.${category}`) || category;
}

function clueLabel(clue) {
  return t(`clue.${clue.k === 'cargoCapacity' ? 'cargo' : clue.k}`) || clue.k;
}

function brandMark() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 6 54 18v28L32 58 10 46V18Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="13" fill="none" stroke="var(--cyan)" stroke-width="1"/>
    <circle cx="32" cy="32" r="3" fill="currentColor"/>
    <path d="M32 10v11M32 43v11M10 32h11M43 32h11" stroke="var(--cyan)" stroke-width="1"/>
  </svg>`;
}

function shipThumb(ship, className = '') {
  if (!ship) return '';
  return `<span class="${className} ship-thumb">
    <span class="fallback">${icon('ship')}</span>
    <img src="${esc(shipIconPath(ship))}" alt="" loading="lazy" draggable="false" onerror="this.remove()">
  </span>`;
}

function moduleThumb(moduleID) {
  return `<span class="module-icon">
    <span class="fallback">?</span>
    <img src="${esc(moduleIconPath(moduleID))}" alt="" loading="eager" draggable="false" onload="this.parentElement.classList.add('has-icon')" onerror="this.remove()">
  </span>`;
}

function renderPips(slots) {
  const rows = [
    ['hi', 'H'],
    ['med', 'M'],
    ['low', 'L'],
    ['rig', 'R'],
  ];
  return `<div class="slot-pips">
    ${rows.map(([key, label]) => {
      const value = slots?.[key] ?? 0;
      return `<span class="slot-pip"><b>${int(value)}</b><span>${esc(label)}</span></span>`;
    }).join('')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function fetchJson(relative) {
  if (JSON_CACHE.has(relative)) return JSON_CACHE.get(relative);
  const response = await fetch(new URL(relative, BASE), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${response.status} ${relative}`);
  const json = await response.json();
  JSON_CACHE.set(relative, json);
  return json;
}

async function fetchInternetTime() {
  const sources = [state.manifest?.timeSource].filter(Boolean);
  for (const source of sources) {
    try {
      const response = await fetch(source, {
        method: 'HEAD',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;

      // Same-origin HTTP Date header: no CORS preflight and no extra service.
      const header = response.headers.get('date');
      const serverMs = header ? Date.parse(header) : NaN;
      if (Number.isFinite(serverMs)) {
        state.serverAnchor = serverMs;
        state.monotonicAnchor = performance.now();
        state.timeVerified = true;
        return true;
      }

      // Compatibility with a trace-style plain-text source.
      const fallback = await fetch(source, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!fallback.ok) continue;
      const match = /(?:^|\n)ts=([\d.]+)/.exec(await fallback.text());
      if (!match) continue;
      state.serverAnchor = Number(match[1]) * 1000;
      state.monotonicAnchor = performance.now();
      state.timeVerified = true;
      return true;
    } catch {
      // try the next time source
    }
  }
  state.serverAnchor = Date.now();
  state.monotonicAnchor = performance.now();
  state.timeVerified = false;
  return false;
}

const ZKILL_CACHE_PREFIX = 'fitdle:v1:zkill:';
const ENTITY_CACHE_KEY = 'fitdle:v1:entity-names';
const ENTITY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function readTimedCache(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(`${ZKILL_CACHE_PREFIX}${key}`) || 'null');
    if (!raw || !Number.isFinite(Number(raw.expiresAt)) || Number(raw.expiresAt) <= Date.now()) {
      localStorage.removeItem(`${ZKILL_CACHE_PREFIX}${key}`);
      return null;
    }
    return raw.data;
  } catch {
    return null;
  }
}

function writeTimedCache(key, data, ttlMs) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
  try {
    localStorage.setItem(`${ZKILL_CACHE_PREFIX}${key}`, JSON.stringify({
      expiresAt: Date.now() + ttlMs,
      data,
    }));
    const keys = Object.keys(localStorage).filter((entry) => entry.startsWith(ZKILL_CACHE_PREFIX));
    if (keys.length > 24) {
      keys
        .map((entry) => {
          try {
            return { entry, expiresAt: Number(JSON.parse(localStorage.getItem(entry) || '{}').expiresAt) || 0 };
          } catch {
            return { entry, expiresAt: 0 };
          }
        })
        .sort((a, b) => a.expiresAt - b.expiresAt)
        .slice(0, keys.length - 24)
        .forEach(({ entry }) => localStorage.removeItem(entry));
    }
  } catch {
    // Cache is best-effort; quota/private modes must not break the puzzle.
  }
}

function statsCacheEntry(shipId) {
  if (!state.timeVerified) return null;
  const now = serverNow().getTime();
  const bucket = Math.floor(now / 600000);
  return {
    key: `stats:${shipId}:${bucket}`,
    ttlMs: Math.max(1000, 600000 - (now % 600000)),
  };
}

function esiUrl(url) {
  const result = new URL(url);
  const repo = state.manifest?.links?.repo || '';
  result.searchParams.set(
    'user_agent',
    `FITDLE/${state.manifest?.version || 'dev'}${repo ? ` (+${repo})` : ''}`,
  );
  return result.toString();
}

async function fetchZkill(path, cache = null) {
  if (cache?.key) {
    const cached = readTimedCache(cache.key);
    if (cached != null) return cached;
  }
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('zKillboard base URL unavailable');
  // Static browser clients cannot set a persistent User-Agent, and zKill's
  // CORS preflight rejects custom X-User-Agent headers; build scripts identify
  // themselves instead.
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after')) || 0;
        lastError = new Error(`${response.status} ${path}`);
        lastError.retryable = response.status === 429 || response.status >= 500;
        if (attempt < 2 && lastError.retryable) {
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 || 600 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }
      const data = await response.json();
      if (cache?.key && cache?.ttlMs) writeTimedCache(cache.key, data, cache.ttlMs);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || error?.retryable === false) break;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError || new Error(`zKill request failed: ${path}`);
}


async function resolveDailyTarget(hulls, dateKey) {
  const seedBase = `${dateKey}:${state.dataVersionKey || state.manifest.dataVersion}:${state.mode}:${state.timed ? 'timed' : 'standard'}`;
  const utcToday = state.utcDate || new Date().toISOString().slice(0, 10);
  for (const shipId of hulls) {
    let data = null;
    try {
      data = await fetchZkill(`/api/losses/shipTypeID/${shipId}/page/1/`);
    } catch (error) {
      // Do not silently move to another hull on a network/API error: that would
      // give players different targets. Fail consistently instead.
      throw error;
    }
    if (!Array.isArray(data) || !data.length) continue;
    const losses = filterDailyKillPool(data, shipId, utcToday);
    if (!losses.length) continue;
    const pair = selectDailyKillPair(losses, `${seedBase}:${shipId}:kills`);
    if (!pair.baseline || !pair.fallback) continue;
    return { shipId: Number(shipId), baseline: pair.baseline, fallback: pair.fallback };
  }
  return null;
}

function captureUrlLocale() {
  const url = new URL(location.href);
  const raw = url.searchParams.get('lang');
  if (!raw) return;
  url.searchParams.delete('lang');
  history.replaceState(null, '', url);
  if (!/^(en|de|es|fr|ja|ko|ru|zh)([-_]|$)/i.test(raw)) return;
  try {
    localStorage.setItem('fitdle:v1:lang', resolveLocale(raw));
  } catch {
    // best effort
  }
}

async function resolveDailySelection() {
  const manifest = state.manifest;
  const killShipPool = state.mode === 'abyss'
    ? (manifest.abyssKillShipPool || manifest.killShipPool)
    : (manifest.normalShipPool || manifest.killShipPool);
  const hulls = weightedHullOrder(
    killShipPool,
    `${state.today}:${manifest.dataVersion}:${state.mode}:${state.timed ? 'timed' : 'standard'}:hulls`,
    Number.MAX_SAFE_INTEGER,
  );
  const target = await resolveDailyTarget(hulls, state.today);
  if (!target) throw new NoTargetError();
  const chosen = state.allowEmptyKb ? target.baseline : target.fallback;
  if (!chosen || !state.catalogMap.has(target.shipId)) throw new NoTargetError();
  return { shipId: target.shipId, killmail: chosen };
}

function freeKillUrl(killId, fromRefresh = false, nonce = '') {
  const url = new URL(location.href);
  url.pathname = new URL('.', location.href).pathname;
  url.search = '';
  url.hash = '';
  url.searchParams.set('kb', freeKillToken(killId));
  if (fromRefresh && nonce) url.searchParams.set('n', nonce);
  const rule = isTimed() ? 'timed' : state.mode === 'abyss' ? 'abyss' : 'standard';
  if (rule !== 'standard') url.searchParams.set('rule', rule);
  else url.searchParams.delete('rule');
  return url.toString();
}

const FREE_INTENT_KEY = 'fitdle:v1:free-intent';
const FREE_INTENT_TTL_MS = 10 * 60 * 1000;

function makeFreeNonce() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function writeFreeIntent(nonce, mode) {
  try {
    sessionStorage.setItem(FREE_INTENT_KEY, JSON.stringify({
      nonce,
      mode,
      at: Date.now(),
    }));
  } catch {
    // best effort
  }
}

function clearFreeIntent() {
  try {
    sessionStorage.removeItem(FREE_INTENT_KEY);
  } catch {
    // best effort
  }
}

function freeIntentMatches(nonce, mode) {
  try {
    const raw = sessionStorage.getItem(FREE_INTENT_KEY);
    if (!raw) return false;
    const intent = JSON.parse(raw);
    const valid = intent?.nonce === nonce
      && intent?.mode === mode
      && Date.now() - Number(intent?.at) < FREE_INTENT_TTL_MS;
    if (!valid) clearFreeIntent();
    return valid;
  } catch {
    return false;
  }
}

function consumeFreeIntent(nonce, mode) {
  if (!freeIntentMatches(nonce, mode)) return false;
  clearFreeIntent();
  return true;
}

function enterFreeMode() {
  const nonce = makeFreeNonce();
  const mode = freeGameplayKey();
  writeFreeIntent(nonce, mode);
  const url = new URL(location.href);
  url.pathname = new URL('.', location.href).pathname;
  url.search = '';
  url.hash = '';
  url.searchParams.set('n', nonce);
  const rule = isTimed() ? 'timed' : state.mode === 'abyss' ? 'abyss' : 'standard';
  if (rule !== 'standard') url.searchParams.set('rule', rule);
  else url.searchParams.delete('rule');
  location.assign(url.toString());
}

async function pickRandomFreeKill() {
  const killShipPool = state.mode === 'abyss'
    ? (state.manifest.abyssKillShipPool || state.manifest.killShipPool)
    : (state.manifest.normalShipPool || state.manifest.killShipPool);
  const hulls = weightedHullOrder(
    killShipPool,
    `free:${Date.now()}:${Math.random()}:${state.mode}`,
    10,
  );
  for (const shipId of hulls) {
    for (let page = 1; page <= 3; page++) {
      let data = null;
      try {
        data = await fetchZkill(`/api/losses/shipTypeID/${shipId}/page/${page}/`);
      } catch {
        break;
      }
      if (!Array.isArray(data) || !data.length) break;
      const losses = data.filter((kill) => (
        Number(kill?.victim?.ship_type_id) === Number(shipId)
        && String(kill?.killmail_time || '') >= `${KILL_HISTORY_START}T00:00:00Z`
        && (state.allowEmptyKb || killHasFittedModules(kill))
      ));
      if (losses.length) {
        return losses[Math.floor(Math.random() * losses.length)];
      }
    }
  }
  return null;
}

function freeAnswerSeed() {
  return String(
    state.freeKillmail?.zkb?.hash
    || state.freeKillmail?.killmail_time
    || state.freeKillId
    || state.freeKillToken
    || 'free',
  );
}

const FREE_STREAK_KEY = 'fitdle:v1:free-streak';
const FREE_STREAK_MODES = ['standard', 'abyss', 'timed'];

function loadFreeStreaks() {
  const empty = { standard: 0, abyss: 0, timed: 0 };
  try {
    const parsed = JSON.parse(localStorage.getItem(FREE_STREAK_KEY) || '{}');
    for (const mode of FREE_STREAK_MODES) {
      empty[mode] = Math.max(0, Math.floor(Number(parsed?.[mode]) || 0));
    }
  } catch {
    // best effort
  }
  return empty;
}

function saveFreeStreaks() {
  try {
    localStorage.setItem(FREE_STREAK_KEY, JSON.stringify(state.freeStreaks));
  } catch {
    // best effort
  }
}

function freeGameplayKey() {
  return isTimed() ? 'timed' : state.mode === 'abyss' ? 'abyss' : 'standard';
}

function setFreeStreak(mode, value) {
  state.freeStreaks[mode] = Math.max(0, Math.floor(Number(value) || 0));
  saveFreeStreaks();
}

function initFreeRound() {
  if (!isFree()) return;
  state.freeStreakMode = freeGameplayKey();
  state.freeStreakBefore = Number(state.freeStreaks[state.freeStreakMode]) || 0;
  state.freeStreakEvent = null;
  // Direct kb/share links are neutral: they never start a streak round.
  // Only the random refresh flow is eligible to change the counter.
  state.freeRoundActive = state.freeFromRefresh === true;
}

function finishFreeRound(won) {
  if (!isFree() || !state.freeRoundActive) return;
  const mode = state.freeStreakMode || freeGameplayKey();
  const before = Number(state.freeStreakBefore) || 0;
  if (won) {
    if (state.freeFromRefresh) {
      setFreeStreak(mode, before + 1);
      state.freeStreakEvent = 'increment';
    } else {
      state.freeStreakEvent = 'none';
    }
  } else {
    setFreeStreak(mode, 0);
    state.freeStreakEvent = before > 0 ? 'reset' : 'none';
  }
  state.freeRoundActive = false;
}

function abandonFreeRound() {
  if (!isFree() || !state.freeRoundActive || state.status !== 'playing') return;
  const mode = state.freeStreakMode || freeGameplayKey();
  setFreeStreak(mode, 0);
  state.freeStreakEvent = 'none';
  state.freeRoundActive = false;
}

function spawnFreeStreakConfetti(host, count) {
  if (!host) return;
  const compact = !!host.closest('.debrief-streak');
  const baseSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 14;
  const scale = baseSize / 14;
  const spreadX = (compact ? 54 : 190) * scale;
  const spreadY = (compact ? 40 : 140) * scale;
  const colors = ['#9bd45a', '#f2a63b', '#6fc6e4', '#f4fdff'];
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('i');
    particle.className = 'debrief-streak-particle';
    particle.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * spreadX)}px`);
    particle.style.setProperty('--dy', `${Math.round((Math.random() - 0.65) * spreadY)}px`);
    particle.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 540)}deg`);
    particle.style.setProperty('--delay', `${Math.round(Math.random() * 120)}ms`);
    particle.style.background = colors[i % colors.length];
    host.append(particle);
  }
  setTimeout(() => { host.replaceChildren(); }, 1500);
}

function animateFreeStreak() {
  const root = document.querySelector('.debrief-streak');
  const valueEl = root?.querySelector('.debrief-streak-value');
  if (!root || !valueEl) return;
  const event = root.dataset.event || 'none';
  const oldValue = Number(root.dataset.old) || 0;
  const newValue = Number(root.dataset.new) || 0;
  root.setAttribute('aria-label', `${t('free.streak')} ${newValue}`);
  if (event === 'increment') {
    valueEl.textContent = String(oldValue);
    requestAnimationFrame(() => {
      setTimeout(() => {
        valueEl.textContent = String(newValue);
        valueEl.classList.add('is-pop');
        spawnFreeStreakConfetti(root.querySelector('.debrief-streak-burst'), Math.max(0, newValue));
        setTimeout(() => valueEl.classList.remove('is-pop'), 450);
      }, 50);
    });
  } else if (event === 'reset') {
    valueEl.textContent = String(oldValue);
    valueEl.classList.remove('is-reset');
    // Let the old value sit in its normal colour first. Then switch the value,
    // turn red and start shaking on the same frame. The colour animation holds
    // red for the full shake and only fades back after the shake ends.
    setTimeout(() => {
      valueEl.textContent = '0';
      valueEl.classList.add('is-reset');
    }, 350);
    setTimeout(() => valueEl.classList.remove('is-reset'), 2000);
  } else {
    valueEl.textContent = String(newValue);
  }
}

async function fetchAnswerLive() {
  if (state.liveFetched || !state.answerId) return;
  state.liveFetched = true;
  const shipId = Number(state.answerId);
  const killId = Number(state.answerKillId);
  const [stats, kill] = await Promise.allSettled([
    fetchZkill(`/api/stats/shipTypeID/${shipId}/kills/`, statsCacheEntry(shipId)),
    state.freeKillmail
      ? Promise.resolve([state.freeKillmail])
      : killId ? fetchZkill(`/api/killID/${killId}/`, { key: `kill:${killId}`, ttlMs: 3600000 }) : Promise.resolve(null),
  ]);
  state.liveStats = stats.status === 'fulfilled' && stats.value?.type === 'shipTypeID' ? stats.value : null;
  const killmail = kill.status === 'fulfilled' && Array.isArray(kill.value) ? kill.value[0] : null;
  state.liveLosses = killmail ? [killmail] : [];
  state.liveError = !state.liveStats && !state.liveLosses.length;
}

function readEntityNameCache() {
  try {
    const value = JSON.parse(localStorage.getItem(ENTITY_CACHE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeEntityNameCache(cache) {
  try {
    localStorage.setItem(ENTITY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best effort
  }
}

async function fetchVictimInfo() {
  const victim = state.liveLosses?.[0]?.victim;
  if (!victim || state.status === 'playing') return;
  const key = [victim.character_id, victim.corporation_id, victim.alliance_id].join(':');
  if (!key.trim(':')) return;
  if (state.victimInfoKey !== key) state.victimInfo = null;
  if (state.victimInfoKey === key || state.victimInfoLoading) return;
  state.victimInfoKey = key;
  state.victimInfoLoading = true;
  const base = (state.manifest?.esi?.baseUrl || '').replace(/\/$/, '');
  const names = readEntityNameCache();
  const fresh = (kind, id) => {
    const entry = names?.[kind]?.[Number(id)];
    return entry && Date.now() - Number(entry.at) < ENTITY_CACHE_TTL_MS ? entry.name : '';
  };
  const read = async (kind, id) => {
    if (!base || !Number(id)) return null;
    const cachedName = fresh(kind, id);
    if (cachedName) return { name: cachedName };
    try {
      const response = await fetch(esiUrl(`${base}/latest/${kind}/${Number(id)}/?datasource=tranquility`), {
        cache: 'default',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data?.name) {
        if (!names[kind]) names[kind] = {};
        names[kind][Number(id)] = { name: data.name, at: Date.now() };
        writeEntityNameCache(names);
      }
      return data;
    } catch {
      return null;
    }
  };
  const [character, corporation, alliance] = await Promise.all([
    read('characters', victim.character_id),
    read('corporations', victim.corporation_id),
    read('alliances', victim.alliance_id),
  ]);
  if (state.victimInfoKey !== key) return;
  state.victimInfo = {
    characterId: Number(victim.character_id) || null,
    characterName: character?.name || fresh('characters', victim.character_id),
    corporationId: Number(victim.corporation_id) || null,
    corporationName: corporation?.name || fresh('corporations', victim.corporation_id),
    allianceId: Number(victim.alliance_id) || null,
    allianceName: alliance?.name || fresh('alliances', victim.alliance_id),
  };
  state.victimInfoLoading = false;
  refreshVictimSlots();
}

function refreshVictimSlots() {
  $$('[data-victim-slot]').forEach((slot) => {
    slot.innerHTML = victimMetaHtml();
  });
}

async function fetchCargoTypeNames() {
  const base = (state.manifest?.esi?.baseUrl || '').replace(/\/$/, '');
  if (!base || !state.refs?.modules) return;
  const locale = state.locale;
  const requestId = ++state.cargoFetchId;
  if (state.extraTypeNamesLocale !== locale) {
    // ESI names are language-specific; never reuse an English/Chinese cache
    // after the player changes the interface language.
    state.extraTypeNames = {};
    state.extraTypeNamesLocale = locale;
    try {
      const cached = JSON.parse(localStorage.getItem(`fitdle:v1:typeNames:${locale}`) || '{}');
      if (cached && typeof cached === 'object') state.extraTypeNames = cached;
    } catch {
      // localStorage may be unavailable; ESI remains the fallback
    }
  }
  const unknown = [...new Set(
    getEquipment(state.liveLosses, state.refs).equipment
      .map((item) => item.module)
      .filter((id) => !state.refs.modules[id] && !state.extraTypeNames[id])
  )];
  if (!unknown.length) return;
  const entries = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < unknown.length) {
      const id = unknown[cursor++];
      try {
        const response = await fetch(
          esiUrl(`${base}/latest/universe/types/${id}/?datasource=tranquility&language=${encodeURIComponent(locale)}`),
          {
            cache: 'default',
            signal: AbortSignal.timeout(8000),
          },
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.name) entries.push([id, data.name]);
        }
      } catch {
        // keep the numeric fallback
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, unknown.length) }, worker));
  // Ignore a response that arrived after another language switch.
  if (state.locale !== locale || state.cargoFetchId !== requestId) return;
  state.extraTypeNames = { ...state.extraTypeNames, ...Object.fromEntries(entries) };
  try {
    localStorage.setItem(`fitdle:v1:typeNames:${locale}`, JSON.stringify(state.extraTypeNames));
  } catch {
    // best effort cache
  }
}

function abyssFallbackByModule() {
  const equipment = getEquipment(state.liveLosses, state.refs).equipment;
  return selectAbyssFallbacks(equipment, state.refs, state.manifest.moduleFallbacks || {});
}

function abyssCalculationKillmail(killmail) {
  const fallbacks = abyssFallbackByModule();
  if (!fallbacks.size || !killmail?.victim?.items) return killmail;
  return {
    ...killmail,
    victim: {
      ...killmail.victim,
      items: killmail.victim.items.map((item) => {
        if (Number(item.flag) === 5) return item;
        const fallback = fallbacks.get(Number(item.item_type_id));
        return fallback ? { ...item, item_type_id: fallback } : item;
      }),
    },
  };
}

async function fetchModuleDetails() {
  if (!usesSimulatedFit() || state.moduleDetails) return;
  const fallback = await fetchJson('data/module-fallback.json').catch(() => null);
  const equipment = getEquipment(state.liveLosses, state.refs).equipment;
  const unique = [...new Set(equipment.map((item) => item.module))];
  const fallbackByModule = abyssFallbackByModule();
  const toDetail = (attributes) => {
    if (!attributes) return null;
    return {
      dogma_attributes: Object.entries(attributes)
        .map(([id, value]) => ({ attribute_id: Number(id), value: Number(value) })),
    };
  };
  state.moduleDetails = {};
  for (const id of unique) {
    const detail = toDetail(fallback?.[id]);
    if (detail) state.moduleDetails[id] = detail;
  }
  // Abyssal modules can lack their mutated effects; use the same slot-tier
  // representative's local SDE attributes instead of a runtime ESI request.
  for (const id of unique) {
    if (state.moduleDetails[id]) continue;
    const resolvedId = fallbackByModule.get(id);
    const representative = toDetail(fallback?.[resolvedId]);
    if (representative) {
      state.moduleDetails[id] = { ...representative, fallbackType: resolvedId };
    }
  }
}

function buildAnswerData() {
  if (!state.answerShip || !state.refs) return;
  const ship = state.answerShip;
  const bonuses = ship.bonuses?.[state.locale] || ship.bonuses?.en || [];
  const bonusEntries = ship.bonusEntries || [];
  const built = buildClues({
    ship,
    catalog: state.catalog,
    refs: state.refs,
    stats: state.liveStats,
    losses: state.liveLosses,
    dateKey: isFree() ? `free:${freeAnswerSeed()}` : state.date,
    dataVersion: state.dataVersionKey || state.manifest.dataVersion,
    targetKillId: state.answerKillId,
    mode: usesSimulatedFit() ? 'abyss' : state.mode,
    moduleDetails: usesSimulatedFit() ? state.moduleDetails : null,
    fittedAttrs: usesSimulatedFit() ? state.dogmaAttrs : null,
    baselineAttrs: usesSimulatedFit() ? state.dogmaBaseline : null,
    moduleFallbacks: usesSimulatedFit() ? state.manifest.moduleFallbacks || {} : {},
  });
  state.answerData = {
    ...ship,
    description: ship.descriptions?.[state.locale] || ship.descriptions?.en || '',
    bonuses,
    bonusEntries,
    clues: built.clues,
    sampleKill: built.sampleKill,
    fitting: { fittedKills: built.fittedKills },
    fitDelta: built.fitDelta,
  };
}

async function loadLocaleData(locale) {
  const refs = await fetchJson(`data/refs/${locale}.json`);
  state.refs = refs;
  state.index = buildSearchIndex(state.catalog, refs.groups, {
    races: refs.races, factions: refs.factions, locale: state.locale, aliases: state.searchAliases,
  });
  await fetchAnswerLive();
  await fetchCargoTypeNames();
  if (usesSimulatedFit() && state.liveLosses[0]) {
    try {
      state.dogmaAttrs = await calculateDogmaFit(
        state.answerShip,
        abyssCalculationKillmail(state.liveLosses[0]),
      );
    } catch {
      state.dogmaError = true;
    }
    try {
      state.dogmaBaseline = await calculateDogmaBaseline(state.answerShip);
    } catch {
      state.dogmaBaseline = null;
    }
  }
  if (usesSimulatedFit() && !state.dogmaAttrs) await fetchModuleDetails();
  buildAnswerData();
  if (!state.answerData) throw new Error('answer data unavailable');
}

function readStoredState() {
  if (isFree()) return { guesses: [], status: 'playing', invalidated: false };
  const stored = loadState(localStorage, state.date, state.dataVersionKey, storageMode());
  if (!stored) return { invalidated: false };
  if (stored.invalidated) return { invalidated: true };
  const allowed = new Set(state.catalogMap.keys());
  const guesses = [...new Set((stored.guesses || []).map(Number).filter((id) => allowed.has(id)))]
    .slice(0, isTimed() ? undefined : ATTEMPT_LIMIT);
  if (stored.answerId && Number(stored.answerId) !== Number(state.answerId)) return { invalidated: true };
  let status = stored.status;
  if (guesses.includes(state.answerId)) status = 'won';
  else if (isTimed()) status = stored.status === 'lost' && (stored.gaveUp || stored.timedExpired) ? 'lost' : 'playing';
  else if (guesses.length >= ATTEMPT_LIMIT) status = 'lost';
  else status = 'playing';
  return {
    guesses,
    status,
    invalidated: false,
    timerStarted: status === 'playing' && stored.timerStarted === true,
    timerStartAt: Number(stored.timerStartAt) || 0,
    timerElapsedMs: Number(stored.timerElapsedMs) || 0,
    gaveUp: stored.gaveUp === true && status === 'lost',
    timedExpired: stored.timedExpired === true && status === 'lost',
  };
}

function recomputeRevealed() {
  const seed = `${isFree() ? `free:${freeAnswerSeed()}` : `${state.date}:${state.answerKillId || state.answerId}`}:${state.mode}:${state.timed ? 'timed' : 'standard'}`;
  const base = {
    clues: state.answerData.clues,
    catalog: state.catalog,
    guesses: state.guesses,
    status: state.status,
    answerId: state.answerId,
    mode: state.mode,
    locale: state.locale,
    getShip: (id) => state.catalogMap.get(id),
    answerBonuses: state.answerData.bonuses || [],
    answer: state.answerData,
    fitDelta: state.answerData.fitDelta || null,
    seed,
  };
  if (isTimed() && state.status === 'playing') {
    if (!state.timerStarted) {
      state.revealed = new Set();
      state.timedClueCount = 0;
      state.visibleCount = 0;
      return;
    }
    const initial = computeRevealed({ ...base, guesses: [], status: 'playing' });
    const releases = Math.floor(currentElapsed() / 30000);
    const extras = computeTimedRevealed({
      clues: state.answerData.clues,
      count: timedRevealTotal(releases),
      seed,
      exclude: initial,
    });
    state.revealed = new Set([...initial, ...extras]);
    state.timedClueCount = releases;
    state.visibleCount = state.revealed.size;
    return;
  }
  state.revealed = computeRevealed(base);
  state.visibleCount = state.revealed.size;
}

function persist() {
  if (isFree()) return;
  saveState(localStorage, state.date, {
    dataVersion: state.dataVersionKey,
    date: state.date,
    answerId: state.answerId,
    guesses: state.guesses,
    status: state.status,
    timed: isTimed(),
    timerStarted: isTimed() && state.timerStarted,
    timerStartAt: isTimed() && state.timerStarted ? state.timerStartAt : 0,
    timerElapsedMs: isTimed()
      ? (state.timerStarted ? currentElapsed() : state.timerElapsedMs)
      : 0,
    gaveUp: isTimed() && state.gaveUp,
    timedExpired: isTimed() && state.timedExpired,
  }, storageMode());
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function localeOptions() {
  return LOCALES.map((locale) => `<option value="${locale}"${locale === state.locale ? ' selected' : ''}>${esc(LOCALE_META[locale].label)}</option>`).join('');
}

function copyrightHtml() {
  const eve = state.manifest?.links?.eveOnline || '#';
  const fenris = state.manifest?.links?.fenris || '#';
  const site = new URL('./', location.href).href.replace(/\/$/, '');
  const siteLabel = site.replace(/^https?:\/\//, '');
  return esc(t('footer.copyright'))
    .replace('{site}', `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(siteLabel)}</a>`)
    .replace('EVE Online', `<a href="${esc(eve)}" target="_blank" rel="noopener noreferrer">EVE Online</a>`)
    .replace('Fenris Creations', `<a href="${esc(fenris)}" target="_blank" rel="noopener noreferrer">Fenris Creations</a>`);
}

function renderShell() {
  hideSuggestions();
  const app = $('#app');
  const fontValue = state.font === 'classic'
    ? t('font.classic')
    : state.font === 'triglavian'
      ? t('font.triglavian')
      : t('font.neue');
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">${brandMark()}</div>
        <div>
          <div class="brand-name">${esc(t('app.name'))}</div>
          <div class="brand-sub">${esc(t('app.subtitle'))}</div>
        </div>
      </div>
      <div class="topbar-center">
        <div class="cycle-chip">
          <span id="date-caption">${esc(t('common.utc'))} // ${esc(t('hero.daily'))}</span>
          <strong id="date-label">${esc(state.date)}</strong>
        </div>
        <div class="countdown">
          <span id="reset-label">${esc(t('header.reset'))}</span>
          <strong id="countdown">--:--:--</strong>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="icon-button" type="button" data-action="help" aria-label="${esc(t('header.help'))}">
          ${icon('help')}<span class="label">${esc(t('header.help'))}</span>
        </button>
        <label class="sr-only" for="lang-select">${esc(t('header.language'))}</label>
        <select id="lang-select" class="lang-select" ${state.localeLoading ? 'disabled' : ''}>
          ${localeOptions()}
        </select>
      </div>
    </header>

    <div id="new-target-banner" class="banner" hidden></div>

    <main id="main" class="shell">
      <div class="mode-row">
        <div class="mode-bar" data-mode="${state.mode}">
        <span class="mode-label">${esc(t('mode.label'))}</span>
        <div class="mode-switch mode-nav" role="group" aria-label="${esc(t('help.modesTitle'))}">
          <button type="button" class="mode-button${!isFree() ? ' is-active' : ''}" data-action="play-today" aria-pressed="${!isFree()}">${esc(t('mode.daily'))}</button>
          <button type="button" class="mode-button${isFree() ? ' is-active' : ''}" data-action="free-mode" aria-pressed="${isFree()}">${esc(t('mode.free'))}</button>
        </div>
        <span class="mode-divider" aria-hidden="true"></span>
        <span class="mode-label">${esc(t('mode.ruleLabel'))}</span>
        <div class="mode-switch" role="group" aria-label="${esc(t('help.gameplayTitle'))}">
          <button type="button" class="mode-button${!isTimed() && state.mode === 'normal' ? ' is-active' : ''}" data-action="set-mode" data-mode="normal" aria-pressed="${!isTimed() && state.mode === 'normal'}">${esc(t('mode.standard'))}</button>
          <button type="button" class="mode-button${!isTimed() && state.mode === 'abyss' ? ' is-active' : ''}" data-action="set-mode" data-mode="abyss" aria-pressed="${!isTimed() && state.mode === 'abyss'}">${esc(t('mode.abyss'))}</button>
          <button type="button" class="mode-button${isTimed() ? ' is-active' : ''}" data-action="set-mode" data-mode="timed" aria-pressed="${isTimed()}">${esc(t('mode.timed'))}</button>
        </div>
        </div>
        <div id="free-actions" class="free-mode-actions" hidden></div>
      </div>

      <section class="hero" id="hero" aria-labelledby="hero-title"></section>

      <div class="console">
        <section class="panel board-panel" id="board-panel" aria-labelledby="board-title">
          <header class="panel-head${isTimed() ? ' is-timed' : ''}">
            <div>
              <div class="panel-kicker"><span class="idx">01</span> // ${esc(t('board.title'))}</div>
              <h2 id="board-title">${esc(t('board.title'))}</h2>
              <p class="panel-sub">${esc(t('board.subtitle'))}</p>
            </div>
            ${isTimed() ? `<button type="button" class="timed-clock-button" aria-label="${esc(t('timed.label'))}">
              <span>${esc(t('timed.label'))}</span>
              <strong id="board-count-text">00:00</strong>
              <small>${esc(t('timed.holdShort'))}</small>
            </button>` : `<div class="dossier-count" aria-hidden="true">
              <strong id="board-count-text">${String(state.guesses.length).padStart(2, '0')} / 06</strong>
              <span>${esc(t('hero.attempts'))}</span>
            </div>`}
          </header>
          <div id="acquire-slot"></div>
          <ol class="attempts" id="attempts" aria-label="${esc(t('board.title'))}"></ol>
        </section>

        <section class="panel dossier-panel" id="dossier-panel" aria-labelledby="dossier-title">
          <header class="panel-head">
            <div>
              <div class="panel-kicker"><span class="idx">02</span> // ${esc(t('dossier.title'))}</div>
              <h2 id="dossier-title">${esc(t('dossier.title'))}</h2>
            </div>
            <div class="dossier-head-right">
              <div class="dossier-count">
                <strong id="dossier-count-text">0 / 0</strong>
                <span>${esc(t('dossier.decrypted'))}</span>
              </div>
              <div class="progress-orb" id="dossier-orb" style="--p:0" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <strong id="dossier-orb-text">0%</strong>
              </div>
            </div>
          </header>
          <div class="progress-line"><span id="dossier-progress"></span></div>
          <div class="dossier-body">
            <div id="answer-banner"></div>
            <div class="dossier-groups" id="dossier-groups"></div>
          </div>
        </section>
      </div>

      <footer class="site-footer">
        <div>
          <div class="footer-brand"><b>${esc(t('app.name'))}</b> // ${esc(t('app.subtitle'))}</div>
          <div class="footer-copyright">${copyrightHtml()}</div>
        </div>
        <div class="footer-links">
          <a class="repo-link" href="${esc(state.manifest.links?.repo || '#')}" target="_blank" rel="noopener noreferrer" title="${esc(state.manifest.links?.repo || '')}">${esc(t('footer.source'))}</a>
          <a class="zkill-link" href="${esc(state.manifest.zkillboard.baseUrl)}" target="_blank" rel="noopener noreferrer">zKillboard</a>
          <a href="${esc(state.manifest.links?.eveDocs || '#')}" target="_blank" rel="noopener noreferrer">EVE SDE</a>
          <span class="footer-meta footer-version">v${esc(state.manifest?.version || '0.1.0')} · SDE ${esc(state.manifest?.sde?.buildNumber || state.manifest?.sde?.generatedAt || '—')}${state.manifest.zkillboard?.snapshot ? ` · ZKILL ${esc(state.manifest.zkillboard.snapshot)}` : ''}</span>
        </div>
      </footer>
    </main>
  `;
  renderChrome();
}

// ---------------------------------------------------------------------------
// Chrome, hero, board, dossier
// ---------------------------------------------------------------------------

function renderChrome() {
  const free = isFree();
  const dateLabel = $('#date-label');
  if (dateLabel) {
    dateLabel.textContent = free ? t('free.badge') : state.date.split('-').join('.');
    dateLabel.setAttribute('title', free ? t('free.kicker') : state.i18n.date(state.date));
  }
  const resetLabel = $('#reset-label');
  const countdown = $('#countdown');
  const dateCaption = $('#date-caption');
    if (dateCaption) {
    if (free) {
      dateCaption.textContent = state.freeFromRefresh
        ? t('free.badge')
        : `${t('free.badge')} // ${t('free.unscored')}`;
    } else {
      dateCaption.textContent = `${t('common.utc')} // ${t('hero.daily')}`;
    }
  }
  if (resetLabel) resetLabel.textContent = free ? t('free.reset') : t('header.reset');
  if (countdown) countdown.textContent = free ? t('free.badge') : nextDowntime();
  const countdownWrap = countdown?.closest('.countdown');
  if (countdownWrap) countdownWrap.style.display = free ? 'none' : '';

  const freeActions = $('#free-actions');
  if (freeActions) {
    freeActions.hidden = !free;
    if (free) {
      freeActions.innerHTML = `
        <button type="button" class="button ghost free-action" data-action="free-refresh">${icon('refresh')} ${esc(t('free.refresh'))}</button>
        <button type="button" class="button ghost free-action" data-action="free-input">${icon('key')} ${esc(t('free.input'))}</button>
        <button type="button" class="button ghost free-action" data-action="free-share">${icon('share')} ${esc(t('free.share'))}</button>`;
    }
  }
  const newBanner = $('#new-target-banner');
  if (newBanner) {
    newBanner.hidden = free || !state.newTargetAvailable;
    if (!free && state.newTargetAvailable) {
      newBanner.innerHTML = `${icon('clock')} ${esc(t('header.newTarget'))} <button type="button" data-action="play-today">${esc(t('header.playToday'))}</button>`;
    }
  }
  const lang = $('#lang-select');
  if (lang) lang.disabled = state.localeLoading;
  const dbNext = $('#debrief-next');
  if (dbNext) dbNext.innerHTML = free
    ? `<span>${esc(t('free.kicker'))}</span><strong>${esc(t('free.next'))}</strong>`
    : `<span>${esc(t('end.next'))}</span><strong>${esc(nextDowntime())}</strong>`;
  document.documentElement.lang = state.locale;
  document.documentElement.dataset.gameMode = state.mode;
  document.title = free ? `FITDLE — ${t('free.badge')} ${state.freeKillToken}` : `FITDLE — ${state.date}`;
  syncFontControls();
}

function hiddenTotals() {
  const clues = state.answerData?.clues || [];
  return clues.some((clue, index) => (
    (clue.c === 'equipment' || clue.c === 'cargo' || clue.c === 'traits') && !state.revealed.has(index)
  ));
}

function renderHero() {
  const hero = $('#hero');
  if (!hero) return;
  const total = state.answerData?.clues?.length || 0;
  const totalHidden = hiddenTotals();
  const visible = state.revealed.size;
  const totalLabel = totalHidden ? '?' : String(total);
  const ended = state.status !== 'playing';
  const answer = displayName(state.answerShip);
  const target = ended ? answer : t('hero.target');
  const free = isFree();
  const heroDate = free
    ? `${t('free.badge')} // ${t('free.kb', { id: state.freeKillToken })}`
    : `${state.date} // UTC`;
  hero.innerHTML = `
    <div class="hero-copy">
      <div class="hero-kicker"><span class="ping"></span>${esc(t('hero.kicker'))}<span class="hero-date">${esc(heroDate)}</span></div>
      <h1 id="hero-title">${esc(t('hero.title'))}<span class="accent">${esc(target)}</span></h1>
      <p class="hero-body">${esc(t('hero.body'))}</p>
      <div class="hero-stats">
        <div class="hero-stat">
          <span>${esc(isTimed() ? t('timed.label') : t('hero.attempts'))}</span>
          <strong${isTimed() ? ' id="hero-timed"' : ''}>${isTimed()
            ? formatElapsed(state.timerStarted ? currentElapsed() : state.timerElapsedMs)
            : `<em>${String(ATTEMPT_LIMIT).padStart(2, '0')}</em>`}</strong>
          <small>${isTimed() ? '∞' : 'MAX'}</small>
        </div>
        <div class="hero-stat">
          <span>${esc(t('hero.fragments'))}</span>
          <strong id="hero-fragments">${visible}<em>/${totalLabel}</em></strong>
          <small>${totalHidden ? '?' : esc(t('dossier.sealed', { n: Math.max(0, total - visible) }))}</small>
        </div>
        <div class="hero-stat">
          <span>${esc(t('hero.status'))}</span>
          <strong id="hero-status">${esc(ended ? t('dossier.answer') : t('hero.statusValue'))}</strong>
          <small>${esc(free ? t('free.kicker') : t('hero.daily'))}</small>
        </div>
      </div>
      <div class="hero-timer" id="hero-timer">${esc(free ? t('free.kicker') : t('header.reset'))} ${free ? '' : `<strong>${esc(nextDowntime())}</strong>`}</div>
    </div>
    <div class="hero-radar${ended ? ' resolved' : ''}">
      <div class="radar" aria-hidden="true">
        <div class="radar-visual${ended ? ' is-resolved' : ''}">
          <img class="radar-visual-image" src="${ended ? esc(renderPath(state.answerId)) : ''}" alt="" draggable="false" onload="this.classList.remove('is-missing')" onerror="this.classList.add('is-missing')">
        </div>
        <div class="radar-grid"></div>
        <div class="radar-sweep"></div>
        <span class="radar-blip b1"></span>
        <span class="radar-blip b2"></span>
        <span class="radar-blip b3"></span>
        <span class="radar-blip b4"></span>
        <div class="radar-target"></div>
      </div>
      <div class="radar-caption">
        <span>${esc(t('hero.status'))} <strong>${esc(ended ? t('dossier.complete') : t('hero.statusValue'))}</strong></span>
        <span class="radar-scale" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      </div>
    </div>
  `;
  startRadarMosaic();
}

function stopRadarMosaic() {
  if (state.radarMosaicTimer) {
    clearInterval(state.radarMosaicTimer);
    state.radarMosaicTimer = null;
  }
}

function startRadarMosaic() {
  stopRadarMosaic();
  if (state.status !== 'playing') return;
  const stage = document.querySelector('.radar-visual');
  if (!stage || !state.answerId) return;

  // Never put the answer render in the pre-reveal DOM. Cycle five unrelated
  // hulls with cosmetic random crops/drift; only the resolved radar swaps in
  // the real 512px target render.
  stage.innerHTML = '';
  const pool = state.catalog.filter((ship) => Number(ship.id) !== Number(state.answerId));
  const frames = [];
  for (let i = 0; i < 5 && pool.length; i++) {
    const pick = Math.floor(Math.random() * pool.length);
    const ship = pool.splice(pick, 1)[0];
    const img = document.createElement('img');
    img.className = 'radar-visual-image radar-frame';
    img.alt = '';
    img.draggable = false;
    img.src = renderPath(ship.id).replace('size=512', 'size=32');
    img.onerror = () => img.classList.add('is-missing');
    stage.appendChild(img);
    frames.push(img);
  }
  if (!frames.length) return;
  let active = 0;
  frames[0].classList.add('is-active');
  const move = (frame) => {
    frame.style.objectPosition = `${Math.floor(Math.random() * 80) + 10}% ${Math.floor(Math.random() * 80) + 10}%`;
    frame.style.transform = `scale(${1.1 + Math.random() * 0.25}) translate(${(Math.random() - 0.5) * 5}%, ${(Math.random() - 0.5) * 5}%)`;
  };
  const cycle = () => {
    active = (active + 1) % frames.length;
    for (let i = 0; i < frames.length; i++) frames[i].classList.toggle('is-active', i === active);
    move(frames[active]);
  };
  move(frames[0]);
  // Swap roughly every 3 seconds; keep moving/cropping the visible hull.
  let ticks = 0;
  state.radarMosaicTimer = setInterval(() => {
    ticks++;
    if (ticks % 4 === 0) cycle();
    else move(frames[active]);
  }, 750);
}

function attemptIcon(ship) {
  return `<span class="attempt-icon">
    <span class="fallback">${icon('ship')}</span>
    <img src="${esc(shipIconPath(ship))}" alt="" loading="lazy" draggable="false" onerror="this.remove()">
  </span>`;
}

function renderAttempts() {
  const list = $('#attempts');
  if (!list) return;
  if (isTimed() && !state.timerStarted && state.status === 'playing') {
    list.innerHTML = '';
    const boardCount = $('#board-count-text');
    if (boardCount) boardCount.textContent = '00:00';
    return;
  }
  const ended = state.status !== 'playing';
  const rows = [];
  const actualRow = (i) => {
    const guessId = state.guesses[i];
    const ship = state.catalogMap.get(guessId);
    if (!ship) return '';
    const correct = guessId === state.answerId;
    const result = buildGuessResult(ship, state.answerShip, i + 1);
    const similarity = correct ? 100 : result.similarity;
    return `
      <li class="attempt is-complete ${correct ? 'is-correct' : 'is-wrong'}${state.latestIndex === i ? ' is-latest' : ''}" aria-label="${esc(`${displayName(ship)}, ${correct ? t('board.confirmed') : t('board.matchRate')}, ${similarity}%`)}">
        <span class="attempt-marker">${String(i + 1).padStart(2, '0')}</span>
        ${attemptIcon(ship)}
        <span class="attempt-body">
          <span class="attempt-name">${esc(displayName(ship))}</span>
          <span class="attempt-meta">${esc(raceName(ship))}<span class="sep"></span>${esc(groupName(ship))}</span>
          <span class="match-track" style="--match:${similarity}%"><span></span></span>
        </span>
        <span class="attempt-status">
          <strong>${esc(correct ? t('board.confirmed') : t('board.matchRate'))}</strong>
          <span>${similarity}%</span>
        </span>
      </li>
    `;
  };
  const emptyRow = (i, active) => `
    <li class="attempt ${active ? 'is-active' : 'is-empty'}"${active ? ' aria-current="step"' : ''}>
      <span class="attempt-marker">${String(i + 1).padStart(2, '0')}</span>
      <span class="attempt-icon"><span class="fallback">${icon(active ? 'crosshair' : 'lock')}</span></span>
      <span class="attempt-body">
        <span class="attempt-name">${esc(active ? t('board.attempt', { n: i + 1 }) : t('board.locked'))}</span>
        <span class="attempt-meta">${esc(active ? t('board.awaiting') : t('dossier.encrypted'))}</span>
      </span>
      <span class="attempt-status"><strong>${esc(active ? t('board.ready') : t('board.sealed'))}</strong></span>
    </li>
  `;
  if (isTimed()) {
    // Timed mode has no fixed slots: newest attempt first, oldest last.
    for (let i = state.guesses.length - 1; i >= 0; i--) rows.push(actualRow(i));
  } else {
    // Standard/Abyss keep the original chronological six-slot board.
    for (let i = 0; i < ATTEMPT_LIMIT; i++) {
      if (state.guesses[i] != null) rows.push(actualRow(i));
      else rows.push(emptyRow(i, !ended && i === state.guesses.length));
    }
  }
  list.innerHTML = rows.join('');
  if (isTimed() && state.guesses.length) list.scrollTop = 0;
  const boardCount = $('#board-count-text');
  if (boardCount) {
    boardCount.textContent = isTimed()
      ? formatElapsed(state.timerStarted ? currentElapsed() : state.timerElapsedMs)
      : `${String(state.guesses.length).padStart(2, '0')} / 06`;
    boardCount.title = isTimed() ? t('timed.hold') : '';
    boardCount.style.cursor = isTimed() ? 'pointer' : '';
    const clockButton = $('.timed-clock-button');
    if (clockButton) clockButton.classList.toggle('is-forfeited', isTimed() && Boolean(state.gaveUp));
  }
  setTimeout(() => {
    $$('.attempt.is-latest').forEach((el) => el.classList.remove('is-latest'));
    state.latestIndex = -1;
  }, 700);
}

function renderAcquire() {
  const slot = $('#acquire-slot');
  if (!slot) return;
  if (state.status !== 'playing') {
    slot.innerHTML = `
      <div class="complete-block" data-status="${state.status}">
        <div class="complete-status">
          <span class="dot"></span>
          <div>${esc(t('board.complete'))}</div>
        </div>
        <button type="button" class="link-button" data-action="debrief">${icon('target')} ${esc(t('end.review'))}</button>
      </div>
    `;
    return;
  }
  if (isTimed() && !state.timerStarted) {
    slot.innerHTML = `
      <div class="acquire timed-acquire">
        <button type="button" class="start-button" data-action="start-timed">
          ${icon('clock')} ${esc(t('timed.start'))}
        </button>
        <p class="timed-hint">${esc(t('timed.startHint'))}</p>
      </div>`;
    return;
  }
  slot.innerHTML = `
    <div class="acquire">
      <div class="search-shell">
        <div class="search-wrap">
          <span class="search-icon">${icon('search')}</span>
          <input id="ship-input" class="search-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions" aria-label="${esc(t('board.inputLabel'))}" placeholder="${esc(t('board.placeholder'))}" autocomplete="off" autocorrect="off" spellcheck="false" value="${esc(state.inputValue)}">
          <span class="search-key">ENTER</span>
        </div>
        <button type="button" class="lock-button" data-action="submit" ${state.inputValue.trim() ? '' : 'disabled'}>
          ${icon('lock')} ${esc(t('board.submit'))}
        </button>
      </div>
      <div class="acquire-meta">
        <span>${icon('globe')} ${esc(t('board.typeAnyLanguage'))}</span>
        <span>${icon('key')} ${esc(t('board.enterHint'))}</span>
      </div>
    </div>
  `;
  syncLockCooldown();
}


function formatMassValue(value) {
  const formatted = formatMass(value, state.massUnit, 't');
  return `<span class="big">${esc(formatted.value)}</span><span class="unit">${esc(formatted.unit)}</span>`;
}

function formatNumberValue(value, unit = '', options = {}) {
  const valueClass = options.small ? '' : ' class="big"';
  return `<span${valueClass}>${esc(options.prefix || '')}${esc(int(value))}</span>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}`;
}

function renderResists(value) {
  if (!value) return '<span class="big">—</span>';
  const damage = [
    ['em', t('damage.em'), '#4da3ff'],
    ['thermal', t('damage.thermal'), '#ff5a5a'],
    ['kinetic', t('damage.kinetic'), '#c3ccd4'],
    ['explosive', t('damage.explosive'), '#ffa94d'],
  ];
  return `<div class="resist-cells">${damage.map(([key, label, color]) => {
    const number = Number(value[key]) || 0;
    return `<span class="resist-cell" style="--v:${Math.max(0, Math.min(100, number))}%;--c:${color}">
      <b>${esc(dec(number, 1))}%</b><small>${esc(label)}</small>
    </span>`;
  }).join('')}</div>`;
}

function clueValue(clue) {
  const value = clue.v;
  switch (clue.k) {
    case 'race':
      return `<span class="big">${esc(state.refs.races[value] || '—')}</span>`;
    case 'faction':
      return `<span class="big">${esc(state.refs.factions[value] || state.refs.races[value] || '—')}</span>`;
    case 'group':
      return `<span class="big">${zkillGroupTextLink(state.refs.groups[value] || '—', value)}</span>`;
    case 'meta':
      return `<span class="big">${esc(state.refs.metaGroups[value] || '—')}</span>`;
    case 'tech':
      return `<span class="big">${esc(t('clue.techValue', { n: int(value) }))}</span>`;
    case 'hiSlots':
    case 'medSlots':
    case 'lowSlots':
    case 'rigSlots':
    case 'turretHardpoints':
    case 'launcherHardpoints':
    case 'maxLockedTargets':
      return `<span class="big">${int(value)}</span>`;
    case 'shieldResists':
    case 'armorResists':
    case 'structureResists':
      return renderResists(value);
    case 'drones':
      return `<div class="hardpoint-row">
        <span class="hardpoint">${icon('drone')}${int(value.bandwidth)}<span>Mbit/s</span></span>
        <span class="hardpoint">${icon('ship')}${int(value.capacity)}<span>m³</span></span>
      </div>`;
    case 'speed':
      return formatNumberValue(value, 'm/s', { prefix: '≈ ' });
    case 'sig':
      return formatNumberValue(value, 'm');
    case 'sensorStrength': {
      const sensors = [
        ['radar', 'sensor.radar', '#7F6C50'],                 // Amarr
        ['gravimetric', 'sensor.gravimetric', '#4A6C7F'],     // Caldari
        ['magnetometric', 'sensor.magnetometric', '#366565'], // Gallente
        ['ladar', 'sensor.ladar', '#653834'],                 // Minmatar
      ].filter(([key]) => Number(value?.[key]) > 0);
      if (!sensors.length) return '<span class="big">—</span>';
      return `<span class="sensor-list">${sensors.map(([key, label, color]) => `
        <span class="sensor-line" style="--c:${color}">
          ${icon('radar')}
          <span class="sensor-kind">${esc(t(label))}</span>
          <span class="sensor-value">${esc(int(value[key]))}</span>
        </span>`).join('')}</span>`;
    }
    case 'shieldRecharge':
      return `<span class="big">${esc(dec(value, 2))}</span><span class="unit">s</span>`;
    case 'align':
      return `<span class="big">${esc(dec(value, 1))}</span><span class="unit">s</span>`;
    case 'warp':
      return `<span class="big">${esc(dec(value, 1))}</span><span class="unit">AU/s</span>`;
    case 'mass':
      return formatMassValue(value);
    case 'cargoCapacity':
      return formatNumberValue(value, 'm³');
    case 'shield':
    case 'armor':
    case 'structure':
      return formatNumberValue(value, 'HP');
    case 'capacitor':
      return formatNumberValue(value, 'GJ');
    case 'pg':
      return formatNumberValue(value, 'MW');
    case 'cpu':
      return formatNumberValue(value, 'tf');
    case 'calibration':
      return formatNumberValue(value, '', { small: true });
    case 'targetRange':
      return value >= 10000
        ? `<span class="big">${esc(dec(value / 1000, 1))}</span><span class="unit">km</span>`
        : formatNumberValue(value, 'm');
    case 'scanRes':
      return formatNumberValue(value, 'mm');
    case 'kbValue':
      return `<span class="big">${esc(isk(value))}</span>`;
    case 'losses30':
      return `<span class="big">≈ ${esc(compact(value))}</span>`;
    case 'usageRank':
      return `<span class="big">${esc(t('clue.rankTop', { n: int(value) }))}</span>`;
    case 'danger':
      return `<span class="big">${esc(pct(value))}%</span>`;
    case 'bonus':
      return '';
    default:
      return `<span class="big">${esc(value ?? '—')}</span>`;
  }
}

function slotLabel(slot) {
  const key = `dossier.slot${slot.charAt(0).toUpperCase()}${slot.slice(1)}`;
  return t(key) || t('cat.equipment');
}

function moduleBadge(tag, clue) {
  const badges = {
    limited: { cls: 'badge-limited', icon: 'lock', label: t('dossier.limited'), hint: t('dossier.limitedHint') },
    unique: { cls: 'badge-unique', icon: 'lock', label: t('dossier.unique'), hint: t('dossier.uniqueHint') },
    officer: { cls: 'badge-officer', icon: 'star', label: t('dossier.officer'), hint: t('dossier.officerHint') },
    abyss: { cls: 'badge-abyss', icon: 'radar', label: t('dossier.abyss'), hint: t('dossier.abyssHint') },
    plex: { cls: 'badge-plex', icon: 'star', label: t('dossier.plex'), hint: t('dossier.plexHint') },
  };
  const badge = badges[tag];
  if (!badge) return '';
  if (tag === 'abyss' && state.status !== 'playing' && clue?.calcModule) {
    const calcName = state.refs.modules?.[clue.calcModule]?.name
      || state.extraTypeNames?.[clue.calcModule]
      || `Type #${clue.calcModule}`;
    badge.hint = `${t('dossier.abyssHint')} ${t('dossier.abyssCalc', { name: calcName })}`;
  }
  return `<span class="badge-hull ${badge.cls}" title="${esc(badge.hint)}" aria-label="${esc(`${badge.label}: ${badge.hint}`)}">${icon(badge.icon)} ${esc(badge.label)}</span>`;
}

function bonusAmountText(entry) {
  if (!Number.isFinite(entry?.bonus)) return '';
  const sign = entry.bonus > 0 ? '+' : '';
  const unit = entry.unit === '%' ? '%' : entry.unit ? ` ${entry.unit}` : '';
  return `${sign}${entry.bonus}${unit}`;
}

function bonusEntryHtml(entry, clue = null) {
  if (!entry) return '';
  const text = entry.text?.[state.locale] || entry.text?.en || '';
  const amount = bonusAmountText(entry);
  return `${amount ? `<strong class="bonus-amount">${esc(amount)}</strong> ` : ''}${esc(text)}`;
}

function bonusGroupHtml(entries, clues) {
  if (!entries.length) return '';
  const groups = [];
  const byKey = new Map();
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const key = entry.section === 'role' ? 'role' : `types:${entry.skillID || 0}`;
    let group = byKey.get(key);
    if (!group) {
      const skillName = entry.skill?.[state.locale] || entry.skill?.en || '';
      const title = entry.section === 'role'
        ? t('clue.bonusRole')
        : t('clue.bonusHull', { name: skillName });
      group = { title, lines: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.lines.push(`<li>${bonusEntryHtml(entry, clues.get(index))}</li>`);
  }
  return groups.map((group) => `<div class="debrief-bonus-group">
    <div class="debrief-bonus-title">${esc(group.title)}</div>
    <ul class="bonus-list debrief-bonus">${group.lines.join('')}</ul>
  </div>`).join('');
}


function renderModuleLine(clue) {
  const module = state.refs.modules?.[clue.v.module];
  const name = module?.name || state.extraTypeNames?.[clue.v.module] || `Type #${clue.v.module}`;
  const tags = [...new Set(clue.tags?.length ? clue.tags : clue.tag ? [clue.tag] : [])];
  return `<span class="module-line">
    ${moduleThumb(clue.v.module, clue.v.slot)}
    <span class="module-line-body">
      <span class="module-line-name">${zkillItemLink(name, clue.v.module)}</span>
      ${tags.map((tag) => moduleBadge(tag, clue)).join('')}
    </span>
    <span class="module-count">×${int(clue.v.count)}</span>
  </span>`;
}

function renderClueRow(clue, index, revealed) {
  const fresh = revealed && state.fresh.has(index);
  const category = groupCategory(clue);
  let label = clueLabel(clue);
  let value = revealed ? clueValue(clue) : '';
  if (clue.k === 'equipment' || clue.k === 'cargo') {
    label = '';
    value = revealed ? renderModuleLine(clue) : '';
  } else if (clue.k === 'bonus') {
    label = '';
    const entry = state.answerData.bonusEntries?.[clue.v];
    value = revealed
      ? (entry ? bonusEntryHtml(entry, clue) : esc(state.answerData.bonuses?.[clue.v] || ''))
      : '';
  }
  if (revealed && !value) value = '—';
  const zeroWeight = (Number(clue.w) || 0) <= 0 && state.status === 'playing';
  const massToggle = clue.k === 'mass' && revealed;
  return `<div class="attr-row cat-${category}${clue.k === 'equipment' || clue.k === 'cargo' ? ' equipment-row' : ''}${clue.k === 'bonus' ? ' bonus-row' : ''}${zeroWeight ? ' is-zero-weight' : ''} ${revealed ? 'is-revealed' : 'is-hidden'}${fresh ? ' is-fresh' : ''}" data-clue-index="${index}" data-clue-kind="${esc(clue.k)}" data-category="${category}"${massToggle
    ? ` data-mass-toggle="true" role="button" tabindex="0" title="${esc(t('clue.massToggle'))}"`
    : ''}>
    <span class="attr-label">${esc(label)}</span>
    <span class="attr-value">${revealed ? value : '<span class="attr-redacted" aria-label="?">?</span>'}</span>
    <span class="attr-meta">${revealed ? weightPips(clue.w) : `<span class="attr-lock">${icon('lock')}</span>`}</span>
  </div>`;
}

function toggleMassUnit() {
  state.massUnit = state.massUnit === 't' ? 'kg' : 't';
  for (const row of $$('.attr-row[data-clue-kind="mass"]')) {
    const clue = state.answerData?.clues?.[Number(row.dataset.clueIndex)];
    const value = row.querySelector('.attr-value');
    if (clue && value) value.innerHTML = clueValue(clue);
  }
}

function renderCargoCapacityPlaceholder() {
  return `<div class="attr-row cat-cargo is-hidden equipment-sealed">
    <span class="attr-label">${esc(t('clue.cargo'))}</span>
    <span class="attr-value"><span class="attr-redacted" aria-label="?">?</span></span>
    <span class="attr-meta"><span class="attr-lock">${icon('lock')}</span></span>
  </div>`;
}

function clearNewClueHint() {
  const host = $('#new-clue-hint');
  state.hintKey = '';
  if (!host) return;
  host.hidden = true;
  host.classList.remove('is-updating');
  host.innerHTML = '';
}

function newClueHintMarkup(direction, count) {
  const label = t('dossier.newClue');
  const arrow = direction === 'up' ? 'arrowUp' : 'arrowDown';
  const edge = direction === 'up' ? 'top' : 'bottom';
  return `<button type="button" class="new-clue-box is-${edge}" data-action="new-clue" data-direction="${direction}" aria-label="${esc(`${label} ${count}`)}">
    ${icon(arrow)}
    <span>${esc(label)}</span>
    <b>${int(count)}</b>
  </button>`;
}

function updateNewClueHint() {
  state.hintRaf = 0;
  const host = $('#new-clue-hint');
  if (!host) return;
  if (state.status !== 'playing' || !state.answerData) {
    state.unseen.clear();
    clearNewClueHint();
    return;
  }
  let above = 0;
  let below = 0;
  for (const index of [...state.unseen]) {
    const row = document.querySelector(`.attr-row[data-clue-index="${index}"]`);
    if (!row) continue;
    const rect = row.getBoundingClientRect();
    // Only count a clue as seen once the whole row is inside the viewport.
    const visible = rect.top >= 0
      && rect.bottom <= window.innerHeight
      && rect.left >= 0
      && rect.right <= window.innerWidth;
    if (visible) {
      state.unseen.delete(index);
    } else if (rect.bottom <= 0) {
      above += 1;
    } else {
      below += 1;
    }
  }
  if (!state.unseen.size || (!above && !below)) {
    clearNewClueHint();
    return;
  }
  const key = `${above}:${below}`;
  if (key === state.hintKey) return;
  const wasVisible = !host.hidden;
  state.hintKey = key;
  host.classList.toggle('is-updating', wasVisible);
  host.innerHTML = [
    above ? newClueHintMarkup('up', above) : '',
    below ? newClueHintMarkup('down', below) : '',
  ].join('');
  host.hidden = false;
}

function scheduleNewClueHint() {
  if (state.hintRaf) return;
  state.hintRaf = requestAnimationFrame(updateNewClueHint);
}

function rememberNewClues(indices) {
  if (state.status !== 'playing') return;
  for (const index of indices) state.unseen.add(index);
  // Evaluate immediately after the post-guess render; do not wait for a
  // follow-up scroll event to decide whether the new rows are off-screen.
  updateNewClueHint();
}

function scrollToNewClue(direction) {
  const rows = [...state.unseen]
    .map((index) => ({
      index,
      row: document.querySelector(`.attr-row[data-clue-index="${index}"]`),
    }))
    .filter((entry) => entry.row)
    .map((entry) => ({ ...entry, rect: entry.row.getBoundingClientRect() }));
  if (!rows.length) return;
  const nearest = direction === 'up'
    ? rows.filter((entry) => entry.rect.bottom <= 0).sort((a, b) => b.rect.bottom - a.rect.bottom)[0]
    : rows.filter((entry) => entry.rect.top >= window.innerHeight).sort((a, b) => a.rect.top - b.rect.top)[0];
  (nearest || rows[0]).row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  scheduleNewClueHint();
}

function renderDossier() {
  if (!state.answerData) return;
  if (isTimed() && !state.timerStarted && state.status === 'playing') {
    const countText = $('#dossier-count-text');
    if (countText) countText.textContent = '0 / ?';
    const progressBar = $('#dossier-progress');
    if (progressBar) progressBar.style.width = '0%';
    const orb = $('#dossier-orb');
    if (orb) orb.style.setProperty('--p', 0);
    const orbText = $('#dossier-orb-text');
    if (orbText) orbText.textContent = '?';
    updateTimedOrb();
    if ($('#answer-banner')) $('#answer-banner').innerHTML = '';
    const host = $('#dossier-groups');
    if (host) {
      host.innerHTML = ['hull', 'nav', 'defense', 'targeting', 'fitting', 'equipment', 'cargo'].map((category) => `
        <section class="dossier-group cat-${category} is-sealed">
          <header class="group-head">
            <span class="group-title">${icon(CATEGORY_ICON[category] || 'dot')}<span>${esc(categoryLabel(category))}</span></span>
            <span class="group-progress" aria-hidden="true"><span style="--p:0"></span></span>
            <span class="group-count"><b>?</b></span>
          </header>
          <div class="group-rows">
            <div class="attr-row is-hidden equipment-sealed">
              <span class="attr-label">${esc(t('dossier.encrypted'))}</span>
              <span class="attr-value"><span class="attr-redacted" aria-label="?">?</span></span>
              <span class="attr-meta"><span class="attr-lock">${icon('lock')}</span></span>
            </div>
          </div>
        </section>`).join('');
    }
    return;
  }
  const total = state.answerData.clues.length;
  const visible = state.revealed.size;
  const totalHidden = hiddenTotals();

  const countText = $('#dossier-count-text');
  if (countText) countText.textContent = `${visible} / ${totalHidden ? '?' : total}`;
  const progress = totalHidden ? 0 : (total ? Math.round((visible / total) * 100) : 0);
  const progressBar = $('#dossier-progress');
  if (progressBar) progressBar.style.width = `${progress}%`;
  const orb = $('#dossier-orb');
  if (orb) {
    orb.style.setProperty('--p', progress);
    orb.setAttribute('aria-valuenow', String(progress));
  }
  const orbText = $('#dossier-orb-text');
  if (orbText) orbText.textContent = totalHidden ? '?' : `${progress}%`;
  updateTimedOrb();

  const answerBanner = $('#answer-banner');
  if (answerBanner) {
    if (state.status === 'playing') {
      answerBanner.innerHTML = '';
    } else {
      answerBanner.innerHTML = `<div class="answer-banner" data-status="${state.status}">
        <div class="answer-ship">
          <span>${esc(t('dossier.answer'))}</span>
          <strong>${zkillShipLink(displayName(state.answerShip), state.answerId)}</strong>
        </div>
        <div class="answer-victim" data-victim-slot>${victimMetaHtml()}</div>
        <button type="button" class="link-button" data-action="debrief">${icon('external')} ${esc(t('end.review'))}</button>
      </div>`;
      void fetchVictimInfo();
    }
  }

  const groups = CATEGORIES.map((category) => ({
    category,
    entries: state.answerData.clues
      .map((clue, index) => ({ clue, index }))
      .filter((entry) => groupCategory(entry.clue) === category),
  })).filter((group) => group.entries.length);

  const host = $('#dossier-groups');
  if (host) {
    host.innerHTML = groups.map(({ category, entries }) => {
      if (category === 'equipment' || category === 'cargo') {
        const ordered = [...entries].sort((a, b) => (
          Number(b.clue.k === 'cargoCapacity') - Number(a.clue.k === 'cargoCapacity')
          || (EQUIPMENT_SLOT_ORDER[a.clue.v.slot] ?? 9) - (EQUIPMENT_SLOT_ORDER[b.clue.v.slot] ?? 9)
          || a.index - b.index
        ));
        const revealed = ordered.filter((entry) => state.revealed.has(entry.index));
        const hidden = ordered.length - revealed.length;
        const capacityEntry = category === 'cargo'
          ? ordered.find((entry) => entry.clue.k === 'cargoCapacity') || null
          : null;
        const capacityIndex = capacityEntry?.index;
        const capacityRevealed = Boolean(capacityEntry && state.revealed.has(capacityIndex));
        const capacityRow = capacityEntry
          ? (capacityRevealed
            ? renderClueRow(capacityEntry.clue, capacityEntry.index, true)
            : renderCargoCapacityPlaceholder())
          : '';
        const revealedOthers = category === 'cargo'
          ? revealed.filter((entry) => entry.index !== capacityIndex)
          : revealed;
        const hiddenOthers = category === 'cargo' && capacityEntry && !capacityRevealed
          ? hidden - 1
          : hidden;
        const sealedKey = category === 'cargo' ? 'dossier.cargoSealed' : 'dossier.equipmentSealed';
        const sealed = hiddenOthers > 0
          ? `<div class="attr-row cat-${category} is-hidden equipment-sealed">
              <span class="attr-label">${esc(t(sealedKey))}</span>
              <span class="attr-value"><span class="attr-redacted" aria-label="?">?</span></span>
              <span class="attr-meta"><span class="attr-lock">${icon('lock')}</span></span>
            </div>`
          : '';
        const sealedDivider = revealed.length > 0 && hiddenOthers > 0
          ? '<div class="sealed-divider" aria-hidden="true"></div>'
          : '';
        const slotGroups = category === 'cargo'
          ? `${capacityRow}${revealedOthers.map(({ clue, index }) => renderClueRow(clue, index, true)).join('')}`
          : Object.entries(EQUIPMENT_SLOT_ORDER)
            .map(([slot]) => ({
              slot,
              rows: revealed.filter(({ clue }) => clue.v.slot === slot),
            }))
            .filter((group) => group.rows.length)
            .map(({ slot, rows }) => `<div class="equipment-slot-group">
              <div class="equipment-slot-head"><span>${esc(slotLabel(slot))}</span><i>${rows.length}</i></div>
              ${rows.map(({ clue, index }) => renderClueRow(clue, index, true)).join('')}
            </div>`)
            .join('');
        const cargoItems = category === 'cargo'
          ? ordered.filter(({ clue }) => clue.k === 'cargo')
          : [];
        const counterRevealed = category === 'cargo'
          ? cargoItems.filter(({ index }) => state.revealed.has(index)).length
          : revealed.length;
        const counterTotal = category === 'cargo' ? cargoItems.length : ordered.length;
        const counterPending = category === 'cargo'
          ? counterTotal - counterRevealed
          : hidden;
        return `<section class="dossier-group cat-${category}${hidden ? ' is-sealed' : ''}">
          <header class="group-head">
            <span class="group-title">${icon(CATEGORY_ICON[category] || 'cargo')}<span>${esc(categoryLabel(category))}</span></span>
            <span class="group-progress" aria-hidden="true"><span style="--p:${counterPending ? 0 : 100}"></span></span>
            <span class="group-count"><b>${counterRevealed}</b> / ${counterPending ? '?' : counterTotal}</span>
          </header>
          <div class="group-rows">
            ${slotGroups}
            ${sealedDivider}
            ${sealed}
          </div>
        </section>`;
      }
      if (category === 'traits') {
        const ordered = [...entries].sort((a, b) => Number(a.clue.v) - Number(b.clue.v));
        const revealed = ordered.filter((entry) => state.revealed.has(entry.index));
        const hidden = ordered.length - revealed.length;
        const sealed = hidden
          ? `<div class="attr-row cat-traits is-hidden equipment-sealed">
              <span class="attr-label">${esc(t('dossier.traitsSealed'))}</span>
              <span class="attr-value"><span class="attr-redacted" aria-label="?">?</span></span>
              <span class="attr-meta"><span class="attr-lock">${icon('lock')}</span></span>
            </div>`
          : '';
        return `<section class="dossier-group cat-traits${hidden ? ' is-sealed' : ''}">
          <header class="group-head">
            <span class="group-title">${icon(CATEGORY_ICON.traits || 'dot')}<span>${esc(categoryLabel('traits'))}</span></span>
            <span class="group-progress" aria-hidden="true"><span style="--p:${hidden ? 0 : 100}"></span></span>
            <span class="group-count"><b>${revealed.length}</b> / ${hidden ? '?' : ordered.length}</span>
          </header>
          <div class="group-rows">
            ${revealed.map(({ clue, index }) => renderClueRow(clue, index, true)).join('')}
            ${sealed}
          </div>
        </section>`;
      }
      const ordered = category === 'defense'
        ? [...entries].sort((a, b) => (
          (DEFENSE_ORDER[a.clue.k] ?? 9) - (DEFENSE_ORDER[b.clue.k] ?? 9)
          || a.index - b.index
        ))
        : category === 'fitting'
          ? [...entries].sort((a, b) => (
            (FITTING_ORDER[a.clue.k] ?? 99) - (FITTING_ORDER[b.clue.k] ?? 99)
            || a.index - b.index
          ))
          : entries;
      const shown = ordered.filter((entry) => state.revealed.has(entry.index)).length;
      const groupProgress = Math.round((shown / ordered.length) * 100);
      return `<section class="dossier-group cat-${category}">
        <header class="group-head">
          <span class="group-title">${icon(CATEGORY_ICON[category] || 'dot')}<span>${esc(categoryLabel(category))}</span></span>
          <span class="group-progress" aria-hidden="true"><span style="--p:${groupProgress}"></span></span>
          <span class="group-count"><b>${shown}</b> / ${ordered.length}</span>
        </header>
        <div class="group-rows">
          ${ordered.map(({ clue, index }) => renderClueRow(clue, index, state.revealed.has(index))).join('')}
        </div>
      </section>`;
    }).join('');
    if (state.scanPulse) {
      state.scanPulse = false;
      const scanRows = host.querySelectorAll('.attr-row.is-hidden, .attr-row.is-fresh');
      scanRows.forEach((row) => row.classList.add('is-scanning'));
      setTimeout(() => scanRows.forEach((row) => row.classList.remove('is-scanning')), 1100);
    }
  }

  if (state.fresh.size) {
    setTimeout(() => {
      $$('.attr-row.is-fresh').forEach((row) => row.classList.remove('is-fresh'));
      state.fresh.clear();
    }, 1700);
  }
  scheduleNewClueHint();
}

function syncBoardHeight() {
  const board = $('#board-panel');
  const dossier = $('#dossier-panel');
  if (!board || !dossier) return;
  if (!isTimed() || window.innerWidth <= 860) {
    board.style.maxHeight = '';
    return;
  }
  board.style.maxHeight = `${Math.max(0, dossier.getBoundingClientRect().height)}px`;
}

function renderAll() {
  renderHero();
  renderAttempts();
  renderAcquire();
  renderDossier();
  renderChrome();
  requestAnimationFrame(syncBoardHeight);
}

// ---------------------------------------------------------------------------
// Search and guessing
// ---------------------------------------------------------------------------

function exactShip(query) {
  const q = normalizeText(query);
  if (!q) return null;
  for (const entry of state.index) {
    if (entry.names.includes(q)) return entry.ship;
  }
  return null;
}

function renderSuggestions() {
  const box = $('#suggestions');
  const input = $('#ship-input');
  if (!box || !input) return;
  const q = state.inputValue.trim();
  if (!q || state.status !== 'playing' || state.composing) {
    box.hidden = true;
    box.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    return;
  }
  const guessed = new Set(state.guesses);
  state.suggestions = searchShips(state.index, q, { exclude: guessed, limit: 8 });
  if (!state.suggestions.length) {
    box.hidden = true;
    box.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    return;
  }
  state.activeSuggestion = Math.max(0, Math.min(state.activeSuggestion, state.suggestions.length - 1));
  box.innerHTML = state.suggestions.map((ship, index) => `
    <button type="button" class="suggestion${index === state.activeSuggestion ? ' is-active' : ''}" role="option" id="suggestion-${ship.id}" aria-selected="${index === state.activeSuggestion}" data-ship-id="${ship.id}">
      <span class="suggestion-icon"><img src="${esc(shipIconPath(ship))}" alt="" loading="lazy" onerror="this.remove()"></span>
      <span>
        <span class="suggestion-name">${esc(displayName(ship))}</span>
        <span class="suggestion-meta">${esc(groupName(ship))} · ${esc(raceName(ship))}</span>
      </span>
      <span class="suggestion-tag">T${esc(ship.techLevel ?? '?')}</span>
    </button>
  `).join('');
  box.hidden = false;
  positionSuggestions();
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-activedescendant', `suggestion-${state.suggestions[state.activeSuggestion].id}`);
}

function hideSuggestions() {
  const box = $('#suggestions');
  const input = $('#ship-input');
  if (box) {
    box.hidden = true;
    box.innerHTML = '';
  }
  if (input) input.setAttribute('aria-expanded', 'false');
  state.activeSuggestion = -1;
  state.suggestions = [];
}

function positionSuggestions() {
  const box = $('#suggestions');
  const input = $('#ship-input');
  if (!box || !input || box.hidden) return;
  const rect = input.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(Math.max(rect.width, 240), window.innerWidth - rect.left - margin);
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const preferAbove = window.innerWidth <= 600;
  const openAbove = preferAbove ? spaceAbove > Math.min(240, spaceBelow) : (spaceBelow < 240 && spaceAbove > spaceBelow);
  box.style.left = `${Math.max(margin, rect.left)}px`;
  box.style.width = `${Math.max(180, width)}px`;
  box.style.maxHeight = `${Math.max(120, Math.min(330, openAbove ? spaceAbove : spaceBelow))}px`;
  if (openAbove) {
    box.style.top = 'auto';
    box.style.bottom = `${window.innerHeight - rect.top + 5}px`;
  } else {
    box.style.top = `${rect.bottom + 5}px`;
    box.style.bottom = 'auto';
  }
}

function selectSuggestion(ship) {
  if (!ship) return;
  state.selectedId = ship.id;
  state.inputValue = displayName(ship);
  const input = $('#ship-input');
  if (input) {
    input.value = state.inputValue;
    input.focus();
  }
  hideSuggestions();
  updateLockButton();
}

function updateLockButton() {
  const button = $('.lock-button');
  if (!button) return;
  if (isTimed() && Date.now() < state.lockCooldownUntil) {
    button.disabled = true;
    syncLockCooldown();
    return;
  }
  button.disabled = !state.inputValue.trim();
}

function setInputValue(value) {
  state.inputValue = value;
  const input = $('#ship-input');
  if (input && input.value !== value) input.value = value;
  const exact = exactShip(value);
  state.selectedId = exact?.id ?? null;
  updateLockButton();
  renderSuggestions();
}

function currentGuessShip() {
  const exact = exactShip(state.inputValue);
  if (exact) return exact;
  if (state.activeSuggestion >= 0 && state.suggestions[state.activeSuggestion]) {
    return state.suggestions[state.activeSuggestion];
  }
  if (state.selectedId != null) return state.catalogMap.get(state.selectedId) || null;
  return null;
}

function submitGuess() {
  if (state.status !== 'playing') return;
  if (isTimed() && Date.now() < state.lockCooldownUntil) return;
  const ship = currentGuessShip();
  if (!ship) {
    showToast(t('toast.invalid'), '', 'error');
    return;
  }
  if (state.guesses.includes(ship.id)) {
    showToast(t('toast.duplicate'), '', 'warn');
    return;
  }
  applyGuess(ship.id);
}

function statMode() {
  return isTimed() ? 'timed' : state.mode === 'abyss' ? 'abyss' : 'standard';
}

function statsEligible() {
  return !isFree() && state.date === state.today;
}

function recordDailyPlay() {
  if (!statsEligible()) return;
  state.stats = recordPlay(localStorage, state.stats, {
    date: state.date,
    mode: statMode(),
    isToday: true,
  });
}

function recordDailyResult() {
  if (!statsEligible()) return;
  state.stats = recordResult(localStorage, state.stats, {
    date: state.date,
    mode: statMode(),
    status: state.status,
    attempts: state.guesses.length,
    isToday: true,
  });
}

function applyGuess(shipId) {
  const ship = state.catalogMap.get(shipId);
  if (!ship) return;
  recordDailyPlay();
  const previousRevealed = new Set(state.revealed);
  const previousGuesses = state.guesses.length;
  hideSuggestions();
  state.guesses.push(shipId);
  const correct = shipId === state.answerId;
  if (isTimed() && correct) stopTimedClock();
  state.status = correct ? 'won' : (isTimed() ? 'playing' : (state.guesses.length >= ATTEMPT_LIMIT ? 'lost' : 'playing'));
  if (isFree() && state.status !== 'playing') finishFreeRound(state.status === 'won');
  recomputeRevealed();
  state.fresh = new Set([...state.revealed].filter((index) => !previousRevealed.has(index)));
  state.latestIndex = previousGuesses;
  state.inputValue = '';
  state.selectedId = null;
  state.activeSuggestion = -1;
  state.suggestions = [];
  persist();

  const newlyRevealed = state.fresh.size;
  if (state.status === 'playing') {
    if (newlyRevealed > 0) showToast(t('toast.intel'), t('toast.clue', { n: newlyRevealed }), 'info');
    else showToast(t('toast.noMatch'), '', 'warn');
  }

  state.scanPulse = true;
  renderAll();
  rememberNewClues(state.fresh);
  if (isTimed() && !correct) startLockCooldown();
  if (state.status !== 'playing') {
    recordDailyResult();
    setTimeout(() => renderDebrief(), 850);
  } else if (window.innerWidth >= 860) {
    setTimeout(() => $('#ship-input')?.focus(), 60);
  }
}

// ---------------------------------------------------------------------------
// Debrief and manual
// ---------------------------------------------------------------------------

function zkillKillUrl(killId) {
  return `${state.manifest.zkillboard.baseUrl.replace(/\/$/, '')}/kill/${killId}/`;
}

function zkillShipUrl(shipId = state.answerId) {
  return `${state.manifest.zkillboard.baseUrl.replace(/\/$/, '')}/ship/${shipId}/`;
}

function shareLink() {
  const timed = isTimed();
  return shareUrl(
    location,
    state.answerKillId,
    state.mode,
    state.status,
    state.guesses.length,
    state.locale,
    timed,
    isFree(),
    timed ? Math.round(state.timerElapsedMs / 1000) : 0,
  );
}

function renderDebrief() {
  if (state.status === 'playing' || !state.answerData) return;
  const won = state.status === 'won';
  const ship = state.answerShip;
  const total = state.answerData.clues.length;
  const free = isFree();
  const url = shareLink();
  const stats = state.stats || DEFAULT_STATS;
  const sampleKill = state.answerData.sampleKill;
  const description = (state.answerData.description || '').split(/\n{2,}/).filter(Boolean);
  const bonuses = state.answerData.bonuses || [];
  const bonusEntries = state.answerData.bonusEntries || [];
  const bonusClues = new Map();
  for (const clue of state.answerData.clues || []) {
    if (clue.k === 'bonus') bonusClues.set(Number(clue.v), clue);
  }
  const bonusHtml = bonusEntries.length
    ? bonusGroupHtml(bonusEntries, bonusClues)
    : (bonuses.length
      ? `<div class="debrief-bonus-title">${esc(t('clue.bonus'))}</div><ul class="bonus-list debrief-bonus">${bonuses.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`
      : '');
  const kbHref = sampleKill ? zkillKillUrl(sampleKill) : (!won ? zkillShipUrl() : null);
  const kbLabel = sampleKill ? t('end.killmail') : t('end.killboard');
  const timed = isTimed();
  const oneShot = !timed && won && state.guesses.length === 1;
  const timedFail = timed && !won && state.timedExpired;
  const kicker = timed
    ? (won ? t('timed.winKicker') : timedFail ? t('timed.failKicker') : t('timed.giveUpKicker'))
    : (oneShot ? t('oneShot.kicker') : (won ? t('end.victoryKicker') : t('end.defeatKicker')));
  const title = timed
    ? (won ? t('timed.winTitle') : timedFail ? t('timed.failTitle') : t('timed.giveUpTitle'))
    : (oneShot ? t('oneShot.title') : (won ? t('end.victoryTitle') : t('end.defeatTitle')));
  const body = timed
    ? (won ? t('timed.winBody', { name: displayName(ship) })
      : timedFail ? t('timed.failBody', { name: displayName(ship) })
        : t('timed.giveUpBody', { name: displayName(ship) }))
    : (oneShot
      ? t('oneShot.body')
      : (won ? t('end.victoryBody', { name: displayName(ship) }) : t('end.defeatBody', { name: displayName(ship) })));
  const freeStreakCounted = free && state.freeFromRefresh === true;
  const freeStreakMode = free ? freeGameplayKey() : '';
  const freeStreakValue = free ? Number(state.freeStreaks[freeStreakMode]) || 0 : 0;
  const freeStreakOld = free ? Number(state.freeStreakBefore) || 0 : 0;
  const freeStreakEvent = freeStreakCounted ? (state.freeStreakEvent || 'none') : 'neutral';
  const freeStreakShown = freeStreakEvent === 'increment' || freeStreakEvent === 'reset'
    ? freeStreakOld
    : freeStreakValue;
  const freeStreakStat = free
    ? `<div class="debrief-stat debrief-streak${freeStreakCounted ? '' : ' is-neutral'}" data-event="${esc(freeStreakEvent)}" data-old="${freeStreakOld}" data-new="${freeStreakValue}" aria-label="${esc(t('free.streak'))} ${freeStreakValue}">
        <span class="debrief-streak-label">${esc(t('free.streak'))} // ${esc(t(`mode.${freeStreakMode}`))}</span>
        <strong class="debrief-streak-value">${freeStreakShown}</strong>
        <span class="debrief-streak-burst" aria-hidden="true"></span>
      </div>`
    : '';
  const html = `
    <div class="modal debrief-modal${oneShot ? ' is-one-shot' : ''}" role="dialog" aria-modal="true" aria-labelledby="debrief-title" data-kind="debrief" data-status="${state.status}" data-one-shot="${oneShot}">
      <button type="button" class="modal-close" data-action="close-modal" aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      <div class="debrief">
        <div class="debrief-visual">
          <div class="debrief-scan"></div>
          <div class="debrief-stamp">${esc(kicker)}</div>
          <div class="debrief-image">
            <img src="${esc(renderPath(ship.id))}" alt="" onerror="this.remove()">
          </div>
          ${won ? `<div class="debrief-cross" aria-hidden="true"></div>` : ''}
          <div class="debrief-visual-caption">
            <span>${esc(t('dossier.answer'))}</span>
            <strong>${zkillShipLink(displayName(ship), ship.id)}</strong>
          </div>
        </div>
        <div class="debrief-main">
          ${oneShot ? `<div class="one-shot-banner"><span class="one-shot-mark">01</span><span>${esc(t('end.victoryKicker'))} // ${esc(t('oneShot.kicker'))}</span></div>` : ''}
          <div class="debrief-kicker"><span class="dot"></span>${esc(kicker)}</div>
          <h2 id="debrief-title">${esc(title)}</h2>
          <p class="debrief-body">${esc(body)}</p>

          <div class="debrief-answer">
            <span class="icon"><img src="${esc(shipIconPath(ship))}" alt="" onerror="this.remove()"></span>
            <div class="debrief-answer-info">
              <span>${esc(t('dossier.answer'))}</span>
              <strong>${zkillShipLink(displayName(ship), state.answerId)}</strong>
            </div>
            <div class="debrief-victim" data-victim-slot>${victimMetaHtml()}</div>
          </div>

          <div class="debrief-stats${timed ? ' is-timed' : ''}">
            ${timed
              ? `<div class="debrief-stat"><span>${esc(t('timed.time'))}</span><strong>${esc(formatElapsed(state.timerElapsedMs))}</strong></div>
                 <div class="debrief-stat"><span>${esc(t('end.attempts'))}</span><strong>${state.guesses.length}</strong></div>
                 <div class="debrief-stat"><span>${esc(t('end.intel'))}</span><strong>${total} / ${total}</strong></div>
                 ${free ? freeStreakStat : `<div class="debrief-stat"><span>${esc(t('end.streak'))}</span><strong>${stats.streak || 0}</strong></div>`}`
              : `<div class="debrief-stat"><span>${esc(t('end.attempts'))}</span><strong>${state.guesses.length} / 6</strong></div>
                 <div class="debrief-stat"><span>${esc(t('end.intel'))}</span><strong>${total} / ${total}</strong></div>
                 ${free ? freeStreakStat : `<div class="debrief-stat"><span>${esc(t('end.streak'))}</span><strong>${stats.streak || 0}</strong></div>`}`}
          </div>

          <div class="debrief-description">${description.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
          ${bonusHtml}

          <div class="debrief-actions">
            <button type="button" class="button primary" data-action="copy-share">${icon('share')} ${esc(t('end.share'))}</button>
            ${kbHref ? `<a class="button" href="${esc(kbHref)}" target="_blank" rel="noopener noreferrer">${icon('external')} ${esc(kbLabel)}</a>` : ''}
            <button type="button" class="button ghost" data-action="close-modal">${esc(t('end.review'))}</button>
          </div>

          <div class="share-box">
            <label for="share-url">${esc(t('end.share'))}</label>
            <input id="share-url" type="text" readonly value="${esc(url)}">
          </div>

          <div class="debrief-next" id="debrief-next">
            ${free ? `<span>${esc(t('free.kicker'))}</span><strong>${esc(t('free.next'))}</strong>` : `<span>${esc(t('end.next'))}</span><strong>${esc(nextDowntime())}</strong>`}
          </div>
        </div>
      </div>
    </div>
  `;
  openModal(html, 'debrief', state.status);
  animateFreeStreak();
  void fetchVictimInfo();
}

function clearToasts() {
  const root = $('#toast-root');
  if (root) root.innerHTML = '';
}

function openModal(html, kind, status = null) {
  const root = $('#modal-root');
  if (!root) return;
  hideSuggestions();
  clearToasts();
  const wasOpen = !!state.modal;
  if (!wasOpen) state.focusBeforeModal = document.activeElement;
  root.innerHTML = html;
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  $('#app')?.setAttribute('aria-hidden', 'true');
  document.body.classList.add('modal-open');
  state.modal = { kind, status };
  if (!wasOpen) {
    requestAnimationFrame(() => {
      const target = root.querySelector('[data-autofocus]') || root.querySelector('button, a, input');
      target?.focus();
    });
  }
}

function closeModal() {
  const root = $('#modal-root');
  if (!root || !state.modal) return;
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '';
  $('#app')?.removeAttribute('aria-hidden');
  document.body.classList.remove('modal-open');
  const focus = state.focusBeforeModal;
  state.modal = null;
  state.focusBeforeModal = null;
  if (focus && typeof focus.focus === 'function' && focus.isConnected) focus.focus();
}

function openFreeModal() {
  openModal(`
    <div class="modal mode-modal" role="dialog" aria-modal="true" aria-labelledby="free-title" data-kind="free">
      <button type="button" class="modal-close" data-action="close-modal" aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      <div class="panel-kicker">${icon('radar')} // ${esc(t('mode.free'))}</div>
      <h2 id="free-title">${esc(t('freeModal.title'))}</h2>
      <p class="mode-modal-body">${esc(t('freeModal.body'))}</p>
      <label class="mode-modal-label" for="free-kb-input">${esc(t('freeModal.kbLabel'))}</label>
      <input id="free-kb-input" class="mode-modal-input" type="text" autocomplete="off" placeholder="${esc(t('freeModal.placeholder'))}">
      <div class="mode-modal-error" id="free-error" aria-live="polite"></div>
      <div class="mode-modal-actions">
        <button type="button" class="button primary" data-action="free-submit">${icon('target')} ${esc(t('freeModal.open'))}</button>
        <button type="button" class="button ghost" data-action="close-modal">${esc(t('common.close'))}</button>
      </div>
    </div>
  `, 'free');
  setTimeout(() => $('#free-kb-input')?.focus(), 40);
}

async function submitFreeKill() {
  const input = $('#free-kb-input');
  const killId = parseKillId(input?.value);
  if (!killId) {
    const error = $('#free-error');
    if (error) error.textContent = t('freeModal.invalid');
    return;
  }
  location.assign(freeKillUrl(killId));
}

function renderManual() {
  const stats = state.stats || DEFAULT_STATS;
  const played = stats.played || {};
  const wins = stats.wins || {};
  const totalPlayed = Object.values(played).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const html = `
    <div class="modal manual" role="dialog" aria-modal="true" aria-labelledby="manual-title" data-kind="manual">
      <button type="button" class="modal-close" data-action="close-modal" aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      <div class="manual-head">
        <div class="panel-kicker">${icon('help')} // ${esc(t('header.help'))}</div>
        <h2 id="manual-title">${esc(t('help.title'))}</h2>
        <p>${esc(t('help.intro'))}</p>
      </div>
      <div class="manual-body">
        <div class="manual-column">
          <div class="manual-section">
            <h3>${icon('calendar')} ${esc(t('help.modesTitle'))}</h3>
            <div class="manual-mode-block">
              <h4>${esc(t('mode.daily'))}</h4>
              <p>${esc(t('help.dailyBody'))}</p>
            </div>
            <div class="manual-mode-block">
              <h4>${esc(t('mode.free'))}</h4>
              <p>${esc(t('mode.freeHint'))}</p>
              <ul class="manual-mode-list">${t('mode.helpFree').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
          </div>
          <div class="manual-section">
            <h3>${icon('layers')} ${esc(t('help.gameplayTitle'))}</h3>
            <div class="manual-mode-block">
              <h4>${esc(t('help.generalTitle'))}</h4>
              <ul class="manual-mode-list">${t('help.sharedRules').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
            <div class="manual-mode-block">
              <h4>${esc(t('mode.standard'))}</h4>
              <p class="manual-mode-hint">${esc(t('mode.standardHint'))}</p>
              <ul class="manual-mode-list">${t('mode.helpNormal').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
            <div class="manual-mode-block">
              <h4>${esc(t('mode.abyss'))}</h4>
              <p class="manual-mode-hint">${esc(t('mode.abyssHint'))}</p>
              <ul class="manual-mode-list">${t('mode.helpAbyss').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
            <div class="manual-mode-block">
              <h4>${esc(t('mode.timed'))}</h4>
              <p class="manual-mode-hint">${esc(t('mode.timedHint'))}</p>
              <ul class="manual-mode-list">${t('mode.helpTimed').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
          </div>
          <div class="manual-section">
            <h3>${icon('globe')} ${esc(t('help.langTitle'))}</h3>
            <p>${esc(t('help.langBody'))}</p>
          </div>
        </div>
        <div class="manual-column">
          <div class="manual-section">
            <h3>${icon('slots')} ${esc(t('manual.settingsTitle'))}</h3>
            <div class="setting-row">
              <span>${esc(t('font.label'))}</span>
              <button type="button" class="font-switch-button" data-action="toggle-font-face" aria-label="${esc(t('font.switch'))}">
                ${esc(state.font === 'classic' ? t('font.classic') : state.font === 'triglavian' ? t('font.triglavian') : t('font.neue'))}
              </button>
            </div>
            <div class="setting-row">
              <span>${esc(t('settings.fontSize'))}</span>
              <div class="segmented">
                ${[['smallest', 'settings.sizeSmallest'], ['smaller', 'settings.sizeSmaller'], ['normal', 'settings.sizeNormal'], ['larger', 'settings.sizeLarger'], ['largest', 'settings.sizeLargest']].map(([value, key]) => `<button type="button" class="${state.fontSize === value ? 'is-active' : ''}" data-action="set-font-size" data-size="${value}" aria-pressed="${state.fontSize === value}">${esc(t(key))}</button>`).join('')}
              </div>
            </div>
            <button type="button" class="setting-toggle" data-action="toggle-empty-kb" role="switch" aria-checked="${state.allowEmptyKb}">
              <span>
                <strong>${esc(t('manual.emptyKb'))}</strong>
                <small>${esc(t('manual.emptyKbHelp'))}</small>
              </span>
              <i class="toggle-track" aria-hidden="true"><b></b></i>
            </button>
          </div>
          <div class="manual-section">
            <h3>${icon('database')} ${esc(t('help.statsTitle'))}</h3>
            <div class="stats-mode-grid">
              ${[['standard', t('mode.standard')], ['abyss', t('mode.abyss')], ['timed', t('mode.timed')]].map(([mode, label]) => `
                <div class="stats-mode">
                  <span>${esc(label)}</span>
                  <strong>${Number(played[mode]) || 0} / ${Number(wins[mode]) || 0}</strong>
                  <small>${esc(t('help.statPlayed'))} / ${esc(t('help.statWon'))}</small>
                </div>`).join('')}
            </div>
            <div class="stats-grid stats-streak-grid">
              <div><span>${esc(t('help.statStreak'))}</span><strong>${stats.streak || 0}</strong></div>
              <div><span>${esc(t('help.statBest'))}</span><strong>${stats.maxStreak || 0}</strong></div>
            </div>
            ${totalPlayed ? '' : `<p class="stats-empty">${esc(t('help.statsEmpty'))}</p>`}
            <div style="margin-top:12px"><button type="button" class="button ghost reset-hold" data-action="reset-hold"><span class="reset-hold-label">${icon('refresh')} ${esc(t('help.resetRecord'))}</span></button></div>
          </div>
          <div class="manual-section manual-legal">
            <h3>${icon('external')} ${esc(t('footer.copyrightTitle'))}</h3>
            <p>${copyrightHtml()}</p>
          </div>
        </div>
      </div>
      <div class="manual-footer">
        <span class="left"><b>FITDLE</b></span>
        <span>v${esc(state.manifest?.version || '0.1.0')} · SDE ${esc(state.manifest?.sde?.buildNumber || state.manifest?.sde?.generatedAt || '—')}${state.manifest?.zkillboard?.snapshot ? ` · ZKILL ${esc(state.manifest.zkillboard.snapshot)}` : ''}</span>
      </div>
    </div>
  `;
  openModal(html, 'manual');
}

// ---------------------------------------------------------------------------
// Toasts, clipboard, language, lifecycle
// ---------------------------------------------------------------------------

function showToast(title, body = '', type = 'info', timeout = 3600) {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast is-${type}`;
  const content = document.createElement('div');
  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title;
  content.append(titleEl);
  if (body) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'toast-body';
    bodyEl.textContent = body;
    content.append(bodyEl);
  }
  el.append(content);
  root.append(el);
  while (root.children.length > 4) root.firstElementChild?.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 280);
  }, timeout);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the legacy path
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

async function copyFreeShare() {
  if (!isFree()) return;
  const ok = await copyText(shareLink());
  if (ok) showToast(t('toast.copied'), '', 'success');
  else showToast(t('toast.copyFailed'), '', 'error');
}

async function copyShare() {
  const ok = await copyText(shareLink());
  if (ok) {
    showToast(t('toast.copied'), '', 'success');
  } else {
    showToast(t('toast.copyFailed'), '', 'error');
    const input = $('#share-url');
    if (input) {
      input.focus();
      input.select();
    }
  }
}

function playToday() {
  const url = new URL(location.href);
  url.searchParams.delete('d');
  url.searchParams.delete('kb');
  url.searchParams.delete('killmail');
  url.searchParams.delete('kill');
  location.href = url.toString();
}

function resetAllProgress() {
  state.resetting = true;
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = null;
  state.timerStarted = false;
  state.timerStartAt = 0;
  state.timerElapsedMs = 0;
  state.gaveUp = false;
  try {
    // Iterate backwards: localStorage.length changes as keys are removed.
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key && key.startsWith('fitdle:v1:')) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  location.reload();
}

async function changeLocale(nextLocale) {
  if (!isLocale(nextLocale) || nextLocale === state.locale || state.localeLoading) return;
  const previous = state.locale;
  state.localeLoading = true;
  renderChrome();
  try {
    state.locale = nextLocale;
    state.i18n = createI18n(nextLocale);
    await loadLocaleData(nextLocale);
    state.index = buildSearchIndex(state.catalog, state.refs.groups, {
      races: state.refs.races, factions: state.refs.factions, locale: state.locale, aliases: state.searchAliases,
    });
    try {
      localStorage.setItem('fitdle:v1:lang', nextLocale);
    } catch {
      // ignore
    }
    const modalKind = state.modal?.kind;
    if (modalKind) closeModal();
    state.localeLoading = false;
    if (state.selectedId && state.catalogMap.has(state.selectedId)) {
      state.inputValue = displayName(state.catalogMap.get(state.selectedId));
    } else {
      state.selectedId = null;
    }
    renderShell();
    renderAll();
    if (modalKind === 'debrief') renderDebrief();
    if (modalKind === 'manual') renderManual();
    showToast(t('toast.langChanged', { lang: LOCALE_META[nextLocale].label }), '', 'info', 2400);
  } catch (err) {
    console.error(err);
    state.locale = previous;
    state.i18n = createI18n(previous);
    state.localeLoading = false;
    try {
      await loadLocaleData(previous);
    } catch {
      // keep the current screen
    }
    renderShell();
    renderAll();
    showToast(t('error.title'), t('error.body'), 'error');
  }
}

function startTicker() {
  const update = () => {
    const now = serverNow();
    const currentDay = gameDateKey(now, state.manifest?.downtimeUtcHour || 11);
    const dayChanged = currentDay !== state.today;
    if (dayChanged) {
      state.today = currentDay;
      if (!isFree()) {
        if (state.date !== state.today && !state.newTargetAvailable) {
          state.newTargetAvailable = true;
          showToast(t('toast.newPuzzle'), '', 'warn', 5000);
        }
        renderChrome();
        renderHero();
      }
    }
    const countdown = $('#countdown');
    if (countdown) {
      if (isFree()) countdown.textContent = t('free.badge');
      else countdown.textContent = nextDowntime();
    }
    const heroTimer = $('#hero-timer');
    if (heroTimer) {
      heroTimer.innerHTML = isFree()
        ? esc(t('free.kicker'))
        : `${esc(t('header.reset'))} <strong>${esc(nextDowntime())}</strong>`;
    }
    const dbNext = $('#debrief-next');
    if (dbNext) dbNext.innerHTML = isFree()
      ? `<span>${esc(t('free.kicker'))}</span><strong>${esc(t('free.next'))}</strong>`
      : `<span>${esc(t('end.next'))}</span><strong>${esc(nextDowntime())}</strong>`;
  };
  update();
  setInterval(update, 1000);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

let timerPressTimer = null;
let timerPressButton = null;
function clearTimerPress() {
  if (timerPressTimer) clearTimeout(timerPressTimer);
  timerPressTimer = null;
  if (timerPressButton) timerPressButton.classList.remove('is-holding');
  timerPressButton = null;
  if (state.status === 'playing') state.timerHoldStart = 0;
}
document.addEventListener('pointerdown', (event) => {
  if (!isTimed() || !state.timerStarted || state.status !== 'playing') return;
  if (event.button !== 0) return;
  const button = event.target.closest('.timed-clock-button');
  if (!button) return;
  clearTimerPress();
  timerPressButton = button;
  state.timerHoldStart = Date.now();
  button.classList.remove('is-holding');
  void button.offsetWidth;
  button.classList.add('is-holding');
  timerPressTimer = setTimeout(() => {
    timerPressTimer = null;
    timerPressButton = null;
    button.classList.remove('is-holding');
    giveUpTimed();
  }, 3000);
});
for (const name of ['pointerup', 'pointercancel', 'blur']) {
  window.addEventListener(name, clearTimerPress);
}
window.addEventListener('resize', syncBoardHeight);

let resetHoldTimer = null;
let resetHoldButton = null;

function clearResetHold() {
  if (resetHoldTimer) clearTimeout(resetHoldTimer);
  resetHoldTimer = null;
  if (resetHoldButton) resetHoldButton.classList.remove('is-holding');
  resetHoldButton = null;
}

function beginResetHold(button) {
  if (!button) return;
  if (resetHoldButton === button && resetHoldTimer) return;
  clearResetHold();
  resetHoldButton = button;
  button.classList.add('is-holding');
  resetHoldTimer = setTimeout(() => {
    resetHoldTimer = null;
    button.classList.remove('is-holding');
    resetAllProgress();
  }, 5000);
}

document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const button = event.target.closest('[data-action="reset-hold"]');
  if (!button) return;
  event.preventDefault();
  beginResetHold(button);
});
for (const name of ['pointerup', 'pointercancel', 'blur']) {
  window.addEventListener(name, clearResetHold);
}
document.addEventListener('keydown', (event) => {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  const button = event.target.closest('[data-action="reset-hold"]');
  if (!button) return;
  event.preventDefault();
  beginResetHold(button);
});
document.addEventListener('keyup', (event) => {
  if (event.key === ' ' || event.key === 'Enter') clearResetHold();
});


document.addEventListener('click', (event) => {
  if (event.target.closest('[data-mass-toggle]')) {
    toggleMassUnit();
    return;
  }
  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'start-timed') { startTimedRun(); return; }
    if (action === 'free-mode' || action === 'free-refresh') { enterFreeMode(); return; }
    if (action === 'free-input') { openFreeModal(); return; }
    if (action === 'free-share') { void copyFreeShare(); return; }
    if (action === 'free-submit') { void submitFreeKill(); return; }
    if (action === 'toggle-empty-kb') { setAllowEmptyKb(!state.allowEmptyKb); return; }
    if (action === 'set-font') { setFontStyle(actionEl.dataset.font); return; }
    if (action === 'set-font-size') { setFontSize(actionEl.dataset.size); return; }
    if (action === 'font-secret') { secretFontClick(); return; }
    if (action === 'toggle-font-face') { toggleFontFace(); return; }
    if (action === 'help') { renderManual(); return; }
    if (action === 'submit') { submitGuess(); return; }
    if (action === 'debrief') { renderDebrief(); return; }
    if (action === 'new-clue') { scrollToNewClue(actionEl.dataset.direction); return; }
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'copy-share') { copyShare(); return; }
    if (action === 'play-today') { playToday(); return; }
    if (action === 'toggle-font') { toggleFont(); return; }
    if (action === 'set-mode') { setMode(actionEl.dataset.mode); return; }
    if (action === 'go-back') { goBack(); return; }
  }
  const suggestion = event.target.closest('[data-ship-id]');
  if (suggestion) {
    const ship = state.catalogMap.get(Number(suggestion.dataset.shipId));
    if (ship) selectSuggestion(ship);
    return;
  }
  const root = $('#modal-root');
  if (root?.classList.contains('is-open') && event.target === root) closeModal();
  if (!event.target.closest('.search-wrap')) hideSuggestions();
});

document.addEventListener('input', (event) => {
  if (event.target.id !== 'ship-input') return;
  setInputValue(event.target.value);
});

document.addEventListener('compositionstart', (event) => {
  if (event.target.id === 'ship-input') state.composing = true;
});
document.addEventListener('compositionend', (event) => {
  if (event.target.id !== 'ship-input') return;
  state.composing = false;
  setInputValue(event.target.value);
});

document.addEventListener('keydown', (event) => {
  if (event.target.closest('[data-mass-toggle]') && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    toggleMassUnit();
    return;
  }
  if (state.modal) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key === 'Enter' && state.modal?.kind === 'free') {
      event.preventDefault();
      void submitFreeKill();
      return;
    }
    if (event.key === 'Tab') {
      const root = $('#modal-root');
      const focusables = $$('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])', root).filter((el) => !el.disabled && el.offsetParent !== null);
      if (focusables.length) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    return;
  }
  if (event.target.id !== 'ship-input') return;
  if (event.isComposing || state.composing) return;
  if (event.key === 'ArrowDown') {
    if (!state.suggestions.length) return;
    event.preventDefault();
    state.activeSuggestion = (state.activeSuggestion + 1) % state.suggestions.length;
    renderSuggestions();
  } else if (event.key === 'ArrowUp') {
    if (!state.suggestions.length) return;
    event.preventDefault();
    state.activeSuggestion = (state.activeSuggestion - 1 + state.suggestions.length) % state.suggestions.length;
    renderSuggestions();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (exactShip(state.inputValue)) {
      submitGuess();
    } else if (state.suggestions[state.activeSuggestion]) {
      selectSuggestion(state.suggestions[state.activeSuggestion]);
    } else {
      submitGuess();
    }
  } else if (event.key === 'Escape') {
    hideSuggestions();
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'lang-select') changeLocale(event.target.value);
});

document.addEventListener('focusin', (event) => {
  if (event.target.id === 'ship-input' && state.inputValue.trim()) renderSuggestions();
});

window.addEventListener('scroll', () => {
  if (!$('#suggestions')?.hidden) positionSuggestions();
  scheduleNewClueHint();
}, true);
window.addEventListener('resize', () => {
  if (!$('#suggestions')?.hidden) positionSuggestions();
  scheduleNewClueHint();
});

window.addEventListener('pagehide', () => {
  abandonFreeRound();
  if (state.status && state.answerId && !state.resetting) persist();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

class NoTargetError extends Error {
  constructor() {
    super('no-target');
    this.name = 'NoTargetError';
  }
}

class UnknownHullError extends Error {
  constructor() {
    super('unknown-hull');
    this.name = 'UnknownHullError';
  }
}

function showFatal(error) {
  console.error(error);
  const app = $('#app');
  if (!app) return;
  if (error instanceof UnknownHullError) {
    app.innerHTML = `<div class="fatal-screen">
      <div class="fatal-glyph">${icon('radar')}</div>
      <div class="fatal-code">${esc(t('error.unknownHullCode'))}</div>
      <h1>${esc(t('error.unknownHullTitle'))}</h1>
      <p>${esc(t('error.unknownHullBody'))}</p>
      <div class="fatal-actions">
        <button class="button primary fatal-back" type="button" data-action="go-back">${icon('arrowRight')} ${esc(t('error.back'))}</button>
      </div>
    </div>`;
    return;
  }
  if (error instanceof NoTargetError) {
    app.innerHTML = `<div class="fatal-screen">
      <div class="fatal-glyph">${icon('alert')}</div>
      <div class="fatal-code">${esc(t('error.noTargetCode'))}</div>
      <h1>${esc(t('error.noTargetTitle'))}</h1>
      <p>${esc(t('error.noTargetBody'))}</p>
      <div class="fatal-actions">
        <button class="button primary" type="button" data-action="free-mode">${icon('radar')} ${esc(t('error.freeMode'))}</button>
        <button class="button" type="button" onclick="location.reload()">${icon('refresh')} ${esc(t('error.retry'))}</button>
      </div>
    </div>`;
    return;
  }
  app.innerHTML = `<div class="fatal-screen">
    <div class="fatal-glyph">${icon('alert')}</div>
    <div class="fatal-code">${esc(t('error.title'))}</div>
    <h1>${esc(t('error.title'))}</h1>
    <p>${esc(t('error.body'))}</p>
    <button class="button primary" type="button" onclick="location.reload()">${icon('refresh')} ${esc(t('error.retry'))}</button>
  </div>`;
}

function goBack() {
  if (history.length > 1) history.back();
  else location.replace(BASE.href);
}

async function boot() {
  initStarfield($('#starfield'));
  captureUrlLocale();
  state.locale = detectLocale();
  state.i18n = createI18n(state.locale);
  await applyBootFlavor();
  state.fontClicks = readFontClicks();
  state.allowEmptyKb = readAllowEmptyKb();
  try {
    const storedFont = localStorage.getItem('fitdle:v1:font');
    applyFont(storedFont === 'classic' || storedFont === 'triglavian' ? storedFont : 'neue');
  } catch {
    applyFont('neue');
  }
  state.fontSize = readFontSize();
  applyFontSize(state.fontSize);
  try {
    const manifest = await fetchJson('data/manifest.json');
    state.manifest = manifest;
    state.dataVersionKey = `${manifest.dataVersion}:${manifest.clueVersion || 1}`;
    await fetchInternetTime();
    const catalog = await fetchJson('data/catalog.json');
    state.catalog = catalog.ships;
    state.catalogMap = new Map(state.catalog.map((ship) => [ship.id, ship]));
    state.searchAliases = await fetchJson('data/search.json').catch(() => null);
    state.watchlist = await fetchJson('assets/watchlist.json').catch(() => null);
    state.timed = timedFromLocation(location.search);
    state.mode = state.timed ? 'normal' : modeFromLocation(location.search);
    {
      const canonical = new URL(location.href);
      canonical.searchParams.delete('mode');
      canonical.searchParams.delete('timer');
      canonical.searchParams.delete('timed');
      if (state.timed) canonical.searchParams.set('rule', 'timed');
      else if (state.mode === 'abyss') canonical.searchParams.set('rule', 'abyss');
      else canonical.searchParams.delete('rule');
      if (canonical.href !== location.href) history.replaceState(null, '', canonical);
    }
    document.documentElement.dataset.gameMode = state.mode;
    document.documentElement.dataset.timed = state.timed ? '1' : '0';

    const now = serverNow();
    const resetHour = manifest.downtimeUtcHour || 11;
    state.today = gameDateKey(now, resetHour);
    state.utcDate = now.toISOString().slice(0, 10);
    const freeTarget = freeKillFromLocation(location.search);
    const bootParams = new URLSearchParams(location.search);
    const freeNonce = bootParams.get('n') || '';
    const legacyFree = bootParams.get('free') === '1';
    state.freeFromRefresh = false;
    if (freeNonce) {
      if (freeTarget?.id) {
        state.freeFromRefresh = consumeFreeIntent(freeNonce, freeGameplayKey());
      } else {
        state.freeFromRefresh = freeIntentMatches(freeNonce, freeGameplayKey());
      }
    }
    state.freeRequested = Boolean(
      (freeNonce && state.freeFromRefresh)
      || (!freeTarget?.id && legacyFree),
    );
    state.freeKillId = freeTarget?.id || null;
    state.freeKillToken = freeTarget?.token || null;
    state.date = state.freeKillId ? `free-${state.freeKillToken}` : state.today;
    const staleDate = new URL(location.href);
    if (staleDate.searchParams.has('d')) {
      staleDate.searchParams.delete('d');
      history.replaceState(null, '', staleDate);
    }
    if (freeTarget?.legacy) {
      const clean = new URL(location.href);
      clean.searchParams.set('kb', state.freeKillToken);
      history.replaceState(null, '', clean);
    }
    state.locale = detectLocale();
    if (!isLocale(state.locale) || !manifest.locales.includes(state.locale)) state.locale = manifest.defaultLocale || 'en';
    state.i18n = createI18n(state.locale);
    state.stats = settleStats(loadStats(localStorage), state.today);
    state.freeStreaks = loadFreeStreaks();
    saveStats(localStorage, state.stats);

    if (state.freeRequested && !state.freeKillId) {
      const kill = await pickRandomFreeKill();
      if (kill) {
        location.replace(freeKillUrl(
          kill.killmail_id,
          state.freeFromRefresh,
          state.freeFromRefresh ? freeNonce : '',
        ));
        return;
      }
      showToast(t('free.randomFailed'), '', 'warn', 5000);
      clearFreeIntent();
      const clean = new URL(location.href);
      clean.searchParams.delete('free');
      clean.searchParams.delete('n');
      history.replaceState(null, '', clean);
    }

    const rawFree = new URLSearchParams(location.search).get('kb')
      || new URLSearchParams(location.search).get('killmail')
      || new URLSearchParams(location.search).get('kill');
    if (rawFree && !state.freeKillId) {
      const clean = new URL(location.href);
      for (const key of ['kb', 'killmail', 'kill', 'n']) clean.searchParams.delete(key);
      history.replaceState(null, '', clean);
    }
    let freeReady = false;
    if (state.freeKillId) {
      try {
        const data = await fetchZkill(`/api/killID/${state.freeKillId}/`, {
          key: `kill:${state.freeKillId}`,
          ttlMs: 3600000,
        });
        const killmail = Array.isArray(data) ? data[0] : null;
        if (!killmail?.victim?.ship_type_id) throw new Error('free target unavailable');
        if (!state.allowEmptyKb && !killHasFittedModules(killmail)) throw new Error('empty free target');
        state.freeKillmail = killmail;
        state.answerId = Number(killmail.victim.ship_type_id);
        state.answerKillId = state.freeKillId;
        state.answerShip = state.catalogMap.get(state.answerId);
        if (!state.answerShip) throw new UnknownHullError();
        freeReady = true;
        try {
          const daily = await resolveDailySelection();
          if (daily && Number(daily.killmail.killmail_id) === Number(state.freeKillId)) {
            state.freeKillId = null;
            state.freeKillToken = null;
            state.freeKillmail = null;
            state.freeRequested = false;
            state.date = state.today;
            freeReady = false;
            const clean = new URL(location.href);
            for (const key of ['kb', 'killmail', 'kill', 'free', 'n', 't']) clean.searchParams.delete(key);
            history.replaceState(null, '', clean);
          }
        } catch {
          // A daily lookup failure must not block the requested free target.
        }
      } catch (error) {
        if (error instanceof UnknownHullError) throw error;
        state.freeKillId = null;
        state.freeKillToken = null;
        state.freeKillmail = null;
        state.date = state.today;
        const clean = new URL(location.href);
        for (const key of ['kb', 'killmail', 'kill', 'n']) clean.searchParams.delete(key);
        history.replaceState(null, '', clean);
      }
    }
    if (!freeReady) {
      state.freeKillId = null;
      state.freeKillToken = null;
      state.freeKillmail = null;
      state.date = state.today;
      const target = await resolveDailySelection();
      state.answerId = Number(target.shipId);
      state.answerKillId = Number(target.killmail.killmail_id);
      state.answerShip = state.catalogMap.get(state.answerId);
    }
    await loadLocaleData(state.locale);

    const restored = readStoredState();
    if (!isFree() && restored.invalidated) {
      state.guesses = [];
      state.status = 'playing';
      state.timerStarted = false;
      state.timerStartAt = 0;
      state.timerElapsedMs = 0;
      state.gaveUp = false;
      state.timedExpired = false;
      persist();
    } else {
      state.guesses = restored.guesses || [];
      state.status = restored.status || 'playing';
      state.timerStarted = isTimed() && state.status === 'playing' && restored.timerStarted === true;
      state.timerStartAt = Number(restored.timerStartAt) || 0;
      state.timerElapsedMs = Number(restored.timerElapsedMs) || 0;
      if (state.timerStarted && !state.timerStartAt) state.timerStartAt = Date.now() - state.timerElapsedMs;
      state.gaveUp = isTimed() && state.status === 'lost' && restored.gaveUp === true;
      state.timedExpired = isTimed() && state.status === 'lost' && restored.timedExpired === true;
    }
    if (isFree()) initFreeRound();
    if (freeNonce || bootParams.has('free')) {
      const clean = new URL(location.href);
      clean.searchParams.delete('n');
      clean.searchParams.delete('free');
      if (clean.href !== location.href) history.replaceState(null, '', clean);
    }
    if (statsEligible() && (
      state.guesses.length > 0
      || (isTimed() && state.timerStarted)
      || state.status !== 'playing'
    )) {
      recordDailyPlay();
      if (state.status !== 'playing') recordDailyResult();
    }
    recomputeRevealed();
    state.fresh = new Set();
    state.inputValue = '';
    state.selectedId = null;

    renderShell();
    renderAll();
    if (state.status === 'playing' && state.guesses.length === 0 && state.revealed.size) {
      // Initial reveals count as unseen too: if the dossier starts below the
      // fold, point the player to the first batch of intel.
      for (const index of state.revealed) state.unseen.add(index);
      updateNewClueHint();
    }
    if (isTimed()) {
      resumeTimedClock();
      markTimedForfeited();
    }

    if (!state.timeVerified) showToast(t('error.time'), '', 'warn', 5200);
    if (state.liveError) showToast(t('error.zkb'), '', 'warn', 5200);
    if (restored.invalidated) showToast(t('error.oldState'), '', 'warn', 4600);
    if (state.status !== 'playing') {
      state.visibleCount = state.answerData.clues.length;
      renderAll();
    }
    state.booted = true;
    startTicker();
  } catch (error) {
    showFatal(error);
  }
}

boot();
