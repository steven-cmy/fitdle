#!/usr/bin/env node
/**
 * Fetch zKillboard ship usage weights for published SDE hulls.
 *
 * Usage: npm run build:weights [-- --refresh]
 *
 * Only missing or aging entries are requested (see ship-weights.mjs); --refresh
 * requests every hull. The cache is intentionally separate from the killmail
 * target pool: it is usage frequency, not a list of target KBs.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { retryAfterMs } from '../js/retry-after.js';
import { mergeWeights, planWeights } from './ship-weights.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const USER_AGENT = `FITDLE/${pkg.version} (+https://gitlab.com/cmy/fitdle)`;
const CACHE = path.join(ROOT, '.cache', 'ship-weights.json');
const CATALOG = path.join(ROOT, 'data', 'catalog.json');
const BASE = 'https://zkillboard.com/api/stats/shipTypeID';
const REFRESH = process.argv.includes('--refresh');

if (!fs.existsSync(CATALOG)) throw new Error('Missing data/catalog.json. Run npm run build first.');
const catalog = JSON.parse(await fsp.readFile(CATALOG, 'utf8')).ships;
const ships = catalog.map((ship) => Number(ship.id)).sort((a, b) => a - b);

let cache = null;
try {
  cache = JSON.parse(await fsp.readFile(CACHE, 'utf8'));
} catch {
  // No usable cache: every hull is requested.
}

const queue = planWeights({ ships, cache, refresh: REFRESH });
if (!queue.length) {
  console.log(`Using cached ship weights (${ships.length} ships, no requests)`);
  process.exit(0);
}
console.log(`Requesting ship weights for ${queue.length}/${ships.length} ships`);

async function fetchShip(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${BASE}/${id}/kills/`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, retryAfterMs(response.headers.get('retry-after'))));
        continue;
      }
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      const recent = Number(data?.rankings?.recent?.all?.metrics?.shipsLost || 0);
      const all = Number(data?.rankings?.alltime?.all?.metrics?.shipsLost || data?.shipsLost || 0);
      return { id, recent, all };
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return { id, error: true };
}

const rows = [];
let cursor = 0;
const worker = async () => {
  for (;;) {
    const index = cursor++;
    if (index >= queue.length) return;
    rows[index] = await fetchShip(queue[index]);
    await new Promise((r) => setTimeout(r, 250));
    if ((index + 1) % 50 === 0) console.log(`Fetched ${index + 1}/${queue.length}`);
  }
};
// One at a time: zKillboard asks clients to space requests out.
await worker();

const { usage, failed, zeroRecent, zeroAll } = mergeWeights({ ships, cache, rows });
const payload = {
  generatedAt: new Date().toISOString(),
  source: `${BASE}/{shipID}/kills/`,
  note: 'recent = zKill rankings.recent.all.metrics.shipsLost; all = alltime; at = fetch time (ms)',
  zeroRecent,
  zeroAll,
  usage,
};
await fsp.mkdir(path.dirname(CACHE), { recursive: true });
await fsp.writeFile(CACHE, `${JSON.stringify(payload, null, 2)}\n`);
if (failed) console.warn(`${failed} ship weight requests failed; previous values were kept where available`);
console.log(`Wrote ${CACHE}: ${Object.keys(usage).length} ships, ${zeroRecent} with zero recent losses, ${zeroAll} with zero all-time losses`);
