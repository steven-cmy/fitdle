/**
 * Pure Fitdle game logic. No DOM access here so the rules can be unit-tested.
 */

export const ATTEMPT_LIMIT = 6;
export const INITIAL_REVEAL = 3;
export const REVEAL_PER_MISS = 6;
export const CLUE_REVEAL_STOPS = [3, 9, 15, 21, 27, 33];
export const DOWNTIME_HOUR_UTC = 11;

/** Number of dossier fragments visible after N incorrect acquisitions. */
export function revealCountFor(misses, totalClues, mode = 'normal') {
  const safeMisses = Math.max(0, misses);
  const count = mode === 'abyss'
    ? INITIAL_REVEAL + (safeMisses * (safeMisses + 1)) / 2 + safeMisses
    : INITIAL_REVEAL + safeMisses * REVEAL_PER_MISS;
  return Math.min(totalClues, count);
}

/** Number of new fragments a miss unlocks (for the toast). */
export function newlyRevealedFor(misses, totalClues, mode = 'normal') {
  const before = revealCountFor(misses - 1, totalClues, mode);
  const after = revealCountFor(misses, totalClues, mode);
  return Math.max(0, after - before);
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Game day runs from EVE downtime (11:00 UTC) to the next downtime. */
export function gameDateKey(date = new Date(), resetHourUtc = DOWNTIME_HOUR_UTC) {
  const shifted = new Date(date.getTime() - resetHourUtc * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function msUntilNextDowntime(now = new Date(), resetHourUtc = DOWNTIME_HOUR_UTC) {
  let next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    resetHourUtc,
    0,
    0,
    0
  );
  if (next <= now.getTime()) next += 24 * 60 * 60 * 1000;
  return Math.max(0, next - now.getTime());
}

export function modeFromLocation(search = '') {
  return new URLSearchParams(search).get('mode') === 'abyss' ? 'abyss' : 'normal';
}

export const ARCHIVE_START = '2003-05-06';
export const KILL_HISTORY_START = '2012-05-22';

export function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  if (date.toISOString().slice(0, 10) !== value) return false;
  return value >= ARCHIVE_START && value <= '2100-12-31';
}

export function shiftDateKey(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

const FREE_KILL_SALT = 0x5bd1e995;

export function freeKillToken(id) {
  const value = Number(id) >>> 0;
  const mixed = (value ^ FREE_KILL_SALT) >>> 0;
  const check = (((mixed >>> 16) ^ mixed) & 0xffff).toString(36).slice(-2).padStart(2, '0');
  return `k${mixed.toString(36)}${check}`;
}

export function freeKillIdFromToken(raw) {
  const value = String(raw || '').trim();
  if (/^\d+$/.test(value) && Number(value) > 0) return Number(value);
  const match = /^k([0-9a-z]+)([0-9a-z]{2})$/.exec(value);
  if (!match) return null;
  const mixed = Number.parseInt(match[1], 36) >>> 0;
  const check = (((mixed >>> 16) ^ mixed) & 0xffff).toString(36).slice(-2).padStart(2, '0');
  if (match[2] !== check) return null;
  return (mixed ^ FREE_KILL_SALT) >>> 0;
}

export function parseKillId(raw) {
  const value = String(raw || '').trim();
  if (/^\d+$/.test(value) && Number(value) > 0) return Number(value);
  const bare = value.match(/(?:zkillboard\.com\/)?(?:api\/)?kill(?:ID)?\/(\d+)/i);
  if (bare) return Number(bare[1]);
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/(?:kill|api\/killID)\/(\d+)\/?/i);
    if (match) return Number(match[1]);
    const query = url.searchParams.get('killID') || url.searchParams.get('killmail_id');
    if (query && /^\d+$/.test(query)) return Number(query);
  } catch {
    // not a URL
  }
  return null;
}

const FITTED_KILL_FLAGS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
  87, 92, 93, 94, 155, 158, 159, 160, 161,
]);

export function killHasFittedModules(killmail) {
  return (killmail?.victim?.items || []).some((item) => FITTED_KILL_FLAGS.has(Number(item.flag)));
}

export function dateKeyFromLocation(search = location.search, now = new Date(), resetHourUtc = DOWNTIME_HOUR_UTC) {
  const params = new URLSearchParams(search);
  const raw = params.get('d');
  const today = gameDateKey(now, resetHourUtc);
  if (!raw) return { date: today, invalid: false, archive: false };
  if (!isValidDateKey(raw) || raw > today) return { date: today, invalid: true, archive: false };
  return { date: raw, invalid: false, archive: raw !== today };
}

export function msUntilNextUtcMidnight(now = new Date()) {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(0, next - now.getTime());
}

/**
 * cyrb53: a small, deterministic 53-bit string hash. The seed keeps the daily
 * selection independent from unrelated uses of the hash.
 */
