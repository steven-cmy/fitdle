import {
  ATTEMPT_LIMIT,
  buildGuessResult,
  buildSearchIndex,
  cyrb53,
  dateKeyFromLocation,
  ARCHIVE_START,
  freeKillIdFromToken,
  freeKillToken,
  gameDateKey,
  killHasFittedModules,
  KILL_HISTORY_START,
  loadState,
  loadStats,
  modeFromLocation,
  msUntilNextDowntime,
  parseKillId,
  shiftDateKey,
  normalizeText,
  pickDailyAnswer,
  profileSimilarity,
  recordResult,
  saveState,
  saveStats,
  searchShips,
  shareUrl,
} from './game.js';
import { detectLocale, createI18n, isLocale, LOCALES, LOCALE_META } from './i18n.js';
import { buildClues, getEquipment, selectAbyssFallbacks, EQUIPMENT_SLOT_ORDER } from './clues.js';
import { calculateDogmaBaseline, calculateDogmaFit } from './dogma.js';
import { computeRevealed } from './reveal.js';
import { CATEGORY_ICON, icon } from './icons.js';
import { initStarfield } from './starfield.js';

const CATEGORIES = ['traits', 'hull', 'nav', 'defense', 'targeting', 'fitting', 'equipment', 'economy'];
const CATEGORY_ALIASES = { identity: 'hull', slots: 'fitting' };
const DEFENSE_ORDER = {
  shield: 0,
  armor: 1,
  structure: 2,
  shieldResists: 3,
  armorResists: 4,
  structureResists: 5,
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
  serverAnchor: null,
  monotonicAnchor: 0,
  timeVerified: false,
  index: [],
  locale: 'en',
  i18n: null,
  date: null,
  today: null,
  answerId: null,
  answerKillId: null,
  freeKillId: null,
  freeKillToken: null,
  freeKillmail: null,
  answerShip: null,
  answerData: null,
  dataVersionKey: null,
  guesses: [],
  status: 'playing',
  visibleCount: 0,
  revealed: new Set(),
  fresh: new Set(),
  latestIndex: -1,
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
  booted: false,
  font: 'neue',
  fontClicks: 0,
  radarMosaicTimer: null,
  resetting: false,
};

const BASE = new URL('.', document.baseURI);
const JSON_CACHE = new Map();
const DEFAULT_STATS = {
  played: 0,
  wins: 0,
  streak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0, 0, 0, 0],
  lastDate: null,
};

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

function isFree() {
  return Boolean(state.freeKillId);
}

function isArchive() {
  if (isFree()) return false;
  return state.date !== state.today;
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

function setMode(mode) {
  const next = mode === 'abyss' ? 'abyss' : 'normal';
  if (next === state.mode) return;
  const url = new URL(location.href);
  if (next === 'abyss') url.searchParams.set('mode', 'abyss');
  else url.searchParams.delete('mode');
  location.assign(url.toString());
}

function displayName(ship) {
  return ship?.names?.[state.locale] || ship?.names?.en || 'UNKNOWN';
}

function zkillItemUrl(id) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  return base && Number(id) ? `${base}/item/${Number(id)}/` : '';
}

function zkillItemLink(text, id) {
  const url = zkillItemUrl(id);
  if (!url) return esc(text);
  return `<a class="zkb-item-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
}

function zkillShipLink(text, id) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base || !Number(id)) return esc(text);
  return `<a class="zkb-item-link" href="${esc(`${base}/ship/${Number(id)}/`)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
}

function zkillEntityLink(kind, id, text) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base || !Number(id)) return esc(text);
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
        ${corporationId ? `<span class="victim-org">${corpIcon}${esc(t('dossier.corporation'))} ${zkillEntityLink('corporation', corporationId, corporation)}</span>` : ''}
        ${allianceId ? `<span class="victim-org">${allianceIcon}${esc(t('dossier.alliance'))} ${zkillEntityLink('alliance', allianceId, alliance)}</span>` : ''}
      </div>
    </div>
    ${portrait}
  </div>`;
}

function zkillGroupTextLink(text, groupID) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  const id = Number(groupID);
  if (!base || !id) return esc(text);
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
  const lit = Math.max(1, Math.min(5, Math.ceil(Number(weight) / 2)));
  return `<span class="weight" title="${esc(t('dossier.signal'))} ${esc(weight)}/10" aria-label="${esc(t('dossier.signal'))} ${esc(weight)}/10">${Array.from({ length: 5 }, (_, i) => `<i class="${i < lit ? 'on' : ''}"></i>`).join('')}</span>`;
}

function categoryLabel(category) {
  return t(`cat.${category}`) || category;
}

function clueLabel(clue) {
  return t(`clue.${clue.k}`) || clue.k;
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

async function fetchZkill(path) {
  const base = (state.manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('zKillboard base URL unavailable');
  const response = await fetch(`${base}${path}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

function monthBefore(dateKey, monthsBack) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 - monthsBack, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

