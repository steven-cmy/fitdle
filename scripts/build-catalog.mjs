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
import { loadBuildConfig, loadBuildEnv } from './build-env.mjs';
import { practicePools } from './practice-pools.mjs';
import { fetchLatestRelease, sdeBase } from './sde-api.mjs';
import { getZkillVersion } from './zkill-version.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV = loadBuildEnv(ROOT);
const BUILD_CONFIG = loadBuildConfig(ROOT);
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '1.0.0';
const USER_AGENT = `FITDLE/${PACKAGE_VERSION} (+https://github.com/steven-cmy/fitdle)`;
const SDE_FILE = path.join(ROOT, '.cache', 'normalized.json');
const OUT = path.join(ROOT, 'data');
const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh'];
const ZKB_BASE = 'https://zkillboard.com';
const IMAGE_BASE = 'https://images.evetech.net';
const EVE_SSO_SMALL = 'https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-small.png';
const EVE_SSO_LARGE = 'https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-large.png';
// Same-origin HTTP Date header. Avoids cross-origin CORS and browser
// interception of the old Cloudflare trace endpoint.
const TIME_SOURCE = 'data/manifest.json';

if (!fs.existsSync(SDE_FILE)) {
  throw new Error('Missing .cache/normalized.json. Run `node scripts/prepare-sde.mjs` first.');
}
const sde = JSON.parse(fs.readFileSync(SDE_FILE, 'utf8'));
if (sde.normalizedVersion !== 3) {
  throw new Error(`Unsupported normalized SDE version ${sde.normalizedVersion}; run npm run update:sde`);
}
const sdeMetaFile = path.join(ROOT, '.cache', 'sde-meta.json');
const sdeMeta = fs.existsSync(sdeMetaFile) ? JSON.parse(fs.readFileSync(sdeMetaFile, 'utf8')) : {};
if (!sdeMeta.buildNumber || !sdeMeta.release) {
  try {
    const latest = await fetchLatestRelease({
      base: sdeBase(ENV.EVE_SDE_BASE),
      userAgent: USER_AGENT,
    });
    sdeMeta.source = 'sde-api';
    sdeMeta.apiBase = latest.apiBase;
    sdeMeta.latestUrl = latest.latestUrl;
    sdeMeta.release = latest.release;
    sdeMeta.buildNumber = latest.buildNumber;
    sdeMeta.releaseDate = latest.releaseDate;
    sdeMeta.latestEtag = latest.etag;
    sdeMeta.tableVersions = Object.fromEntries(
      Object.entries(latest.tables || {}).map(([table, value]) => [table, value?.version || null]),
    );
    fs.writeFileSync(sdeMetaFile, `${JSON.stringify(sdeMeta, null, 2)}\n`);
  } catch {
    // Offline builds fall back to the normalized source metadata.
  }
}
const locales = LOCALES.filter((locale) => sde.locales?.includes(locale));
if (!sdeMeta.release || !sdeMeta.buildNumber) {
  throw new Error('Missing SDE API release metadata; run npm run prepare:sde');
}

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
function poolCounts(pool) {
  const counts = new Map();
  for (const id of pool) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, count]) => `${id}:${count}`).join(',');
}
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
    bonusEntries: ship.bonusEntries || [],
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
      rigSize: number(attrs.rigSize) ?? 0,
      turret: number(attrs.turretHardpoints) ?? 0,
      launcher: number(attrs.launcherHardpoints) ?? 0,
      speed: number(attrs.maxVelocity) ?? 0,
      sig: number(attrs.signatureRadius) ?? 0,
      sensorStrength: {
        radar: number(attrs.sensorRadarStrength) ?? 0,
        ladar: number(attrs.sensorLadarStrength) ?? 0,
        magnetometric: number(attrs.sensorMagnetometricStrength) ?? 0,
        gravimetric: number(attrs.sensorGravimetricStrength) ?? 0,
      },
      droneBandwidth: number(attrs.droneBandwidth) ?? 0,
      droneCapacity: number(attrs.droneCapacity) ?? 0,
      mass,
      shield: number(attrs.shieldCapacity) ?? 0,
      shieldRecharge: Math.round((Number(attrs.shieldRechargeRate) || 0) / 10) / 100,
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