export function cyrb53(input, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Deterministically map a UTC date onto the answer pool. Both the date and the
 * pool version are part of the hash; the pool is sorted by numeric hull ID so
 * localized data files can never change the result.
 */
export function dailyAnswerIndex(dateKey, poolSize, poolVersion = '') {
  if (!poolSize) return 0;
  const hash = cyrb53(`fitdle:v1:${dateKey}:${poolVersion}`, 0x5ca1ab1e);
  return hash % poolSize;
}

export function pickDailyAnswer(pool, dateKey, poolVersion = '') {
  if (!Array.isArray(pool) || !pool.length) return null;
  const sorted = [...pool].sort((a, b) => Number(a) - Number(b));
  return sorted[dailyAnswerIndex(dateKey, sorted.length, poolVersion)];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff]+/g, ' ')
    .trim();
}

export function buildSearchIndex(catalog, groupNames = {}, { races = {}, factions = {}, locale = 'en' } = {}) {
  return catalog.map((ship) => {
    const names = [...new Set(Object.values(ship.names || {}).map(normalizeText).filter(Boolean))];
    const group = normalizeText(groupNames[ship.groupID] || '');
    return {
      ship,
      names,
      group,
      sortGroup: groupNames[ship.groupID] || '',
      sortRace: races[ship.raceID] || '',
      sortFaction: factions[ship.factionID] || '',
      sortName: ship.names?.[locale] || ship.names?.en || '',
      haystack: [...names, group].join(' '),
    };
  });
}

