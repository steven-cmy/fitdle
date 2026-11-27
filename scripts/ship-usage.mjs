/**
 * Rules for the monthly ship usage file (data branch, ship-usage.json).
 *
 * Per hull and calendar month it keeps [shipsDestroyed, shipsLost] from the
 * zKillboard single-ship statistics: kills the hull took part in as an attacker
 * (the usage measure) and its losses (which sizes the loss pages of a month).
 */

/** Months of a single-ship stats response as { YYYYMM: [destroyed, lost] }. */
export function parseStats(stats) {
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
    months[`${year}${String(month).padStart(2, '0')}`] = [destroyed, lost];
  }
  return { found: true, months };
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