// Audit difficulty biases the daily target toward rare/specialised hulls.
// Price/meta/tech/group are static SDE proxies for "less commonly used"; no
// zKillboard snapshot is baked into the deployment.
function auditWeight(ship) {
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

const auditAnswerPool = catalog
  .flatMap((ship) => Array.from({ length: auditWeight(ship) }, () => ship.id))
  .sort((a, b) => a - b);

// Monthly hull usage of the data branch (npm run fetch:usage). A build never
// requests zKillboard for it and never fails without it.
let usageData = null;
try {
  usageData = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache', 'ship-usage.json'), 'utf8'));
} catch {
  // Missing or unreadable: reported below.
}
const pools = practicePools({ ships: catalog, usage: usageData });
if (pools.source === 'usage') {
  console.log(`Practice hull pools: ship usage generated ${pools.generatedAt}`);
} else {
  console.warn(`WARNING: ship usage not available (${pools.reason}); every hull gets weight 1 in the practice pools. Run npm run fetch:usage before the build.`);
}
const killShipPool = pools.eligible;
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
const auditKillPool = killPool
  .flatMap((entry) => Array.from(
    { length: auditWeight(shipByID.get(entry.ship_id)) },
    () => entry.killmail_id,
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

const normalShipPool = pools.normal;
const auditKillShipPool = pools.audit;

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

const WEAPON_UPGRADE_GROUP_FAMILIES = [
  [/^gyrostabilizer$/i, 'projectile'],
  [/^heat sink$/i, 'energy'],
  [/^magnetic field stabilizer$/i, 'hybrid'],
  [/^ballistic control system$/i, 'missile'],
  [/^drone damage modules$/i, 'drone'],
  [/^drone tracking modules$/i, 'drone'],
  [/^tracking enhancer$/i, 'turret'],
  [/^drone tracking enhancer$/i, 'drone'],
  [/^missile guidance enhancer$/i, 'missile'],
  [/^entropic radiation sink$/i, 'disintegrator'],
  [/^vorton projector upgrade$/i, 'vorton'],
];
const WEAPON_GROUP_FAMILIES = [
  [/projectile turret|autocannon|artillery/i, 'projectile'],
  [/energy turret|laser|beam|pulse/i, 'energy'],
  [/hybrid turret|blaster|railgun/i, 'hybrid'],
  [/missile launcher|rocket|torpedo|launcher/i, 'missile'],
  [/vorton projector/i, 'vorton'],
  [/disintegrator/i, 'disintegrator'],
];
function familyFromGroupName(name, patterns) {
  const text = String(name || '').trim();
  for (const [pattern, family] of patterns) if (pattern.test(text)) return family;
  return '';
}
const weaponUpgradeGroups = {};
const weaponGroups = {};
for (const [id, group] of Object.entries(groupNames)) {
  const name = localized(group?.names, 'en');
  const upgrade = familyFromGroupName(name, WEAPON_UPGRADE_GROUP_FAMILIES);
  if (upgrade) weaponUpgradeGroups[id] = upgrade;
  const weapon = familyFromGroupName(name, WEAPON_GROUP_FAMILIES);
  if (weapon) weaponGroups[id] = weapon;
}

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
      chargeGroups: module.chargeGroups || [],
      requiredSkills: module.requiredSkills || [],
      power: Number(module.power || 0),
      cpu: Number(module.cpu || 0),
      metaLevel: module.metaLevel ?? null,
      resistLayers: module.resistLayers || null,
      assaultDamageControl: module.assaultDamageControl === true,
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

function searchNameList(entry) {
  if (!entry?.names) return [];
  return [...new Set(locales
    .map((locale) => localized(entry.names, locale))
    .filter(Boolean))];
}

const searchAliases = {
  groups: Object.fromEntries([...usedGroupIDs].map((id) => [id, searchNameList(groupNames[id])])),
  races: Object.fromEntries([...new Set(catalog.map((ship) => ship.raceID))].filter(Boolean)
    .map((id) => [id, searchNameList(races[id])])),
  factions: Object.fromEntries([...new Set(catalog.map((ship) => ship.factionID))].filter(Boolean)
    .map((id) => [id, searchNameList(factions[id])])),
};

function moduleSizeKey(name) {
  const match = String(name || '').match(/\b(X-Large|Small|Medium|Large|Capital|\d+MN|\d+mm|Micro|Heavy|Light)\b/i);
  return match ? match[1].toLowerCase() : '';
}

const moduleFallbacks = {};
{
  const buckets = new Map();
  const tiers = ['deadspace', 'officer', 'faction', 't2', 'highMeta', 't1'];
  const tierOf = (meta) => {
    if (meta === 6) return 'deadspace';
    if (meta === 5) return 'officer';
    if (meta === 4) return 'faction';
    if (meta === 2) return 't2';
    if (meta === 3) return 'highMeta';
    if (meta === 1) return 't1';
    return null;
  };
  for (const module of moduleTypes) {
    const key = `${module.groupID}|${moduleSizeKey(module.names?.en || '')}`;
    if (!buckets.has(key)) buckets.set(key, Object.fromEntries(tiers.map((tier) => [tier, []])));
    const tier = tierOf(Number(module.metaGroupID || 0));
    if (tier) buckets.get(key)[tier].push(module.id);
  }
  for (const module of moduleTypes) {
    if (Number(module.metaGroupID || 0) !== 15) continue;
    const key = `${module.groupID}|${moduleSizeKey(module.names?.en || '')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const entry = {};
    for (const tier of tiers) {
      const candidates = bucket[tier].filter((representative) => representative !== module.id);
      if (candidates.length) entry[tier] = candidates;
    }
    if (Object.keys(entry).length) moduleFallbacks[module.id] = entry;
  }
}

const RULESET_VERSION = 'v60';
// How often each hull appears in the two practice pools.
const usageStamp = [normalShipPool, auditKillShipPool].map(poolCounts).join(';');
const configStamp = [
  BUILD_CONFIG.gameDayStartUtc,
  BUILD_CONFIG.kbSelectionStartDate,
  BUILD_CONFIG.kbRecencyHalfLifeDays,
  BUILD_CONFIG.kbMaxScanPages,
  JSON.stringify(BUILD_CONFIG.reveal),
].join('|');
const bonusStamp = crypto.createHash('sha1').update(catalog.map((ship) => (
  `${ship.id}:${(ship.bonusEntries || []).map((entry) => `${entry.bonusKey}:${(entry.links || []).join(',')}`).join(',')}`
)).join('|')).digest('hex').slice(0, 12);
const moduleFitStamp = moduleTypes.reduce((sum, module) => (
  sum + (Number(module.power) > 0 ? 1 : 0) + (Number(module.cpu) > 0 ? 1 : 0)
), 0);
const moduleFallbackDetails = Object.fromEntries(moduleTypes
  .filter((module) => module.simulationAttributes && Object.keys(module.simulationAttributes).length)
  .map((module) => [module.id, module.simulationAttributes]));
const rigSizeStamp = catalog.filter((ship) => Number(ship.attrs.rigSize) > 0).length;
const versionSeed = `${RULESET_VERSION}|${configStamp}|${sde.generatedAt || ''}|${catalog.map((ship) => `${ship.id}:${ship.attrs.warp}:${ship.attrs.align}`).join(',')}|${moduleTypes.length}|${moduleFitStamp}|${Object.keys(moduleFallbackDetails).length}|${rigSizeStamp}|${auditAnswerPool.length}|${Object.keys(moduleFallbacks).length}|${killPool.map((entry) => entry.killmail_id).join(',')}|${usageStamp}|${normalShipPool.length}|${auditKillShipPool.length}|${bonusStamp}`;
const dataVersion = crypto.createHash('sha1').update(versionSeed).digest('hex').slice(0, 12);

const publicOrigin = String(ENV.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
const apiOrigin = String(ENV.API_ORIGIN || publicOrigin).replace(/\/+$/, '');
const manifestApiBase = publicOrigin && apiOrigin !== publicOrigin ? apiOrigin : '';
const zkillVersion = await getZkillVersion();

const manifest = {
  format: 'fitdle-runtime-v2',
  version: PACKAGE_VERSION,
  dataVersion,
  clueVersion: '5',
  gameDayStartUtc: BUILD_CONFIG.gameDayStartUtc,
  gameDayStartMinutes: BUILD_CONFIG.gameDayStartMinutes,
  kbSelectionStartDate: BUILD_CONFIG.kbSelectionStartDate,
  kbRecencyHalfLifeDays: BUILD_CONFIG.kbRecencyHalfLifeDays,
  kbMaxScanPages: BUILD_CONFIG.kbMaxScanPages,
  apiBase: manifestApiBase,
  reveal: BUILD_CONFIG.reveal,
  generatedAt: new Date().toISOString(),
  sdeGeneratedAt: sde.generatedAt || null,
  sde: {
    source: sdeMeta.source || 'sde-api',
    release: sdeMeta.release || null,
    buildNumber: sdeMeta.buildNumber || null,
    releaseDate: sdeMeta.releaseDate || null,
    apiBase: String(sdeMeta.apiBase || sdeBase(ENV.EVE_SDE_BASE)).replace(/\/+$/, ''),
    url: sdeMeta.latestUrl || `${sdeBase(ENV.EVE_SDE_BASE)}/latest/`,
    latestEtag: sdeMeta.latestEtag || '',
    tableVersions: sdeMeta.tableVersions || {},
    downloadedAt: sdeMeta.downloadedAt || null,
  },
  locales,
  defaultLocale: 'en',
  zkillboard: {
    baseUrl: ZKB_BASE,
    snapshot: (() => {
      const raw = killPoolSource.serverDate || killPoolSource.generatedAt || '';
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? (raw.slice(0, 10) || null) : parsed.toISOString().slice(0, 10);
    })(),
    version: zkillVersion.version || null,
    versionCapturedAt: zkillVersion.capturedAt || null,
    versionSource: zkillVersion.source,
    versionCached: zkillVersion.cached === true,
    source: killPoolSource.source || `${ZKB_BASE}/api/losses/`,
    capturedAt: killPoolSource.serverDate || killPoolSource.generatedAt || null,
  },
  images: {
    baseUrl: IMAGE_BASE,
    eveSsoLoginSmall: EVE_SSO_SMALL,
    eveSsoLoginLarge: EVE_SSO_LARGE,
  },
  esi: { baseUrl: 'https://esi.evetech.net' },
  links: {
    eveDocs: 'https://developers.eveonline.com/static-data/',
    eveOnline: 'https://www.eveonline.com/',
    fenris: 'https://fenris.com/',
    glossary: 'https://ddd4512kk-source.github.io/EVE-Online-Tranquility-Chinese-Personas/glossary/',
    repo: 'https://github.com/steven-cmy/fitdle',
  },
  timeSource: TIME_SOURCE,
  answerPool: catalog.map((ship) => ship.id).sort((a, b) => a - b),
  auditAnswerPool,
  killPool,
  auditKillPool,
  killShipPool,
  normalShipPool,
  auditKillShipPool,
  killPoolsByShip,
  shipUsage: {
    source: pools.source,
    generatedAt: pools.generatedAt,
    eligible: killShipPool.length,
    excludedNoKb: catalog.length - killShipPool.length,
  },
  killPoolGeneratedAt: killPoolSource.generatedAt || null,
  moduleFallbacks,
  weaponUpgradeGroups,
  weaponGroups,
  downtimeUtcHour: Math.floor(BUILD_CONFIG.gameDayStartMinutes / 60),
  counts: {
    catalog: catalog.length,
    answers: catalog.length,
    auditPool: auditAnswerPool.length,
    killPool: killPool.length,
    auditKillPool: auditKillPool.length,
    killShipPool: killShipPool.length,
    auditKillShipPool: auditKillShipPool.length,
    modules: moduleTypes.length,
    groups: usedGroupIDs.size,
  },
};

await fsp.rm(OUT, { recursive: true, force: true });
await fsp.mkdir(path.join(OUT, 'refs'), { recursive: true });
await fsp.writeFile(path.join(OUT, 'module-fallback.json'), JSON.stringify(moduleFallbackDetails));
await fsp.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await fsp.writeFile(path.join(OUT, 'catalog.json'), JSON.stringify({ ships: catalog }));
await fsp.writeFile(path.join(OUT, 'search.json'), JSON.stringify(searchAliases));
for (const locale of locales) {
  await fsp.writeFile(path.join(OUT, 'refs', `${locale}.json`), JSON.stringify(makeRefs(locale)));
}

console.log(`Wrote catalog ${dataVersion}: ${catalog.length} ships, ${moduleTypes.length} modules, ${killPool.length} killmail targets, ${locales.length} locales.`);
if (!killPool.length) console.warn('No killmail target pool; run npm run build:killpool before building for web deployment.');
console.log(`Capsule/shuttle/corvette groups: ${catalog.filter((ship) => [29, 31, 237].includes(ship.groupID)).length} ships.`);
