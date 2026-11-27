#!/usr/bin/env node
/**
 * Fetch monthly ship usage from zKillboard for every playable SDE hull.
 *
 * Usage: node scripts/build-ship-usage.mjs [--out FILE] [--previous FILE] [--missing-only]
 *
 * One documented request per hull (/api/stats/shipTypeID/{id}/kills/), sent one at a
 * time with a pause, gzip, an application User-Agent without personal details,
 * and Retry-After honoured. A 401/403 (access block) stops the whole run at
 * once. Only complete calendar months are kept. Hulls that fail keep their previous entry. The file
 * is only written when the response format looks as expected, so a format change
 * upstream fails the run instead of publishing empty data.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { retryAfterMs } from '../js/retry-after.js';
import { mergeUsage, monthKeyOf, parseStats, planUsage } from './ship-usage.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const OUT = path.resolve(arg('--out', path.join(ROOT, '.cache', 'ship-usage.json')));
const PREVIOUS = path.resolve(arg('--previous', OUT));
const MISSING_ONLY = process.argv.includes('--missing-only');
const PAUSE_MS = Number(process.env.USAGE_REQUEST_PAUSE_MS || 1000);
// The base address can be replaced for tests only.
const BASE = process.env.USAGE_STATS_BASE || 'https://zkillboard.com/api/stats/shipTypeID';
const THIS_MONTH = monthKeyOf(Date.now());
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const USER_AGENT = `FITDLE/${pkg.version} (+https://github.com/steven-cmy/fitdle)`;
const CATALOG = path.join(ROOT, 'data', 'catalog.json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!fs.existsSync(CATALOG)) throw new Error('Missing data/catalog.json. Run npm run build:catalog first.');
const ships = JSON.parse(await fsp.readFile(CATALOG, 'utf8')).ships.map((ship) => Number(ship.id)).sort((a, b) => a - b);

let previous = null;
try {
  previous = JSON.parse(await fsp.readFile(PREVIOUS, 'utf8'));
  if (previous?.version !== 1) previous = null;
} catch {
  // No previous file: every hull is requested.
}

const queue = planUsage({ ships, previous, missingOnly: MISSING_ONLY });
if (!queue.length) {
  console.log(`Nothing to request (${ships.length} hulls known)`);
  process.exit(0);
}
console.log(`Requesting monthly usage for ${queue.length}/${ships.length} hulls`);

class Blocked extends Error {}

async function fetchShip(id) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/${id}/kills/`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Encoding': 'gzip' },
        signal: AbortSignal.timeout(20000),
      });
      // An access block is not retried and not worked around: stop everything.
      if (response.status === 401 || response.status === 403) throw new Blocked(`HTTP ${response.status}`);
      if (response.status === 429 || response.status === 503) {
        await sleep(retryAfterMs(response.headers.get('retry-after'), { fallbackMs: 30_000 }));
        continue;
      }
      // A hull without statistics is a valid empty answer, not an error.
      if (response.status === 404) return { id, months: {}, found: true };
      if (!response.ok) throw new Error(String(response.status));
      const parsed = parseStats(await response.json(), { beforeKey: THIS_MONTH });
      return { id, months: parsed.months, found: parsed.found };
    } catch (error) {
      if (error instanceof Blocked) throw error;
      await sleep(2000 * (attempt + 1));
    }
  }
  return { id, error: true };
}

const rows = [];
for (const [index, id] of queue.entries()) {
  try {
    rows.push(await fetchShip(id));
  } catch (error) {
    if (!(error instanceof Blocked)) throw error;
    console.error(`zKillboard refused access (${error.message}) after ${rows.length} hulls; stopping and writing nothing.`);
    process.exit(1);
  }
  if ((index + 1) % 50 === 0) console.log(`Fetched ${index + 1}/${queue.length}`);
  await sleep(PAUSE_MS);
}

const answered = rows.filter((row) => !row.error);
const withMonths = answered.filter((row) => Object.keys(row.months).length > 0);
if (!answered.length || withMonths.length < answered.length * 0.5 || rows.length - answered.length > rows.length * 0.1) {
  console.error(`Refusing to write: ${answered.length}/${rows.length} answers, ${withMonths.length} with monthly data. The response format may have changed.`);
  process.exit(1);
}
const merged = mergeUsage({ ships, previous, rows });
const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: `${BASE}/{id}/kills/ months (undocumented field, complete months only): [shipsDestroyed, shipsLost] per YYYYMM`,
  ships: merged.ships,
};
await fsp.mkdir(path.dirname(OUT), { recursive: true });
await fsp.writeFile(OUT, `${JSON.stringify(payload)}\n`);
console.log(`Wrote ${OUT}: ${Object.keys(merged.ships).length} hulls, ${merged.failed} failed (kept as before)`);
