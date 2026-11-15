import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8')).ships;
const shipIDs = new Set(catalog.map((ship) => Number(ship.id)));
const zkb = 'https://zkillboard.com/api';
const response = await fetch(`${zkb}/losses/`, { headers: { 'User-Agent': 'Fitdle/1.0' } });
if (!response.ok) throw new Error(`zKill global losses failed: ${response.status}`);
const serverDate = response.headers.get('date') || null;
const losses = await response.json();
const kills = [];
for (const kill of Array.isArray(losses) ? losses : []) {
  const shipID = Number(kill?.victim?.ship_type_id);
  const killID = Number(kill?.killmail_id);
  if (!shipIDs.has(shipID) || !killID || kills.some((entry) => entry.killmail_id === killID)) continue;
  kills.push({
    killmail_id: killID,
    ship_id: shipID,
    total_value: Number(kill?.zkb?.totalValue || 0),
  });
}
const payload = {
  generatedAt: serverDate ? new Date(serverDate).toISOString() : new Date().toISOString(),
  serverDate,
  source: `${zkb}/losses/`,
  kills,
};
for (const target of [path.join(ROOT, '.cache', 'killpool.json'), path.join(ROOT, 'data', 'killpool.json')]) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
}
console.log(`Wrote ${kills.length} killmail targets`);
