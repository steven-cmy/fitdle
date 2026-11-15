#!/usr/bin/env node
/**
 * Build the static SDE catalog used by the browser.  This is intentionally
 * limited to CCP data (ships, bonuses, module metadata).  It does NOT fetch or
 * bundle zKillboard statistics/fits: those are requested live at runtime.
 *
 * Input:  .cache/normalized.json (from prepare-sde.mjs)
 * Output: data/catalog.json, data/refs/{lang}.json, data/manifest.json
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '1.0.0';
const SDE_FILE = path.join(ROOT, '.cache', 'normalized.json');
const OUT = path.join(ROOT, 'data');
const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh'];
const ZKB_BASE = 'https://zkillboard.com';
const IMAGE_BASE = 'https://images.evetech.net';
// Same-origin HTTP Date header. Avoids cross-origin CORS and browser
// interception of the old Cloudflare trace endpoint.
const TIME_SOURCE = 'data/manifest.json';

if (!fs.existsSync(SDE_FILE)) {
  throw new Error('Missing .cache/normalized.json. Run `node scripts/prepare-sde.mjs` first.');
}
const sde = JSON.parse(fs.readFileSync(SDE_FILE, 'utf8'));
const sdeMetaFile = path.join(ROOT, '.cache', 'sde-meta.json');
const sdeMeta = fs.existsSync(sdeMetaFile) ? JSON.parse(fs.readFileSync(sdeMetaFile, 'utf8')) : {};
const locales = LOCALES.filter((locale) => sde.locales?.includes(locale));

function localized(value, locale) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[locale] || value.en || '';
}

function number(value) {
  return value == null ? null : Number(value);
}

function cleanText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ships = [...sde.ships].sort((a, b) => a.id - b.id);
function resistPercent(resonance) {
  const value = Number(resonance);
  if (!Number.isFinite(value)) return 0;
  return Math.round((1 - value) * 1000) / 10;
}

function alignSeconds(mass, agility) {
  const m = Number(mass) || 0;
  const a = Number(agility) || 0;
  if (!m || !a) return 0;
  return Math.round(1.386 * a * m / 1e6 * 100) / 100;
}

const catalog = ships.map((ship) => {
  const attrs = ship.attrs || {};
  const mass = ship.mass ?? number(attrs.massAttr) ?? 0;
  return {
    id: ship.id,
    names: ship.names,
    groupID: ship.groupID,
    raceID: ship.raceID ?? null,
    factionID: ship.factionID ?? null,
    metaGroupID: ship.metaGroupID ?? null,
    techLevel: ship.techLevel ?? null,
    basePrice: Number(ship.basePrice || 0),
    descriptions: Object.fromEntries(
      Object.entries(ship.description || {}).map(([locale, text]) => [locale, cleanText(text)])
    ),
    bonuses: ship.bonuses || {},
    attrs: {
      maxLockedTargets: number(attrs.maxLockedTargets) ?? 0,
      shieldResists: {
        em: resistPercent(attrs.shieldEmResonance),
        thermal: resistPercent(attrs.shieldThermalResonance),
        kinetic: resistPercent(attrs.shieldKineticResonance),
        explosive: resistPercent(attrs.shieldExplosiveResonance),
      },
      armorResists: {
        em: resistPercent(attrs.armorEmResonance),
        thermal: resistPercent(attrs.armorThermalResonance),
        kinetic: resistPercent(attrs.armorKineticResonance),
        explosive: resistPercent(attrs.armorExplosiveResonance),
      },
      structureResists: {
        em: resistPercent(attrs.structureEmResonance),
        thermal: resistPercent(attrs.structureThermalResonance),
        kinetic: resistPercent(attrs.structureKineticResonance),
        explosive: resistPercent(attrs.structureExplosiveResonance),
      },
      hi: number(attrs.hiSlots) ?? 0,
      med: number(attrs.medSlots) ?? 0,
      low: number(attrs.lowSlots) ?? 0,
      rig: number(attrs.rigSlots) ?? 0,
      turret: number(attrs.turretHardpoints) ?? 0,
      launcher: number(attrs.launcherHardpoints) ?? 0,
      speed: number(attrs.maxVelocity) ?? 0,
      sig: number(attrs.signatureRadius) ?? 0,
      droneBandwidth: number(attrs.droneBandwidth) ?? 0,
      droneCapacity: number(attrs.droneCapacity) ?? 0,
      mass,
      shield: number(attrs.shieldCapacity) ?? 0,
      armor: number(attrs.armorHP) ?? 0,
      structure: number(attrs.structureHP) ?? 0,
      capacitor: number(attrs.capacitorCapacity) ?? 0,
      capacitorRecharge: number(attrs.capacitorRecharge) ?? 0,
      align: alignSeconds(mass, attrs.agility),
      warp: Math.round((Number(attrs.baseWarpSpeed) || 1) * (Number(attrs.warpSpeedMultiplier) || 1) * 100) / 100,
      cargo: number(attrs.cargoCapacity) ?? 0,
      targetRange: number(attrs.maxTargetRange) ?? 0,
      scanRes: number(attrs.scanResolution) ?? 0,
      pg: number(attrs.powerOutput) ?? 0,
      cpu: number(attrs.cpuOutput) ?? 0,
      calibration: number(attrs.calibration) ?? 0,
    },
  };
});

// Abyssal difficulty biases the daily target toward rare/specialised hulls.
// Price/meta/tech/group are static SDE proxies for "less commonly used"; no
// zKillboard snapshot is baked into the deployment.
function abyssWeight(ship) {
  let weight = 1;
  const meta = Number(ship.metaGroupID || 0);
  if (meta >= 4) weight += 5;
  else if (meta === 3) weight += 1;
  else if (meta === 2) weight += 2;
  const price = Number(ship.basePrice || 0);
  if (price > 0) weight += Math.min(5, Math.max(0, Math.log10(price / 1e6)));
  if (Number(ship.techLevel || 0) >= 2) weight += 1;
  if ([29, 31, 237].includes(ship.groupID)) weight += 2;
  return Math.max(1, Math.min(12, Math.round(weight)));
}

const abyssAnswerPool = catalog
  .flatMap((ship) => Array.from({ length: abyssWeight(ship) }, () => ship.id))
  .sort((a, b) => a - b);

const killPoolPath = [
  path.join(ROOT, '.cache', 'killpool.json'),
  path.join(ROOT, 'data', 'killpool.json'),
].find((candidate) => fs.existsSync(candidate));
const killPoolSource = killPoolPath ? JSON.parse(fs.readFileSync(killPoolPath, 'utf8')) : { kills: [] };
const shipByID = new Map(catalog.map((ship) => [Number(ship.id), ship]));
const killPool = (killPoolSource.kills || [])
  .map((entry) => ({
    killmail_id: Number(entry.killmail_id),
    ship_id: Number(entry.ship_id),
    total_value: Number(entry.total_value || 0),
  }))
  .filter((entry) => Number.isFinite(entry.killmail_id) && shipByID.has(entry.ship_id));
const abyssKillPool = killPool
  .flatMap((entry) => Array.from(
    { length: abyssWeight(shipByID.get(entry.ship_id)) },
    () => entry.killmail_id,
  ))
  .sort((a, b) => a - b);
const killShipPool = [...new Set(killPool.map((entry) => entry.ship_id))].sort((a, b) => a - b);
const abyssKillShipPool = killShipPool
  .flatMap((shipID) => Array.from(
    { length: abyssWeight(shipByID.get(shipID)) },
    () => shipID,
  ))
  .sort((a, b) => a - b);
const killPoolsByShip = {};
for (const entry of killPool) {
  if (!killPoolsByShip[entry.ship_id]) killPoolsByShip[entry.ship_id] = [];
  if (!killPoolsByShip[entry.ship_id].includes(entry.killmail_id)) {
    killPoolsByShip[entry.ship_id].push(entry.killmail_id);
  }
}
for (const ids of Object.values(killPoolsByShip)) ids.sort((a, b) => a - b);

const moduleTypes = sde.moduleTypes || [];
const moduleIDs = new Set(moduleTypes.map((module) => module.id));
const usedGroupIDs = new Set([
  ...catalog.map((ship) => ship.groupID),
  ...moduleTypes.map((module) => module.groupID),
]);
const groupNames = sde.groups || {};
const races = sde.races || {};
const factions = sde.factions || {};
const metaGroups = sde.metaGroups || {};

function makeRefs(locale) {
  const groups = {};
  for (const id of usedGroupIDs) {
    const group = groupNames[id];
    if (group) groups[id] = localized(group.names, locale) || localized(group.names, 'en') || String(id);
  }
  const modules = {};
  for (const module of moduleTypes) {
    modules[module.id] = {
      name: localized(module.names, locale) || localized(module.names, 'en') || `Module #${module.id}`,
      groupID: module.groupID,
      categoryID: module.categoryID,
      metaGroupID: module.metaGroupID ?? null,
      fitRestrictions: module.fitRestrictions || null,
    };
  }
  const raceMap = {};
  for (const [id, race] of Object.entries(races)) raceMap[id] = localized(race.names, locale) || localized(race.names, 'en') || String(id);
  const factionMap = {};
  for (const [id, faction] of Object.entries(factions)) factionMap[id] = localized(faction.names, locale) || localized(faction.names, 'en') || String(id);
  const metaMap = {};
  for (const [id, meta] of Object.entries(metaGroups)) metaMap[id] = localized(meta.names, locale) || localized(meta.names, 'en') || String(id);
  return { lang: locale, groups, races: raceMap, factions: factionMap, metaGroups: metaMap, modules };
}

function moduleSizeKey(name) {
  const match = String(name || '').match(/\b(X-Large|Small|Medium|Large|Capital|\d+MN|\d+mm|Micro|Heavy|Light)\b/i);
  return match ? match[1].toLowerCase() : '';
}

const moduleFallbacks = {};
{
  const buckets = new Map();
  for (const module of moduleTypes) {
    const key = `${module.groupID}|${moduleSizeKey(module.names?.en || '')}`;
    if (!buckets.has(key)) buckets.set(key, { t2: [], faction: [], t1: [] });
    const bucket = buckets.get(key);
    const meta = Number(module.metaGroupID || 0);
    if (meta === 2) bucket.t2.push(module.id);
    else if (meta >= 4) bucket.faction.push(module.id);
    else if (meta === 1) bucket.t1.push(module.id);
  }
  for (const module of moduleTypes) {
    if (Number(module.metaGroupID || 0) !== 15) continue;
    const key = `${module.groupID}|${moduleSizeKey(module.names?.en || '')}`;
    const bucket = buckets.get(key);
    const representative = bucket?.t2[0] || bucket?.faction[0] || bucket?.t1[0];
    if (representative && representative !== module.id) moduleFallbacks[module.id] = representative;
  }
}

const RULESET_VERSION = 'v8';
const versionSeed = `${RULESET_VERSION}|${sde.generatedAt || ''}|${catalog.map((ship) => `${ship.id}:${ship.attrs.warp}:${ship.attrs.align}`).join(',')}|${moduleTypes.length}|${abyssAnswerPool.length}|${Object.keys(moduleFallbacks).length}|${killPool.map((entry) => entry.killmail_id).join(',')}`;
const dataVersion = crypto.createHash('sha1').update(versionSeed).digest('hex').slice(0, 12);

const manifest = {
  format: 'fitdle-runtime-v2',
  version: PACKAGE_VERSION,
  dataVersion,
  clueVersion: '2',
  generatedAt: new Date().toISOString(),
  sdeGeneratedAt: sde.generatedAt || null,
  sde: {
    generatedAt: sde.generatedAt || null,
    url: sdeMeta.url || 'https://developers.eveonline.com/static-data/',
    etag: sdeMeta.etag || '',
    lastModified: sdeMeta.lastModified || '',
    downloadedAt: sdeMeta.downloadedAt || null,
  },
  locales,
  defaultLocale: 'en',
  zkillboard: {
    baseUrl: ZKB_BASE,
    snapshot: killPoolSource.generatedAt ? killPoolSource.generatedAt.slice(0, 10) : null,
  },
  images: { baseUrl: IMAGE_BASE },
  esi: { baseUrl: 'https://esi.evetech.net' },
  links: {
    eveDocs: 'https://developers.eveonline.com/docs/',
    eveOnline: 'https://www.eveonline.com/',
    fenris: 'https://fenris.com/',
    glossary: 'https://ddd4512kk-source.github.io/EVE-Online-Tranquility-Chinese-Personas/glossary/',
  },
  timeSource: TIME_SOURCE,
  answerPool: catalog.map((ship) => ship.id).sort((a, b) => a - b),
  abyssAnswerPool,
  killPool,
  abyssKillPool,
  killShipPool,
  abyssKillShipPool,
  killPoolsByShip,
  killPoolGeneratedAt: killPoolSource.generatedAt || null,
  moduleFallbacks,
  downtimeUtcHour: 11,
  counts: {
    catalog: catalog.length,
    answers: catalog.length,
    abyssPool: abyssAnswerPool.length,
    killPool: killPool.length,
    abyssKillPool: abyssKillPool.length,
    killShipPool: killShipPool.length,
    abyssKillShipPool: abyssKillShipPool.length,
    modules: moduleTypes.length,
    groups: usedGroupIDs.size,
  },
};

await fsp.rm(OUT, { recursive: true, force: true });
await fsp.mkdir(path.join(OUT, 'refs'), { recursive: true });
await fsp.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await fsp.writeFile(path.join(OUT, 'catalog.json'), JSON.stringify({ ships: catalog }));
for (const locale of locales) {
  await fsp.writeFile(path.join(OUT, 'refs', `${locale}.json`), JSON.stringify(makeRefs(locale)));
}

console.log(`Wrote catalog ${dataVersion}: ${catalog.length} ships, ${moduleTypes.length} modules, ${killPool.length} killmail targets, ${locales.length} locales.`);
if (!killPool.length) console.warn('No killmail target pool; run npm run build:killpool before building for web deployment.');
console.log(`Capsule/shuttle/corvette groups: ${catalog.filter((ship) => [29, 31, 237].includes(ship.groupID)).length} ships.`);