async function resolveRuntimeKill(shipId, dateKey, anchorDate = state.today) {
  // The archive date only seeds the selection. The KB window is anchored to
  // today so archived runs do not try to reconstruct historical killboards.
  for (let offset = 1; offset <= 180; offset++) {
    const month = monthBefore(anchorDate, offset);
    if (!month) return null;
    const monthEnd = new Date(Date.UTC(month.year, month.month, 0)).toISOString().slice(0, 10);
    if (monthEnd < KILL_HISTORY_START) return null;
    try {
      const data = await fetchZkill(`/api/losses/shipTypeID/${shipId}/year/${month.year}/month/${month.month}/`);
      if (!Array.isArray(data)) continue;
      const losses = data.filter((kill) => (
        Number(kill?.victim?.ship_type_id) === Number(shipId)
        && String(kill?.killmail_time || '') >= `${KILL_HISTORY_START}T00:00:00Z`
        && (state.allowEmptyKb || killHasFittedModules(kill))
      ));
      if (!losses.length) continue;
      const index = cyrb53(`${dateKey}:${shipId}:${month.year}-${month.month}`, 0x5ca1ab1e) % losses.length;
      return losses[index];
    } catch {
      // try the previous month
    }
  }
  return null;
}

async function fetchAnswerLive() {
  if (state.liveFetched || !state.answerId) return;
  state.liveFetched = true;
  const shipId = Number(state.answerId);
  const killId = Number(state.answerKillId);
  const [stats, kill] = await Promise.allSettled([
    fetchZkill(`/api/stats/shipTypeID/${shipId}/kills/`),
    state.freeKillmail
      ? Promise.resolve([state.freeKillmail])
      : killId ? fetchZkill(`/api/killID/${killId}/`) : Promise.resolve(null),
  ]);
  state.liveStats = stats.status === 'fulfilled' && stats.value?.type === 'shipTypeID' ? stats.value : null;
  const killmail = kill.status === 'fulfilled' && Array.isArray(kill.value) ? kill.value[0] : null;
  state.liveLosses = killmail ? [killmail] : [];
  state.liveError = !state.liveStats && !state.liveLosses.length;
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
  const read = async (kind, id) => {
    if (!base || !Number(id)) return null;
    try {
      const response = await fetch(`${base}/latest/${kind}/${Number(id)}/?datasource=tranquility`, {
        cache: 'force-cache',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      return await response.json();
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
    characterName: character?.name || '',
    corporationId: Number(victim.corporation_id) || null,
    corporationName: corporation?.name || '',
    allianceId: Number(victim.alliance_id) || null,
    allianceName: alliance?.name || '',
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
          `${base}/latest/universe/types/${id}/?datasource=tranquility&language=${encodeURIComponent(locale)}`,
          {
            cache: 'no-store',
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
  if (state.mode !== 'abyss' || state.moduleDetails) return;
  const base = (state.manifest?.esi?.baseUrl || '').replace(/\/$/, '');
  if (!base) return;
  const equipment = getEquipment(state.liveLosses, state.refs).equipment;
  const modules = equipment.map((item) => item.module);
  const unique = [...new Set(modules)];
  const fallbackByModule = abyssFallbackByModule();
  const entries = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      const id = unique[cursor++];
      try {
        const response = await fetch(`${base}/latest/universe/types/${id}/?datasource=tranquility`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) entries.push([id, await response.json()]);
      } catch {
        // keep the base module effects when ESI is unavailable
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, unique.length) }, worker));
  state.moduleDetails = Object.fromEntries(entries);

  // Abyssal modules do not expose their mutated values through ESI's type
  // endpoint. Use the same-group/size representative selected for the slot
  // tier, so fitted effects are not silently zero.
  const relevant = new Set([4, 20, 67, 72, 150, 169, 554, 600, 796, 983, 1076, 1159]);
  const hasEffects = (data) => (data?.dogma_attributes || []).some((attr) => relevant.has(attr.attribute_id));
  for (const id of unique) {
    const data = state.moduleDetails[id];
    if (!data || hasEffects(data)) continue;
    const resolvedId = fallbackByModule.get(id);
    if (!resolvedId) continue;
    if (!state.moduleDetails[resolvedId]) {
      try {
        const response = await fetch(`${base}/latest/universe/types/${resolvedId}/?datasource=tranquility`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) state.moduleDetails[resolvedId] = await response.json();
      } catch {
        // leave the module without simulated effects
      }
    }
    const representative = state.moduleDetails[resolvedId];
    if (hasEffects(representative)) {
      state.moduleDetails[id] = { ...data, dogma_attributes: representative.dogma_attributes, fallbackType: resolvedId };
    }
  }
}

function buildAnswerData() {
  if (!state.answerShip || !state.refs) return;
  const ship = state.answerShip;
  const bonuses = ship.bonuses?.[state.locale] || ship.bonuses?.en || [];
  const built = buildClues({
    ship,
    catalog: state.catalog,
    refs: state.refs,
    stats: state.liveStats,
    losses: state.liveLosses,
    dateKey: state.date,
    dataVersion: state.dataVersionKey || state.manifest.dataVersion,
    targetKillId: state.answerKillId,
    mode: state.mode,
    moduleDetails: state.mode === 'abyss' ? state.moduleDetails : null,
    fittedAttrs: state.mode === 'abyss' ? state.dogmaAttrs : null,
    baselineAttrs: state.mode === 'abyss' ? state.dogmaBaseline : null,
    moduleFallbacks: state.mode === 'abyss' ? state.manifest.moduleFallbacks || {} : {},
  });
  state.answerData = {
    ...ship,
    description: ship.descriptions?.[state.locale] || ship.descriptions?.en || '',
    bonuses,
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
    races: refs.races, factions: refs.factions, locale: state.locale,
  });
  await fetchAnswerLive();
  await fetchCargoTypeNames();
  if (state.mode === 'abyss' && state.liveLosses[0]) {
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
  if (state.mode === 'abyss' && !state.dogmaAttrs) await fetchModuleDetails();
  buildAnswerData();
  if (!state.answerData) throw new Error('answer data unavailable');
}

function readStoredState() {
  if (isFree()) return { guesses: [], status: 'playing', invalidated: false };
  const stored = loadState(localStorage, state.date, state.dataVersionKey, state.mode);
  if (!stored) return { invalidated: false };
  if (stored.invalidated) return { invalidated: true };
  const allowed = new Set(state.catalogMap.keys());
  const guesses = [...new Set((stored.guesses || []).map(Number).filter((id) => allowed.has(id)))].slice(0, ATTEMPT_LIMIT);
  if (stored.answerId && Number(stored.answerId) !== Number(state.answerId)) return { invalidated: true };
  let status = stored.status;
  if (guesses.includes(state.answerId)) status = 'won';
  else if (guesses.length >= ATTEMPT_LIMIT) status = 'lost';
  else status = 'playing';
  return { guesses, status, invalidated: false };
}

function recomputeRevealed() {
  state.revealed = computeRevealed({
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
    seed: `${state.date}:${state.answerKillId || state.answerId}:${state.mode}`,
  });
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
  }, state.mode);
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
  const repo = state.manifest?.links?.repo || '#';
  return esc(t('footer.copyright'))
    .replace('EVE Online', `<a href="${esc(eve)}" target="_blank" rel="noopener noreferrer">EVE Online</a>`)
    .replace('Fenris Creations', `<a href="${esc(fenris)}" target="_blank" rel="noopener noreferrer">Fenris Creations</a>`)
    .replace('gitlab.com/cmy/fitdle', `<a href="${esc(repo)}" target="_blank" rel="noopener noreferrer">gitlab.com/cmy/fitdle</a>`);
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

    <div id="free-banner" class="banner" hidden></div>
    <div id="archive-wrap" class="archive-wrap" hidden>
      <button type="button" class="archive-arrow" data-action="archive-prev" aria-label="${esc(t('archive.prev'))}">&larr;</button>
      <div id="archive-banner" class="banner" hidden></div>
      <button type="button" class="archive-arrow" data-action="archive-next" aria-label="${esc(t('archive.next'))}">&rarr;</button>
    </div>
    <div id="new-target-banner" class="banner" hidden></div>

    <main id="main" class="shell">
      <div class="mode-bar" data-mode="${state.mode}">
        <span class="mode-label">${esc(t('mode.label'))}</span>
        <div class="mode-switch mode-nav" role="group" aria-label="${esc(t('mode.label'))}">
          <button type="button" class="mode-button${!isFree() && !isArchive() ? ' is-active' : ''}" data-action="play-today" aria-pressed="${!isFree() && !isArchive()}">${esc(t('mode.daily'))}</button>
          <button type="button" class="mode-button${isFree() ? ' is-active' : ''}" data-action="free-mode" aria-pressed="${isFree()}">${esc(t('mode.free'))}</button>
          <button type="button" class="mode-button${isArchive() ? ' is-active' : ''}" data-action="archive-mode" aria-pressed="${isArchive()}">${esc(t('mode.archive'))}</button>
        </div>
        <span class="mode-divider" aria-hidden="true"></span>
        <div class="mode-switch" role="group" aria-label="${esc(t('mode.label'))}">
          <button type="button" class="mode-button${state.mode === 'normal' ? ' is-active' : ''}" data-action="set-mode" data-mode="normal" aria-pressed="${state.mode === 'normal'}">${esc(t('mode.standard'))}</button>
          <button type="button" class="mode-button${state.mode === 'abyss' ? ' is-active' : ''}" data-action="set-mode" data-mode="abyss" aria-pressed="${state.mode === 'abyss'}">${esc(t('mode.abyss'))}</button>
        </div>
      </div>

      <section class="hero" id="hero" aria-labelledby="hero-title"></section>

      <div class="console">
        <section class="panel board-panel" id="board-panel" aria-labelledby="board-title">
          <header class="panel-head">
            <div>
              <div class="panel-kicker"><span class="idx">01</span> // ${esc(t('board.title'))}</div>
              <h2 id="board-title">${esc(t('board.title'))}</h2>
              <p class="panel-sub">${esc(t('board.subtitle'))}</p>
            </div>
            <div class="dossier-count" aria-hidden="true">
              <strong id="board-count-text">${String(state.guesses.length).padStart(2, '0')} / 06</strong>
              <span>${esc(t('hero.attempts'))}</span>
            </div>
          </header>
          <ol class="attempts" id="attempts" aria-label="${esc(t('board.title'))}"></ol>
          <div id="acquire-slot"></div>
        </section>

        <section class="panel dossier-panel" id="dossier-panel" aria-labelledby="dossier-title">
          <header class="panel-head">
            <div>
              <div class="panel-kicker"><span class="idx">02</span> // ${esc(t('dossier.title'))}</div>
              <h2 id="dossier-title">${esc(t('dossier.title'))}</h2>
              <p class="panel-sub">${esc(t('dossier.subtitle'))}</p>
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
          <a class="repo-link" href="${esc(state.manifest.links?.repo || '#')}" target="_blank" rel="noopener noreferrer" title="${esc(state.manifest.links?.repo || '')}">GitLab</a>
          <a class="zkill-link" href="${esc(state.manifest.zkillboard.baseUrl)}" target="_blank" rel="noopener noreferrer">zKillboard</a>
          <a href="${esc(state.manifest.sde?.url || '#')}" target="_blank" rel="noopener noreferrer">EVE SDE</a>
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
  const archive = isArchive();
  if (dateCaption) dateCaption.textContent = free ? t('free.kicker') : `${t('common.utc')} // ${archive ? t('header.archive') : t('hero.daily')}`;
  if (resetLabel) resetLabel.textContent = free ? t('free.reset') : archive ? t('header.archive') : t('header.reset');
  if (countdown) countdown.textContent = free ? t('free.badge') : archive ? (state.newTargetAvailable ? t('common.today') : t('header.archive')) : nextDowntime();
  const countdownWrap = countdown?.closest('.countdown');
  if (countdownWrap) countdownWrap.style.display = free || archive ? 'none' : '';

  const freeBanner = $('#free-banner');
  if (freeBanner) {
    freeBanner.hidden = !free;
    if (free) {
      freeBanner.innerHTML = `${icon('radar')} ${esc(t('free.kicker'))} // ${esc(t('free.kb', { id: state.freeKillToken }))} <button type="button" data-action="play-today">${esc(t('header.playToday'))}</button>`;
    }
  }
  const archiveWrap = $('#archive-wrap');
  if (archiveWrap) archiveWrap.hidden = !archive;
  const archiveBanner = $('#archive-banner');
  if (archiveBanner) {
    archiveBanner.hidden = !archive;
    if (archive) {
      archiveBanner.innerHTML = `<span>${icon('database')} ${esc(t('header.archive'))} // ${esc(state.date)}</span>
        <button type="button" data-action="play-today">${esc(t('header.playToday'))}</button>`;
    }
  }
  const archivePrev = $('[data-action="archive-prev"]');
  const archiveNext = $('[data-action="archive-next"]');
  if (archivePrev) archivePrev.disabled = !archive || shiftDateKey(state.date, -1) < ARCHIVE_START;
  if (archiveNext) archiveNext.disabled = !archive || shiftDateKey(state.date, 1) > state.today;
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
    (clue.c === 'equipment' || clue.c === 'traits') && !state.revealed.has(index)
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
          <span>${esc(t('hero.attempts'))}</span>
          <strong><em>${String(ATTEMPT_LIMIT).padStart(2, '0')}</em></strong>
          <small>MAX</small>
        </div>
        <div class="hero-stat">
          <span>${esc(t('hero.fragments'))}</span>
          <strong id="hero-fragments">${visible}<em>/${totalLabel}</em></strong>
          <small>${totalHidden ? '?' : esc(t('dossier.sealed', { n: Math.max(0, total - visible) }))}</small>
        </div>
        <div class="hero-stat">
          <span>${esc(t('hero.status'))}</span>
          <strong id="hero-status">${esc(ended ? t('dossier.answer') : t('hero.statusValue'))}</strong>
          <small>${esc(free ? t('free.kicker') : isArchive() ? t('header.archive') : t('hero.daily'))}</small>
        </div>
      </div>
      <div class="hero-timer" id="hero-timer">${esc(free ? t('free.kicker') : isArchive() ? t('header.archive') : t('header.reset'))} ${free || isArchive() ? '' : `<strong>${esc(nextDowntime())}</strong>`}</div>
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
  const ended = state.status !== 'playing';
  const rows = [];
  for (let i = 0; i < ATTEMPT_LIMIT; i++) {
    const guessId = state.guesses[i];
    if (guessId != null) {
      const ship = state.catalogMap.get(guessId);
      const correct = guessId === state.answerId;
      const result = buildGuessResult(ship, state.answerShip, i + 1);
      const similarity = correct ? 100 : result.similarity;
      rows.push(`
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
      `);
    } else {
      const active = !ended && i === state.guesses.length;
      rows.push(`
        <li class="attempt ${active ? 'is-active' : 'is-empty'}"${active ? ' aria-current="step"' : ''}>
          <span class="attempt-marker">${String(i + 1).padStart(2, '0')}</span>
          <span class="attempt-icon"><span class="fallback">${icon(active ? 'crosshair' : 'lock')}</span></span>
          <span class="attempt-body">
            <span class="attempt-name">${esc(active ? t('board.attempt', { n: i + 1 }) : t('board.locked'))}</span>
            <span class="attempt-meta">${esc(active ? t('board.awaiting') : t('dossier.encrypted'))}</span>
          </span>
          <span class="attempt-status"><strong>${esc(active ? t('board.ready') : t('board.sealed'))}</strong></span>
        </li>
      `);
    }
  }
  list.innerHTML = rows.join('');
  const boardCount = $('#board-count-text');
  if (boardCount) boardCount.textContent = `${String(state.guesses.length).padStart(2, '0')} / 06`;
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
      if (!value.bandwidth && !value.capacity) return `<span class="big">${esc(t('clue.noDrones'))}</span>`;
      return `<div class="hardpoint-row">
        <span class="hardpoint">${icon('drone')}${int(value.bandwidth)}<span>Mbit/s</span></span>
        <span class="hardpoint">${icon('ship')}${int(value.capacity)}<span>m³</span></span>
      </div>`;
    case 'speed':
      return formatNumberValue(value, 'm/s', { prefix: '≈ ' });
    case 'sig':
      return formatNumberValue(value, 'm');
    case 'align':
      return `<span class="big">${esc(dec(value, 1))}</span><span class="unit">s</span>`;
    case 'warp':
      return `<span class="big">${esc(dec(value, 1))}</span><span class="unit">AU/s</span>`;
    case 'mass':
      return `<span class="big">${esc(compact(value))}</span><span class="unit">kg</span>`;
    case 'cargo':
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
  if (clue.k === 'equipment') {
    label = '';
    value = revealed ? renderModuleLine(clue) : '';
  } else if (clue.k === 'bonus') {
    label = t('clue.bonusLine', { n: Number(clue.v) + 1 });
    value = revealed ? (state.answerData.bonuses?.[clue.v] || '') : '';
  }
  if (revealed && !value) value = '—';
  return `<div class="attr-row cat-${category}${clue.k === 'equipment' ? ' equipment-row' : ''} ${revealed ? 'is-revealed' : 'is-hidden'}${fresh ? ' is-fresh' : ''}" data-clue-index="${index}" data-category="${category}">
    <span class="attr-label">${esc(label)}</span>
    <span class="attr-value">${revealed ? value : '<span class="attr-redacted" aria-label="?">?</span>'}</span>
    <span class="attr-meta">${revealed ? weightPips(clue.w) : `<span class="attr-lock">${icon('lock')}</span>`}</span>
  </div>`;
}

