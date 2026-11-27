import {
  ATTEMPT_LIMIT,
  buildGuessResult,
  buildSearchIndex,
  claimCaseNumber,
  ycDateLabel,
  freeKillIdFromToken,
  formatGameDayStart,
  formatMass,
  freeKillToken,
  gameDateKey,
  killHasFittedModules,
  loadState,
  modeFromLocation,
  msUntilNextDowntime,
  normalizeText,
  saveState,
  searchShips,
  weightedHullOrder,
  weightedRendezvousOrder,
} from './game.js';
import { claimGroups, claimSeed, pickClaimDebrief, pickClaimGroup, pickClaimMemo } from './claim.js';
import { detectLocale, createI18n, isLocale, LOCALES, LOCALE_META } from './i18n.js';
import { buildClues, auditSimulationItems, getEquipment, selectAuditFallbacks, EQUIPMENT_SLOT_ORDER } from './clues.js';
import { retryAfterMs } from './retry-after.js';
import { slimKillmails } from './killmail.js';
import { buildUserAgent, publicSite } from './user-agent.js';
import { calculateDogmaBaseline, calculateDogmaFit, preloadDogma } from './dogma.js';
import { buildRevealPlan, computeRevealed, computeTimedRevealed } from './reveal.js';
import {
  ARBITRATION_SCORING,
  arbitrationSolvePoints,
  arbitrationDealerRoundRaw,
  arbitrationEndBonusRaw,
} from './mp/rules.js';
import { CATEGORY_ICON, icon } from './icons.js';
import { api } from './api.js';
import { avatarHtml } from './avatar.js';
import { brandLogoHtml, fitdleMark, FITDLE_SYSTEM_LONG, PEND_INSURANCE_ID, SCC_ID } from './brand.js';
import { legalNotice } from './legal-copy.js';
import { TRIGLAVIAN_CONVOCATION_ID, TRIGLAVIAN_FACTION_ID, triglavianBrand, triglavianDepartments } from './triglavian-copy.js';
import { RoomSurface } from './rooms.js';
import { RunSync, mergeGuesses } from './run-sync.js';
import { resolveShipQuery } from './ship-query.js';

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
  catalogLocale: '',
  refs: null,
  liveStats: null,
  liveLosses: [],
  liveError: false,
  liveFetched: false,
  insurancePrices: null,
  insurancePromise: null,
  insuranceLoaded: false,
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
  victimEsiWarningKey: null,
  mode: 'normal',
  appMode: 'practice',
  gameplay: 'standard',
  auth: { loading: true, loggedIn: false, name: '', characterId: null },
  profileStats: null,
  onlineRun: null,
  // Online runs: the shipId of a guess the service has not answered yet.
  pendingGuess: null,
  // A masked Timed run given up, until the service confirms it.
  pendingEnd: false,
  // The last Timed release a masked run asked the service for.
  timedPolled: 0,
  onlineFinished: false,
  newTargetBusy: false,
  roomRequest: null,
  roomCode: null,
  roomSurface: null,
  roomView: null,
  roomArbitration: null,
  arbSeenMatchId: '',
  arbSeenPublished: new Set(),
  arbFresh: new Set(),
  arbFreshRound: null,
  arbRadarTimer: null,
  roomEndless: null,
  roomEntry: null,
  loginRequired: false,
  serverAnchor: null,
  monotonicAnchor: 0,
  timeVerified: false,
  dailySeed: null,
  dailyKillmail: null,
  gameDayStartMinutes: 11 * 60,
  kbSelectionStartDate: '',
  index: [],
  locale: 'en',
  i18n: null,
  massUnit: 't',
  kbValueCompact: false,
  payoutFrame: 0,
  date: null,
  today: null,
  targetGameDay: '',
  answerId: null,
  answerKillId: null,
  answerKillmail: null,
  targetSource: '',
  freeKillId: null,
  freeKillToken: null,
  freeKillmail: null,
  answerShip: null,
  answerData: null,
  claimDepartments: null,
  claimDepartmentId: '',
  claimDepartment: null,
  claimMemo: '',
  dataVersionKey: null,
  guesses: [],
  status: 'playing',
  visibleCount: 0,
  revealed: new Set(),
  fresh: new Set(),
  initialFreshDone: false,
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
  suggestionChosen: false,
  arbSignature: '',
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
  salvageNoiseTimer: null,
  lastRevealSize: 0,
  clueScanTimer: null,
  resetting: false,
};

const BASE = new URL('.', document.baseURI);
const JSON_CACHE = new Map();

const DEBUG_DETAIL_KEYS = new Set(['request', 'relay', 'round', 'reason', 'phase', 'attempt', 'fatal']);

function safeRequest(value) {
  if (!value) return null;
  const raw = String(value);
  try {
    if (/^https?:/i.test(raw)) {
      const url = new URL(raw);
      return `${url.origin}${url.pathname}`;
    }
  } catch {
    // fall through to a query-stripped path
  }
  return raw.split('?')[0].split('#')[0];
}

function safeDebugText(value) {
  return String(value ?? '')
    .replace(/([?&](?:kb|n|token|nonce|session|key|auth)=)[^&\s]+/gi, '$1<redacted>')
    .replace(/\bhttps?:\/\/[^\s]+/gi, (url) => safeRequest(url) || '<url>');
}

function debugLog(context, error = null, details = {}) {
  const status = Number(error?.status) || 0;
  const payload = {
    context,
    name: error?.name || null,
    message: safeDebugText(error?.message || error || ''),
    status: status || null,
    source: error?.source || null,
    request: safeRequest(error?.request || details.request),
    retryable: error?.retryable ?? null,
  };
  if (error?.cause) {
    payload.cause = {
      name: error.cause.name || null,
      message: safeDebugText(error.cause.message || ''),
      status: Number(error.cause.status) || null,
      source: error.cause.source || null,
      request: safeRequest(error.cause.request),
    };
  }
  for (const [key, value] of Object.entries(details)) {
    if (!DEBUG_DETAIL_KEYS.has(key)) continue;
    payload[key] = key === 'request' ? safeRequest(value) : value;
  }
  // KB/ESI request targets and statuses are public. Never include client-local
  // state, tokens/nonces, full query URLs, or browser/device information.
  const write = details.fatal || status >= 500 || status === 429 || !error
    ? console.error
    : console.warn;
  write('[FITDLE]', payload);
}

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

