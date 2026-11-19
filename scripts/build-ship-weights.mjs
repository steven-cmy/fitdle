#!/usr/bin/env node
/**
 * Fetch zKillboard ship usage weights for every published SDE hull.
 *
 * Usage: npm run build:weights [-- --refresh]
 *
 * The cache is intentionally separate from the killmail target pool: it is
 * usage frequency, not a list of target KBs.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const USER_AGENT = `FITDLE/${pkg.version} (+https://gitlab.com/cmy/fitdle)`;
const CACHE = path.join(ROOT, '.cache', 'ship-weights.json');
const CATALOG = path.join(ROOT, 'data', 'catalog.json');
const BASE = 'https://zkillboard.com/api/stats/shipTypeID';
const REFRESH = process.argv.includes('--refresh');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

if (!fs.existsSync(CATALOG)) throw new Error('Missing data/catalog.json. Run npm run build first.');
const catalog = JSON.parse(await fsp.readFile(CATALOG, 'utf8')).ships;
const ships = catalog.map((ship) => Number(ship.id)).sort((a, b) => a - b);

if (!REFRESH && fs.existsSync(CACHE)) {
  const cached = JSON.parse(await fsp.readFile(CACHE, 'utf8'));
  const age = Date.now() - Date.parse(cached.generatedAt || 0);
  if (age >= 0 && age < MAX_AGE_MS) {
    console.log(`Using cached ship weights (${Math.round(age / 86400000)} days old)`);
    process.exit(0);
  }
}

async function fetchShip(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${BASE}/${id}/kills/`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
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
  return { id, recent: 0, all: 0, error: true };
}

const rows = [];
let cursor = 0;
const worker = async () => {
  for (;;) {
    const index = cursor++;
    if (index >= ships.length) return;
    const id = ships[index];
    rows[index] = await fetchShip(id);
    await new Promise((r) => setTimeout(r, 180));
    if ((index + 1) % 50 === 0) console.log(`Fetched ${index + 1}/${ships.length}`);
  }
};
await Promise.all(Array.from({ length: 2 }, worker));

const usage = Object.fromEntries(rows.map((row) => [row.id, {
  recent: Math.max(0, row.recent || 0),
  all: Math.max(0, row.all || 0),
}]));
const payload = {
  generatedAt: new Date().toISOString(),
  source: `${BASE}/{shipID}/kills/`,
  note: 'recent = zKill rankings.recent.all.metrics.shipsLost; all = alltime',
  zeroRecent: rows.filter((row) => !row.recent).length,
  zeroAll: rows.filter((row) => !row.all).length,
  usage,
};
await fsp.mkdir(path.dirname(CACHE), { recursive: true });
await fsp.writeFile(CACHE, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${CACHE}: ${rows.length} ships, ${payload.zeroRecent} with zero recent losses, ${payload.zeroAll} with zero all-time losses`);
