/**
 * Incremental refresh rules for zKillboard ship usage weights.
 *
 * Every entry carries its own fetch time, so a build only requests hulls that
 * need it. A failed request keeps the previous numbers: writing zeros would
 * drop the hull from the target pools as if it had never been lost.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Hard limit: entries older than this are always requested again. */
export const MAX_AGE_MS = 7 * DAY_MS;
/** From this age on a build renews a few of the oldest entries ahead of time. */
export const EARLY_AGE_MS = 5 * DAY_MS;
/** Upper bound for early renewals per build. */
export const EARLY_BUDGET = 60;

function fetchedAt(entry, cache) {
  const value = Number(entry?.at) || Date.parse(cache?.generatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

/** Return the hull ids a build has to request, most urgent first. */
export function planWeights({ ships, cache = null, now = Date.now(), refresh = false }) {
  if (refresh) return [...ships];
  const usage = cache?.usage || {};
  const missing = [];
  const expired = [];
  const aging = [];
  for (const id of ships) {
    const entry = usage[String(id)];
    if (!entry) {
      missing.push(id);
      continue;
    }
    const age = now - fetchedAt(entry, cache);
    // A timestamp from the future cannot be trusted either.
    if (age < 0 || age >= MAX_AGE_MS) expired.push({ id, age });
    else if (age >= EARLY_AGE_MS) aging.push({ id, age });
  }
  const oldestFirst = (a, b) => b.age - a.age || a.id - b.id;
  const required = [...missing, ...expired.sort(oldestFirst).map((item) => item.id)];
  const early = aging.sort(oldestFirst)
    .slice(0, Math.max(0, EARLY_BUDGET - required.length))
    .map((item) => item.id);
  return [...required, ...early];
}

/** Merge fetched rows into the previous cache. Rows with `error` are ignored. */
export function mergeWeights({ ships, cache = null, rows, now = Date.now() }) {
  const usage = {};
  for (const id of ships) {
    const previous = cache?.usage?.[String(id)];
    if (!previous) continue;
    usage[id] = {
      recent: Math.max(0, Number(previous.recent) || 0),
      all: Math.max(0, Number(previous.all) || 0),
      at: fetchedAt(previous, cache),
    };
  }
  let failed = 0;
  for (const row of rows) {
    if (row.error) {
      failed += 1;
      continue;
    }
    usage[row.id] = {
      recent: Math.max(0, row.recent || 0),
      all: Math.max(0, row.all || 0),
      at: now,
    };
  }
  const entries = Object.values(usage);
  return {
    usage,
    failed,
    zeroRecent: entries.filter((entry) => !entry.recent).length,
    zeroAll: entries.filter((entry) => !entry.all).length,
  };
}