function tl(key, fallback, vars = {}) {
  const value = t(key, vars);
  return value === key ? fallback : value;
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

function iskFull(n) {
  return state.i18n.iskFull(n);
}

function pct(n) {
  return state.i18n.percent(n);
}

function serverNow() {
  if (state.serverAnchor == null) return new Date();
  return new Date(state.serverAnchor + (performance.now() - state.monotonicAnchor));
}

function nextDowntime() {
  return state.i18n.duration(msUntilNextDowntime(serverNow(), gameDayStartMinutes()));
}

function dailyResetReady() {
  return state.appMode === 'online'
    && state.gameplay === 'daily'
    && Boolean(state.targetGameDay)
    && state.targetGameDay !== state.today;
}

function claimFileId() {
  // An online run's file number comes from the service; it does not name the killmail.
  const caseId = onlineBoard()?.caseId;
  return claimCaseNumber({
    gameplay: state.gameplay,
    day: state.today,
    killId: caseId ? null : state.answerKillId,
    killHash: caseId || state.answerKillmail?.zkb?.hash,
  });
}

async function applyBootFlavor() {
  if (isTriglavianBrand()) {
    const brand = triglavianBrand(state.locale);
    const status = $('.boot-status');
    const sub = $('.boot-sub');
    if (status) status.textContent = brand.faction;
    if (sub) sub.textContent = brand.convocation;
    return;
  }
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

function activeBrandLogos() {
  if (isTriglavianBrand()) {
    const brand = triglavianBrand(state.locale);
    return {
      first: { id: TRIGLAVIAN_FACTION_ID, alt: brand.faction, fallback: 'TC' },
      second: { id: TRIGLAVIAN_CONVOCATION_ID, alt: brand.convocation, fallback: 'CT' },
    };
  }
  return {
    first: { id: PEND_INSURANCE_ID, alt: 'Pend Insurance', fallback: 'PI' },
    second: { id: SCC_ID, alt: 'Secure Commerce Commission', fallback: 'SCC' },
  };
}

function renderBootLogos() {
  const host = $('[data-boot-logos]');
  const baseUrl = state.manifest?.images?.baseUrl || '';
  if (!host || !baseUrl) return;
  const logos = activeBrandLogos();
  host.innerHTML = [
    brandLogoHtml({
      corporationId: logos.first.id,
      baseUrl,
      size: 128,
      alt: logos.first.alt,
      fallback: logos.first.fallback,
    }),
    '<span class="boot-logo-divider" aria-hidden="true">//</span>',
    brandLogoHtml({
      corporationId: logos.second.id,
      baseUrl,
      size: 128,
      alt: logos.second.alt,
      fallback: logos.second.fallback,
    }),
  ].join('');
}

async function loadClaimDepartments() {
  try {
    const { locale } = state;
    if (state.claimDepartments?.[locale]) return;
    // One small file per language; the complete one is the fallback.
    const data = await fetchJson(`assets/claim-departments/${locale}.json`)
      .catch(() => fetchJson('assets/claim-departments.json'));
    if (data.departments && typeof data.departments === 'object') {
      state.claimDepartments = { ...state.claimDepartments, ...data.departments };
    }
  } catch {
    // The generic sender and debrief stand in.
  }
}

function claimDepartmentPool() {
  if (isTriglavianBrand()) return triglavianDepartments(state.locale);
  return claimGroups(state.claimDepartments, state.locale);
}

function currentClaimSeed(seed = null) {
  const caseId = onlineBoard()?.caseId;
  if (caseId) return claimSeed({ killId: `case:${caseId}` });
  return claimSeed({
    killId: seed ?? state.answerKillId,
    killmailId: state.answerKillmail?.killmail_id,
    day: state.today,
  });
}

function pickClaimDepartment(preserveId = false, seed = null) {
  const pool = claimDepartmentPool();
  if (!pool.length) {
    state.claimDepartmentId = '';
    state.claimDepartment = null;
    state.claimMemo = '';
    return;
  }

  const selectionSeed = currentClaimSeed(seed);
  const chosen = pickClaimGroup(pool, selectionSeed, preserveId ? state.claimDepartmentId : '');
  state.claimDepartmentId = chosen.id;
  state.claimDepartment = chosen;
  state.claimMemo = pickClaimMemo(chosen, selectionSeed);
}

function claimDebriefForStatus() {
  if (state.status !== 'won' && state.status !== 'lost') return '';
  return pickClaimDebrief(state.claimDepartment, state.status, currentClaimSeed());
}

/** Custom killmails are played online but never recorded. */
function isScored() {
  return state.appMode === 'online' && state.onlineRun?.kind !== 'custom';
}

function isFree() {
  return Boolean(state.freeKillId);
}

/**
 * An online run whose answer stays on the service: the page holds only the
 * board the service sent (released clues, kinds of the open-board ones and the
 * match of each guess) until the run has ended.
 */
function isMasked() {
  return state.targetSource === 'online' && Boolean(state.onlineRun?.board);
}

function onlineBoard() {
  return isMasked() ? state.onlineRun.board : null;
}

function isTriglavianBrand() {
  return state.font === 'triglavian';
}

function brandText(key) {
  if (!isTriglavianBrand()) return t(key);
  const brand = triglavianBrand(state.locale);
  const map = {
    'brand.parent': brand.faction,
    'brand.claimDivision': brand.convocation,
    'brand.scc': brand.convocation,
    'app.subtitle': brand.subtitle,
    'app.description': brand.description,
    'hero.kicker': brand.kicker,
    'help.intro': brand.helpIntro,
    'help.sourceBody': brand.sourceBody,
    'share.tagline': brand.tagline,
    'claim.disclaimer': brand.disclaimer,
    'claim.scc': brand.scc,
    'claim.fromValue': brand.convocation,
  };
  return map[key] ?? t(key);
}

function refreshBrandUI() {
  if (!state.booted) return;
  pickClaimDepartment();
  renderAll();
  if (document.querySelector('.modal[data-kind="manual"]')) renderManual();
}

const TARGET_CACHE_KEY = 'fitdle:v1:target-cache';

function targetCacheUser() {
  return state.auth.loggedIn ? `user:${state.auth.name}` : 'guest';
}

function readTargetCache() {
  try {
    const data = JSON.parse(localStorage.getItem(TARGET_CACHE_KEY) || 'null');
    if (!data || typeof data !== 'object' || !data.entries) return null;
    if (data.dataVersion !== state.dataVersionKey || data.gameDay !== state.today) return null;
    if (data.user !== targetCacheUser()) return null;
    return data;
  } catch {
    return null;
  }
}

function writeTargetCache(data) {
  try {
    if (!data || !Object.keys(data.entries || {}).length) {
      localStorage.removeItem(TARGET_CACHE_KEY);
      return;
    }
    localStorage.setItem(TARGET_CACHE_KEY, JSON.stringify(data));
  } catch {
    // best effort
  }
}

function cacheCurrentTarget() {
  // The service keeps an open masked run itself; the page has no target to keep.
  if (isMasked()) return;
  if (!state.answerKillmail || !state.answerKillId || state.roomCode || state.roomRequest) return;
  if (state.guesses.length || state.timerStarted || state.onlineFinished) return;
  const data = readTargetCache() || {
    dataVersion: state.dataVersionKey,
    gameDay: state.today,
    user: targetCacheUser(),
    entries: {},
  };
  data.entries[state.gameplay] = {
    source: state.targetSource,
    gameplay: state.gameplay,
    run: state.onlineRun,
    killId: state.answerKillId,
    shipId: state.answerId,
    killmail: state.answerKillmail,
    cachedAt: Date.now(),
  };
  writeTargetCache(data);
}

function dropCurrentTargetCache() {
  const data = readTargetCache();
  if (!data) return;
  delete data.entries[state.gameplay];
  writeTargetCache(data);
}

async function restoreCachedTarget(gameplay) {
  const data = readTargetCache();
  const entry = data?.entries?.[gameplay];
  if (!entry) return false;
  try {
    if (entry.source === 'online') {
      if (!entry.run?.runId) throw new Error('cached run missing');
      const run = await api.run(entry.run.runId);
      if (run?.board) throw new Error('the service keeps this run');
      if (!run || run.status !== 'playing' || run.begun) throw new Error('cached run consumed');
      if (run.gameplay !== gameplay) throw new Error('cached run gameplay changed');
      if (!run.target?.killmail) throw new Error('cached target missing');
      if (gameplay !== 'daily' && rejectsEmptyKb(run.target.killmail)) throw new Error('cached target is an empty hull');
      installTarget({
        killmail: run.target.killmail,
        shipId: run.target.shipId,
        killId: run.target.killId,
        run,
        source: 'online',
        free: false,
        cacheable: true,
      });
      return true;
    }
    if (!entry.killmail?.victim?.ship_type_id) throw new Error('cached practice target missing');
    if (rejectsEmptyKb(entry.killmail)) throw new Error('cached target is an empty hull');
    installTarget({
      killmail: entry.killmail,
      shipId: entry.shipId,
      killId: entry.killId,
      source: 'practice',
      free: true,
      cacheable: true,
    });
    return true;
  } catch (error) {
    debugLog('target cache', error);
    delete data.entries[gameplay];
    writeTargetCache(data);
    return false;
  }
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
  if (state.booted) refreshBrandUI();
  else if (state.font === 'triglavian') {
    const brand = triglavianBrand(state.locale);
    const status = $('.boot-status');
    const sub = $('.boot-sub');
    if (status) status.textContent = brand.faction;
    if (sub) sub.textContent = brand.convocation;
    for (const image of $$('[data-boot-logos] img')) {
      image.src = image.src
        .replace('/corporations/1000113/', `/corporations/${TRIGLAVIAN_FACTION_ID}/`)
        .replace('/corporations/1000132/', `/corporations/${TRIGLAVIAN_CONVOCATION_ID}/`);
      image.alt = image.src.includes(`/${TRIGLAVIAN_FACTION_ID}/`) ? brand.faction : brand.convocation;
    }
  }
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
    showToast(t('font.triglavianToast'), t('font.triglavianSub'), 'info');
    return;
  }
  applyFont(state.font === 'classic' ? 'neue' : 'classic', true);
}

function setFontSize(size) {
  applyFontSize(size, true);
  for (const button of $$('[data-action="set-font-size"]')) {
    const active = button.dataset.size === state.fontSize;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function syncFontControls() {
  const value = state.font === 'classic'
    ? t('font.classic')
    : state.font === 'triglavian'
      ? t('font.triglavian')
      : t('font.neue');
  for (const button of $$('[data-action="toggle-font"], [data-action="toggle-font-face"]')) {
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

/** Daily, rooms and explicit kb links use one fixed target for everyone. */
function emptyKbSettingApplies() {
  return state.gameplay !== 'daily'
    && !state.roomCode
    && !state.roomView
    && !new URL(location.href).searchParams.get('kb');
}

function rejectsEmptyKb(killmail) {
  return !state.allowEmptyKb && Boolean(killmail) && !killHasFittedModules(killmail);
}

function setAllowEmptyKb(enabled) {
  state.allowEmptyKb = Boolean(enabled);
  try {
    localStorage.setItem('fitdle:v1:allowEmptyKb', state.allowEmptyKb ? '1' : '0');
  } catch {
    // ignore
  }
  const current = state.liveLosses?.[0];
  // A started online run stays the same target, so there is nothing to reload.
  const started = state.appMode === 'online' && (state.guesses.length > 0 || state.timerStarted);
  // A masked target is unknown here: the service replaces it if it is an empty hull.
  const replace = isMasked() ? !state.allowEmptyKb && state.status === 'playing' : rejectsEmptyKb(current);
  if (!started && emptyKbSettingApplies() && replace) {
    location.reload();
    return;
  }
  for (const button of $$('[data-action="toggle-empty-kb"]')) {
    button.setAttribute('aria-checked', String(state.allowEmptyKb));
  }
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
  return state.mode === 'audit' || isTimed();
}

function storageMode() {
  return isTimed() ? `${state.mode}:timed` : state.mode;
}

function timedFromLocation(search) {
  const params = new URLSearchParams(search);
  return params.get('claim') === 'timed'
    || params.get('rule') === 'timed';
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
  if (isMasked()) {
    // The service's clock decides the releases and the end; ask it shortly after each one.
    const releases = Math.floor(currentElapsed() / 30000);
    if (state.timerStarted && state.status === 'playing' && releases > state.timedPolled) {
      state.timedPolled = releases;
      setTimeout(() => { void pollMaskedRun(); }, 1000);
    }
    return;
  }
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
      syncClueScan();
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

/** A masked Timed run: fetch the board the service's clock has reached. */
async function pollMaskedRun() {
  if (state.roomEndless) {
    if (isMasked() && state.status === 'playing') state.roomSurface?.requestBoard(state.roomEndless.roundId);
    return;
  }
  const runId = state.onlineRun?.runId;
  if (!runId || !isMasked() || state.status !== 'playing') return;
  try {
    const run = await api.run(runId);
    if (state.onlineRun?.runId === runId) applyServerRun(run);
  } catch (error) {
    debugLog('timed poll', error);
    if (isOutdatedPage(error)) showFatal(error);
  }
}

function startTimedRun() {
  if (!isTimed() || state.timerStarted || state.status !== 'playing') return;
  dropCurrentTargetCache();
  startTimedClock();
  if (isMasked()) {
    // The service starts its clock and answers with the opening clues.
    state.timedPolled = 0;
    state.timerHoldStart = 0;
    state.gaveUp = false;
    state.timedExpired = false;
    void runSync?.begin(state.onlineRun.runId, state.timerStartAt);
    renderAll();
    setTimeout(() => $('#ship-input')?.focus(), 80);
    return;
  }
  if (state.onlineRun?.runId) void runSync?.begin(state.onlineRun.runId, state.timerStartAt);
  state.timerHoldStart = 0;
  state.gaveUp = false;
  state.timedExpired = false;
  const before = new Set(state.revealed);
  recomputeRevealed();
  state.fresh = new Set([...state.revealed].filter((index) => isHighlightableClue(state.answerData?.clues?.[index])));
  renderAll();
  rememberNewClues(state.fresh);
  persist();
  setTimeout(() => $('#ship-input')?.focus(), 80);
}

function failTimedRun() {
  if (!isTimed() || !state.timerStarted || state.status !== 'playing') return;
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
  if (isMasked()) {
    const holdMs = state.timerHoldStart ? Math.max(0, Date.now() - state.timerHoldStart) : 0;
    const elapsed = Math.max(0, currentElapsed() - holdMs);
    state.timerHoldStart = 0;
    stopTimedClock();
    state.timerElapsedMs = elapsed;
    state.pendingEnd = true;
    // The service names the answer once it has recorded the loss.
    if (state.roomEndless) state.roomSurface?.sendLoss(state.roomEndless.roundId);
    else void runSync?.lose(state.onlineRun.runId, elapsed);
    renderAll();
    return;
  }
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

function zkillShipLink(text, id, faction = '') {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base || !Number(id) || !zkillLinksEnabled()) return esc(text);
  const attr = faction ? ` data-faction="${esc(faction)}"` : '';
  return `<a class="zkb-item-link"${attr} href="${esc(`${base}/ship/${Number(id)}/`)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
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
  const portrait = characterId && imageBase() && zkillBase
    ? `<a class="victim-portrait zkb-item-link" href="${esc(`${zkillBase}/character/${characterId}/`)}" target="_blank" rel="noopener noreferrer"><img src="${esc(`${imageBase()}/characters/${characterId}/portrait?size=64`)}" alt="${esc(t('dossier.victimAlt'))}" onerror="this.parentElement.remove()"></a>`
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

const HERO_FACTION_FONTS = Object.freeze({
  500003: 'amarr',
  500001: 'caldari',
  500004: 'gallente',
  500002: 'minmatar',
});

function heroTitleFaction(ship) {
  return HERO_FACTION_FONTS[Number(ship?.factionID)] || '';
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
  return `<span class="weight${zero ? ' is-zero' : ''}" data-tip="${esc(t('dossier.signal'))} ${esc(shown)}/10" tabindex="0" aria-label="${esc(t('dossier.signal'))} ${esc(shown)}/10">${Array.from({ length: 5 }, (_, i) => `<i class="${i < lit ? 'on' : ''}"></i>`).join('')}</span>`;
}

function categoryLabel(category) {
  return t(`cat.${category}`) || category;
}

function clueLabel(clue) {
  return t(`clue.${clue.k === 'cargoCapacity' ? 'cargo' : clue.k}`) || clue.k;
}

function moduleThumb(moduleID) {
  return `<span class="module-icon">
    <span class="fallback">?</span>
    <img src="${esc(moduleIconPath(moduleID))}" alt="" loading="eager" draggable="false" onload="this.parentElement.classList.add('has-icon')" onerror="this.remove()">
  </span>`;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function fetchJson(relative) {
  const cached = JSON_CACHE.get(relative);
  if (cached) return cached;
  // Cache the pending request so prefetches and their consumers share one
  // download; a failed request is dropped so the next caller retries.
  const pending = (async () => {
    const response = await fetch(new URL(relative, BASE), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${response.status} ${relative}`);
    return response.json();
  })();
  JSON_CACHE.set(relative, pending);
  try {
    return await pending;
  } catch (error) {
    if (JSON_CACHE.get(relative) === pending) JSON_CACHE.delete(relative);
    throw error;
  }
}

function prefetchJson(paths) {
  // Failures stay silent here: the code that needs the file reports them.
  for (const path of paths) fetchJson(path).catch(() => {});
}

const INSURANCE_CACHE_KEY = 'fitdle:v1:insurance-prices';
const INSURANCE_TTL_MS = 60 * 60 * 1000;

function readInsuranceCache() {
  try {
    const data = JSON.parse(localStorage.getItem(INSURANCE_CACHE_KEY) || 'null');
    if (!data || !data.prices || Date.now() - Number(data.at) > INSURANCE_TTL_MS) return null;
    return data.prices;
  } catch {
    return null;
  }
}

function writeInsuranceCache(prices) {
  try {
    localStorage.setItem(INSURANCE_CACHE_KEY, JSON.stringify({ at: Date.now(), prices }));
  } catch {
    // best effort
  }
}

async function loadInsurancePrices() {
  if (state.insuranceLoaded) return state.insurancePrices;
  if (state.insurancePromise) return state.insurancePromise;
  const cached = readInsuranceCache();
  if (cached) {
    state.insurancePrices = cached;
    state.insuranceLoaded = true;
    return cached;
  }
  const base = String(state.manifest?.esi?.baseUrl || '').replace(/\/+$/, '');
  if (!base) {
    state.insuranceLoaded = true;
    return null;
  }
  state.insurancePromise = esiFetch('/insurance/prices', 9000)
    .then(async (response) => {
      if (!response.ok) throw new Error(`insurance ${response.status}`);
      return response.json();
    })
    .then((rows) => {
      const prices = {};
      for (const row of Array.isArray(rows) ? rows : []) {
        const id = Number(row?.type_id);
        if (Number.isSafeInteger(id) && id > 0) prices[id] = row;
      }
      state.insurancePrices = prices;
      state.insuranceLoaded = true;
      writeInsuranceCache(prices);
      return prices;
    })
    .catch((error) => {
      debugLog('insurance', error);
      state.insurancePrices = state.insurancePrices || {};
      state.insuranceLoaded = true;
      return state.insurancePrices;
    })
    .finally(() => {
      state.insurancePromise = null;
    });
  return state.insurancePromise;
}

function platinumPayout(shipId) {
  const row = state.insurancePrices?.[Number(shipId)];
  const level = (row?.levels || []).find((entry) => String(entry?.name || '').toLowerCase() === 'platinum');
  const value = Number(level?.payout);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function debriefPayoutAmount() {
  if (state.status !== 'won') return 0;
  return platinumPayout(state.answerShip?.id);
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

// Loss pages are far larger than localStorage can hold; the browser's HTTP cache
// keeps those for the hour zKillboard allows.
const TIMED_CACHE_MAX_CHARS = 64 * 1024;

function writeTimedCache(key, data, ttlMs) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
  try {
    const text = JSON.stringify({ expiresAt: Date.now() + ttlMs, data });
    if (text.length > TIMED_CACHE_MAX_CHARS) return;
    localStorage.setItem(`${ZKILL_CACHE_PREFIX}${key}`, text);
    const keys = Object.keys(localStorage).filter((entry) => entry.startsWith(ZKILL_CACHE_PREFIX));
    if (keys.length > 64) {
      keys
        .map((entry) => {
          try {
            return { entry, expiresAt: Number(JSON.parse(localStorage.getItem(entry) || '{}').expiresAt) || 0 };
          } catch {
            return { entry, expiresAt: 0 };
          }
        })
        .sort((a, b) => a.expiresAt - b.expiresAt)
        .slice(0, keys.length - 64)
        .forEach(({ entry }) => localStorage.removeItem(entry));
    }
  } catch {
    // Cache is best-effort; quota/private modes must not break the puzzle.
  }
}

function statsCacheEntry(shipId) {
  const now = state.timeVerified ? serverNow().getTime() : Date.now();
  const bucket = Math.floor(now / 3600000);
  return {
    key: `stats:${shipId}:${bucket}`,
    ttlMs: Math.max(1000, 3600000 - (now % 3600000)),
  };
}

// Response shapes are pinned to this ESI compatibility date.
const ESI_COMPATIBILITY_DATE = '2026-07-21';
let esiPausedUntil = 0;

function esiUrl(url) {
  const result = new URL(url);
  result.searchParams.set('compatibility_date', ESI_COMPATIBILITY_DATE);
  result.searchParams.set('user_agent', buildUserAgent({
    version: state.manifest?.version,
    site: publicSite(location),
    repo: state.manifest?.links?.repo,
    // Only present when the operator chose to publish it.
    contact: state.meta?.contact,
  }));
  return result.toString();
}

/**
 * One ESI request. Expires and ETag are handled by the HTTP cache; error and rate
 * limits stop every further request until the window resets.
 */
async function esiFetch(path, timeoutMs) {
  if (Date.now() < esiPausedUntil) {
    throw Object.assign(new Error('ESI requests are paused'), { name: 'EsiPausedError', source: 'esi', request: path });
  }
  const base = String(state.manifest?.esi?.baseUrl || '').replace(/\/+$/, '');
  const response = await fetch(esiUrl(`${base}${path}`), {
    // Keeps level names in English whatever the browser language is.
    headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const number = (name) => (response.headers.has(name) ? Number(response.headers.get(name)) : NaN);
  const pause = (ms) => { esiPausedUntil = Math.max(esiPausedUntil, Date.now() + ms); };
  if (response.status === 420 || response.status === 429) {
    const reset = number('x-esi-error-limit-reset');
    pause(response.headers.has('retry-after') || !Number.isFinite(reset)
      ? retryAfterMs(response.headers.get('retry-after'))
      : reset * 1000);
  } else if (number('x-esi-error-limit-remain') <= 10) {
    pause(Math.max(1, number('x-esi-error-limit-reset') || 60) * 1000);
  } else if (number('x-ratelimit-remaining') <= 5) {
    pause(60_000);
  }
  return response;
}

let zkillPausedUntil = 0;

async function fetchZkill(path, cache = null) {
  if (cache?.key) {
    const cached = readTimedCache(cache.key);
    if (cached != null) return cached;
  }
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base) {
    const error = new Error('zKillboard base URL unavailable');
    error.source = 'zkill';
    error.request = 'manifest.zkillboard.baseUrl';
    debugLog('zKillboard config', error);
    throw error;
  }
  // Static browser clients cannot set a persistent User-Agent, and zKill's
  // CORS preflight rejects custom X-User-Agent headers; build scripts identify
  // themselves instead.
  let lastError = null;
  if (Date.now() < zkillPausedUntil) {
    throw Object.assign(new Error('zKillboard requests are paused'), {
      name: 'ZkillHttpError', source: 'zkill', status: 429, request: path, retryable: false,
    });
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        const limited = response.status === 429;
        if (limited) zkillPausedUntil = Math.max(zkillPausedUntil, Date.now() + retryAfterMs(response.headers.get('retry-after')));
        lastError = new Error(`zKillboard request failed (${response.status})`);
        lastError.name = 'ZkillHttpError';
        lastError.source = 'zkill';
        lastError.status = response.status;
        lastError.request = path;
        lastError.retryable = response.status >= 500;
        throw lastError;
      }
      const data = slimKillmails(await response.json());
      if (cache?.key && cache?.ttlMs) writeTimedCache(cache.key, data, cache.ttlMs);
      return data;
    } catch (error) {
      lastError = error;
      if (!lastError.source) lastError.source = 'zkill';
      if (!lastError.request) lastError.request = path;
      if (attempt >= 1 || error?.retryable === false) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  debugLog('zKillboard request', lastError);
  throw lastError || new Error('zKillboard request failed');
}

function isZkillUnavailable(error) {
  if (error?.source !== 'zkill') return false;
  const status = Number(error.status) || 0;
  return !status || status === 429 || status >= 500;
}


function gameDayStartMinutes() {
  // The server's value wins: it is what decides the game day of a run.
  const fromServer = state.meta?.gameDayStartMinutes;
  if (Number.isInteger(fromServer)) return fromServer;
  return Number(state.manifest?.gameDayStartMinutes ?? state.gameDayStartMinutes ?? 11 * 60);
}

function kbSelectionStartDate() {
  return String(state.manifest?.kbSelectionStartDate || state.kbSelectionStartDate || '');
}

const SHIP_PAGE_CACHE_MS = 60 * 60 * 1000;
const FREE_PAGE_CACHE_MS = SHIP_PAGE_CACHE_MS;

function kbInvalid() {
  return new DailyUnavailableError('kb-invalid');
}

function kbRecencyHalfLifeDays() {
  const value = Number(state.manifest?.kbRecencyHalfLifeDays);
  return Number.isFinite(value) && value > 0 ? value : 365;
}

function kbMaxScanPages() {
  const value = Number(state.manifest?.kbMaxScanPages);
  return Number.isInteger(value) && value > 0 ? Math.min(100, value) : 20;
}

async function fetchShipPage(shipId, page) {
  try {
    const data = await fetchZkill(
      `/api/losses/shipTypeID/${shipId}/page/${page}/`,
      { key: `ship-page:${shipId}:${page}`, ttlMs: SHIP_PAGE_CACHE_MS },
    );
    if (!Array.isArray(data)) throw kbInvalid();
    return data;
  } catch (error) {
    if (error instanceof DailyUnavailableError) throw error;
    debugLog('daily ship page request', error);
    throw new DailyUnavailableError('kb-unavailable', error);
  }
}

async function pickRandomFreeKill() {
  const killShipPool = state.mode === 'audit'
    ? (state.manifest.auditKillShipPool || state.manifest.killShipPool)
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
        data = await fetchZkill(
          `/api/losses/shipTypeID/${shipId}/page/${page}/`,
          { key: `free-page:${shipId}:${page}`, ttlMs: FREE_PAGE_CACHE_MS },
        );
      } catch (error) {
        debugLog('free random zKillboard', error);
        if (isZkillUnavailable(error)) throw new DailyUnavailableError('kb-unavailable', error);
        break;
      }
      if (!Array.isArray(data) || !data.length) break;
      const earliest = kbSelectionStartDate();
      const losses = data.filter((kill) => (
        Number(kill?.victim?.ship_type_id) === Number(shipId)
        && (!earliest || String(kill?.killmail_time || '') >= `${earliest}T00:00:00Z`)
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

function revealBaseSeed() {
  if (isFree()) return `free:${freeAnswerSeed()}`;
  if (state.dailySeed != null) return `daily:${state.dailySeed}`;
  return `daily:${state.date}:${state.answerKillId || state.answerId}`;
}

async function fetchAnswerLive() {
  if (state.liveFetched || !state.answerId) return;
  state.liveFetched = true;
  const shipId = Number(state.answerId);
  const killId = Number(state.answerKillId);
  const statsCache = statsCacheEntry(shipId);
  const [stats, kill] = await Promise.allSettled([
    statsCache
      ? fetchZkill(`/api/stats/shipTypeID/${shipId}/kills/`, statsCache)
      : Promise.resolve(null),
    state.freeKillmail
      ? Promise.resolve([state.freeKillmail])
      : state.dailyKillmail
        ? Promise.resolve([state.dailyKillmail])
        // The service already sent the complete killmail; asking zKill again can
        // fail or return nothing and would drop fitting and value clues.
        : Number(state.answerKillmail?.killmail_id) === killId && killId
          ? Promise.resolve([state.answerKillmail])
          : killId ? fetchZkill(`/api/killID/${killId}/`, { key: `kill:${killId}`, ttlMs: 3600000 }) : Promise.resolve(null),
  ]);
  state.liveStats = stats.status === 'fulfilled' && stats.value?.type === 'shipTypeID'
    ? stats.value
    : null;
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
  const victimKey = (item) => [item?.character_id, item?.corporation_id, item?.alliance_id].join(':');
  const key = victimKey(victim);
  if (state.victimInfoKey !== key) state.victimInfo = null;
  if (state.victimInfoKey === key || state.victimInfoLoading) return;
  state.victimInfoKey = key;
  state.victimInfoLoading = true;
  const base = (state.manifest?.esi?.baseUrl || '').replace(/\/$/, '');
  const names = readEntityNameCache();
  let esiFailed = false;
  let esiError = null;
  const fresh = (kind, id) => {
    const entry = names?.[kind]?.[Number(id)];
    return entry && Date.now() - Number(entry.at) < ENTITY_CACHE_TTL_MS ? entry.name : '';
  };
  const read = async (kind, id) => {
    if (!base) {
      esiFailed = true;
      esiError = esiError || Object.assign(new Error('ESI base URL unavailable'), {
        source: 'esi',
        request: 'manifest.esi.baseUrl',
      });
      return null;
    }
    if (!Number(id)) return null;
    const cachedName = fresh(kind, id);
    if (cachedName) return { name: cachedName };
    try {
      const requestUrl = `/${kind}/${Number(id)}`;
      const response = await esiFetch(requestUrl, 8000);
      if (!response.ok) {
        esiFailed = true;
        esiError = Object.assign(new Error(`ESI request failed (${response.status})`), {
          name: 'EsiHttpError',
          source: 'esi',
          status: response.status,
          request: requestUrl,
        });
        return null;
      }
      const data = await response.json();
      if (data?.name) {
        if (!names[kind]) names[kind] = {};
        names[kind][Number(id)] = { name: data.name, at: Date.now() };
        writeEntityNameCache(names);
      }
      return data;
    } catch (error) {
      esiFailed = true;
      esiError = error;
      if (!esiError.source) esiError.source = 'esi';
      if (!esiError.request) esiError.request = `/${kind}/${Number(id)}`;
      return null;
    }
  };
  const [character, corporation, alliance] = await Promise.all([
    read('characters', victim.character_id),
    read('corporations', victim.corporation_id),
    read('alliances', victim.alliance_id),
  ]);
  if (victimKey(state.liveLosses?.[0]?.victim) !== key) {
    // The target changed meanwhile: look up its own victim.
    state.victimInfoLoading = false;
    state.victimInfoKey = null;
    void fetchVictimInfo();
    return;
  }
  if (esiFailed) {
    debugLog('ESI name lookup', esiError);
    if (state.victimEsiWarningKey !== key) {
      state.victimEsiWarningKey = key;
      showToast(t('error.esiTitle'), t('error.esiBody'), 'warn', 6000);
    }
  }
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

// Type ids the SDE does not know; not asked again in this session.
const missingTypeNames = new Set();

async function fetchCargoTypeNames() {
  const sdeBase = (state.manifest?.sde?.apiBase || '').replace(/\/$/, '');
  const release = String(state.manifest?.sde?.release || '').trim();
  if (!sdeBase || !release || !state.refs?.modules) return;
  const locale = state.locale;
  const requestId = ++state.cargoFetchId;
  if (state.extraTypeNamesLocale !== locale) {
    // SDE names are language-specific; never reuse an English/Chinese cache
    // after the player changes the interface language.
    state.extraTypeNames = {};
    state.extraTypeNamesLocale = locale;
    try {
      const cached = JSON.parse(localStorage.getItem(`fitdle:v1:typeNames:${locale}`) || '{}');
      if (cached && typeof cached === 'object') state.extraTypeNames = cached;
    } catch {
      // localStorage may be unavailable; the SDE API remains the fallback
    }
  }
  const modules = isMasked() && !state.liveLosses.length
    ? (state.onlineRun.board.clues || []).filter((clue) => clue.v?.module).map((clue) => ({ module: clue.v.module }))
    : getEquipment(state.liveLosses, state.refs).equipment;
  const unknown = [...new Set(
    modules
      .map((item) => item.module)
      .filter((id) => !state.refs.modules[id] && !state.extraTypeNames[id] && !missingTypeNames.has(Number(id)))
  )];
  if (!unknown.length) return;
  const entries = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < unknown.length) {
      const id = unknown[cursor++];
      try {
        const record = (version) => fetch(`${sdeBase}/${encodeURIComponent(version)}/types/${encodeURIComponent(id)}.json`, {
          cache: 'default',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        // Only the current and previous SDE releases are kept upstream.
        let response = await record(release);
        if (response.status === 404) response = await record('latest');
        if (response.status === 404) missingTypeNames.add(Number(id));
        if (response.ok) {
          const data = await response.json();
          const name = typeof data?.name === 'string'
            ? data.name
            : (data?.name?.[locale] || data?.name?.en);
          if (name) entries.push([id, name]);
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

function auditFallbackByModule() {
  const equipment = getEquipment(state.liveLosses, state.refs).equipment;
  return selectAuditFallbacks(equipment, state.refs, state.manifest.moduleFallbacks || {});
}

function auditCalculationKillmail(killmail) {
  const fallbacks = auditFallbackByModule();
  if (!fallbacks.size || !killmail?.victim?.items) return killmail;
  return {
    ...killmail,
    victim: {
      ...killmail.victim,
      items: auditSimulationItems(killmail.victim.items.map((item) => {
        if (Number(item.flag) === 5) return item;
        const fallback = fallbacks.get(Number(item.item_type_id));
        return fallback ? { ...item, item_type_id: fallback } : item;
      }), state.refs),
    },
  };
}

async function fetchModuleDetails() {
  if (!usesSimulatedFit() || state.moduleDetails) return;
  const fallback = await fetchJson('data/module-fallback.json').catch(() => null);
  const equipment = getEquipment(state.liveLosses, state.refs).equipment;
  const unique = [...new Set(equipment.map((item) => item.module))];
  const fallbackByModule = auditFallbackByModule();
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
  // Audit modules can lack their mutated effects; use the same slot-tier
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

/** The board of a masked run as answer data: no hull until the service names it. */
function buildMaskedAnswerData() {
  const board = state.onlineRun.board;
  const clues = (board.clues || []).map((clue) => ({ ...clue }));
  const ship = state.answerShip;
  if (ship) {
    state.answerData = {
      ...ship,
      description: ship.descriptions?.[state.locale] || ship.descriptions?.en || '',
      bonuses: ship.bonuses?.[state.locale] || ship.bonuses?.en || [],
      bonusEntries: ship.bonusEntries || [],
      clues,
      sampleKill: board.sampleKill || null,
      fitting: { fittedKills: board.fittedKills || 0 },
      fitDelta: null,
      revealSeed: '',
      revealPlan: null,
      sealed: [],
    };
    return;
  }
  const bonusEntries = {};
  for (const clue of clues) {
    if (clue.k === 'bonus' && clue.entry) bonusEntries[clue.v] = clue.entry;
  }
  state.answerData = {
    clues,
    bonusEntries,
    bonuses: [],
    description: '',
    sampleKill: null,
    fitting: { fittedKills: 0 },
    fitDelta: null,
    revealSeed: '',
    revealPlan: null,
    sealed: [...(board.sealed || [])],
  };
}

function buildAnswerData() {
  if (isMasked()) {
    buildMaskedAnswerData();
    return;
  }
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
    dataVersion: state.manifest?.clueVersion || '5',
    targetKillId: state.answerKillId,
    mode: usesSimulatedFit() ? 'audit' : state.mode,
    moduleDetails: usesSimulatedFit() ? state.moduleDetails : null,
    fittedAttrs: usesSimulatedFit() ? state.dogmaAttrs : null,
    baselineAttrs: usesSimulatedFit() ? state.dogmaBaseline : null,
    moduleFallbacks: usesSimulatedFit() ? state.manifest.moduleFallbacks || {} : {},
    weaponUpgradeGroups: state.manifest.weaponUpgradeGroups || null,
    weaponGroups: state.manifest.weaponGroups || null,
  });
  const revealSeed = revealBaseSeed();
  const revealPlan = buildRevealPlan({
    clues: built.clues,
    seed: revealSeed,
    mode: state.mode,
    timed: isTimed(),
    config: state.manifest?.reveal,
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
    revealSeed,
    revealPlan,
  };
}

function localizeAnswerData() {
  if (isMasked()) {
    buildMaskedAnswerData();
    return;
  }
  if (!state.answerData || !state.answerShip) return;
  const ship = state.answerShip;
  state.answerData = {
    ...state.answerData,
    description: ship.descriptions?.[state.locale] || ship.descriptions?.en || '',
    bonuses: ship.bonuses?.[state.locale] || ship.bonuses?.en || [],
    bonusEntries: ship.bonusEntries || state.answerData.bonusEntries,
  };
}

async function loadCatalog(locale) {
  if (state.catalogLocale === locale) return;
  // Per-language catalogs are generated into dist/; the complete catalog covers
  // source previews and builds without them.
  const catalog = await fetchJson(`data/catalog/${locale}.json`)
    .catch(() => fetchJson('data/catalog.json'));
  state.catalog = catalog.ships;
  state.catalogMap = new Map(state.catalog.map((ship) => [ship.id, ship]));
  state.catalogLocale = locale;
  if (state.answerId) state.answerShip = state.catalogMap.get(state.answerId) || state.answerShip;
}

async function loadLocaleData(locale, { keepLive = false, keepAnswer = false } = {}) {
  if (state.catalogLocale !== locale) prefetchJson([`data/catalog/${locale}.json`]);
  const refs = await fetchJson(`data/refs/${locale}.json`);
  await loadCatalog(locale);
  state.refs = refs;
  state.index = buildSearchIndex(state.catalog, refs.groups, {
    races: refs.races, factions: refs.factions, locale: state.locale, aliases: state.searchAliases,
  });
  if (!keepLive && !isMasked()) await fetchAnswerLive();
  await fetchCargoTypeNames();
  if (usesSimulatedFit() && !isMasked() && state.liveLosses[0]) {
    try {
      state.dogmaAttrs = await calculateDogmaFit(
        state.answerShip,
        auditCalculationKillmail(state.liveLosses[0]),
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
  if (usesSimulatedFit() && !isMasked() && !state.dogmaAttrs) await fetchModuleDetails();
  if (keepAnswer && state.answerData) {
    localizeAnswerData();
  } else {
    buildAnswerData();
  }
  if (!state.answerData) throw new Error('answer data unavailable');
}

function localeTargetSnapshot() {
  return {
    answerId: state.answerId,
    answerKillId: state.answerKillId,
    freeKillId: state.freeKillId,
    freeKillToken: state.freeKillToken,
    answerKillmail: state.answerKillmail,
    freeKillmail: state.freeKillmail,
    liveLosses: state.liveLosses,
    liveStats: state.liveStats,
    liveFetched: state.liveFetched,
    liveError: state.liveError,
    date: state.date,
    targetSource: state.targetSource,
    targetGameDay: state.targetGameDay,
    dailyKillmail: state.dailyKillmail,
    dailySeed: state.dailySeed,
    onlineRun: state.onlineRun,
    answerData: state.answerData,
    revealed: state.revealed,
    fresh: state.fresh,
    visibleCount: state.visibleCount,
    timedClueCount: state.timedClueCount,
    kbValue: (() => {
      const clue = state.answerData?.clues?.find((item) => item.k === 'kbValue');
      return clue && !clue.hidden ? Number(clue.v) : null;
    })(),
    kb: new URL(location.href).searchParams.get('kb'),
  };
}

function localeTargetChanged(snapshot) {
  return Number(snapshot.answerId) !== Number(state.answerId)
    || Number(snapshot.answerKillId) !== Number(state.answerKillId)
    || Number(snapshot.freeKillId || 0) !== Number(state.freeKillId || 0)
    || String(snapshot.freeKillToken || '') !== String(state.freeKillToken || '')
    || String(snapshot.date || '') !== String(state.date || '')
    || Number(snapshot.liveLosses?.[0]?.killmail_id || 0) !== Number(state.liveLosses?.[0]?.killmail_id || 0);
}

function restoreLocaleTarget(snapshot) {
  Object.assign(state, {
    answerId: snapshot.answerId,
    answerKillId: snapshot.answerKillId,
    freeKillId: snapshot.freeKillId,
    freeKillToken: snapshot.freeKillToken,
    answerKillmail: snapshot.answerKillmail,
    freeKillmail: snapshot.freeKillmail,
    liveLosses: snapshot.liveLosses,
    liveStats: snapshot.liveStats,
    liveFetched: snapshot.liveFetched,
    liveError: snapshot.liveError,
    date: snapshot.date,
    targetSource: snapshot.targetSource,
    targetGameDay: snapshot.targetGameDay,
    dailyKillmail: snapshot.dailyKillmail,
    dailySeed: snapshot.dailySeed,
    onlineRun: snapshot.onlineRun,
    answerData: snapshot.answerData,
    revealed: snapshot.revealed,
    fresh: snapshot.fresh,
    visibleCount: snapshot.visibleCount,
    timedClueCount: snapshot.timedClueCount,
  });
  state.answerShip = state.catalogMap.get(state.answerId) || state.answerShip;
  localizeAnswerData();
}

function restoreLocaleKb(snapshot) {
  if (!snapshot?.kb) return;
  const url = new URL(location.href);
  if (url.searchParams.get('kb') === snapshot.kb) return;
  url.searchParams.set('kb', snapshot.kb);
  history.replaceState(null, '', url);
}

function restoreLocaleKbValue(snapshot) {
  if (snapshot?.kbValue == null) return;
  const clue = state.answerData?.clues?.find((item) => item.k === 'kbValue');
  if (!clue) return;
  if (Number(clue.v) !== Number(snapshot.kbValue)) clue.v = snapshot.kbValue;
}

function readStoredState() {
  if (isFree()) return { guesses: [], status: 'playing', invalidated: false };
  // A masked run comes back from the service alone.
  if (isMasked()) return { invalidated: false };
  const stored = loadState(localStorage, state.date, state.dataVersionKey, storageMode(), {
    dailySeed: state.dailySeed,
    answerKillId: state.answerKillId,
  });
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

function isHighlightableClue(clue) {
  return Number(clue?.w) > 0 && clue?.k !== 'structureResists';
}

function markInitialFresh() {
  if (state.initialFreshDone || state.guesses.length || !state.revealed.size || !state.answerData) return;
  state.initialFreshDone = true;
  state.fresh = new Set([...state.revealed].filter((index) => isHighlightableClue(state.answerData.clues[index])));
}

function recomputeRevealed() {
  if (isMasked()) {
    state.revealed = new Set(state.onlineRun.board.revealed || []);
    state.visibleCount = state.revealed.size;
    markInitialFresh();
    return;
  }
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
    seed: state.answerData.revealSeed || revealBaseSeed(),
    plan: state.answerData.revealPlan,
    config: state.manifest?.reveal,
    timed: isTimed(),
  };
  if (isTimed() && state.status === 'playing') {
    if (!state.timerStarted) {
      state.revealed = new Set();
      state.timedClueCount = 0;
      state.visibleCount = 0;
      return;
    }
    const initial = computeRevealed({ ...base, guesses: [], status: 'playing', timed: true });
    const releases = Math.floor(currentElapsed() / 30000);
    const extras = computeTimedRevealed({
      clues: state.answerData.clues,
      plan: state.answerData.revealPlan,
      releases,
      exclude: initial,
    });
    state.revealed = new Set([...initial, ...extras]);
    state.timedClueCount = releases;
    state.visibleCount = state.revealed.size;
    markInitialFresh();
    return;
  }
  state.revealed = computeRevealed(base);
  state.visibleCount = state.revealed.size;
  markInitialFresh();
}

const STATE_PREFIX = 'fitdle:v1:state:online-';
const STATE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** The service keeps finished runs; only open ones still need their local board. */
function pruneStoredStates() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(STATE_PREFIX) || key.startsWith(`fitdle:v1:state:${state.date}:`)) continue;
      let data = null;
      try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* unreadable */ }
      if (data?.status !== 'playing' || Date.now() - Number(data.savedAt) > STATE_MAX_AGE_MS) localStorage.removeItem(key);
      else if (!data.savedAt) localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
    }
  } catch {
    // best effort
  }
}

function persist() {
  // Practice, rooms and the room placeholder have nothing to come back to.
  if (isFree() || !state.onlineRun?.runId) return;
  // The service keeps a masked run; a board of an older page version is dropped.
  if (isMasked()) {
    try { localStorage.removeItem(`fitdle:v1:state:${state.date}:${storageMode()}`); } catch { /* best effort */ }
    return;
  }
  saveState(localStorage, state.date, {
    dataVersion: state.dataVersionKey,
    dailySeed: state.dailySeed,
    date: state.date,
    savedAt: Date.now(),
    answerId: state.answerId,
    answerKillId: state.answerKillId,
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
  return esc(legalNotice(state.locale))
    .replace('{site}', `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(siteLabel)}</a>`)
    .replace('EVE Online', `<a href="${esc(eve)}" target="_blank" rel="noopener noreferrer">EVE Online</a>`)
    .replace('Fenris Creations', `<a href="${esc(fenris)}" target="_blank" rel="noopener noreferrer">Fenris Creations</a>`);
}

function pilotStatsHtml() {
  const stats = state.profileStats || { dailyWins: 0, winStreak: 0, streaks: {} };
  const streaks = stats.streaks || {};
  const modes = [
    ['standard', t('mode.standard')],
    ['audit', t('mode.audit')],
    ['timed', t('mode.timed')],
  ];
  return `
    <div class="pilot-menu-record">
      <div class="pilot-menu-kicker">${esc(t('help.statsTitle'))}</div>
      <div class="pilot-menu-streak">
        <span>${esc(t('help.dailyWins'))} <b>${Number(stats.dailyWins) || 0}</b></span>
        <span>${esc(t('help.statStreak'))} <b>${Number(stats.winStreak) || 0}</b></span>
      </div>
      <div class="pilot-menu-modes">
        ${modes.map(([mode, label]) => `<div>
          <span>${esc(label)}</span>
          <strong>${Number(streaks[mode]) || 0}</strong>
        </div>`).join('')}
      </div>
    </div>`;
}

function pilotMenuHtml() {
  return `
    <div class="pilot-menu" id="pilot-menu" role="menu" hidden>
      <div class="pilot-menu-head">
        <span>${esc(t('claim.assessor'))}</span>
        <strong>${esc(state.auth.name)}</strong>
      </div>
      ${pilotStatsHtml()}
      <button type="button" class="button danger pilot-menu-logout" data-action="logout" role="menuitem">${esc(t('auth.logout'))}</button>
    </div>`;
}

function appearanceMenuHtml() {
  const fontValue = state.font === 'classic'
    ? t('font.classic')
    : state.font === 'triglavian'
      ? t('font.triglavian')
      : t('font.neue');
  return `
    <div class="appearance-menu" id="appearance-menu" hidden>
      <div class="appearance-menu-head">${esc(t('manual.settingsTitle'))}</div>
      <div class="setting-row">
        <span>${esc(t('font.label'))}</span>
        <button type="button" class="font-switch-button" data-action="toggle-font-face" aria-label="${esc(t('font.switch'))}">
          <span class="font-toggle-value">${esc(fontValue)}</span>
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
    </div>`;
}

function closeTopbarMenus() {
  const pilot = $('#pilot-menu');
  if (pilot) pilot.hidden = true;
  const appearance = $('#appearance-menu');
  if (appearance) appearance.hidden = true;
  for (const button of $$('[data-action="pilot-menu"], [data-action="appearance-menu"]')) {
    button.setAttribute('aria-expanded', 'false');
  }
}

function applyRoomLayout() {
  const main = $('#main');
  const roomView = $('#room-view');
  const roomRail = $('#room-rail');
  if (!main || !roomView || !roomRail) return;
  const open = Boolean(state.roomSurface && state.roomView);
  const overlayView = open && ['lobby', 'result'].includes(state.roomView);
  const arbitrationView = open && state.roomView === 'arbitration';
  const endlessView = open && state.roomView === 'endless';
  const gameplayView = arbitrationView || endlessView;
  const loadingRoom = endlessView && ['loading', 'ready', 'starting'].includes(state.roomEndless?.phase);
  roomView.hidden = !overlayView;
  roomRail.hidden = !gameplayView;
  main.classList.toggle('is-room', overlayView);
  main.classList.toggle('is-in-room', open);
  main.classList.toggle('is-room-arbitration', arbitrationView);
  main.classList.toggle('is-room-endless', endlessView);
  main.classList.toggle('is-room-loading', Boolean(loadingRoom));
  const loadingHost = $('#room-loading');
  if (loadingHost) loadingHost.hidden = !loadingRoom;
  document.querySelector('.target-dock')?.toggleAttribute('hidden', overlayView);
  $('#hero')?.toggleAttribute('hidden', overlayView);
  document.querySelector('.console')?.toggleAttribute('hidden', overlayView);
  syncRoomChrome();
  syncRoomAction();
}

function syncRoomChrome() {
  const inRoom = Boolean(state.roomSurface && state.roomView);
  const joinedRoom = Boolean(state.roomSurface?.room?.code);
  const gameplay = state.roomSurface?.room?.gameplay || '';
  document.documentElement.dataset.multiplayer = inRoom ? '1' : '';
  if (!inRoom) delete document.documentElement.dataset.multiplayer;
  document.documentElement.dataset.roomGameplay = inRoom && gameplay ? gameplay : '';
  if (!(inRoom && gameplay)) delete document.documentElement.dataset.roomGameplay;
  const nav = document.querySelector('.mode-nav');
  if (!nav) return;
  const multiplayer = nav.querySelector('.mode-multiplayer');
  multiplayer?.classList.toggle('is-active', inRoom);
  multiplayer?.setAttribute('aria-current', inRoom ? 'page' : 'false');
  for (const button of nav.querySelectorAll('[data-action="set-gameplay"]')) {
    const active = !inRoom && button.dataset.gameplay === state.gameplay;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
    button.disabled = joinedRoom;
    button.classList.toggle('is-unavailable', joinedRoom);
    if (joinedRoom) button.setAttribute('aria-disabled', 'true');
    else if (button.dataset.gameplay === 'daily' && state.appMode !== 'online') button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }
  const bar = document.querySelector('.mode-bar');
  if (bar) bar.dataset.mode = inRoom ? 'multiplayer' : state.mode;
  const chip = document.querySelector('.cycle-chip');
  if (chip) {
    const modeLine = chip.querySelector('.cycle-mode-line');
    if (modeLine) {
      modeLine.innerHTML = inRoom
        ? `<span>${esc(tl('mode.multiplayer', 'MULTIPLAYER'))}</span><strong>${esc(tl(`gameplay.${gameplay}`, gameplay.toUpperCase()))}</strong>`
        : `<span>${esc(state.appMode === 'online' ? tl('online.label', 'ONLINE') : tl('practice.label', 'PRACTICE'))}</span><strong>${esc(tl(`gameplay.${state.gameplay}`, state.gameplay.toUpperCase()))}</strong>`;
    }
    const score = chip.querySelector('.cycle-score');
    if (score) score.textContent = inRoom ? tl('status.scored', 'SCORED') : (isScored() ? tl('status.scored', 'SCORED') : tl('status.unscored', 'UNSCORED'));
  }
}

function footerVersionHtml() {
  const manifest = state.manifest || {};
  const sde = manifest.sde || {};
  const zkill = manifest.zkillboard || {};
  const sdeLabel = sde.buildNumber || sde.generatedAt || '—';
  const sdeTitle = [
    sde.release ? `release ${sde.release}` : '',
    sde.url || sde.apiBase || '',
  ].filter(Boolean).join(' · ');
  const zkillLabel = zkill.version || zkill.snapshot || '—';
  const zkillTitle = [
    zkill.versionSource || '',
    zkill.versionCapturedAt || zkill.capturedAt || '',
    zkill.snapshot ? `loss snapshot ${zkill.snapshot}` : '',
  ].filter(Boolean).join(' · ');
  return `<span class="footer-meta footer-version">v${esc(manifest.version || '0.1.0')} · <span data-tip="${esc(sdeTitle)}" tabindex="0">SDE ${esc(sdeLabel)}</span> · <span data-tip="${esc(zkillTitle)}" tabindex="0">ZKILL ${esc(zkillLabel)}</span></span>`;
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
        <div class="brand-mark" aria-hidden="true">${fitdleMark()}</div>
        <div>
          <div class="brand-name">${esc(t('app.name'))}</div>
          <div class="brand-sub">${esc(brandText('brand.parent'))} // ${esc(brandText('brand.scc'))}</div>
        </div>
      </div>
      <div class="topbar-center">
        <div class="cycle-chip${isScored() ? '' : ' is-unscored'}" tabindex="0"
          aria-label="${esc(`${state.appMode === 'online' ? tl('online.label', 'ONLINE') : tl('practice.label', 'PRACTICE')} // ${tl(`gameplay.${state.gameplay}`, state.gameplay.toUpperCase())} // ${isScored() ? tl('status.scored', 'SCORED') : tl('status.unscored', 'UNSCORED')}`)}"
          data-tip="${esc(isScored() ? tl('status.scoredHelp', 'Online results are recorded in the service statistics.') : state.appMode === 'online' ? t('status.customHelp') : tl('status.unscoredHelp', 'Practice runs are not scored and do not affect online statistics.'))}">
          <div class="cycle-mode-line">
            <span>${esc(state.appMode === 'online' ? tl('online.label', 'ONLINE') : tl('practice.label', 'PRACTICE'))}</span>
            <strong>${esc(tl(`gameplay.${state.gameplay}`, state.gameplay.toUpperCase()))}</strong>
          </div>
          <em class="cycle-score">${esc(isScored() ? tl('status.scored', 'SCORED') : tl('status.unscored', 'UNSCORED'))}</em>
        </div>
      </div>
      <div class="topbar-actions">
        ${state.auth.loggedIn
          ? `<div class="pilot-wrap">
               <button class="pilot-identity" type="button" data-action="pilot-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="pilot-menu">
                 ${avatarHtml(state.auth.name, state.auth.characterId, 64, 'pilot-avatar', state.manifest?.images?.baseUrl)}
                 <span class="pilot-copy">
                   <span class="pilot-name">${esc(state.auth.name)}</span>
                   <span class="pilot-role">${esc(t('claim.assessor'))}</span>
                 </span>
                 ${icon('chevron')}
               </button>
               ${pilotMenuHtml()}
             </div>`
          : `<div class="eve-sso-slot">${eveSsoButton('small')}</div>`}
        <div class="appearance-wrap">
          <button class="icon-button topbar-appearance" type="button" data-action="appearance-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="appearance-menu" aria-label="${esc(t('manual.settingsTitle'))}">${icon('settings')}</button>
          ${appearanceMenuHtml()}
        </div>
        <button class="button ghost topbar-help" type="button" data-action="help">${esc(t('header.help'))}</button>
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
          <span class="mode-label">${esc(tl('mode.label', 'MODE'))}</span>
          <div class="mode-switch mode-nav" role="group" aria-label="${esc(tl('mode.label', 'MODE'))}">
            <button type="button" class="mode-button${state.gameplay === 'daily' ? ' is-active' : ''}${state.appMode === 'online' ? '' : ' is-unavailable'}"
              data-action="set-gameplay" data-gameplay="daily"
              ${state.appMode === 'online' ? '' : 'aria-disabled="true"'}
              ${state.appMode === 'online' ? '' : `data-tip="${esc(tl('mode.dailyReason', 'Sign in with EVE to play Daily mode.'))}"`}
              ${state.appMode === 'online' ? '' : `aria-label="${esc(`${t('mode.daily')} — ${tl('mode.dailyReason', 'Sign in with EVE to play Daily mode.')}`)}"`}>${esc(t('mode.daily'))}</button>
            <button type="button" class="mode-button${state.gameplay === 'standard' ? ' is-active' : ''}" data-action="set-gameplay" data-gameplay="standard">${esc(tl('gameplay.standard', 'STANDARD'))}</button>
            <button type="button" class="mode-button${state.gameplay === 'audit' ? ' is-active' : ''}" data-action="set-gameplay" data-gameplay="audit">${esc(t('mode.audit'))}</button>
            <button type="button" class="mode-button${state.gameplay === 'timed' ? ' is-active' : ''}" data-action="set-gameplay" data-gameplay="timed">${esc(t('mode.timed'))}</button>
            <span class="mode-divider" aria-hidden="true"></span>
            <button type="button" class="mode-button mode-multiplayer${state.appMode === 'online' ? '' : ' is-unavailable'}"
              data-action="rooms"
              ${state.appMode === 'online' ? '' : 'aria-disabled="true"'}
              ${state.appMode === 'online' ? '' : `data-tip="${esc(tl('mode.multiplayerReason', 'Sign in with EVE to enter multiplayer.'))}"`}
              ${state.appMode === 'online' ? '' : `aria-label="${esc(`${tl('mode.multiplayer', 'MULTIPLAYER')} — ${tl('mode.multiplayerReason', 'Sign in with EVE to enter multiplayer.')}`)}"`}>${esc(tl('mode.multiplayer', 'MULTIPLAYER'))}</button>
          </div>
        </div>
      </div>

      <section id="room-view" class="room-view" hidden></section>

      <section class="target-dock" aria-label="${esc(tl('mode.targetControl', 'TARGET CONTROL'))}">
        <div class="target-dock-meta">
          <span>${esc(tl('mode.targetControl', 'TARGET CONTROL'))}</span>
          <strong>${esc(tl(`gameplay.${state.gameplay}`, state.gameplay.toUpperCase()))}</strong>
        </div>
        <button id="room-action-button" class="button primary" type="button" data-action="room-action" hidden></button>
        ${state.appMode === 'online' && state.gameplay === 'daily'
          ? `<button class="button daily-reset-cta${dailyResetReady() ? ' is-ready' : ''}" type="button"
              data-action="play-today"
              aria-disabled="${dailyResetReady() ? 'false' : 'true'}"
              data-tip="${esc(dailyResetReady() ? t('mode.dailyRefresh') : tl('mode.dailyFixed', 'The Daily target is fixed and cannot be refreshed.'))}">
              ${icon('clock')}
              <span>${esc(dailyResetReady() ? t('mode.dailyRefresh') : tl('header.reset', 'RESET IN'))}</span>
              <strong id="daily-reset-countdown">${esc(dailyResetReady() ? '00:00:00' : nextDowntime())}</strong>
            </button>`
          : `<button class="button primary new-target-cta" type="button" data-action="new-target"
              aria-label="${esc(tl('online.newTarget', 'NEW TARGET'))}">
              ${icon('refresh')}
              <span>${esc(tl('online.newTarget', 'NEW TARGET'))}</span>
              <small>${esc(tl('mode.newSignal', 'NEW SIGNAL'))}</small>
            </button>`}
      </section>

      <section id="room-loading" class="room-loading" hidden></section>

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

        <div class="console-side">
          <section id="room-rail" class="room-rail" hidden></section>
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
      </div>

      <footer class="site-footer">
        <div>
          <div class="footer-brand"><b>${esc(t('app.name'))}</b> // ${esc(brandText('app.subtitle'))}</div>
          <div class="footer-disclaimer">${esc(brandText('claim.disclaimer'))}</div>
          <div class="footer-copyright">${copyrightHtml()}</div>
        </div>
        <div class="footer-links">
          <a class="repo-link" href="${esc(state.manifest.links?.repo || '#')}" target="_blank" rel="noopener noreferrer" data-tip="${esc(state.manifest.links?.repo || '')}">${esc(t('footer.source'))}</a>
          <a class="zkill-link" href="${esc(state.manifest.zkillboard.baseUrl)}" target="_blank" rel="noopener noreferrer">zKillboard</a>
          <a href="${esc(state.manifest.links?.eveDocs || '#')}" target="_blank" rel="noopener noreferrer">EVE SDE</a>
          ${footerVersionHtml()}
        </div>
      </footer>
    </main>
  `;
  renderChrome();
  if (state.roomSurface) {
    state.roomSurface.attach($('#room-view'), $('#room-rail'));
    applyRoomLayout();
  }
}

// ---------------------------------------------------------------------------
// Chrome, hero, board, dossier
// ---------------------------------------------------------------------------

function eveSsoButton(size = 'small') {
  const label = tl('auth.login', 'LOG IN WITH EVE');
  const source = size === 'large'
    ? state.manifest?.images?.eveSsoLoginLarge
    : state.manifest?.images?.eveSsoLoginSmall;
  const href = esc(api.loginUrl());
  if (!source) {
    return `<a class="eve-sso-button is-text ${size}" href="${href}">${esc(label)}</a>`;
  }
  return `<a class="eve-sso-button ${size}" href="${href}" aria-label="${esc(label)}">
    <img src="${esc(source)}" alt="${esc(label)}" draggable="false" onerror="this.closest('.eve-sso-button').classList.add('is-error')">
    <span class="eve-sso-fallback">${esc(label)}</span>
  </a>`;
}

function renderChrome() {
  const free = isFree();
  const dateLabel = $('#date-label');
  if (dateLabel) {
    dateLabel.textContent = free ? t('free.badge') : (ycDateLabel(state.today || state.date) || state.date);
    dateLabel.setAttribute('title', free ? t('free.kicker') : state.i18n.date(state.today || state.date));
  }
  const resetLabel = $('#reset-label');
  const dateCaption = $('#date-caption');
    if (dateCaption) {
    if (free) {
      dateCaption.textContent = `${t('free.badge')} // ${t('free.unscored')}`;
    } else {
      dateCaption.textContent = `${t('common.utc')} // ${t('hero.daily')}`;
    }
  }
  if (resetLabel) resetLabel.textContent = t('header.reset');
  syncNewTarget();
  const dailyButton = $('.daily-reset-cta');
  if (dailyButton) {
    const ready = dailyResetReady();
    dailyButton.classList.toggle('is-ready', ready);
    dailyButton.setAttribute('aria-disabled', String(!ready));
    dailyButton.dataset.tip = ready
      ? t('mode.dailyRefresh')
      : tl('mode.dailyFixed', 'The Daily target is fixed and cannot be refreshed.');
    const label = dailyButton.querySelector('span');
    const countdown = dailyButton.querySelector('#daily-reset-countdown');
    if (label) label.textContent = ready ? t('mode.dailyRefresh') : tl('header.reset', 'RESET IN');
    if (countdown) countdown.textContent = ready ? '00:00:00' : nextDowntime();
  }
  const pilotMenu = $('#pilot-menu');
  const pilotRecord = pilotMenu?.querySelector('.pilot-menu-record');
  if (pilotMenu && pilotRecord) pilotRecord.outerHTML = pilotStatsHtml();
  const brandSub = $('.brand-sub');
  if (brandSub) brandSub.textContent = `${brandText('brand.parent')} // ${brandText('brand.scc')}`;
  const footerBrand = $('.footer-brand');
  if (footerBrand) footerBrand.innerHTML = `<b>${esc(t('app.name'))}</b> // ${esc(brandText('app.subtitle'))}`;
  const footerDisclaimer = $('.footer-disclaimer');
  if (footerDisclaimer) footerDisclaimer.textContent = brandText('claim.disclaimer');

  const freeActions = $('#free-actions');
  if (freeActions) {
    freeActions.hidden = true;
    freeActions.innerHTML = '';
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
  document.title = state.appMode === 'online'
    ? `FITDLE — ${t(`gameplay.${state.gameplay}`)}`
    : `FITDLE — ${t('practice.label')}`;
  syncFontControls();
}

function hiddenTotals() {
  const clues = state.answerData?.clues || [];
  if (state.answerData?.sealed?.length) return true;
  return clues.some((clue, index) => (
    (clue.c === 'equipment' || clue.c === 'cargo' || clue.c === 'traits') && !state.revealed.has(index)
  ));
}

function renderHero() {
  const hero = $('#hero');
  if (!hero) return;
  stopClueScan();
  if (state.roomArbitration) {
    renderArbitrationHero(hero);
    return;
  }
  stopArbitrationRadar();
  if (state.status !== 'playing') stopRadarMosaic();
  const total = state.answerData?.clues?.length || 0;
  const totalHidden = hiddenTotals();
  const visible = state.revealed.size;
  const totalLabel = totalHidden ? '?' : String(total);
  const ended = state.status !== 'playing';
  const answer = displayName(state.answerShip);
  const logos = activeBrandLogos();
  const free = isFree();
  const heroDate = `${state.appMode === 'online' ? t('online.label') : t('practice.label')} // ${t(`gameplay.${state.gameplay}`)}`;
  const claimStatus = !ended ? t('claim.pending') : state.status === 'won' ? t('claim.confirmed') : t('claim.escalated');
  const subject = ended ? claimStatus : t('hero.target');
  const titleFaction = ended ? heroTitleFaction(state.answerShip) : '';
  hero.innerHTML = `
    <div class="hero-copy">
      <div class="claim-mail-head">
        <div class="claim-mail-brand">
          <div class="claim-mail-logos">
            ${brandLogoHtml({
              corporationId: logos.first.id,
              baseUrl: state.manifest?.images?.baseUrl || '',
              size: 128,
              className: 'claim-mail-logo',
              alt: logos.first.alt,
              fallback: logos.first.fallback,
            })}
            <span class="claim-mail-logo-divider" aria-hidden="true">//</span>
            ${brandLogoHtml({
              corporationId: logos.second.id,
              baseUrl: state.manifest?.images?.baseUrl || '',
              size: 128,
              className: 'claim-mail-logo',
              alt: logos.second.alt,
              fallback: logos.second.fallback,
            })}
          </div>
          <div class="claim-mail-brand-copy">
            <div class="claim-mail-company">${esc(brandText('brand.parent'))} // ${esc(brandText('brand.claimDivision'))}</div>
            <div class="claim-mail-system">${esc(FITDLE_SYSTEM_LONG)}</div>
            <div class="claim-mail-file">${esc(t('claim.file'))} <strong>${esc(claimFileId())}</strong></div>
          </div>
        </div>
        <dl class="claim-mail-meta">
          <div><dt>${esc(t('claim.from'))}</dt><dd>${esc(state.claimDepartment?.name || brandText('claim.fromValue'))}</dd></div>
          <div><dt>${esc(t('claim.to'))}</dt><dd>${esc(state.auth.loggedIn ? state.auth.name : t('claim.provisional'))}</dd></div>
          <div><dt>${esc(t('claim.subject'))}</dt><dd>${esc(t('claim.subjectValue'))}</dd></div>
          <div><dt>${esc(t('claim.status'))}</dt><dd class="claim-status">${esc(claimStatus)}</dd></div>
        </dl>
      </div>
      <div class="hero-kicker"><span class="ping"></span>${esc(brandText('hero.kicker'))}<span class="hero-date">${esc(heroDate)}</span></div>
      <h1 id="hero-title"${titleFaction ? ` data-faction="${titleFaction}"` : ''}>${esc(ended ? answer : t('hero.title'))}</h1>
      <div class="hero-subject">${esc(subject)}</div>
      ${state.claimMemo ? `<p class="claim-memo">${esc(state.claimMemo)}</p>` : ''}
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
        </div>
      </div>
    </div>
    <div class="hero-radar${ended ? ' resolved' : ''}">
      <div class="wreck-plate">
        <div class="wreck-plate-tab microtype" aria-hidden="true">
          <span>F.I.T.D.L.E. // SALVAGE PLATE</span>
          <span>WRECK // ${ended ? 'CONFIRMED' : 'SCANNING'}</span>
        </div>
        <div class="radar" aria-hidden="true">
          <div class="radar-visual${ended ? ' is-resolved' : ''}">
            <img class="radar-visual-image" src="${ended ? esc(renderPath(state.answerId)) : ''}" alt="" draggable="false" onload="this.classList.remove('is-missing')" onerror="this.classList.add('is-missing')">
          </div>
          <div class="radar-grid"></div>
          <div class="salvage-scanline"></div>
          <div class="clue-reveal-scan" aria-hidden="true"></div>
          <div class="salvage-noise" aria-hidden="true"></div>
          <span class="scan-corner c1"></span>
          <span class="scan-corner c2"></span>
          <span class="scan-corner c3"></span>
          <span class="scan-corner c4"></span>
        </div>
        <div class="radar-caption microtype">
          <span>${esc(t('hero.scanLabel'))} <strong>${esc(ended ? t('hero.scanComplete') : t('hero.scanActive'))}</strong></span>
          <span class="radar-scale" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
        </div>
      </div>
    </div>
  `;
  startRadarMosaic();
}

function arbitrationRole() {
  const arb = state.roomArbitration;
  const selfId = state.roomSurface?.playerId;
  if (!arb || !selfId) return 'spectator';
  if (arb.dealerId === selfId) return 'dealer';
  if (arb.solved?.has(selfId)) return 'solved';
  if (arb.spectator || arb.role === 'spectator') return 'spectator';
  return 'player';
}

function stopArbitrationRadar() {
  if (state.arbRadarTimer) {
    clearInterval(state.arbRadarTimer);
    state.arbRadarTimer = null;
  }
}

function startArbitrationRadar(host, decoyIds) {
  stopArbitrationRadar();
  const stage = host?.querySelector('.radar-visual[data-arb-radar]');
  if (!stage || !Array.isArray(decoyIds) || !decoyIds.length) return;
  const frames = decoyIds.slice(0, 5).map((id, index) => {
    const img = document.createElement('img');
    img.className = 'radar-visual-image radar-frame';
    img.alt = '';
    img.draggable = false;
    img.src = renderPath(id).replace('size=512', 'size=32');
    img.style.objectPosition = `${24 + index * 13}% ${32 + index * 9}%`;
    img.onerror = () => img.classList.add('is-missing');
    stage.appendChild(img);
    return img;
  });
  if (!frames.length) return;
  let active = 0;
  frames[0].classList.add('is-active');
  state.arbRadarTimer = setInterval(() => {
    active = (active + 1) % frames.length;
    frames.forEach((frame, index) => frame.classList.toggle('is-active', index === active));
  }, 2400);
}

function renderArbitrationHero(hero) {
  const arb = state.roomArbitration;
  const selfId = state.roomSurface?.playerId;
  const role = arbitrationRole();
  const revealed = arb.phase === 'reveal' && Boolean(arb.revealResult);
  const answerId = role === 'dealer' ? Number(arb.dealerTarget?.shipId) || null : null;
  const finalAnswerId = revealed ? Number(arb.revealResult?.target?.shipId) || null : null;
  const targetId = finalAnswerId || answerId;
  const targetShip = targetId ? state.catalogMap.get(targetId) : null;
  const targetName = targetShip ? displayName(targetShip) : '';
  const published = Number(arb.published?.size ?? arb.publishedCount ?? 0);
  const total = Number(arb.clueCount || arb.clues?.length || 0);
  const roleLabel = role === 'dealer'
    ? t('room.dealerTag')
    : role === 'solved'
      ? t('room.solvedSpectating')
      : role === 'spectator'
        ? t('room.spectator')
        : t('room.guess');
  const titleAnswer = targetName && (role === 'dealer' || revealed);
  const titleFaction = titleAnswer ? heroTitleFaction(targetShip) : '';
  hero.innerHTML = `
    <div class="hero-copy">
      <div class="hero-kicker"><span class="ping"></span>${esc(t('gameplay.arbitration'))}<span class="hero-date">${esc(arb.roomCode || '')}</span></div>
      <h1 id="hero-title"${titleFaction ? ` data-faction="${titleFaction}"` : ''}>${esc(titleAnswer ? targetName : t('gameplay.arbitration'))}</h1>
      <div class="hero-subject">${esc(titleAnswer ? (revealed ? t('room.roundAnswer') : t('room.dealerAnswer')) : `${arb.roomCode || ''} // ${arb.room?.code || ''}`)}</div>
      <p class="hero-body">${esc(revealed ? t('room.revealAnswer') : role === 'dealer' ? t('room.fullIntel') : t('room.publishedIntel'))}</p>
      <div class="hero-stats">
        <div class="hero-stat">
          <span>${esc(t('room.round', { round: Number(arb.round) || 1, total: Number(arb.totalRounds) || 6 }))}</span>
          <strong>${esc(String(Number(arb.round) || 1))}<em>/${esc(String(Number(arb.totalRounds) || 6))}</em></strong>
          <small>${esc(arb.bigRound ? t('room.bigRound', { number: arb.bigRound.number, total: arb.bigRound.total }) : '')}</small>
        </div>
        <div class="hero-stat">
          <span>${esc(t('room.publishedIntel'))}</span>
          <strong>${published}<em>/${total || '?'}</em></strong>
          <small>${esc(t('room.dealerLine', { name: state.roomSurface?.playerName(arb.dealerId) || '—' }))}</small>
        </div>
        <div class="hero-stat">
          <span>${esc(t('hero.status'))}</span>
          <strong>${esc(roleLabel)}</strong>
          <small>${selfId ? `#${esc(state.roomSurface?.localId(selfId))}` : ''}</small>
        </div>
      </div>
    </div>
    <div class="hero-radar${targetId ? ' resolved' : ''}">
      <div class="wreck-plate">
        <div class="wreck-plate-tab microtype" aria-hidden="true">
          <span>F.I.T.D.L.E. // ARBITRATION</span>
          <span>ROOM // ${esc(arb.roomCode || '')}</span>
        </div>
        <div class="radar" aria-hidden="true">
          <div class="radar-visual${targetId ? ' is-resolved' : ''}" data-arb-radar>
            ${targetId ? `<img class="radar-visual-image" src="${esc(renderPath(targetId))}" alt="" draggable="false" onload="this.classList.remove('is-missing')" onerror="this.classList.add('is-missing')">` : ''}
          </div>
          <div class="radar-grid"></div>
          <div class="salvage-scanline"></div>
          <div class="clue-reveal-scan" aria-hidden="true"></div>
          <div class="salvage-noise" aria-hidden="true"></div>
          <span class="scan-corner c1"></span>
          <span class="scan-corner c2"></span>
          <span class="scan-corner c3"></span>
          <span class="scan-corner c4"></span>
        </div>
        <div class="radar-caption microtype">
          <span>${esc(t('room.publishedIntel'))} <strong>${targetId ? esc(targetName || t('room.revealAnswer')) : published}</strong></span>
        </div>
      </div>
    </div>
  `;
  if (!targetId) {
    requestAnimationFrame(() => startArbitrationRadar(hero, arb.decoyShipIds || []));
  } else {
    stopArbitrationRadar();
  }
}

function stopRadarMosaic() {
  if (state.radarMosaicTimer) {
    clearInterval(state.radarMosaicTimer);
    state.radarMosaicTimer = null;
  }
  stopSalvageNoise();
}

function stopSalvageNoise() {
  if (state.salvageNoiseTimer) {
    clearTimeout(state.salvageNoiseTimer);
    state.salvageNoiseTimer = null;
  }
  document.querySelector('.salvage-noise')?.replaceChildren();
}

function stopClueScan() {
  if (state.clueScanTimer) {
    clearTimeout(state.clueScanTimer);
    state.clueScanTimer = null;
  }
  document.querySelector('.hero-radar')?.classList.remove('is-clue-scanning');
  document.querySelector('.clue-reveal-scan')?.classList.remove('is-playing');
}

function playClueScan() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  const hero = document.querySelector('.hero-radar');
  const overlay = document.querySelector('.clue-reveal-scan');
  if (!hero || !overlay) return;
  stopClueScan();
  hero.classList.add('is-clue-scanning');
  overlay.classList.remove('is-playing');
  void overlay.offsetWidth;
  overlay.classList.add('is-playing');
  state.clueScanTimer = setTimeout(stopClueScan, 850);
}

function syncClueScan() {
  const revealSize = state.revealed.size;
  if (state.booted && revealSize > state.lastRevealSize) playClueScan();
  state.lastRevealSize = revealSize;
}

function spawnSalvageNoise() {
  if (state.status !== 'playing') return;
  const host = document.querySelector('.salvage-noise');
  if (!host) return;
  const count = Math.random() < 0.14 ? 0 : 1 + Math.floor(Math.random() * 10);
  host.replaceChildren();
  for (let index = 0; index < count; index++) {
    const piece = document.createElement('i');
    const life = 120 + Math.random() * 360;
    const streak = Math.random() < 0.28;
    piece.className = 'salvage-fragment';
    piece.style.left = `${3 + Math.random() * 94}%`;
    piece.style.top = `${4 + Math.random() * 92}%`;
    piece.style.width = streak ? `${12 + Math.random() * 28}px` : `${3 + Math.random() * 10}px`;
    piece.style.height = `${1 + Math.random() * 5}px`;
    piece.style.setProperty('--noise-r', `${Math.random() * 180}deg`);
    piece.style.setProperty('--noise-life', `${life}ms`);
    piece.style.animationDelay = `${Math.random() * 50}ms`;
    host.appendChild(piece);
  }
  state.salvageNoiseTimer = setTimeout(spawnSalvageNoise, 420 + Math.random() * 1050);
}

function startRadarMosaic() {
  stopRadarMosaic();
  if (state.status !== 'playing') return;
  const stage = document.querySelector('.radar-visual');
  if (!stage || (!state.answerId && !isMasked())) return;
  spawnSalvageNoise();

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
    frame.style.objectPosition = `${Math.floor(Math.random() * 60) + 20}% ${Math.floor(Math.random() * 60) + 20}%`;
    frame.style.transform = `scale(${1.6 + Math.random() * 0.4}) translate(${(Math.random() - 0.5) * 3}%, ${(Math.random() - 0.5) * 3}%)`;
  };
  const cycle = () => {
    active = (active + 1) % frames.length;
    for (let i = 0; i < frames.length; i++) frames[i].classList.toggle('is-active', i === active);
    move(frames[active]);
  };
  move(frames[0]);
  // Each hull holds for two ticks; the drift still advances every tick.
  let ticks = 0;
  state.radarMosaicTimer = setInterval(() => {
    ticks++;
    if (ticks % 2 === 0) cycle();
    else move(frames[active]);
  }, 4000);
}

function attemptIcon(ship) {
  return `<span class="attempt-icon">
    <span class="fallback">${icon('ship')}</span>
    <img src="${esc(shipIconPath(ship))}" alt="" loading="lazy" draggable="false" onerror="this.remove()">
  </span>`;
}

function renderArbitrationAttempts(list) {
  const arb = state.roomArbitration;
  const players = arb.players || [];
  list.innerHTML = players.map((player) => {
    const solved = arb.solved?.has(player.id);
    const guessed = arb.guessed?.has(player.id);
    const dealer = player.id === arb.dealerId;
    const status = dealer ? t('room.dealerTag') : solved ? t('board.confirmed') : guessed ? t('board.locked') : t('board.awaiting');
    return `<li class="attempt ${dealer ? 'is-active' : solved ? 'is-correct' : guessed ? 'is-wrong' : 'is-empty'}">
      <span class="attempt-marker">${avatarHtml(player.name, player.characterId, 32, 'attempt-avatar', state.manifest?.images?.baseUrl)}</span>
      <span class="attempt-body">
        <span class="attempt-name">${esc(player.name)}</span>
        <span class="attempt-meta">${esc(status)}</span>
      </span>
      <span class="attempt-status"><strong>${esc(status)}</strong></span>
    </li>`;
  }).join('');
  const boardCount = $('#board-count-text');
  if (boardCount) boardCount.textContent = `${Number(arb.round) || 1} / ${Number(arb.totalRounds) || 6}`;
}

function renderAttempts() {
  const list = $('#attempts');
  if (!list) return;
  if (state.roomArbitration) {
    renderArbitrationAttempts(list);
    return;
  }
  if (isTimed() && !state.timerStarted && state.status === 'playing' && !state.pendingEnd) {
    list.innerHTML = '';
    const boardCount = $('#board-count-text');
    if (boardCount) boardCount.textContent = '00:00';
    return;
  }
  const ended = state.status !== 'playing';
  const rows = [];
  const board = onlineBoard();
  const pendingRow = () => {
    const ship = state.catalogMap.get(state.pendingGuess);
    if (!ship || state.guesses.includes(ship.id)) return '';
    return `
      <li class="attempt is-complete is-pending" aria-busy="true" aria-label="${esc(`${displayName(ship)}, ${t('board.awaiting')}`)}">
        <span class="attempt-marker">${String(state.guesses.length + 1).padStart(2, '0')}</span>
        ${attemptIcon(ship)}
        <span class="attempt-body">
          <span class="attempt-name">${esc(displayName(ship))}</span>
          <span class="attempt-meta">${esc(raceName(ship))}<span class="sep"></span>${esc(groupName(ship))}</span>
          <span class="match-track" style="--match:0%"><span></span></span>
        </span>
        <span class="attempt-status">
          <strong>${esc(t('board.awaiting'))}</strong>
          <span>…</span>
        </span>
      </li>
    `;
  };
  const actualRow = (i) => {
    const guessId = state.guesses[i];
    const ship = state.catalogMap.get(guessId);
    if (!ship) return '';
    // A masked run has no answer here: the service judged the guess.
    const feedback = board?.feedback?.find((item) => Number(item.shipId) === Number(guessId));
    const correct = board ? Boolean(feedback?.correct) : guessId === state.answerId;
    const similarity = correct ? 100 : board
      ? Number(feedback?.similarity) || 0
      : buildGuessResult(ship, state.answerShip, i + 1).similarity;
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
  const pending = state.pendingGuess != null && !ended ? pendingRow() : '';
  if (isTimed()) {
    // Timed mode has no fixed slots: newest attempt first, oldest last.
    if (pending) rows.push(pending);
    for (let i = state.guesses.length - 1; i >= 0; i--) rows.push(actualRow(i));
  } else {
    // Standard/Audit keep the original chronological six-slot board.
    for (let i = 0; i < ATTEMPT_LIMIT; i++) {
      if (state.guesses[i] != null) rows.push(actualRow(i));
      else if (pending && i === state.guesses.length) rows.push(pending);
      else rows.push(emptyRow(i, !ended && !pending && i === state.guesses.length));
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

const acquireMarkup = new WeakMap();

/** Replace the input area only when it changes, so typing (and an IME) survives updates. */
function paintAcquire(slot, html) {
  if (acquireMarkup.get(slot) === html) return;
  acquireMarkup.set(slot, html);
  slot.innerHTML = html;
  state.composing = false;
}

function paintSearchBox(slot) {
  paintAcquire(slot, `
    <div class="acquire">
      <div class="search-shell">
        <div class="search-wrap">
          <span class="search-icon">${icon('search')}</span>
          <input id="ship-input" class="search-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions" aria-label="${esc(t('board.inputLabel'))}" placeholder="${esc(t('board.placeholder'))}" autocomplete="off" autocorrect="off" spellcheck="false">
          <span class="search-key">ENTER</span>
        </div>
        <button type="button" class="lock-button" data-action="submit">
          ${icon('lock')} ${esc(t('board.submit'))}
        </button>
      </div>
      <div class="acquire-meta">
        <span>${icon('globe')} ${esc(t('board.typeAnyLanguage'))}</span>
        <span>${icon('key')} ${esc(t('board.enterHint'))}</span>
      </div>
    </div>
  `);
  const input = $('#ship-input');
  if (input && !state.composing && input.value !== state.inputValue) input.value = state.inputValue;
  updateLockButton();
}

function renderArbitrationAcquire(slot) {
  const arb = state.roomArbitration;
  if (arb.phase === 'reveal') {
    paintAcquire(slot, `<div class="acquire"><p class="room-note">${esc(t('room.phase.reveal'))}</p></div>`);
    return;
  }
  const role = arbitrationRole();
  const selfId = state.roomSurface?.playerId;
  const canGuess = role === 'player'
    && arb.acceptingGuesses
    && !arb.guessed?.has(selfId)
    && !arb.solved?.has(selfId);
  if (!canGuess) {
    const key = role === 'dealer'
      ? 'room.arbitration.dealerPublish'
      : arb.solved?.has(selfId)
        ? 'room.solvedSpectating'
        : role === 'spectator'
          ? 'room.spectator'
          : 'room.arbitration.waiting';
    paintAcquire(slot, `<div class="acquire"><p class="room-note">${esc(t(key))}</p></div>`);
    return;
  }
  paintSearchBox(slot);
}

function renderAcquire() {
  const slot = $('#acquire-slot');
  if (!slot) return;
  if (state.roomEndless) {
    const phase = state.roomEndless.phase;
    if (phase === 'loading' || phase === 'starting') {
      paintAcquire(slot, `<div class="acquire"><p class="room-note">${esc(phase === 'loading' ? t('room.loadingRound') : t('room.startingRound'))}</p></div>`);
      return;
    }
    if (phase === 'waiting' || phase === 'finished') {
      paintAcquire(slot, `<div class="acquire"><p class="room-note">${esc(t('room.waitingReady'))}</p></div>`);
      return;
    }
  }
  if (state.roomArbitration) {
    renderArbitrationAcquire(slot);
    return;
  }
  if (state.status !== 'playing') {
    paintAcquire(slot, `
      <div class="complete-block" data-status="${state.status}">
        <div class="complete-status">
          <span class="dot"></span>
          <div>${esc(t('board.complete'))}</div>
        </div>
        <button type="button" class="link-button" data-action="debrief">${icon('target')} ${esc(t('end.review'))}</button>
      </div>
    `);
    return;
  }
  if (state.pendingEnd && isMasked()) {
    paintAcquire(slot, `<div class="acquire"><p class="room-note">${esc(t('board.awaiting'))}</p></div>`);
    return;
  }
  if (isTimed() && !state.timerStarted) {
    paintAcquire(slot, `
      <div class="acquire timed-acquire">
        <button type="button" class="start-button" data-action="start-timed">
          ${icon('clock')} ${esc(t('timed.start'))}
        </button>
        <p class="timed-hint">${esc(t('timed.startHint'))}</p>
      </div>`);
    return;
  }
  paintSearchBox(slot);
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
  if (clue.missing) return `<span class="big">${esc(t('clue.unavailable'))}</span>`;
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
      return `<span class="big">${esc(state.kbValueCompact ? isk(value) : iskFull(value))}</span>`;
    case 'losses90':
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
    audit: { cls: 'badge-audit', icon: 'radar', label: t('dossier.audit'), hint: t('dossier.auditHint') },
    cloak: { cls: 'badge-cloak', icon: 'lock', label: t('dossier.cloak'), hint: t('dossier.cloakHint') },
    plex: { cls: 'badge-plex', icon: 'star', label: t('dossier.plex'), hint: t('dossier.plexHint') },
  };
  const badge = badges[tag];
  if (!badge) return '';
  if (tag === 'audit' && state.status !== 'playing' && clue?.calcModule) {
    const calcName = state.refs.modules?.[clue.calcModule]?.name
      || state.extraTypeNames?.[clue.calcModule]
      || `Type #${clue.calcModule}`;
    badge.hint = `${t('dossier.auditHint')} ${t('dossier.auditCalc', { name: calcName })}`;
  }
  return `<span class="badge-hull ${badge.cls}" data-tip="${esc(badge.hint)}" tabindex="0" aria-label="${esc(`${badge.label}: ${badge.hint}`)}">${icon(badge.icon)} ${esc(badge.label)}</span>`;
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
  const kbValueToggle = clue.k === 'kbValue' && revealed;
  const toggleAttrs = massToggle
    ? ` data-mass-toggle="true" role="button" tabindex="0" data-tip="${esc(t('clue.massToggle'))}"`
    : kbValueToggle
      ? ` data-kb-value-toggle="true" role="button" tabindex="0" data-tip="${esc(t('clue.kbValueToggle'))}" aria-label="${esc(t('clue.kbValueToggle'))}"`
      : '';
  return `<div class="attr-row cat-${category}${clue.k === 'equipment' || clue.k === 'cargo' ? ' equipment-row' : ''}${clue.k === 'bonus' ? ' bonus-row' : ''}${zeroWeight ? ' is-zero-weight' : ''} ${revealed ? 'is-revealed' : 'is-hidden'}${fresh ? ' is-fresh' : ''}" data-clue-index="${index}" data-clue-kind="${esc(clue.k)}" data-category="${category}"${toggleAttrs}>
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

function toggleKillValueFormat() {
  state.kbValueCompact = !state.kbValueCompact;
  for (const row of $$('.attr-row[data-clue-kind="kbValue"]')) {
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

function arbitrationTurnLock(arb, role) {
  if (arb.phase === 'dealer' && role !== 'dealer' && role !== 'spectator') {
    return { locked: true, text: t('room.phase.dealer') };
  }
  if (arb.phase === 'player' && role === 'dealer') {
    return { locked: true, text: t('room.phase.player') };
  }
  return { locked: false, text: '' };
}

function arbitrationPlaceholderHtml() {
  return ['hull', 'nav', 'defense', 'targeting', 'fitting', 'equipment', 'cargo'].map((category) => `
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

function renderArbitrationTurnLock(host, arb, role) {
  const body = host?.closest('.dossier-body');
  if (!body) return;
  const lock = arbitrationTurnLock(arb, role);
  body.classList.toggle('is-turn-locked', lock.locked);
  let overlay = body.querySelector('.dossier-turn-lock');
  if (!lock.locked) {
    overlay?.remove();
    return;
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'dossier-turn-lock';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    body.appendChild(overlay);
  }
  overlay.innerHTML = `<span class="dossier-turn-lock-kicker">${icon('radar')}</span><strong>${esc(lock.text)}</strong>`;
}

function clearFreshHighlight(event) {
  const row = event.currentTarget?.classList?.contains('attr-row')
    ? event.currentTarget
    : event.target?.closest?.('.attr-row.is-fresh, .attr-row.is-new-clue');
  if (!row) return;
  const index = Number(row.dataset.clueIndex);
  row.classList.remove('is-fresh', 'is-new-clue');
  if (Number.isInteger(index)) {
    state.fresh.delete(index);
    state.arbFresh.delete(index);
  }
}

function renderArbitrationHiddenRow(clue, index) {
  const category = groupCategory(clue);
  return `<div class="attr-row cat-${category} is-hidden" data-clue-index="${index}" data-clue-kind="${esc(clue.k || 'hidden')}" data-category="${category}">
    <span class="attr-label">${esc(t('dossier.encrypted'))}</span>
    <span class="attr-value"><span class="attr-redacted" aria-label="?">?</span></span>
    <span class="attr-meta"><span class="attr-lock">${icon('lock')}</span></span>
  </div>`;
}

/**
 * What the dealer would earn by publishing `pending` now: this round's points
 * if nobody solves, and the end bonus if the stint ended at that share.
 */
function arbitrationDealerPreview(arb, pending) {
  const scoring = arb.scoring || ARBITRATION_SCORING;
  const players = Math.max(1, Number(arb.playerCount) || 1);
  const byIndex = new Map((arb.dealerClues || []).map((clue) => [Number(clue.i), clue]));
  const added = pending.reduce((sum, index) => sum + (Number(byIndex.get(Number(index))?.p) || 0), 0);
  const share = Math.min(1, (Number(arb.share) || 0) + added);
  const unsolved = Math.max(0, players - (arb.solved?.size || 0));
  return {
    round: Math.round(arbitrationDealerRoundRaw({ share, unsolved, scoring }) / players),
    end: Math.round(arbitrationEndBonusRaw({ share, players, scoring }) / players),
  };
}

function renderArbitrationDossier() {
  const arb = state.roomArbitration;
  const role = arbitrationRole();
  const isDealer = role === 'dealer';
  const published = arb.published || new Set();
  if (state.arbSeenMatchId !== arb.matchId) {
    state.arbSeenMatchId = arb.matchId;
    state.arbSeenPublished = new Set();
    state.arbFresh = new Set();
    state.arbFreshRound = null;
  }
  if (state.arbFreshRound !== arb.round) {
    state.arbFreshRound = arb.round;
    state.arbFresh = new Set();
    state.arbSeenPublished = new Set(published);
  }
  const freshClues = [...published].filter((index) => !state.arbSeenPublished.has(index));
  for (const index of freshClues) {
    state.arbSeenPublished.add(index);
    if (!isDealer) state.arbFresh.add(index);
  }
  const publishedByIndex = new Map((arb.publishedClues || []).map((clue) => [Number(clue.i), clue]));
  const clueMeta = Array.isArray(arb.clueMeta) ? arb.clueMeta : [];
  const clues = isDealer
    ? (arb.dealerClues || [])
    : clueMeta.map((meta) => {
      const index = Number(meta.i);
      return publishedByIndex.get(index) || { ...meta, hidden: true };
    });
  const total = Number(arb.clueCount || clues.length || 0);
  const shown = published.size;
  const countText = $('#dossier-count-text');
  const countLabel = countText?.parentElement?.querySelector('span');
  const orb = $('#dossier-orb');
  const progressLine = document.querySelector('.dossier-panel .progress-line');
  if (isDealer) {
    const selected = state.roomSurface?.selected || new Set();
    const auto = new Set();
    for (const clue of (arb.dealerClues || [])) {
      if (clue.auto && !published.has(Number(clue.i))) auto.add(Number(clue.i));
    }
    const pending = [...new Set([...selected, ...auto])].filter((index) => !published.has(Number(index)));
    const preview = arbitrationDealerPreview(arb, pending);
    if (countText) {
      countText.textContent = String(preview.round);
      const tip = t('room.arbitration.endBonus', { points: preview.end });
      countText.parentElement?.setAttribute('data-tip', tip);
      countText.parentElement?.setAttribute('title', tip);
    }
    if (countLabel) countLabel.textContent = t('room.roundScore');
    if (orb) {
      orb.hidden = true;
      orb.style.display = 'none';
    }
    if (progressLine) {
      progressLine.hidden = true;
      progressLine.style.display = 'none';
    }
  } else {
    const canScore = role === 'player' && arb.phase === 'player';
    if (countText) {
      countText.textContent = canScore
        ? String(arbitrationSolvePoints({ share: arb.share, round: arb.round, scoring: arb.scoring || ARBITRATION_SCORING }))
        : `${shown} / ${total || '?'}`;
      countText.parentElement?.removeAttribute('data-tip');
      countText.parentElement?.removeAttribute('title');
    }
    if (countLabel) countLabel.textContent = t(canScore ? 'room.arbitration.solveNow' : 'dossier.decrypted');
    if (orb) {
      orb.hidden = false;
      orb.style.display = '';
    }
    if (progressLine) {
      progressLine.hidden = false;
      progressLine.style.display = '';
    }
    const progress = total ? Math.round((shown / total) * 100) : 0;
    const progressBar = $('#dossier-progress');
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (orb) {
      orb.style.setProperty('--p', progress);
      orb.setAttribute('aria-valuenow', String(progress));
    }
    const orbText = $('#dossier-orb-text');
    if (orbText) orbText.textContent = total ? `${progress}%` : '?';
  }
  if ($('#answer-banner')) $('#answer-banner').innerHTML = '';
  const host = $('#dossier-groups');
  if (!host) return;
  if (!clues.length) {
    host.innerHTML = arbitrationPlaceholderHtml();
    renderArbitrationTurnLock(host, arb, role);
    return;
  }
  const groups = CATEGORIES.map((category) => ({
    category,
    entries: clues.map((clue, index) => ({ clue, index: Number(clue.i ?? index) }))
      .filter((entry) => groupCategory(entry.clue) === category),
  })).filter((group) => group.entries.length);
  host.innerHTML = groups.map(({ category, entries }) => {
    const revealedCount = entries.filter((entry) => !entry.clue.hidden).length;
    return `
    <section class="dossier-group cat-${category}">
      <header class="group-head">
        <span class="group-title">${icon(CATEGORY_ICON[category] || 'dot')}<span>${esc(categoryLabel(category))}</span></span>
        <span class="group-progress" aria-hidden="true"><span style="--p:100"></span></span>
        <span class="group-count"><b>${isDealer ? entries.length : revealedCount}</b> / ${entries.length}</span>
      </header>
      <div class="group-rows">
        ${entries.map(({ clue, index }) => {
          if (clue.hidden) return renderArbitrationHiddenRow(clue, index);
          if (clue.k !== 'bonus') return renderClueRow(clue, index, true);
          const text = clue.text?.[state.locale] || clue.text?.en || '';
          return `<div class="attr-row cat-traits bonus-row is-revealed" data-clue-index="${index}" data-clue-kind="bonus" data-category="traits">
            <span class="attr-label"></span>
            <span class="attr-value">${esc(text)}</span>
            <span class="attr-meta"></span>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  }).join('');
  host.querySelectorAll('.attr-row[data-clue-index]').forEach((row) => {
    const index = Number(row.dataset.clueIndex);
    const clue = clues.find((entry) => Number(entry.i) === index);
    if (!clue || clue.hidden) return;
    const scoreText = `${Math.round((Number(clue.p) || 0) * 1000) / 10}%`;
    const weight = Math.max(0, Number(clue.w) || 0);
    const tip = t('room.clueWeight', { weight });
    const meta = row.querySelector('.attr-meta');
    if (meta) {
      meta.innerHTML = `<span class="room-clue-score" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(`${scoreText} — ${tip}`)}">${esc(scoreText)}</span>`;
    }
    const autoSelected = Boolean(clue.auto) && !published.has(index) && isDealer;
    row.classList.toggle('is-auto-selected', autoSelected);
    row.classList.toggle('is-published', published.has(index));
    row.classList.toggle('is-dealer-published', isDealer && published.has(index));
    if (isDealer && (autoSelected || state.roomSurface?.selected?.has(index))) row.classList.add('is-selected');
    if (!isDealer && state.arbFresh.has(index)) {
      row.classList.add('is-new-clue');
      row.addEventListener('pointerenter', clearFreshHighlight, { once: true });
      row.addEventListener('focusin', clearFreshHighlight, { once: true });
    }
    if (isDealer && arb.phase === 'dealer' && !published.has(index) && clue.k !== 'equipment' && clue.k !== 'cargo') {
      row.classList.add('is-selectable');
      row.dataset.selectIndex = String(index);
      if (state.roomSurface?.selected?.has(index)) row.classList.add('is-selected');
      row.addEventListener('click', () => {
        if (!state.roomSurface) return;
        if (state.roomSurface.selected.has(index)) state.roomSurface.selected.delete(index);
        else state.roomSurface.selected.add(index);
        renderDossier();
        syncRoomAction();
      });
    }
  });
  if (freshClues.length) requestAnimationFrame(() => playClueScan());
  renderArbitrationTurnLock(host, arb, role);
}

function renderDossier() {
  if (state.roomArbitration) {
    renderArbitrationDossier();
    return;
  }
  const arbBody = document.querySelector('.dossier-body');
  arbBody?.classList.remove('is-turn-locked');
  arbBody?.querySelector('.dossier-turn-lock')?.remove();
  if (!state.answerData) return;
  if (isTimed() && !state.timerStarted && state.status === 'playing' && !state.pendingEnd) {
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

  // Groups of a masked run with clues the service has not released yet.
  const sealedGroups = new Set((state.answerData.sealed || []).map((c) => groupCategory({ c })));
  const sealedExtra = (category) => (sealedGroups.has(category) ? 1 : 0);
  const groups = CATEGORIES.map((category) => ({
    category,
    entries: state.answerData.clues
      .map((clue, index) => ({ clue, index }))
      .filter((entry) => groupCategory(entry.clue) === category),
  })).filter((group) => group.entries.length || sealedGroups.has(group.category));

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
        const hidden = ordered.length - revealed.length + sealedExtra(category);
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
          ? counterTotal - counterRevealed + sealedExtra(category)
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
        const hidden = ordered.length - revealed.length + sealedExtra('traits');
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
    host.querySelectorAll('.attr-row.is-fresh').forEach((row) => {
      row.addEventListener('pointerenter', clearFreshHighlight, { once: true });
      row.addEventListener('focusin', clearFreshHighlight, { once: true });
    });
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

function renderRoomLoading() {
  const host = $('#room-loading');
  if (!host) return;
  const room = state.roomSurface?.room;
  const phase = state.roomEndless?.phase;
  if (!state.roomSurface || !room || !state.roomEndless || !['loading', 'ready', 'starting'].includes(phase)) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  const match = room.match || {};
  const ready = Array.isArray(match.ready) ? match.ready.length : 0;
  const active = Number(match.activeCount) || state.roomEndless.activeCount || ready;
  host.hidden = false;
  host.innerHTML = `
    <div class="room-loading-panel" role="status" aria-live="polite">
      <div class="room-loading-radar" aria-hidden="true">
        <span class="room-loading-ring"></span>
        <span class="room-loading-ring is-inner"></span>
        <span class="room-loading-sweep"></span>
      </div>
      <div class="room-loading-copy">
        <span class="mp-kicker">${esc(t('room.loadingKicker'))}</span>
        <h2>${esc(t('room.loadingKb'))}</h2>
        <p>${esc(t('room.readyCount', { ready, total: active }))}</p>
        <div class="room-loading-bar"><span style="--p:${active ? Math.round((ready / active) * 100) : 0}%"></span></div>
      </div>
      <div class="room-loading-shade" aria-hidden="true"></div>
    </div>`;
}

function renderAll() {
  renderRoomLoading();
  renderHero();
  renderAttempts();
  renderAcquire();
  renderDossier();
  renderChrome();
  syncRoomAction();
  syncClueScan();
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
  state.suggestionChosen = false;
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
  state.suggestionChosen = false;
  const input = $('#ship-input');
  if (input && input.value !== value) input.value = value;
  const exact = exactShip(value);
  state.selectedId = exact?.id ?? null;
  updateLockButton();
  renderSuggestions();
}

function currentGuessShip() {
  // A suggestion chosen with the arrow keys is an explicit choice.
  if (state.suggestionChosen && state.suggestions[state.activeSuggestion]) {
    return state.suggestions[state.activeSuggestion];
  }
  const { ship, ambiguous } = resolveShipQuery(state.index, state.inputValue, {
    exclude: new Set(state.guesses),
    selectedId: state.selectedId,
  });
  if (ship) return ship;
  if (ambiguous) {
    // Let the player choose instead of guessing one of them.
    renderSuggestions();
    $('#ship-input')?.focus();
    return null;
  }
  showToast(t('toast.invalid'), '', 'error');
  return null;
}

function submitGuess() {
  if (state.status !== 'playing') return;
  if (state.roomEndless && state.roomEndless.phase !== 'playing') return;
  if (state.roomArbitration) {
    const arb = state.roomArbitration;
    const selfId = state.roomSurface?.playerId;
    if (!selfId || arb.role === 'dealer' || arb.role === 'spectator') return;
    if (!arb.acceptingGuesses || arb.solved?.has(selfId) || arb.guessed?.has(selfId)) return;
    const ship = currentGuessShip();
    if (!ship) return;
    if (!state.roomSurface?.send({ t: 'guess', text: displayName(ship) })) return;
    state.inputValue = '';
    state.selectedId = null;
    state.activeSuggestion = -1;
    state.suggestions = [];
    hideSuggestions();
    renderAcquire();
    return;
  }
  if (isTimed() && Date.now() < state.lockCooldownUntil) return;
  if (isMasked() && state.pendingGuess != null) {
    showToast(t('online.guessPending'), '', 'warn');
    return;
  }
  const ship = currentGuessShip();
  if (!ship) return;
  if (state.guesses.includes(ship.id)) {
    showToast(t('toast.duplicate'), '', 'warn');
    return;
  }
  applyGuess(ship.id);
}

function recordDailyResult() {
  if (state.roomEndless) {
    finishEndlessRound();
    return;
  }
  void finishOnlineRun();
}

/** A guess of a masked run: the service judges it and answers with the new board. */
function applyMaskedGuess(shipId) {
  dropCurrentTargetCache();
  hideSuggestions();
  state.pendingGuess = shipId;
  state.inputValue = '';
  state.selectedId = null;
  state.activeSuggestion = -1;
  state.suggestions = [];
  if (state.roomEndless) {
    // The room keeps the guess until the service confirmed it.
    state.roomSurface?.sendGuess(state.roomEndless.roundId, shipId);
  } else {
    void runSync?.guess(state.onlineRun.runId, shipId, isTimed() ? currentElapsed() : 0).then((delivered) => {
      if (delivered === false && state.pendingGuess === shipId) showToast(t('online.recordPending'), '', 'warn', 5000);
    });
  }
  renderAll();
  if (isTimed()) startLockCooldown();
  if (window.innerWidth < 860) $('#ship-input')?.blur();
}

/**
 * The service's board of a masked run: guesses, released clues and, once the
 * run has ended, the answer. Returns false when nothing changed.
 */
function applyMaskedRun(run) {
  const previous = state.onlineRun;
  const previousRevealed = new Set(state.revealed);
  const previousGuesses = state.guesses.length;
  const ended = run.completed && state.status === 'playing';
  const guesses = (run.guesses || []).map(Number).filter((id) => state.catalogMap.has(id));
  const changed = ended
    || guesses.length !== state.guesses.length
    || (run.board?.revealed?.length || 0) !== (previous?.board?.revealed?.length || 0);
  state.onlineRun = { ...previous, ...run };
  if (!changed) return false;
  state.guesses = guesses;
  if (state.pendingGuess != null && (guesses.includes(state.pendingGuess) || run.completed)) state.pendingGuess = null;
  if (run.completed) state.pendingEnd = false;
  if (ended) {
    if (isTimed()) {
      stopTimedClock();
      state.timerElapsedMs = Number(run.elapsedMs) || state.timerElapsedMs;
      state.gaveUp = run.status === 'lost' && run.endReason === 'gave-up';
      state.timedExpired = run.status === 'lost' && run.endReason === 'exhausted';
    }
    state.status = run.status;
    state.onlineFinished = true;
    revealOnlineAnswer(run);
  }
  buildMaskedAnswerData();
  recomputeRevealed();
  state.fresh = new Set([...state.revealed].filter((index) => !previousRevealed.has(index)));
  if (guesses.length > previousGuesses) state.latestIndex = previousGuesses;
  return true;
}

/** The answer of an ended masked run, as the service sent it. */
function revealOnlineAnswer(run) {
  const target = run.target;
  if (!target?.killmail?.victim) return;
  state.answerKillmail = target.killmail;
  state.answerId = Number(target.shipId || target.killmail.victim.ship_type_id);
  state.answerKillId = Number(target.killId);
  state.answerShip = state.catalogMap.get(state.answerId) || null;
  state.liveLosses = [target.killmail];
  state.liveFetched = true;
  void fetchCargoTypeNames();
}

function applyGuess(shipId) {
  if (isMasked()) {
    applyMaskedGuess(shipId);
    return;
  }
  const ship = state.catalogMap.get(shipId);
  if (!ship) return;
  dropCurrentTargetCache();
  const previousRevealed = new Set(state.revealed);
  const previousGuesses = state.guesses.length;
  hideSuggestions();
  state.guesses.push(shipId);
  if (state.roomEndless) state.roomSurface?.sendGuess(state.roomEndless.roundId, shipId);
  else if (state.onlineRun?.runId) void runSync?.guess(state.onlineRun.runId, shipId, isTimed() ? currentElapsed() : 0);
  const correct = shipId === state.answerId;
  if (isTimed() && correct) stopTimedClock();
  state.status = correct ? 'won' : (isTimed() ? 'playing' : (state.guesses.length >= ATTEMPT_LIMIT ? 'lost' : 'playing'));
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
    if (!state.roomEndless) setTimeout(() => renderDebrief(), 850);
  } else if (window.innerWidth >= 860) {
    setTimeout(() => $('#ship-input')?.focus(), 60);
  } else {
    // Small screens: close the keyboard so the result is visible.
    $('#ship-input')?.blur();
  }
}

// ---------------------------------------------------------------------------
// Debrief and manual
// ---------------------------------------------------------------------------

function zkillKillUrl(killId) {
  return `${state.manifest.zkillboard.baseUrl.replace(/\/$/, '')}/kill/${killId}/`;
}

function updateDebriefPayout() {
  const el = document.querySelector('[data-debrief-payout]');
  if (!el) return;
  const payout = debriefPayoutAmount();
  el.dataset.amount = payout == null ? '' : String(payout);
  animateDebriefPayout();
}

function animateDebriefPayout() {
  if (state.payoutFrame) cancelAnimationFrame(state.payoutFrame);
  state.payoutFrame = 0;
  const el = document.querySelector('[data-debrief-payout]');
  if (!el) return;
  const raw = el.dataset.amount;
  const target = raw === '' ? null : Number(raw);
  if (!Number.isFinite(target)) {
    el.textContent = '—';
    return;
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    el.textContent = iskFull(target);
    return;
  }
  const start = performance.now();
  const duration = 1100;
  const tick = (now) => {
    if (!el.isConnected) {
      state.payoutFrame = 0;
      return;
    }
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    el.textContent = iskFull(Math.round(target * eased));
    if (progress < 1) {
      state.payoutFrame = requestAnimationFrame(tick);
    } else {
      el.textContent = iskFull(target);
      state.payoutFrame = 0;
    }
  };
  el.textContent = iskFull(0);
  state.payoutFrame = requestAnimationFrame(tick);
}

function zkillShipUrl(shipId = state.answerId) {
  return `${state.manifest.zkillboard.baseUrl.replace(/\/$/, '')}/ship/${shipId}/`;
}

function shareLink() {
  const base = new URL('.', location.href);
  base.search = '';
  base.hash = '';
  if (state.appMode === 'online' && state.gameplay === 'daily') {
    base.searchParams.set('mode', 'online');
    base.searchParams.set('claim', 'daily');
    base.searchParams.set('share', 'daily');
    return base.toString();
  }
  if (state.roomCode) {
    base.searchParams.set('mode', 'multiplayer');
    base.searchParams.set('share', 'room');
    base.searchParams.set('room', state.roomCode);
    return base.toString();
  }
  if (!state.freeKillToken) return location.href;
  base.searchParams.set('claim', state.gameplay);
  base.searchParams.set('kb', state.freeKillToken);
  base.searchParams.set('share', 'kb');
  return base.toString();
}

function renderDebrief() {
  if (state.status === 'playing' || !state.answerData || !state.answerShip) return;
  const won = state.status === 'won';
  const ship = state.answerShip;
  const total = state.answerData.clues.length;
  const free = isFree();
  // Online targets other than Daily are not shared; practice killmails are.
  const shareable = state.appMode !== 'online' || state.gameplay === 'daily';
  const sampleKill = state.answerData.sampleKill;
  const payout = debriefPayoutAmount();
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
  const claimDebrief = claimDebriefForStatus();
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
            <strong>${zkillShipLink(displayName(ship), ship.id, heroTitleFaction(ship))}</strong>
          </div>
        </div>
        <div class="debrief-main">
          ${oneShot ? `<div class="one-shot-banner"><span class="one-shot-mark">01</span><span>${esc(t('end.victoryKicker'))} // ${esc(t('oneShot.kicker'))}</span></div>` : ''}
          <div class="debrief-kicker"><span class="dot"></span>${esc(kicker)}</div>
          <h2 id="debrief-title">${esc(title)}</h2>
          <div class="debrief-payout${won ? '' : ' is-void'}">
            <span>${esc(t('end.insurancePayout'))}</span>
            <strong data-debrief-payout data-amount="${payout == null ? '' : payout}" aria-live="polite">${payout == null ? '—' : iskFull(0)}</strong>
          </div>
          <p class="debrief-body">${esc(claimDebrief || body)}</p>

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
                 <div class="debrief-stat"><span>${esc(t('end.intel'))}</span><strong>${total} / ${total}</strong></div>`
              : `<div class="debrief-stat"><span>${esc(t('end.attempts'))}</span><strong>${state.guesses.length} / 6</strong></div>
                 <div class="debrief-stat"><span>${esc(t('end.intel'))}</span><strong>${total} / ${total}</strong></div>`}
          </div>

          <div class="debrief-description">${description.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
          ${bonusHtml}

          <div class="debrief-actions">
            ${shareable ? `<button type="button" class="button primary" data-action="copy-share">${icon('share')} ${esc(t('end.share'))}</button>` : ''}
            ${kbHref ? `<a class="button" href="${esc(kbHref)}" target="_blank" rel="noopener noreferrer">${icon('external')} ${esc(kbLabel)}</a>` : ''}
            <button type="button" class="button ghost" data-action="close-modal">${esc(t('end.review'))}</button>
          </div>

          ${shareable ? `<div class="share-box">
            <label for="share-url">${esc(t('end.share'))}</label>
            <input id="share-url" type="text" readonly value="${esc(shareLink())}">
          </div>` : ''}

          <div class="debrief-next" id="debrief-next">
            ${state.appMode === 'online' && state.gameplay === 'daily'
              ? `<span>${esc(t('end.next'))}</span><strong>${esc(nextDowntime())}</strong>`
              : `<span>${esc(state.appMode === 'online' ? t('online.label') : t('practice.label'))}</span><strong>${esc(t(`gameplay.${state.gameplay}`))}</strong>`}
          </div>
        </div>
      </div>
    </div>
  `;
  openModal(html, 'debrief', state.status);
  animateDebriefPayout();
  if (payout == null && !state.insuranceLoaded) {
    void loadInsurancePrices().then(() => {
      if (state.modal?.kind === 'debrief') updateDebriefPayout();
    });
  }
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
  if (state.payoutFrame) cancelAnimationFrame(state.payoutFrame);
  state.payoutFrame = 0;
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

/** One line renders as a paragraph; several lines render as a list. */
function manualBody(text) {
  const lines = String(text).split('\n').filter(Boolean);
  if (lines.length < 2) return `<p>${esc(text)}</p>`;
  return `<ul class="manual-mode-list">${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`;
}

function multiplayerManualBlocks() {
  return [
    ['help.multiplayerFlowTitle', 'help.multiplayerFlow'],
    ['help.multiplayerRaceTitle', 'help.multiplayerRace'],
    ['help.multiplayerArbitrationTitle', 'help.multiplayerArbitration'],
  ].map(([title, body]) => `
    <div class="manual-mode-block">
      <h4>${esc(t(title))}</h4>
      ${manualBody(t(body))}
    </div>`).join('');
}

function renderManual() {
  const html = `
    <div class="modal manual" role="dialog" aria-modal="true" aria-labelledby="manual-title" data-kind="manual">
      <button type="button" class="modal-close" data-action="close-modal" aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      <div class="manual-head">
        <div class="panel-kicker">${icon('help')} // ${esc(t('header.help'))}</div>
        <h2 id="manual-title">${esc(t('help.title'))}</h2>
        <p>${esc(brandText('help.intro'))}</p>
      </div>
      <div class="manual-body">
        <div class="manual-column">
          <div class="manual-section">
            <h3>${icon('calendar')} ${esc(t('help.modesTitle'))}</h3>
            <div class="manual-mode-block">
              <h4>${esc(t('mode.daily'))}</h4>
              <p>${esc(t('help.dailyBody', { time: formatGameDayStart(gameDayStartMinutes()) }))}</p>
            </div>
            <div class="manual-mode-block">
              <h4>${esc(t('online.label'))}</h4>
              <p>${esc(t('help.onlineBody'))}</p>
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
              <h4>${esc(t('mode.audit'))}</h4>
              <p class="manual-mode-hint">${esc(t('mode.auditHint'))}</p>
              <ul class="manual-mode-list">${t('mode.helpAudit').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
            <div class="manual-mode-block">
              <h4>${esc(t('mode.timed'))}</h4>
              <p class="manual-mode-hint">${esc(t('mode.timedHint'))}</p>
              <ul class="manual-mode-list">${t('mode.helpTimed').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
          </div>
        </div>
        <div class="manual-column">
          <div class="manual-section">
            <h3>${icon('radar')} ${esc(t('mode.multiplayer'))}</h3>
            <p>${esc(t('help.multiplayerBody'))}</p>
            ${multiplayerManualBlocks()}
          </div>
        </div>
      </div>
      <div class="manual-section manual-legal">
        <h3>${icon('external')} ${esc(t('footer.copyrightTitle'))}</h3>
        <p>${copyrightHtml()}</p>
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
  if (state.gameplay === 'daily' && state.appMode === 'online' && !dailyResetReady()) {
    showToast(t('mode.daily'), tl('mode.dailyFixed', 'The Daily target is fixed and cannot be refreshed.'), 'warn', 3200);
    return;
  }
  dropCurrentTargetCache();
  const url = new URL(location.href);
  url.searchParams.delete('kb');
  location.href = url.toString();
}

async function changeLocale(nextLocale) {
  if (!isLocale(nextLocale) || nextLocale === state.locale || state.localeLoading) return;
  const previous = state.locale;
  const targetSnapshot = localeTargetSnapshot();
  state.localeLoading = true;
  renderChrome();
  try {
    state.locale = nextLocale;
    state.i18n = createI18n(nextLocale);
    await loadLocaleData(nextLocale, { keepLive: true, keepAnswer: true });
    await loadClaimDepartments();
    if (localeTargetChanged(targetSnapshot)) {
      restoreLocaleTarget(targetSnapshot);
      debugLog('locale target restored');
    }
    restoreLocaleKbValue(targetSnapshot);
    restoreLocaleKb(targetSnapshot);
    pickClaimDepartment(true);
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
    state.roomSurface?.updateLocale?.(state.locale, state.refs);
    if (modalKind === 'debrief') renderDebrief();
    if (modalKind === 'manual') renderManual();
    showToast(t('toast.langChanged', { lang: LOCALE_META[nextLocale].label }), '', 'info', 2400);
  } catch (err) {
    console.error(err);
    state.locale = previous;
    state.i18n = createI18n(previous);
    state.localeLoading = false;
    try {
      await loadLocaleData(previous, { keepLive: true, keepAnswer: true });
      if (localeTargetChanged(targetSnapshot)) restoreLocaleTarget(targetSnapshot);
      restoreLocaleKbValue(targetSnapshot);
      restoreLocaleKb(targetSnapshot);
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
    const currentDay = gameDateKey(now, gameDayStartMinutes());
    const dayChanged = currentDay !== state.today;
    if (dayChanged) {
      const targetDay = state.targetGameDay || state.today;
      state.today = currentDay;
      if (!isFree()) {
        if (targetDay !== currentDay && !state.newTargetAvailable) {
          state.newTargetAvailable = true;
          showToast(t('toast.newPuzzle'), '', 'warn', 5000);
        }
        renderChrome();
        renderHero();
      }
    }
    const countdown = $('#daily-reset-countdown');
    if (countdown) countdown.textContent = dailyResetReady() ? '00:00:00' : nextDowntime();
    const dbNext = $('#debrief-next');
    if (dbNext) {
      dbNext.innerHTML = state.appMode === 'online' && state.gameplay === 'daily'
        ? `<span>${esc(t('end.next'))}</span><strong>${esc(nextDowntime())}</strong>`
        : `<span>${esc(state.appMode === 'online' ? t('online.label') : t('practice.label'))}</span><strong>${esc(t(`gameplay.${state.gameplay}`))}</strong>`;
    }
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



let uiTipElement = null;
function ensureUiTip() {
  if (!uiTipElement) {
    uiTipElement = document.createElement('div');
    uiTipElement.id = 'ui-tooltip';
    uiTipElement.className = 'ui-tooltip';
    uiTipElement.setAttribute('role', 'tooltip');
    uiTipElement.hidden = true;
    document.body.append(uiTipElement);
  }
  return uiTipElement;
}

function showUiTip(target) {
  const text = String(target?.dataset?.tip || '').trim();
  if (!text) return;
  const tip = ensureUiTip();
  tip.textContent = text;
  tip.hidden = false;
  const rect = target.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(320, Math.max(180, tip.offsetWidth || 240));
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  let top = rect.bottom + margin;
  if (top + tip.offsetHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - tip.offsetHeight - margin);
  }
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.maxWidth = `${width}px`;
}

function hideUiTip() {
  if (uiTipElement) uiTipElement.hidden = true;
}

document.addEventListener('pointerover', (event) => {
  const target = event.target.closest?.('[data-tip]');
  if (target && !target.contains(event.relatedTarget)) showUiTip(target);
});
document.addEventListener('pointerout', (event) => {
  const target = event.target.closest?.('[data-tip]');
  if (target && !target.contains(event.relatedTarget)) hideUiTip();
});
document.addEventListener('focusin', (event) => {
  const target = event.target.closest?.('[data-tip]');
  if (target) showUiTip(target);
});
document.addEventListener('focusout', (event) => {
  const target = event.target.closest?.('[data-tip]');
  if (target) hideUiTip();
});
document.addEventListener('click', (event) => {
  const target = event.target.closest?.('[aria-disabled="true"][data-tip]');
  if (target) {
    event.preventDefault();
    showUiTip(target);
  }
});
window.addEventListener('scroll', hideUiTip, true);
window.addEventListener('resize', hideUiTip);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideUiTip();
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target.closest?.('.new-target-cta');
  if (target && target.getAttribute('aria-disabled') !== 'true' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8);
  }
});


document.addEventListener('click', (event) => {
  if (event.target.closest('[data-mass-toggle]')) {
    toggleMassUnit();
    return;
  }
  if (event.target.closest('[data-kb-value-toggle]')) {
    toggleKillValueFormat();
    return;
  }
  if (!event.target.closest('.pilot-wrap, .appearance-wrap')) closeTopbarMenus();
  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    if (actionEl.getAttribute('aria-disabled') === 'true') {
      showUiTip(actionEl);
      return;
    }
    const action = actionEl.dataset.action;
    if (action === 'pilot-menu') {
      const menu = $('#pilot-menu');
      if (!menu) return;
      const open = menu.hidden;
      closeTopbarMenus();
      if (open) {
        menu.hidden = false;
        actionEl.setAttribute('aria-expanded', 'true');
      }
      return;
    }
    if (action === 'appearance-menu') {
      const menu = $('#appearance-menu');
      if (!menu) return;
      const open = menu.hidden;
      closeTopbarMenus();
      if (open) {
        menu.hidden = false;
        actionEl.setAttribute('aria-expanded', 'true');
      }
      return;
    }
    if (action === 'start-timed') { startTimedRun(); return; }
    if (action === 'login') { location.assign(api.loginUrl()); return; }
    if (action === 'logout') {
      api.logout().finally(() => location.assign(location.pathname));
      return;
    }
    if (action === 'set-gameplay') { setGameplay(actionEl.dataset.gameplay); return; }
    if (action === 'new-target') { void requestNewTarget(); return; }
    if (action === 'abandon-target') { closeModal(); void takeNewTarget(); return; }
    if (action === 'rooms') { openRooms(); return; }
    if (action === 'room-action') { handleRoomAction(); return; }
    if (action === 'leave-room') { leaveRoomAndRestore(); return; }
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
  if (event.target.closest('[data-kb-value-toggle]') && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    toggleKillValueFormat();
    return;
  }
  if (event.key === 'Escape' && [$('#pilot-menu'), $('#appearance-menu')].some((menu) => menu && !menu.hidden)) {
    event.preventDefault();
    closeTopbarMenus();
    return;
  }
  if (state.modal) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
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
    state.suggestionChosen = true;
    renderSuggestions();
  } else if (event.key === 'ArrowUp') {
    if (!state.suggestions.length) return;
    event.preventDefault();
    state.activeSuggestion = (state.activeSuggestion - 1 + state.suggestions.length) % state.suggestions.length;
    state.suggestionChosen = true;
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

class DailyUnavailableError extends Error {
  constructor(reason, cause = null) {
    super(reason || 'daily-unavailable');
    this.name = 'DailyUnavailableError';
    this.reason = reason || 'unknown';
    this.cause = cause;
  }
}

function dailyErrorCopy(reason) {
  const value = String(reason || '');
  if (value === 'time') {
    return {
      lore: 'error.timeLore',
      code: 'error.timeTitle',
      body: 'error.timeBody',
    };
  }
  if (value.startsWith('kb')) {
    return {
      lore: 'error.zkillLore',
      code: 'error.zkillTitle',
      body: 'error.zkillBody',
    };
  }
  if (value.startsWith('esi')) {
    return {
      lore: 'error.esiLore',
      code: 'error.esiTitle',
      body: 'error.esiBody',
    };
  }
  return {
    lore: 'error.dailyLore',
    code: 'error.dailyUnavailableTitle',
    body: 'error.dailyUnavailableBody',
  };
}

function showFatal(error) {
  debugLog('fatal', error, {
    fatal: true,
    reason: error?.reason || null,
  });
  const app = $('#app');
  if (!app) return;
  if (error instanceof DailyUnavailableError) {
    const copy = dailyErrorCopy(error.reason);
    app.innerHTML = `<div class="fatal-screen">
      <div class="fatal-glyph">${icon('radar')}</div>
      <div class="fatal-code">${esc(t(copy.code))}</div>
      <h1>${esc(t(copy.lore))}</h1>
      <p>${esc(t(copy.body))}</p>
      <div class="fatal-actions">
        <button class="button primary" type="button" data-action="new-target">${icon('radar')} ${esc(tl('online.newTarget', 'NEW TARGET'))}</button>
        <button class="button" type="button" onclick="location.reload()">${icon('refresh')} ${esc(t('error.retry'))}</button>
      </div>
    </div>`;
    return;
  }
  if (isOutdatedPage(error)) {
    app.innerHTML = `<div class="fatal-screen">
      <div class="fatal-glyph">${icon('refresh')}</div>
      <div class="fatal-code">${esc(t('error.outdatedCode'))}</div>
      <h1>${esc(t('error.outdatedLore'))}</h1>
      <p>${esc(t('error.outdatedBody'))}</p>
      <div class="fatal-actions">
        <button class="button primary" type="button" onclick="location.reload()">${icon('refresh')} ${esc(t('error.reload'))}</button>
      </div>
    </div>`;
    return;
  }
  if (error instanceof UnknownHullError) {
    app.innerHTML = `<div class="fatal-screen">
      <div class="fatal-glyph">${icon('radar')}</div>
      <div class="fatal-code">${esc(t('error.unknownHullTitle'))}</div>
      <h1>${esc(t('error.unknownHullLore'))}</h1>
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
      <h1>${esc(t('error.noTargetLore'))}</h1>
      <p>${esc(t('error.noTargetBody'))}</p>
      <div class="fatal-actions">
        <button class="button primary" type="button" data-action="new-target">${icon('radar')} ${esc(tl('online.newTarget', 'NEW TARGET'))}</button>
        <button class="button" type="button" onclick="location.reload()">${icon('refresh')} ${esc(t('error.retry'))}</button>
      </div>
    </div>`;
    return;
  }
  app.innerHTML = `<div class="fatal-screen">
    <div class="fatal-glyph">${icon('alert')}</div>
    <div class="fatal-code">${esc(t('error.genericCode'))}</div>
    <h1>${esc(t('error.genericLore'))}</h1>
    <p>${esc(t('error.body'))}</p>
    <div class="fatal-actions">
      <button class="button primary" type="button" data-action="new-target">${icon('radar')} ${esc(tl('online.newTarget', 'NEW TARGET'))}</button>
      <button class="button" type="button" onclick="location.reload()">${icon('refresh')} ${esc(t('error.retry'))}</button>
    </div>
  </div>`;
}

function goBack() {
  if (history.length > 1) history.back();
  else location.replace(BASE.href);
}

function routeGameplay(raw) {
  return ['daily', 'standard', 'audit', 'timed'].includes(raw) ? raw : 'standard';
}

function applyGameplay(gameplay) {
  state.gameplay = gameplay;
  state.timed = gameplay === 'timed';
  state.mode = gameplay === 'audit' ? 'audit' : 'normal';
}

function parseAppRoute() {
  const params = new URLSearchParams(location.search);
  return {
    mode: params.get('mode') || '',
    gameplay: routeGameplay(params.get('claim') || 'daily'),
    kb: params.get('kb') || '',
    room: params.get('room') || '',
  };
}

function setGameplay(gameplay) {
  const next = routeGameplay(gameplay);
  if (state.appMode === 'practice' && next === 'daily') return;
  cacheCurrentTarget();
  const url = new URL(location.href);
  url.searchParams.delete('gameplay');
  url.searchParams.delete('rule');
  url.searchParams.set('claim', next);
  url.searchParams.delete('mode');
  if (state.appMode === 'online') url.searchParams.set('mode', 'online');
  location.assign(url.toString());
}

async function resolveSession() {
  state.auth = { loading: false, loggedIn: false, name: '', characterId: null };
  const metaRequest = api.meta().catch(() => null);
  try {
    const me = await api.me();
    if (me?.loggedIn) {
      state.auth = {
        loading: false,
        loggedIn: true,
        name: String(me.name || ''),
        characterId: Number(me.characterId) || null,
      };
      void refreshProfileStats();
    }
  } catch {
    // Backend unavailable: practice mode.
  }
  // A failed meta request (static/offline) keeps the local date for practice.
  const meta = await metaRequest;
  if (meta?.gameDay) {
    state.meta = meta;
    state.today = meta.gameDay;
    if (Number.isInteger(meta.gameDayStartMinutes)) state.gameDayStartMinutes = meta.gameDayStartMinutes;
  }
}

function installTarget({ killmail, shipId, killId, run = null, source, free = false, cacheable = true }) {
  if (!killmail?.victim?.ship_type_id) throw new UnknownHullError();
  state.freeKillId = free ? Number(killId) : null;
  state.freeKillToken = free ? freeKillToken(Number(killId)) : null;
  state.freeKillmail = free ? killmail : null;
  state.answerKillmail = killmail;
  state.targetSource = source;
  state.answerId = Number(shipId || killmail.victim.ship_type_id);
  state.answerKillId = Number(killId);
  state.answerShip = state.catalogMap.get(state.answerId);
  if (!state.answerShip) throw new UnknownHullError();
  state.dailyKillmail = null;
  state.dailySeed = null;
  state.onlineRun = run;
  state.onlineFinished = Boolean(run?.completed);
  state.kbValueCompact = false;
  state.lastRevealSize = 0;
  state.initialFreshDone = false;
  state.targetGameDay = source === 'online'
    ? String(run?.gameDay || state.today || '')
    : String(state.today || '');
  state.date = source === 'online' ? `online-${run?.runId || killId}` : `practice-${killId}`;
  pickClaimDepartment(false, Number(killId));
  void loadInsurancePrices();
  if (cacheable) cacheCurrentTarget();
}

/** An online run whose answer the service keeps until it has ended. */
function installMaskedTarget(run) {
  state.freeKillId = null;
  state.freeKillToken = null;
  state.freeKillmail = null;
  state.answerKillmail = null;
  state.answerId = null;
  state.answerKillId = null;
  state.answerShip = null;
  state.targetSource = 'online';
  state.dailyKillmail = null;
  state.dailySeed = null;
  state.onlineRun = run;
  state.onlineFinished = Boolean(run.completed);
  state.pendingGuess = null;
  state.kbValueCompact = false;
  state.lastRevealSize = 0;
  state.initialFreshDone = false;
  state.liveLosses = [];
  state.liveStats = null;
  state.liveFetched = true;
  state.liveError = false;
  state.targetGameDay = String(run.gameDay || state.today || '');
  state.date = `online-${run.runId}`;
  if (run.completed) revealOnlineAnswer(run);
  pickClaimDepartment(false);
  void loadInsurancePrices();
}

/** A local board behind the room lobby; it is never shown or played. */
function installPlaceholder() {
  const ship = state.catalog.find((item) => Number(item.id) > 0);
  const killmail = { killmail_id: 0, victim: { ship_type_id: Number(ship.id), items: [] }, zkb: {} };
  installTarget({ killmail, shipId: ship.id, killId: 0, source: 'placeholder', cacheable: false });
  state.liveLosses = [killmail];
  state.liveFetched = true;
}

async function resolvePracticeTarget(route) {
  if (route.kb) {
    const killId = Number(freeKillIdFromToken(route.kb));
    if (!Number.isInteger(killId) || killId <= 0) throw new UnknownHullError();
    const data = await fetchZkill(`/api/killID/${killId}/`, { key: `kill:${killId}`, ttlMs: 3600000 });
    const killmail = Array.isArray(data) ? data[0] : null;
    if (!killmail?.victim?.ship_type_id) throw new DailyUnavailableError('kb-unavailable');
    installTarget({ killmail, shipId: killmail.victim.ship_type_id, killId, source: 'practice', free: true, cacheable: false });
    return;
  }
  if (route.gameplay === 'daily') route.gameplay = 'standard';
  applyGameplay(route.gameplay);
  const killmail = await pickRandomFreeKill();
  if (!killmail?.victim?.ship_type_id) throw new DailyUnavailableError('kb-unavailable');
  installTarget({
    killmail,
    shipId: killmail.victim.ship_type_id,
    killId: killmail.killmail_id,
    source: 'practice',
    free: true,
  });
}

async function resolveOnlineTarget(route) {
  let run;
  if (route.gameplay === 'daily') {
    run = await api.daily();
  } else if (route.kb) {
    run = await api.custom(route.gameplay, route.kb);
  } else {
    run = await api.start(route.gameplay, state.allowEmptyKb);
  }
  if (run?.board) {
    applyGameplay(route.gameplay);
    installMaskedTarget(run);
    return;
  }
  if (!run?.target?.killmail) throw new Error('online target missing');
  applyGameplay(route.gameplay);
  installTarget({
    killmail: run.target.killmail,
    shipId: run.target.shipId,
    killId: run.target.killId,
    run,
    source: 'online',
    free: false,
    cacheable: !route.kb,
  });
}

async function prepareAppTarget(route) {
  const online = state.auth.loggedIn;
  state.appMode = online ? 'online' : 'practice';
  state.loginRequired = !online && (route.mode === 'online' || Boolean(route.room));
  state.gameplay = online || route.gameplay !== 'daily' ? route.gameplay : 'standard';
  state.roomRequest = route.mode === 'multiplayer' || route.room ? route.room || 'lobby' : null;
  if (state.roomRequest) {
    // The room surface takes over after boot. Signed-in pilots need no target of
    // their own for that; guests get a practice one behind the login request.
    state.gameplay = 'standard';
    applyGameplay('standard');
    if (online) {
      installPlaceholder();
      return;
    }
    try {
      await resolvePracticeTarget({ ...route, gameplay: 'standard', kb: '' });
    } catch {
      state.freeKillId = null;
    }
    return;
  }
  applyGameplay(state.gameplay);
  // Online, the service simulates fits; the engine is only needed for practice.
  if (usesSimulatedFit() && !online) preloadDogma();
  if (online && runSync?.runs.size) await runSync.flush();
  if (!route.kb && await restoreCachedTarget(state.gameplay)) return;
  if (online) {
    try {
      await resolveOnlineTarget(route);
      return;
    } catch (error) {
      debugLog('online target', error);
      if (!isOutdatedPage(error)) showToast(t('online.unavailable'), '', 'warn', 5000);
      throw error;
    }
  }
  await resolvePracticeTarget(route);
  if (!online && route.mode === 'online') {
    showToast(t('auth.loginRequired'), '', 'warn', 5000);
  }
}

let runSync = null;

/** Deliver this account's guesses, including those an earlier visit could not send. */
function startRunSync() {
  if (!state.auth.loggedIn) return;
  runSync = new RunSync({
    api,
    storage: localStorage,
    user: state.auth.name,
    onRun: (runId, run) => {
      if (state.onlineRun?.runId === runId) applyServerRun(run);
      if (run.completed) void refreshProfileStats();
    },
    onRejected: (runId, error) => {
      debugLog('online run', error);
      if (isOutdatedPage(error)) {
        showFatal(error);
        return;
      }
      const run = error?.payload?.run;
      if (run && state.onlineRun?.runId === runId) applyServerRun(run);
      else if (state.onlineRun?.runId === runId) {
        if (state.pendingGuess != null) {
          state.pendingGuess = null;
          renderAll();
        }
        showToast(t('online.recordFailed'), '', 'warn', 5000);
      }
      void refreshProfileStats();
    },
  });
}

window.addEventListener('online', () => { void runSync?.flush(); });

/** A page of an older release than the service: it has to reload. */
function isOutdatedPage(error) {
  return Number(error?.status) === 426 || error?.code === 'client-outdated';
}

/** A new board of a masked run: show what the service released and judged. */
function showMaskedRun(run) {
  const guessesBefore = state.guesses.length;
  const shownBefore = state.revealed.size;
  if (!applyMaskedRun(run)) return;
  const guessed = state.guesses.length > guessesBefore;
  if (state.status === 'playing' && (guessed || shownBefore > 0)) {
    if (state.fresh.size > 0) showToast(t('toast.intel'), t('toast.clue', { n: state.fresh.size }), 'info');
    else if (guessed) showToast(t('toast.noMatch'), '', 'warn');
  }
  if (guessed) state.scanPulse = true;
  renderAll();
  rememberNewClues(state.fresh);
  if (state.fresh.size) void fetchCargoTypeNames().then(() => renderDossier());
  if (state.status !== 'playing') {
    dropCurrentTargetCache();
    setTimeout(() => renderDebrief(), guessed ? 850 : 300);
  } else if (guessed && window.innerWidth >= 860) {
    setTimeout(() => $('#ship-input')?.focus(), 60);
  }
}

/** The service's answer wins over the local board, e.g. after playing on two devices. */
function applyServerRun(run) {
  if (state.booted && !state.roomEndless && !state.roomArbitration && isMasked() && run?.board) {
    showMaskedRun(run);
    return;
  }
  state.onlineRun = { ...state.onlineRun, ...run };
  if (!state.booted || state.roomEndless || state.roomArbitration) return;
  const allowed = (run.guesses || []).filter((id) => state.catalogMap.has(Number(id)));
  const guesses = run.completed ? allowed.map(Number) : mergeGuesses(allowed, state.guesses);
  const ended = run.completed && state.status === 'playing';
  if (!ended && guesses.length <= state.guesses.length) return;
  state.guesses = guesses;
  if (ended) {
    if (isTimed()) {
      stopTimedClock();
      state.gaveUp = run.status === 'lost';
    }
    state.status = run.status;
    state.onlineFinished = true;
    dropCurrentTargetCache();
  }
  recomputeRevealed();
  persist();
  renderAll();
  if (ended) renderDebrief();
}

/** The board of an online run: what the service confirmed plus unsent local guesses. */
function mergeOnlineRun(restored) {
  const run = state.onlineRun;
  if (!run?.runId) return restored;
  if (isMasked()) {
    const guesses = (run.guesses || []).map(Number).filter((id) => state.catalogMap.has(id));
    // A guess sent before a reload that the service has not answered yet.
    const waiting = runSync?.runs.get(run.runId)?.guesses?.[0]?.shipId;
    if (!run.completed && waiting && !guesses.includes(Number(waiting))) state.pendingGuess = Number(waiting);
    const merged = { guesses, status: run.status, invalidated: false };
    if (isTimed()) {
      const running = run.status === 'playing' && run.begun;
      const elapsed = Math.max(0, Number(run.now) - Number(run.startedAt) || 0);
      merged.timerStarted = running;
      merged.timerStartAt = running ? Date.now() - elapsed : 0;
      merged.timerElapsedMs = running ? elapsed : Number(run.elapsedMs) || 0;
      merged.gaveUp = run.status === 'lost' && run.endReason === 'gave-up';
      merged.timedExpired = run.status === 'lost' && run.endReason === 'exhausted';
      state.timedPolled = running ? Math.floor(elapsed / 30000) : 0;
      // A give-up sent before a reload that the service has not answered yet.
      if (running && runSync?.runs.get(run.runId)?.lost) state.pendingEnd = true;
    }
    return merged;
  }
  const known = (id) => state.catalogMap.has(Number(id));
  const confirmed = (run.guesses || []).map(Number).filter(known);
  if (run.completed) {
    const lostTimed = isTimed() && run.status === 'lost';
    return {
      guesses: confirmed,
      status: run.status,
      timerElapsedMs: Number(run.elapsedMs) || 0,
      timedExpired: lostTimed && restored.timedExpired === true,
      gaveUp: lostTimed && restored.timedExpired !== true,
    };
  }
  const local = restored.invalidated ? [] : restored.guesses || [];
  const guesses = mergeGuesses(confirmed, local).slice(0, isTimed() ? undefined : ATTEMPT_LIMIT);
  const merged = { ...restored, invalidated: false, guesses };
  if (guesses.includes(state.answerId)) merged.status = 'won';
  else if (!isTimed()) merged.status = guesses.length >= ATTEMPT_LIMIT ? 'lost' : 'playing';
  else merged.status = restored.status === 'lost' ? 'lost' : 'playing';
  if (isTimed() && merged.status === 'playing' && !restored.timerStarted && run.begun) {
    // Started on another device: continue its clock.
    merged.timerStarted = true;
    merged.timerStartAt = Date.now() - Math.max(0, Number(run.now) - Number(run.startedAt) || 0);
  }
  if (restored.timerStarted && !run.begun) void runSync?.begin(run.runId, restored.timerStartAt);
  for (const id of guesses) {
    if (!confirmed.includes(id)) void runSync?.guess(run.runId, id, merged.timerElapsedMs || 0);
  }
  if (isTimed() && merged.status === 'lost') void runSync?.lose(run.runId, merged.timerElapsedMs || 0);
  return merged;
}

/** A counted run of this player that another target would replace. */
function replaceableRun() {
  const run = state.onlineRun;
  return state.appMode === 'online' && run?.runId && run.kind === 'random' ? run : null;
}

/** Before its clock starts a random timed target shows no clue, so there is nothing to change. */
function timedTargetFixed() {
  return isTimed() && state.status === 'playing' && !state.timerStarted
    && !new URL(location.href).searchParams.has('kb');
}

function syncNewTarget() {
  const button = $('.new-target-cta');
  if (!button) return;
  const fixed = timedTargetFixed();
  button.setAttribute('aria-disabled', String(fixed));
  if (fixed) button.dataset.tip = t('mode.timedFixed');
  else delete button.dataset.tip;
}

function requestNewTarget() {
  if (state.newTargetBusy) return;
  const run = replaceableRun();
  const started = run && state.status === 'playing' && !run.completed
    && (state.guesses.length > 0 || state.timerStarted || run.begun);
  if (!started || !$('#modal-root')) return takeNewTarget();
  openModal(`
    <div class="modal mode-modal" role="dialog" aria-modal="true" aria-labelledby="abandon-title" data-kind="abandon">
      <button type="button" class="modal-close" data-action="close-modal" aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      <div class="panel-kicker">${icon('refresh')} // ${esc(t('online.newTarget'))}</div>
      <h2 id="abandon-title">${esc(t('online.abandonTitle'))}</h2>
      <p class="mode-modal-body">${esc(t('online.abandonBody'))}</p>
      <div class="mode-modal-actions">
        <button type="button" class="button primary" data-action="close-modal" data-autofocus>${esc(t('online.abandonKeep'))}</button>
        <button type="button" class="button ghost" data-action="abandon-target">${icon('refresh')} ${esc(t('online.newTarget'))}</button>
      </div>
    </div>
  `, 'abandon');
  return undefined;
}

async function takeNewTarget() {
  if (state.newTargetBusy) return;
  state.newTargetBusy = true;
  const run = replaceableRun();
  try {
    if (run) {
      // Deliver unsent guesses first, so a finished run is not taken for an open one.
      const delivered = !runSync || await runSync.flush();
      if (!delivered) throw new Error('run not delivered');
      if (!state.onlineRun.completed && state.status === 'playing') await api.abandon(run.runId);
    }
  } catch (error) {
    if (error?.status !== 404) {
      debugLog('new target', error);
      state.newTargetBusy = false;
      showToast(t('online.unavailable'), '', 'warn', 5000);
      return;
    }
  }
  dropCurrentTargetCache();
  const url = new URL(location.href);
  url.searchParams.delete('kb');
  url.searchParams.delete('mode');
  url.searchParams.delete('rule');
  url.searchParams.set('claim', state.gameplay);
  if (state.appMode === 'online') url.searchParams.set('mode', 'online');
  location.assign(url.toString());
}

async function refreshProfileStats() {
  if (!state.auth.loggedIn) return;
  try {
    state.profileStats = await api.stats();
    const record = document.querySelector('#pilot-menu .pilot-menu-record');
    if (record) record.outerHTML = pilotStatsHtml();
  } catch (error) {
    debugLog('profile stats', error);
  }
}

async function finishOnlineRun() {
  if (state.appMode !== 'online' || !state.onlineRun?.runId || state.onlineFinished) return;
  if (state.status === 'playing') return;
  state.onlineFinished = true;
  dropCurrentTargetCache();
  // The service judges the guesses; only a timed loss has to be reported.
  const delivered = isTimed() && state.status === 'lost'
    ? await runSync?.lose(state.onlineRun.runId, state.timerStarted ? currentElapsed() : state.timerElapsedMs)
    : await runSync?.flush();
  // After the debrief, which clears earlier notices.
  if (delivered === false) setTimeout(() => showToast(t('online.recordPending'), '', 'warn', 5000), 1000);
}

function roomEntrySnapshot() {
  const url = new URL(location.href);
  const inRoom = url.searchParams.get('mode') === 'multiplayer' || Boolean(url.searchParams.get('room'));
  if (inRoom) {
    url.searchParams.delete('mode');
    url.searchParams.delete('room');
  }
  return {
    href: url.toString(),
    gameplay: state.gameplay,
    started: state.guesses.length > 0 || state.timerStarted,
    timed: isTimed(),
  };
}

function restoreRoomEntry() {
  const entry = state.roomEntry;
  state.roomEntry = null;
  let href = entry?.href || new URL('?', location.href).toString();
  if (entry?.timed && entry.started) {
    const url = new URL(href);
    url.searchParams.delete('claim');
    url.searchParams.delete('rule');
    href = url.toString();
  }
  location.assign(href);
}

function leaveRoomAndRestore() {
  const surface = state.roomSurface;
  if (surface) {
    surface.send({ t: 'leave' });
    surface.leaving = true;
    surface.close();
  }
  restoreRoomEntry();
}

function roomRoundMode(gameplay) {
  if (gameplay === 'audit') return { mode: 'audit', timed: false };
  if (gameplay === 'timed') return { mode: 'normal', timed: true };
  return { mode: 'normal', timed: false };
}

/**
 * A race round: the service keeps the target and sends this player's board
 * (released clues and the match of each guess) once the round starts; the
 * answer follows when this player's part, or the round, is decided.
 */
async function prepareEndlessRound(message) {
  if (!message?.roundId) throw new Error('room-target');
  // The connection dropped and came back during this round: keep the board.
  if (message.resumed && state.roomEndless?.loaded && state.roomEndless.roundId === message.roundId) {
    if (message.board) applyMaskedRun(raceRun(message));
    applySubmittedRound(message);
    applyRoomLayout();
    renderAll();
    return true;
  }
  const gameplay = ['standard', 'audit', 'timed'].includes(message.gameplay) ? message.gameplay : 'standard';
  const { timed } = roomRoundMode(gameplay);
  applyGameplay(gameplay);
  installMaskedTarget({
    race: true,
    roundId: message.roundId,
    board: { clues: [], revealed: [], sealed: [], feedback: [] },
    guesses: [],
    status: 'playing',
    completed: false,
  });
  state.date = `room-${message.roundId}`;
  state.roomCode = state.roomSurface?.code || state.roomCode;
  state.roomView = 'endless';
  state.roomArbitration = null;
  state.roomEndless = {
    roundId: message.roundId,
    roundNo: message.roundNo,
    gameplay,
    phase: 'loading',
    startAt: null,
    serverOffset: 0,
    ready: false,
  };
  state.status = 'playing';
  state.appMode = 'online';
  state.onlineFinished = false;
  state.pendingEnd = false;
  state.guesses = [];
  state.revealed = new Set();
  state.fresh = new Set();
  state.inputValue = '';
  state.selectedId = null;
  state.suggestions = [];
  state.timerStarted = false;
  state.timerStartAt = 0;
  state.timerElapsedMs = 0;
  state.timedPolled = 0;
  state.gaveUp = false;
  state.timedExpired = false;
  state.timed = timed;
  buildMaskedAnswerData();
  if (message.board) applyMaskedRun(raceRun(message));
  state.roomEndless.loaded = true;
  applySubmittedRound(message);
  applyRoomLayout();
  renderAll();
  if (document.fonts?.ready) await document.fonts.ready;
  return true;
}

/** A board message of the room as the run-like object the masked board reads. */
function raceRun(message) {
  const status = ['won', 'lost'].includes(message.status) ? message.status : 'playing';
  return {
    ...state.onlineRun,
    guesses: message.guesses || [],
    board: message.board,
    status,
    completed: status !== 'playing',
    target: message.target || null,
    endReason: message.endReason || null,
    elapsedMs: message.elapsedMs,
  };
}

/** A new board of a race round: show what the service released and judged. */
function showRaceBoard(message) {
  const room = state.roomEndless;
  const guessesBefore = state.guesses.length;
  const shownBefore = state.revealed.size;
  if (!applyMaskedRun(raceRun(message))) return;
  const guessed = state.guesses.length > guessesBefore;
  if (state.status === 'playing' && (guessed || shownBefore > 0)) {
    if (state.fresh.size > 0) showToast(t('toast.intel'), t('toast.clue', { n: state.fresh.size }), 'info');
    else if (guessed) showToast(t('toast.noMatch'), '', 'warn');
  }
  if (guessed) state.scanPulse = true;
  if (state.status !== 'playing') {
    room.phase = 'waiting';
    stopTimedClock();
  }
  renderAll();
  rememberNewClues(state.fresh);
  if (state.fresh.size) void fetchCargoTypeNames().then(() => renderDossier());
  if (state.status === 'playing' && guessed && window.innerWidth >= 860) {
    setTimeout(() => $('#ship-input')?.focus(), 60);
  }
  syncRoomAction();
}

/** This player already reported a result for the round being resumed. */
function applySubmittedRound(message) {
  if (!message.submitted) return;
  state.status = message.submitted.status === 'won' ? 'won' : 'lost';
  state.roomEndless.phase = 'waiting';
  state.visibleCount = state.answerData?.clues?.length || 0;
  state.pendingGuess = null;
  state.pendingEnd = false;
  stopTimedClock();
}

/** Guesses the server recorded, e.g. before a reload. Returns true if any was new here. */
function mergeRoomGuesses(confirmed = []) {
  const guesses = mergeGuesses(confirmed.filter((id) => state.catalogMap.has(Number(id))), state.guesses);
  if (guesses.length === state.guesses.length) return false;
  state.guesses = guesses;
  return true;
}

function onRaceState(message) {
  const room = state.roomEndless;
  if (!room || room.roundId !== message.roundId || !isMasked() || !message.board) return;
  if (room.phase === 'playing') {
    showRaceBoard(message);
    return;
  }
  // The opening board before the start, or the full board after this part ended.
  if (applyMaskedRun(raceRun(message)) && room.phase !== 'loading' && room.phase !== 'starting') renderAll();
}

function onEndlessLoaded(message) {
  if (!state.roomEndless) return;
  state.roomEndless.phase = 'ready';
  state.roomEndless.prepared = false;
  applyRoomLayout();
  renderAll();
  syncRoomAction();
}

function onEndlessStart(message) {
  if (!state.roomEndless) return;
  if (message.board && isMasked() && state.roomEndless.roundId === message.roundId) onRaceState(message);
  // A resumed start must not restart a round that already runs here.
  if (message.resumed && ['playing', 'waiting', 'finished'].includes(state.roomEndless.phase)) return;
  state.roomEndless.phase = 'starting';
  state.roomEndless.startAt = Number(message.startAt) || Date.now();
  state.roomEndless.endsAt = message.endsAt || null;
  state.roomEndless.serverOffset = Number(message.serverNow || Date.now()) - Date.now();
  const wait = Math.max(0, state.roomEndless.startAt - (Date.now() + state.roomEndless.serverOffset));
  clearTimeout(state.roomEndless.startTimer);
  state.roomEndless.startTimer = setTimeout(beginEndlessRound, wait);
  applyRoomLayout();
  renderAll();
}

function beginEndlessRound() {
  if (!state.roomEndless) return;
  state.roomEndless.phase = 'playing';
  state.status = 'playing';
  state.timerStarted = false;
  recomputeRevealed();
  if (isTimed()) {
    startTimedClock();
    // Follow the server's start, so a late or resumed client loses no clue time.
    const startedAt = Number(state.roomEndless.startAt) - (Number(state.roomEndless.serverOffset) || 0);
    if (Number.isFinite(startedAt) && startedAt > 0) state.timerStartAt = Math.min(Date.now(), startedAt);
    state.timedPolled = Math.floor(currentElapsed() / 30000);
    // A late or resumed start asks for the releases it missed.
    if (state.timedPolled > 0) void pollMaskedRun();
    recomputeRevealed();
  }
  applyRoomLayout();
  renderAll();
  setTimeout(() => $('#ship-input')?.focus(), 60);
}

function onEndlessRoundResult(result) {
  if (!state.roomEndless) return;
  // A spectator learns the answer with the round's result.
  if (isMasked() && !state.answerShip && result?.target) {
    revealOnlineAnswer({ target: result.target });
    buildMaskedAnswerData();
  }
  state.pendingGuess = null;
  state.pendingEnd = false;
  state.roomEndless.phase = 'finished';
  state.roomEndless.result = result;
  state.roomEndless.prepared = false;
  stopTimedClock();
  renderAll();
  syncRoomAction();
}

function onRoundEvent(message) {
  if (message.t === 'endlessFinished') {
    state.roomEndless = state.roomEndless || {};
    state.roomEndless.finished = [...new Set([...(state.roomEndless.finished || []), message.playerId])];
    renderAll();
    syncRoomAction();
  }
}

function finishEndlessRound() {
  const room = state.roomEndless;
  if (!room || (room.phase !== 'playing' && room.phase !== 'starting')) return;
  room.phase = 'waiting';
  // The server judges the guesses; only a timed loss has to be reported.
  if (isTimed() && state.status === 'lost') state.roomSurface?.sendLoss(room.roundId);
  stopTimedClock();
  renderAll();
  syncRoomAction();
}

function syncRoomAction() {
  const button = $('#room-action-button');
  if (!button) return;
  const surface = state.roomSurface;
  const room = state.roomEndless;
  const arbitration = state.roomArbitration;
  const roomOpen = Boolean(surface && state.roomView);
  document.querySelectorAll('.daily-reset-cta, .new-target-cta').forEach((element) => {
    element.hidden = roomOpen;
    element.style.display = roomOpen ? 'none' : '';
  });
  button.hidden = !roomOpen || overlayRoomView();
  button.textContent = '';
  if (!roomOpen) return;
  button.disabled = true;
  button.dataset.action = 'room-action';
  if (room) {
    if (room.phase === 'ready') {
      button.hidden = false;
      const prepared = Boolean(state.roomSurface?.room?.match?.prepared?.includes?.(surface.playerId));
      button.disabled = prepared;
      button.textContent = prepared ? t('room.preparedState') : t('room.readyForNext');
      return;
    }
    if (room.phase === 'finished') {
      button.hidden = false;
      const prepared = Boolean(room.prepared)
        || Boolean(state.roomSurface?.room?.match?.prepared?.includes?.(surface.playerId));
      button.disabled = prepared;
      button.textContent = prepared ? t('room.preparedState') : t('room.readyForNext');
      return;
    }
    button.hidden = true;
    return;
  }
  if (arbitration) {
    const selfId = surface.playerId;
    const prepared = arbitration.prepared?.includes?.(selfId);
    if (arbitration.phase === 'reveal') {
      button.hidden = false;
      button.disabled = Boolean(prepared);
      button.textContent = prepared ? t('room.preparedState') : t('room.readyForNext');
      return;
    }
    if (arbitration.dealerId === selfId) {
      button.hidden = false;
      button.disabled = arbitration.phase !== 'dealer';
      button.textContent = arbitration.phase === 'dealer'
        ? t('room.publishSelected')
        : t('room.phase.publishLocked');
      return;
    }
  }
  button.hidden = true;
}

function overlayRoomView() {
  return ['lobby', 'result'].includes(state.roomView);
}

function handleRoomAction() {
  const surface = state.roomSurface;
  if (!surface) return;
  if (state.roomEndless?.phase === 'ready') {
    if (surface.prepareForNext()) {
      state.roomEndless.prepared = true;
      syncRoomAction();
    }
    return;
  }
  if (state.roomEndless?.phase === 'finished') {
    if (surface.prepareForNext()) {
      state.roomEndless.prepared = true;
      syncRoomAction();
    }
    return;
  }
  if (state.roomArbitration) {
    const selfId = surface.playerId;
    if (state.roomArbitration.phase === 'reveal') {
      surface.prepareForNext();
      syncRoomAction();
      return;
    }
    if (state.roomArbitration.dealerId === selfId) {
      if (state.roomArbitration.phase === 'dealer') surface.publishSelected();
      syncRoomAction();
      return;
    }
  }
}

function openRooms() {
  if (!state.auth.loggedIn) {
    showAuthGate();
    return;
  }
  if (state.roomSurface) {
    state.roomSurface.show();
    state.roomView = state.roomSurface.view || 'lobby';
    applyRoomLayout();
    return;
  }
  if (!state.roomSurface) {
    state.roomEntry = roomEntrySnapshot();
  }
  const surface = new RoomSurface({
    api,
    t,
    refs: state.refs,
    catalog: state.catalog,
    locale: state.locale,
    maxPlayers: Number(state.meta?.limits?.maxPlayers) || 8,
    roomLimits: state.meta?.limits?.room || {},
    imagesBase: state.manifest?.images?.baseUrl || '',
    int,
    onViewChange: (view) => {
      state.roomView = view;
      if (view === 'lobby' && !state.roomSurface?.room) state.roomCode = null;
      if (view !== 'arbitration') state.roomArbitration = null;
      if (view !== 'endless') state.roomEndless = view === 'lobby' || view === 'result' ? null : state.roomEndless;
      applyRoomLayout();
      if (view === 'arbitration' || view === 'endless') renderAll();
    },
    onArbitrationState: (context) => {
      const signature = JSON.stringify(
        [surface.playerId, [...surface.selected], context],
        (key, value) => (value instanceof Set ? [...value] : value),
      );
      // Chat and other messages change nothing on the board.
      if (state.roomArbitration && state.roomView === 'arbitration' && state.arbSignature === signature) return;
      state.arbSignature = signature;
      const previous = state.roomArbitration;
      state.roomArbitration = context;
      state.roomView = 'arbitration';
      state.status = 'playing';
      if (previous?.matchId !== context.matchId || previous.round !== context.round || previous.phase !== context.phase) {
        state.inputValue = '';
        state.selectedId = null;
        hideSuggestions();
      }
      applyRoomLayout();
      syncRoomAction();
      renderAll();
    },
    onEndlessPrepare: (message) => prepareEndlessRound(message),
    onEndlessStart: (message) => onEndlessStart(message),
    onEndlessLoaded: (message) => onEndlessLoaded(message),
    onEndlessRoundResult: (result) => onEndlessRoundResult(result),
    onRoundEvent: (message) => onRoundEvent(message),
    onRaceState: (message) => onRaceState(message),
    onOutdated: () => showFatal({ status: 426, code: 'client-outdated' }),
    onKicked: () => {
      showToast(tl('room.kicked', 'You were removed from the room by the host.'), '', 'error');
    },
    onLeave: () => leaveRoomAndRestore(),
    onRoomUpdate: () => {
      // The server's list is authoritative: a lost request must stay clickable.
      if (state.roomEndless) {
        state.roomEndless.prepared = Boolean(surface.room?.match?.prepared?.includes?.(surface.playerId));
      }
      syncRoomChrome();
      syncRoomAction();
    },
    onClose: () => {
      state.roomSurface = null;
      state.roomView = null;
      state.roomArbitration = null;
      state.roomEndless = null;
      state.roomCode = null;
      applyRoomLayout();
      syncRoomAction();
    },
  });
  // Leaving the room restores a real page in place of the placeholder.
  surface.usedBoard = state.targetSource === 'placeholder';
  state.roomSurface = surface;
  state.roomView = 'lobby';
  surface.mount($('#room-view'), $('#room-rail'));
  applyRoomLayout();
  if (state.roomRequest && state.roomRequest !== 'lobby') {
    surface.joinRoom(String(state.roomRequest).toUpperCase(), '');
  }
  state.roomRequest = null;
}

function showAuthGate() {
  if (document.getElementById('auth-gate')) return;
  const gate = document.createElement('div');
  gate.id = 'auth-gate';
  gate.className = 'room-overlay';
  gate.innerHTML = `<div class="room-surface auth-gate">
    <div class="mp-kicker">FITDLE // ONLINE</div>
    <h2>${esc(tl('auth.loginTitle', 'SIGN IN WITH EVE'))}</h2>
    <p>${esc(t('auth.loginRequired'))}</p>
    <div class="room-actions">
      ${eveSsoButton('large')}
      <button class="button ghost" type="button" data-auth-close>${esc(tl('auth.practice', 'CONTINUE IN PRACTICE'))}</button>
    </div>
  </div>`;
  document.body.append(gate);
  gate.querySelector('[data-auth-close]')?.addEventListener('click', () => gate.remove());
}


async function boot() {
  state.locale = detectLocale();
  state.i18n = createI18n(state.locale);
  state.fontClicks = readFontClicks();
  state.allowEmptyKb = readAllowEmptyKb();
  try {
    const storedFont = localStorage.getItem('fitdle:v1:font');
    applyFont(storedFont === 'classic' || storedFont === 'triglavian' ? storedFont : 'neue');
  } catch {
    applyFont('neue');
  }
  void applyBootFlavor();
  prefetchJson([
    'data/manifest.json',
    `assets/claim-departments/${state.locale}.json`,
    `data/catalog/${state.locale}.json`,
    'data/search.json',
    `data/refs/${state.locale}.json`,
  ]);
  state.fontSize = readFontSize();
  applyFontSize(state.fontSize);
  let loginFailed = false;
  try {
    const manifest = await fetchJson('data/manifest.json');
    state.manifest = manifest;
    renderBootLogos();
    await loadClaimDepartments();
    state.dataVersionKey = `${manifest.dataVersion}:${manifest.clueVersion || 1}`;
    state.gameDayStartMinutes = Number(manifest.gameDayStartMinutes ?? 11 * 60);
    state.kbSelectionStartDate = String(manifest.kbSelectionStartDate || '');
    await loadCatalog(state.locale);
    state.searchAliases = await fetchJson('data/search.json').catch(() => null);
    state.timed = timedFromLocation(location.search);
    state.mode = state.timed ? 'normal' : modeFromLocation(location.search);
    {
      const canonical = new URL(location.href);
      canonical.searchParams.delete('rule');
      canonical.searchParams.delete('share');
      canonical.searchParams.delete('gameplay');
      loginFailed = canonical.searchParams.has('auth_error');
      canonical.searchParams.delete('auth_error');
      if (!canonical.searchParams.get('claim')) {
        if (state.timed) canonical.searchParams.set('claim', 'timed');
        else if (state.mode === 'audit') canonical.searchParams.set('claim', 'audit');
      }
      if (canonical.href !== location.href) history.replaceState(null, '', canonical);
    }
    document.documentElement.dataset.gameMode = state.mode;
    document.documentElement.dataset.timed = state.timed ? '1' : '0';

    const now = serverNow();
    state.today = gameDateKey(now, state.gameDayStartMinutes);
    const route = parseAppRoute();
    api.setBase(String(manifest.apiBase || ''));
    await resolveSession();
    startRunSync();
    if (state.meta?.gameDay) state.today = state.meta.gameDay;
    state.locale = detectLocale();
    if (!isLocale(state.locale) || !manifest.locales.includes(state.locale)) state.locale = manifest.defaultLocale || 'en';
    state.i18n = createI18n(state.locale);
    state.timeVerified = true;
    await prepareAppTarget(route);
    applyGameplay(state.gameplay);
    document.documentElement.dataset.gameMode = state.mode;
    document.documentElement.dataset.timed = state.timed ? '1' : '0';
    document.documentElement.dataset.appMode = state.appMode;
    const canonical = new URL(location.href);
    canonical.searchParams.delete('n');
    if (canonical.href !== location.href) history.replaceState(null, '', canonical);
    await loadLocaleData(state.locale);

    const restored = mergeOnlineRun(readStoredState());
    pruneStoredStates();
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
      if (state.guesses.length) dropCurrentTargetCache();
      state.status = restored.status || 'playing';
      state.timerStarted = isTimed() && state.status === 'playing' && restored.timerStarted === true;
      state.timerStartAt = Number(restored.timerStartAt) || 0;
      state.timerElapsedMs = Number(restored.timerElapsedMs) || 0;
      if (state.timerStarted && !state.timerStartAt) state.timerStartAt = Date.now() - state.timerElapsedMs;
      state.gaveUp = isTimed() && state.status === 'lost' && restored.gaveUp === true;
      state.timedExpired = isTimed() && state.status === 'lost' && restored.timedExpired === true;
    }
    recomputeRevealed();
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

    if (state.liveError) showToast(t('error.zkb'), '', 'warn', 5200);
    if (state.status !== 'playing') {
      state.visibleCount = state.answerData.clues.length;
      renderAll();
    }
    state.booted = true;
    startTicker();
    if (loginFailed) showToast(t('auth.failed'), '', 'error', 6000);
    if (state.loginRequired) showAuthGate();
    if (state.roomRequest && state.auth.loggedIn) openRooms();
  } catch (error) {
    showFatal(error);
  }
}

boot();