export function searchShips(index, query, { exclude = new Set(), limit = 8 } = {}) {
  const q = normalizeText(query);
  if (!q) return [];
  const terms = q.split(' ').filter(Boolean);
  const results = [];
  for (const entry of index) {
    const ship = entry.ship;
    if (exclude.has(ship.id)) continue;
    if (!terms.every((term) => entry.haystack.includes(term))) continue;
    let score = 0;
    for (const name of entry.names) {
      if (name === q) score = Math.max(score, 120);
      else if (name.startsWith(q)) score = Math.max(score, 100 - Math.min(20, name.length - q.length));
      else if (name.includes(q)) score = Math.max(score, 70 - Math.min(15, name.indexOf(q)));
      else if (terms.every((term) => name.includes(term))) score = Math.max(score, 55);
    }
    if (entry.group === q) score = Math.max(score, 65);
    else if (entry.group.startsWith(q)) score = Math.max(score, 45);
    if (score > 0) results.push({ ship, score, entry });
  }
  // Browse order: tech level → hull class/group → race → faction. Localized
  // names are used when available, numeric IDs are the stable fallback.
  results.sort((a, b) => (
    Number(a.ship.techLevel || 0) - Number(b.ship.techLevel || 0)
    || a.entry.sortGroup.localeCompare(b.entry.sortGroup)
    || Number(a.ship.groupID || 0) - Number(b.ship.groupID || 0)
    || a.entry.sortRace.localeCompare(b.entry.sortRace)
    || Number(a.ship.raceID || 0) - Number(b.ship.raceID || 0)
    || a.entry.sortFaction.localeCompare(b.entry.sortFaction)
    || Number(a.ship.factionID || 0) - Number(b.ship.factionID || 0)
    || a.entry.sortName.localeCompare(b.entry.sortName)
    || a.ship.id - b.ship.id
  ));
  return results.slice(0, limit).map((r) => r.ship);
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

function closeness(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  return Math.exp(-Math.abs(Math.log(a / b)) * 1.7);
}

/**
 * Aggregate, spoiler-free profile similarity between a guess and the answer.
 * Individual values are never exposed; only the aggregate percentage is shown.
 */
export function profileSimilarity(guess, answer) {
  if (!guess || !answer) return 0;
  if (guess.id === answer.id) return 100;
  let earned = 0;
  let possible = 0;
  const add = (weight, ratio) => {
    possible += weight;
    earned += weight * Math.max(0, Math.min(1, ratio));
  };

  add(18, guess.groupID === answer.groupID ? 1 : 0);
  add(8, guess.raceID === answer.raceID ? 1 : 0);
  add(4, guess.factionID && guess.factionID === answer.factionID ? 1 : 0);
  const techDiff = Math.abs((guess.techLevel || 0) - (answer.techLevel || 0));
  add(6, techDiff === 0 ? 1 : techDiff <= 1 ? 0.45 : 0);

  const g = guess.attrs || {};
  const a = answer.attrs || {};
  const slotKeys = ['hi', 'med', 'low', 'rig'];
  const slotDiff = slotKeys.reduce((sum, key) => sum + Math.abs((g[key] || 0) - (a[key] || 0)), 0);
  const slotTotal = Math.max(1, slotKeys.reduce((sum, key) => sum + (a[key] || 0), 0));
  add(18, 1 - Math.min(1, slotDiff / slotTotal));
  const hardpointDiff = Math.abs((g.turret || 0) - (a.turret || 0)) + Math.abs((g.launcher || 0) - (a.launcher || 0));
  add(8, 1 - Math.min(1, hardpointDiff / Math.max(1, (a.turret || 0) + (a.launcher || 0))));
  add(12, closeness(g.speed, a.speed));
  add(12, closeness(g.sig, a.sig));
  add(5, closeness((g.droneBandwidth || 0) + 1, (a.droneBandwidth || 0) + 1));
  add(8, closeness((g.shield || 0) + (g.armor || 0) + 1, (a.shield || 0) + (a.armor || 0) + 1));
  add(4, closeness(g.mass, a.mass));

  const score = possible ? (earned / possible) * 100 : 0;
  return Math.min(97, Math.max(1, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Results and sharing
// ---------------------------------------------------------------------------

export function resultGrid(status, attempts, limit = ATTEMPT_LIMIT) {
  const used = Math.min(limit, Math.max(0, attempts));
  if (status === 'won') {
    return '🟧'.repeat(Math.max(0, used - 1)) + '🟩' + '⬛'.repeat(Math.max(0, limit - used));
  }
  return '🟧'.repeat(used) + '⬛'.repeat(Math.max(0, limit - used));
}

export function shareText({ date, status, attempts, url, t }) {
  const grid = resultGrid(status, attempts);
  const headline = status === 'won'
    ? t('end.shareScore', { date, score: attempts })
    : t('end.shareLoss', { date });
  return `${headline}\n${grid}\n${url}`;
}

export function shareUrl(locationLike, date, mode = 'normal', status = 'playing', attempts = 0, locale = 'en') {
  // A localized static score page carries the Open Graph metadata used by
  // Discord and other link previews. The page itself redirects into the puzzle.
  const url = new URL(locationLike.href);
  const key = status === 'lost' ? 'lost' : String(Math.max(1, Math.min(6, Number(attempts) || 1)));
  const language = String(locale || 'en').toLowerCase().split(/[-_]/)[0];
  const safeLocale = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh'].includes(language) ? language : 'en';
  url.pathname = new URL(`share/${key}/${safeLocale}.html`, url).pathname;
  url.search = '';
  url.hash = '';
  url.searchParams.set('d', date);
  url.searchParams.set('mode', mode === 'abyss' ? 'abyss' : 'normal');
  url.searchParams.set('lang', safeLocale);
  return url.toString();
}

export function buildGuessResult(guess, answer, attempt) {
  if (guess.id === answer.id) {
    return { kind: 'correct', attempt, similarity: 100 };
  }
  return { kind: 'wrong', attempt, similarity: profileSimilarity(guess, answer) };
}

export function loadState(storage, date, dataVersion, mode = 'normal') {
  try {
    const raw = storage.getItem(`fitdle:v1:state:${date}:${mode}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.dataVersion !== dataVersion) return { invalidated: true };
    if (!Array.isArray(data.guesses)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveState(storage, date, state, mode = 'normal') {
  try {
    storage.setItem(`fitdle:v1:state:${date}:${mode}`, JSON.stringify(state));
  } catch {
    // best effort only
  }
}

export function loadStats(storage) {
  try {
    const raw = storage.getItem('fitdle:v1:stats');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed || {
      played: 0,
      wins: 0,
      streak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0, 0, 0, 0],
      lastDate: null,
    };
  } catch {
    return { played: 0, wins: 0, streak: 0, maxStreak: 0, distribution: [0, 0, 0, 0, 0, 0], lastDate: null };
  }
}

export function saveStats(storage, stats) {
  try {
    storage.setItem('fitdle:v1:stats', JSON.stringify(stats));
  } catch {
    // best effort only
  }
}

/** Record a completed daily cycle once. Archive games do not affect records. */
export function recordResult(storage, stats, { date, status, attempts, isToday }) {
  if (!isToday) return stats;
  if (stats.lastDate === date) return stats;
  const next = { ...stats, distribution: [...(stats.distribution || [0, 0, 0, 0, 0, 0])] };
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  const yesterday = day.toISOString().slice(0, 10);
  next.played = (next.played || 0) + 1;
  if (status === 'won') {
    next.wins = (next.wins || 0) + 1;
    next.streak = stats.lastDate === yesterday ? (next.streak || 0) + 1 : 1;
    next.maxStreak = Math.max(next.maxStreak || 0, next.streak);
    const index = Math.max(0, Math.min(5, attempts - 1));
    next.distribution[index] = (next.distribution[index] || 0) + 1;
  } else {
    next.streak = 0;
  }
  next.lastDate = date;
  saveStats(storage, next);
  return next;
}