function renderDossier() {
  if (!state.answerData) return;
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

  const answerBanner = $('#answer-banner');
  if (answerBanner) {
    if (state.status === 'playing') {
      answerBanner.innerHTML = '';
    } else {
      answerBanner.innerHTML = `<div class="answer-banner" data-status="${state.status}">
        <div class="answer-confirmed">
          <div>
            <span>${esc(t('dossier.answer'))}</span>
            <strong>${zkillShipLink(displayName(state.answerShip), state.answerId)}</strong>
          </div>
          <div data-victim-slot>${victimMetaHtml()}</div>
        </div>
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
      if (category === 'equipment') {
        const ordered = [...entries].sort((a, b) => (
          (EQUIPMENT_SLOT_ORDER[a.clue.v.slot] ?? 9) - (EQUIPMENT_SLOT_ORDER[b.clue.v.slot] ?? 9)
          || a.index - b.index
        ));
        const revealed = ordered.filter((entry) => state.revealed.has(entry.index));
        const hidden = ordered.length - revealed.length;
        const sealed = hidden
          ? `<div class="attr-row cat-equipment is-hidden equipment-sealed">
              <span class="attr-label">${esc(t('dossier.equipmentSealed'))}</span>
              <span class="attr-value"><span class="attr-redacted" aria-label="?">?</span></span>
              <span class="attr-meta"><span class="attr-lock">${icon('lock')}</span></span>
            </div>`
          : '';
        const slotGroups = Object.entries(EQUIPMENT_SLOT_ORDER)
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
        return `<section class="dossier-group cat-equipment${hidden ? ' is-sealed' : ''}">
          <header class="group-head">
            <span class="group-title">${icon(CATEGORY_ICON.equipment || 'dot')}<span>${esc(categoryLabel('equipment'))}</span></span>
            <span class="group-progress" aria-hidden="true"><span style="--p:${hidden ? 0 : 100}"></span></span>
            <span class="group-count"><b>${revealed.length}</b> / ${hidden ? '?' : ordered.length}</span>
          </header>
          <div class="group-rows">
            ${slotGroups}
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
  }

  if (state.fresh.size) {
    setTimeout(() => {
      $$('.attr-row.is-fresh').forEach((row) => row.classList.remove('is-fresh'));
      state.fresh.clear();
    }, 1700);
  }
}

function renderAll() {
  renderHero();
  renderAttempts();
  renderAcquire();
  renderDossier();
  renderChrome();
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

function applyGuess(shipId) {
  const ship = state.catalogMap.get(shipId);
  if (!ship) return;
  const previousRevealed = new Set(state.revealed);
  const previousGuesses = state.guesses.length;
  hideSuggestions();
  state.guesses.push(shipId);
  const correct = shipId === state.answerId;
  state.status = correct ? 'won' : (state.guesses.length >= ATTEMPT_LIMIT ? 'lost' : 'playing');
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

  renderAll();
  if (state.status !== 'playing') {
    if (!isFree() && !isArchive()) {
      state.stats = recordResult(localStorage, state.stats, {
        date: state.date,
        status: state.status,
        attempts: state.guesses.length,
        isToday: state.date === state.today,
      });
    }
    setTimeout(() => renderDebrief(), 850);
  } else if (window.innerWidth < 860 && newlyRevealed > 0) {
    setTimeout(() => $('#dossier-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
  } else {
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
  if (isFree()) {
    const url = new URL(location.href);
    url.pathname = new URL('.', location.href).pathname;
    url.search = '';
    url.hash = '';
    url.searchParams.set('kb', state.freeKillToken || freeKillToken(state.freeKillId));
    url.searchParams.set('mode', state.mode === 'abyss' ? 'abyss' : 'normal');
    url.searchParams.set('lang', state.locale);
    return url.toString();
  }
  return shareUrl(location, state.date, state.mode, state.status, state.guesses.length, state.locale);
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
  const kbHref = sampleKill ? zkillKillUrl(sampleKill) : (!won ? zkillShipUrl() : null);
  const kbLabel = sampleKill ? t('end.killmail') : t('end.killboard');
  const oneShot = won && state.guesses.length === 1;
  const kicker = oneShot ? t('oneShot.kicker') : (won ? t('end.victoryKicker') : t('end.defeatKicker'));
  const title = oneShot ? t('oneShot.title') : (won ? t('end.victoryTitle') : t('end.defeatTitle'));
  const body = oneShot
    ? t('oneShot.body')
    : (won ? t('end.victoryBody', { name: displayName(ship) }) : t('end.defeatBody', { name: displayName(ship) }));
  const html = `
    <div class="modal${oneShot ? ' is-one-shot' : ''}" role="dialog" aria-modal="true" aria-labelledby="debrief-title" data-kind="debrief" data-status="${state.status}" data-one-shot="${oneShot}">
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
            <div class="debrief-victim" data-victim-slot>${victimMetaHtml()}</div>
          </div>
        </div>
        <div class="debrief-main">
          ${oneShot ? `<div class="one-shot-banner"><span class="one-shot-mark">01</span><span>${esc(t('end.victoryKicker'))} // ${esc(t('oneShot.kicker'))}</span></div>` : ''}
          <div class="debrief-kicker"><span class="dot"></span>${esc(kicker)}</div>
          <h2 id="debrief-title">${esc(title)}</h2>
          <p class="debrief-body">${esc(body)}</p>

          <div class="debrief-answer">
            <span class="icon"><img src="${esc(shipIconPath(ship))}" alt="" onerror="this.remove()"></span>
            <div>
              <span>${esc(t('dossier.answer'))}</span>
              <strong>${zkillShipLink(displayName(ship), state.answerId)}</strong>
            </div>
          </div>

          <div class="debrief-stats">
            <div class="debrief-stat"><span>${esc(t('end.attempts'))}</span><strong>${state.guesses.length} / 6</strong></div>
            <div class="debrief-stat"><span>${esc(t('end.intel'))}</span><strong>${total} / ${total}</strong></div>
            <div class="debrief-stat"><span>${esc(t('end.streak'))}</span><strong>${stats.streak || 0}</strong></div>
          </div>

          <div class="debrief-description">${description.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
          ${bonuses.length ? `<div class="debrief-bonus-title">${esc(t('clue.bonus'))}</div><ul class="bonus-list debrief-bonus">${bonuses.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}

          <div class="debrief-actions">
            <button type="button" class="button primary" data-action="copy-share">${icon('share')} ${esc(t('end.share'))}</button>
            ${kbHref ? `<a class="button" href="${esc(kbHref)}" target="_blank" rel="noopener noreferrer">${icon('external')} ${esc(kbLabel)}</a>` : ''}
            <button type="button" class="button ghost" data-action="close-modal">${esc(t('end.review'))}</button>
          </div>

          ${free
            ? `<div class="free-note">${esc(t('free.noStats'))}</div>`
            : isArchive()
              ? `<div class="free-note">${esc(t('archive.noStats'))}</div>`
              : ''}
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

function navigateToDate(date) {
  const url = new URL(location.href);
  url.pathname = new URL('.', location.href).pathname;
  url.search = '';
  url.hash = '';
  if (date !== state.today) url.searchParams.set('d', date);
  if (state.mode === 'abyss') url.searchParams.set('mode', 'abyss');
  url.searchParams.set('lang', state.locale);
  location.assign(url.toString());
}

function stepArchive(days) {
  if (!isArchive()) return;
  let next = shiftDateKey(state.date, days);
  if (next < ARCHIVE_START) next = ARCHIVE_START;
  if (next > state.today) next = state.today;
  if (next === state.date) return;
  navigateToDate(next);
}

function openArchiveModal() {
  const selected = isArchive() ? state.date : state.today;
  openModal(`
    <div class="modal mode-modal" role="dialog" aria-modal="true" aria-labelledby="archive-title" data-kind="archive">
      <button type="button" class="modal-close" data-action="close-modal" aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      <div class="panel-kicker">${icon('database')} // ${esc(t('mode.archive'))}</div>
      <h2 id="archive-title">${esc(t('archiveModal.title'))}</h2>
      <p class="mode-modal-body">${esc(t('archiveModal.body'))}</p>
      <label class="mode-modal-label" for="archive-date">${esc(t('archiveModal.select'))}</label>
      <input id="archive-date" class="mode-modal-input" type="date" min="${ARCHIVE_START}" max="${state.today}" value="${selected}">
      <div class="mode-modal-error" id="archive-error" aria-live="polite"></div>
      <div class="mode-modal-actions">
        <button type="button" class="button primary" data-action="archive-submit">${icon('calendar')} ${esc(t('archiveModal.open'))}</button>
        <button type="button" class="button ghost" data-action="close-modal">${esc(t('common.close'))}</button>
      </div>
    </div>
  `, 'archive');
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
    closeModal();
    playToday();
    return;
  }
  const url = new URL(location.href);
  url.pathname = new URL('.', location.href).pathname;
  url.search = '';
  url.hash = '';
  url.searchParams.set('kb', freeKillToken(killId));
  if (state.mode === 'abyss') url.searchParams.set('mode', 'abyss');
  url.searchParams.set('lang', state.locale);
  location.assign(url.toString());
}

function submitArchiveDate() {
  const input = $('#archive-date');
  const error = $('#archive-error');
  const value = input?.value;
  if (!value || value < ARCHIVE_START || value > state.today) {
    if (error) error.textContent = t('archiveModal.invalid');
    return;
  }
  navigateToDate(value);
}

function renderManual() {
  const stats = state.stats || DEFAULT_STATS;
  const played = stats.played || 0;
  const wins = stats.wins || 0;
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
            <div class="manual-step"><span class="manual-step-num">01</span><div><h4>${esc(t('help.step1Title'))}</h4><p>${esc(t('help.step1'))}</p></div></div>
            <div class="manual-step"><span class="manual-step-num">02</span><div><h4>${esc(t('help.step2Title'))}</h4><p>${esc(t('help.step2'))}</p></div></div>
            <div class="manual-step"><span class="manual-step-num">03</span><div><h4>${esc(t('help.step3Title'))}</h4><p>${esc(t('help.step3'))}</p></div></div>
            <div class="manual-step"><span class="manual-step-num">04</span><div><h4>${esc(t('help.step4Title'))}</h4><p>${esc(t('help.step4'))}</p></div></div>
          </div>
          <div class="manual-section">
            <h3>${icon('help')} ${esc(t('help.sharedTitle'))}</h3>
            <ul class="manual-mode-list">${t('help.sharedRules').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
          </div>
          <div class="manual-section">
            <h3>${icon('layers')} ${esc(t('mode.standard'))}</h3>
            <p class="manual-mode-hint">${esc(t('mode.standardHint'))}</p>
            <ul class="manual-mode-list">${t('mode.helpNormal').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
          </div>
          <div class="manual-section">
            <h3>${icon('radar')} ${esc(t('mode.abyss'))}</h3>
            <p class="manual-mode-hint">${esc(t('mode.abyssHint'))}</p>
            <ul class="manual-mode-list">${t('mode.helpAbyss').split('\n').filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
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
              <button type="button" class="setting-secret" data-action="font-secret">${esc(t('font.label'))}</button>
              <div class="segmented">
                ${[['neue', 'font.neue'], ['classic', 'font.classic']].map(([value, key]) => `<button type="button" class="${state.font === value ? 'is-active' : ''}" data-action="set-font" data-font="${value}" aria-pressed="${state.font === value}">${esc(t(key))}</button>`).join('')}
              </div>
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
            <div class="stats-grid">
              <div><span>${esc(t('help.statPlayed'))}</span><strong>${played}</strong></div>
              <div><span>${esc(t('help.statWon'))}</span><strong>${wins}</strong></div>
              <div><span>${esc(t('help.statStreak'))}</span><strong>${stats.streak || 0}</strong></div>
              <div><span>${esc(t('help.statBest'))}</span><strong>${stats.maxStreak || 0}</strong></div>
            </div>
            ${played ? '' : `<p class="stats-empty">${esc(t('help.statsEmpty'))}</p>`}
            <div style="margin-top:12px"><button type="button" class="button ghost" data-action="reset-all">${icon('refresh')} ${esc(t('help.resetRecord'))}</button></div>
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
  url.searchParams.set('lang', state.locale);
  location.href = url.toString();
}

function resetAllProgress() {
  if (!window.confirm(t('help.resetConfirm'))) return;
  state.resetting = true;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('fitdle:v1:')) localStorage.removeItem(key);
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
      races: state.refs.races, factions: state.refs.factions, locale: state.locale,
    });
    try {
      localStorage.setItem('fitdle:v1:lang', nextLocale);
    } catch {
      // ignore
    }
    const url = new URL(location.href);
    url.searchParams.set('lang', nextLocale);
    history.replaceState(null, '', url);
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
      else if (isArchive()) countdown.textContent = state.newTargetAvailable ? t('common.today') : t('header.archive');
      else countdown.textContent = nextDowntime();
    }
    const heroTimer = $('#hero-timer');
    if (heroTimer) {
      heroTimer.innerHTML = isFree()
        ? esc(t('free.kicker'))
        : isArchive()
          ? esc(t('header.archive'))
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

document.addEventListener('click', (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'free-mode') { openFreeModal(); return; }
    if (action === 'archive-mode') { openArchiveModal(); return; }
    if (action === 'free-submit') { void submitFreeKill(); return; }
    if (action === 'archive-submit') { submitArchiveDate(); return; }
    if (action === 'archive-prev') { stepArchive(-1); return; }
    if (action === 'archive-next') { stepArchive(1); return; }
    if (action === 'toggle-empty-kb') { setAllowEmptyKb(!state.allowEmptyKb); return; }
    if (action === 'set-font') { setFontStyle(actionEl.dataset.font); return; }
    if (action === 'set-font-size') { setFontSize(actionEl.dataset.size); return; }
    if (action === 'font-secret') { secretFontClick(); return; }
    if (action === 'help') { renderManual(); return; }
    if (action === 'submit') { submitGuess(); return; }
    if (action === 'debrief') { renderDebrief(); return; }
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'copy-share') { copyShare(); return; }
    if (action === 'play-today') { playToday(); return; }
    if (action === 'reset-all') { resetAllProgress(); return; }
    if (action === 'toggle-font') { toggleFont(); return; }
    if (action === 'set-mode') { setMode(actionEl.dataset.mode); return; }
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
    if (event.key === 'Enter' && state.modal?.kind === 'archive') {
      event.preventDefault();
      submitArchiveDate();
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
}, true);
window.addEventListener('resize', () => {
  if (!$('#suggestions')?.hidden) positionSuggestions();
});

window.addEventListener('pagehide', () => {
  if (state.status && state.answerId && !state.resetting) persist();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function showFatal(error) {
  console.error(error);
  const app = $('#app');
  if (!app) return;
  app.innerHTML = `<div class="fatal-screen">
    <div class="fatal-glyph">${icon('alert')}</div>
    <div class="fatal-code">${esc(t('error.title'))}</div>
    <h1>${esc(t('error.title'))}</h1>
    <p>${esc(t('error.body'))}</p>
    <button class="button primary" type="button" onclick="location.reload()">${icon('refresh')} ${esc(t('error.retry'))}</button>
  </div>`;
}

async function boot() {
  initStarfield($('#starfield'));
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
    state.mode = modeFromLocation(location.search);
    document.documentElement.dataset.gameMode = state.mode;

    const now = serverNow();
    const resetHour = manifest.downtimeUtcHour || 11;
    state.today = gameDateKey(now, resetHour);
    const locationDate = dateKeyFromLocation(location.search, now, resetHour);
    const freeTarget = freeKillFromLocation(location.search);
    state.freeKillId = freeTarget?.id || null;
    state.freeKillToken = freeTarget?.token || null;
    state.date = state.freeKillId ? `free-${state.freeKillToken}` : locationDate.date;
    if (freeTarget?.legacy) {
      const clean = new URL(location.href);
      clean.searchParams.set('kb', state.freeKillToken);
      history.replaceState(null, '', clean);
    }
    state.locale = detectLocale();
    if (!isLocale(state.locale) || !manifest.locales.includes(state.locale)) state.locale = manifest.defaultLocale || 'en';
    state.i18n = createI18n(state.locale);
    state.stats = loadStats(localStorage);

    const rawFree = new URLSearchParams(location.search).get('kb')
      || new URLSearchParams(location.search).get('killmail')
      || new URLSearchParams(location.search).get('kill');
    if (rawFree && !state.freeKillId) {
      const clean = new URL(location.href);
      for (const key of ['kb', 'killmail', 'kill']) clean.searchParams.delete(key);
      history.replaceState(null, '', clean);
    }
    let freeReady = false;
    if (state.freeKillId) {
      try {
        const data = await fetchZkill(`/api/killID/${state.freeKillId}/`);
        const killmail = Array.isArray(data) ? data[0] : null;
        if (!killmail?.victim?.ship_type_id) throw new Error('free target unavailable');
        if (String(killmail.killmail_time || '') < `${KILL_HISTORY_START}T00:00:00Z`) {
          throw new Error('free killmail before kill history');
        }
        if (!state.allowEmptyKb && !killHasFittedModules(killmail)) {
          throw new Error('empty free killmail disabled');
        }
        state.freeKillmail = killmail;
        state.answerId = Number(killmail.victim.ship_type_id);
        state.answerKillId = state.freeKillId;
        state.answerShip = state.catalogMap.get(state.answerId);
        if (!state.answerShip) throw new Error('free target hull unavailable');
        freeReady = true;
      } catch {
        state.freeKillId = null;
        state.freeKillToken = null;
        state.freeKillmail = null;
        state.date = locationDate.date;
        const clean = new URL(location.href);
        for (const key of ['kb', 'killmail', 'kill']) clean.searchParams.delete(key);
        history.replaceState(null, '', clean);
      }
    }
    if (!freeReady) {
      state.freeKillId = null;
      state.freeKillToken = null;
      state.freeKillmail = null;
      state.date = locationDate.date;
      const killShipPool = state.mode === 'abyss'
        ? (manifest.abyssKillShipPool || manifest.killShipPool)
        : (manifest.normalShipPool || manifest.killShipPool);
      const targetShipId = pickDailyAnswer(killShipPool, state.date, manifest.dataVersion);
      const shipKills = manifest.killPoolsByShip?.[targetShipId] || [];
      const targetKillId = pickDailyAnswer(shipKills, `${state.date}:kb`, manifest.dataVersion);
      const targetKill = (manifest.killPool || []).find((entry) => Number(entry.killmail_id) === Number(targetKillId));
      state.answerId = Number(targetShipId);
      state.answerKillId = targetKill ? Number(targetKill.killmail_id) : null;
      if (!state.answerId || !state.catalogMap.has(state.answerId)) throw new Error('daily target unavailable');
      state.answerShip = state.catalogMap.get(state.answerId);
      const runtimeKill = await resolveRuntimeKill(state.answerId, state.date, state.today);
      if (runtimeKill?.killmail_id) state.answerKillId = Number(runtimeKill.killmail_id);
    }
    await loadLocaleData(state.locale);

    const restored = readStoredState();
    if (!isFree() && restored.invalidated) {
      saveState(localStorage, state.date, { dataVersion: state.dataVersionKey, date: state.date, answerId: state.answerId, guesses: [], status: 'playing' }, state.mode);
    } else {
      state.guesses = restored.guesses || [];
      state.status = restored.status || 'playing';
    }
    recomputeRevealed();
    state.fresh = new Set();
    state.inputValue = '';
    state.selectedId = null;

    renderShell();
    renderAll();

    if (!isFree() && locationDate.invalid) showToast(t('error.date'), '', 'warn', 4200);
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
