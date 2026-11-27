/**
 * Rules for the monthly ship usage file (data branch, ship-usage.json).
 *
 * Per hull and calendar month it keeps [shipsDestroyed, shipsLost] from the
 * zKillboard single-ship statistics: kills the hull took part in as an attacker
 * (the usage measure) and its losses (which sizes the loss pages of a month).
 */

/**
 * Months of a single-ship stats response as { YYYYMM: [destroyed, lost] }.
 *
 * `months` is not in the documented response of /api/stats/ (zKillboard's API
 * catalog lists no per-month field); it was found by looking at real answers.
 * When it is missing or unreadable the result is `found: false` with no months,
 * never an error, and the caller decides what that means.
 * `beforeKey` ('YYYYMM') drops that month and later ones: a month that is not
 * over has only a few days of data.
 */
export function parseStats(stats, { beforeKey = '' } = {}) {
  const raw = stats?.months;
  if (!raw || typeof raw !== 'object') return { found: false, months: {} };
  const entries = Array.isArray(raw) ? raw.map((value) => [null, value]) : Object.entries(raw);
  const months = {};
  for (const [key, value] of entries) {
    const year = Number(value?.year ?? String(key).slice(0, 4));
    const month = Number(value?.month ?? String(key).slice(4, 6));
    if (!Number.isInteger(year) || year < 2003 || !Number.isInteger(month) || month < 1 || month > 12) continue;
    const destroyed = Math.max(0, Math.floor(Number(value?.shipsDestroyed) || 0));
    const lost = Math.max(0, Math.floor(Number(value?.shipsLost) || 0));
    if (!destroyed && !lost) continue;
    const key = `${year}${String(month).padStart(2, '0')}`;
    if (beforeKey && key >= beforeKey) continue;
    months[key] = [destroyed, lost];
  }
  return { found: true, months };
}

/** 'YYYYMM' of the month `time` falls in (UTC). */
export function monthKeyOf(time) {
  const date = new Date(time);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Hull ids to request: all of them, or only those without an entry yet. */
export function planUsage({ ships, previous = null, missingOnly = false }) {
  const known = previous?.ships || {};
  return ships.filter((id) => !missingOnly || !known[String(id)]);
}

/** Previous entries of hulls still in the SDE, replaced by the fresh rows. */
export function mergeUsage({ ships, previous = null, rows, now = Date.now() }) {
  const out = {};
  for (const id of ships) {
    const old = previous?.ships?.[String(id)];
    if (old) out[id] = old;
  }
  let failed = 0;
  for (const row of rows) {
    if (row.error) {
      failed += 1;
      continue;
    }
    out[row.id] = { at: now, m: row.months };
  }
  return { ships: out, failed };
}
