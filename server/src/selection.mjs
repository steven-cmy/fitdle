/**
 * Pure rules of the unified target selection: which hull is tried first and
 * which month of its loss history a killmail is drawn from. Nothing here
 * talks to zKillboard or the database, so every rule can be tested alone.
 */
import { cyrb53, killHasFittedModules } from '../../js/game.js';

export const PAGE_SIZE = 200;
export const MAX_PAGE = 100;
export const DEFAULT_GROUP_FACTORS = '29:0.2,31:0.3,237:0.5';

/** Deterministic random stream (mulberry32) seeded from any string. */
export function makeRng(seed) {
  let state = cyrb53(String(seed), 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * "29:0.2,31:0.3" -> Map(group id -> factor). Factor 0 excludes the group.
 * Invalid pieces are reported in `warnings` and skipped.
 */
export function parseGroupFactors(text) {
  const factors = new Map();
  const warnings = [];
  for (const piece of String(text ?? '').split(',')) {
    const item = piece.trim();
    if (!item) continue;
    const match = /^(\d+)\s*[:=]\s*(\d+(?:\.\d+)?)$/.exec(item);
    if (!match || Number(match[1]) <= 0) {
      warnings.push(`ignored ship group factor "${item}"`);
      continue;
    }
    factors.set(Number(match[1]), Number(match[2]));
  }
  return { factors, warnings };
}

export const monthKey = (year, month) => `${year}${String(month).padStart(2, '0')}`;

/** The `count` complete calendar months before the month of `day` (YYYY-MM-DD). */
export function recentMonthKeys(day, count) {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return [];
  const keys = [];
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  for (let i = 0; i < count; i += 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    keys.push(monthKey(year, month));
  }
  return keys;
}

/** Ships a hull destroyed in the given months (usage file: m[YYYYMM] = [destroyed, lost]). */
export function usageOver(entry, keys) {
  let total = 0;
  for (const key of keys) total += Math.max(0, Number(entry?.m?.[key]?.[0]) || 0);
  return total;
}

/**
 * Weight of every hull. All hulls start at 1; recent usage adds up to
 * `maxRatio - 1` on a log scale, so the heaviest hull is at most `maxRatio`
 * times the lightest. Then each hull is multiplied by its group factor
 * (0 removes it). Hulls of a factored group do not set the usage scale.
 */
export function shipWeights({ ships, usage, day, windowMonths = 3, maxRatio = 3, groupFactors = new Map() }) {
  const keys = recentMonthKeys(day, windowMonths);
  const used = new Map(ships.map((ship) => [Number(ship.id), usageOver(usage?.ships?.[String(ship.id)], keys)]));
  let top = 0;
  for (const ship of ships) {
    const factor = groupFactors.get(Number(ship.groupID));
    if (factor !== undefined && factor !== 1) continue;
    top = Math.max(top, used.get(Number(ship.id)));
  }
  const scale = top > 0 ? Math.log1p(top) : 0;
  const weights = new Map();
  for (const ship of ships) {
    const share = scale ? Math.min(1, Math.log1p(used.get(Number(ship.id))) / scale) : 0;
    const factor = groupFactors.has(Number(ship.groupID)) ? groupFactors.get(Number(ship.groupID)) : 1;
    weights.set(Number(ship.id), (1 + (Math.max(1, maxRatio) - 1) * share) * factor);
  }
  return weights;
}

/**
 * Weighted order without replacement (exponential keys): a heavier hull tends
 * to come first, every hull with a weight above zero appears exactly once, and
 * the same seed always gives the same order.
 */
export function weightedShipOrder(weights, seed) {
  const rng = makeRng(`${seed}:ship-order`);
  const keyed = [];
  for (const id of [...weights.keys()].sort((a, b) => a - b)) {
    const weight = weights.get(id);
    const u = rng();
    if (!(weight > 0)) continue;
    keyed.push({ id, key: -Math.log(1 - u) / weight });
  }
  keyed.sort((a, b) => a.key - b.key || a.id - b.id);
  return keyed.map((item) => item.id);
}

function monthStart(year, month) {
  return Date.UTC(year, month - 1, 1);
}

/**
 * Months of a hull's history that can hold a target, each with its loss count
 * and a time weight: half every `halfLifeDays` of age, never zero.
 */
export function monthCandidates(entry, earliestDate, latestDate, halfLifeDays = 365) {
  const latest = Date.parse(`${latestDate}T12:00:00Z`);
  if (!Number.isFinite(latest)) return [];
  const earliest = earliestDate ? Date.parse(`${earliestDate}T00:00:00Z`) : -Infinity;
  const halfLife = Number(halfLifeDays) > 0 ? Number(halfLifeDays) : 365;
  const out = [];
  for (const [key, value] of Object.entries(entry?.m || {})) {
    const match = /^(\d{4})(\d{2})$/.exec(key);
    const losses = Math.max(0, Number(value?.[1]) || 0);
    if (!match || !losses) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const start = monthStart(year, month);
    const end = monthStart(year, month + 1) - 1;
    if (end < earliest || start > latest) continue;
    const middle = (start + Math.min(end, latest)) / 2;
    const ageDays = Math.max(0, (latest - middle) / 86400000);
    out.push({ key, year, month, losses, weight: Math.pow(0.5, ageDays / halfLife) });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** One item by weight; `rng` returns [0, 1). */
export function pickWeighted(items, rng) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (!items.length || !(total > 0)) return null;
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

export function pageCount(losses) {
  return Math.min(MAX_PAGE, Math.max(1, Math.ceil(losses / PAGE_SIZE)));
}

/** Killmails of one loss page that may become the target. */
export function eligibleKills(page, shipId, { earliestDate = '', latestDate = '', allowEmpty = true, exclude = null } = {}) {
  const out = [];
  let blocked = false;
  for (const kill of Array.isArray(page) ? page : []) {
    const id = Number(kill?.killmail_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (Number(kill?.victim?.ship_type_id) !== Number(shipId)) continue;
    const date = String(kill?.killmail_time || '').slice(0, 10);
    if (!date || (earliestDate && date < earliestDate) || (latestDate && date > latestDate)) continue;
    if (!allowEmpty && !killHasFittedModules(kill)) continue;
    if (exclude?.has(id)) {
      blocked = true;
      continue;
    }
    out.push(kill);
  }
  return { kills: out, blocked };
}
