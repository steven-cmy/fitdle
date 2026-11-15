#!/usr/bin/env node
/**
 * Normalize the CCP Static Data Export into a compact cache used by the Fitdle
 * data builder. This is build tooling only; the shipped game is static.
 *
 * Usage: node scripts/prepare-sde.mjs
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const SOURCE = path.join(CACHE, 'sde-source');
const OUT = path.join(CACHE, 'normalized.json');
const ARCHIVE = path.join(CACHE, 'sde-jsonl.zip');
const META = path.join(CACHE, 'sde-meta.json');
const SDE_URL = process.env.EVE_SDE_URL || 'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip';
let archiveMeta = null;
const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh'];
const SHIP_CATEGORY = 6;
const MODULE_CATEGORIES = new Set([7, 18, 22, 32, 87]);
const REQUIRED = [
  'groups.jsonl',
  'categories.jsonl',
  'metaGroups.jsonl',
  'races.jsonl',
  'factions.jsonl',
  'dogmaUnits.jsonl',
  'dogmaAttributes.jsonl',
  'types.jsonl',
  'typeDogma.jsonl',
  'typeBonus.jsonl',
];
const REFRESH = process.argv.includes('--refresh');
const KEEP_ARCHIVE = process.argv.includes('--keep-archive');
let SDE = CACHE;

function hasFiles(directory) {
  return REQUIRED.every((file) => fs.existsSync(path.join(directory, file)));
}

function extractArchive() {
  fs.mkdirSync(SOURCE, { recursive: true });
  const tar = spawnSync('tar', ['-xf', ARCHIVE, '-C', SOURCE, ...REQUIRED], { stdio: 'inherit' });
  if (tar.status === 0) return;
  const unzip = spawnSync('unzip', ['-o', ARCHIVE, ...REQUIRED, '-d', SOURCE], { stdio: 'inherit' });
  if (unzip.status === 0) return;
  throw new Error('Could not extract SDE zip. Install bsdtar or unzip, or extract it manually into .cache/sde-source.');
}

async function downloadArchive() {
  console.log(`Downloading EVE SDE: ${SDE_URL}`);
  const response = await fetch(SDE_URL, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`SDE download failed: ${response.status}`);
  archiveMeta = {
    url: SDE_URL,
    etag: response.headers.get('etag') || '',
    lastModified: response.headers.get('last-modified') || '',
    size: Number(response.headers.get('content-length') || 0),
    downloadedAt: new Date().toISOString(),
  };
  const temp = `${ARCHIVE}.tmp`;
  const stream = fs.createWriteStream(temp);
  await new Promise((resolve, reject) => {
    const reader = response.body.getReader();
    const pump = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!stream.write(Buffer.from(value))) await new Promise((r) => stream.once('drain', r));
        }
        stream.end(resolve);
      } catch (error) {
        stream.destroy();
        reject(error);
      }
    };
    pump();
  });
  await fsp.rename(temp, ARCHIVE);
  await fsp.writeFile(META, `${JSON.stringify(archiveMeta, null, 2)}\n`);
  console.log(`Downloaded ${(fs.statSync(ARCHIVE).size / 1024 / 1024).toFixed(1)} MiB`);
}

async function ensureSde() {
  if (!REFRESH && hasFiles(SOURCE)) {
    console.log('Using cached .cache/sde-source');
    return SOURCE;
  }
  if (!REFRESH && hasFiles(CACHE)) {
    console.log('Using existing SDE JSONL files in .cache');
    return CACHE;
  }
  await fsp.mkdir(CACHE, { recursive: true });
  if (REFRESH || !fs.existsSync(ARCHIVE)) await downloadArchive();
  console.log('Extracting required SDE files...');
  await fsp.rm(SOURCE, { recursive: true, force: true });
  extractArchive();
  if (!hasFiles(SOURCE)) throw new Error('SDE extraction incomplete');
  if (!KEEP_ARCHIVE) await fsp.rm(ARCHIVE, { force: true });
  if (!archiveMeta && !fs.existsSync(META)) {
    await fsp.writeFile(META, `${JSON.stringify({ url: SDE_URL, etag: '', lastModified: '', source: 'cached' }, null, 2)}\n`);
  }
  return SOURCE;
}

function stream(file, onLine) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(path.join(SDE, file), 'utf8'),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      if (!line) return;
      try {
        onLine(JSON.parse(line));
      } catch (err) {
        reject(new Error(`Failed parsing ${file}: ${err.message}`));
      }
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
}

function decodeEntities(input) {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function localizeBonusText(text, types, locale) {
  if (!text) return '';
  const withNames = text.replace(
    /<a\s+href=["']?showinfo:(\d+)["']?[^>]*>(.*?)<\/a>/gi,
    (_, id, fallback) => {
      const t = types.get(Number(id));
      return t?.names?.[locale] || fallback || `#${id}`;
    }
  );
  return decodeEntities(withNames.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  SDE = await ensureSde();

  console.log('Loading groups / categories / attributes...');
  const groups = new Map();
  const categories = new Map();
  const metaGroups = new Map();
  const races = new Map();
  const factions = new Map();
  const attributes = new Map();
  const units = new Map();

  await stream('groups.jsonl', (o) => groups.set(o._key, {
    id: o._key,
    categoryID: o.categoryID,
    names: o.name || {},
    published: o.published,
  }));
  await stream('categories.jsonl', (o) => categories.set(o._key, {
    id: o._key,
    names: o.name || {},
  }));
  await stream('metaGroups.jsonl', (o) => metaGroups.set(o._key, {
    id: o._key,
    names: o.name || {},
  }));
  await stream('races.jsonl', (o) => races.set(o._key, {
    id: o._key,
    names: o.name || o.raceName || {},
  }));
  await stream('factions.jsonl', (o) => factions.set(o._key, {
    id: o._key,
    names: o.name || o.factionName || {},
  }));
  await stream('dogmaUnits.jsonl', (o) => units.set(o._key, {
    id: o._key,
    names: o.displayName || {},
  }));
  await stream('dogmaAttributes.jsonl', (o) => attributes.set(o._key, {
    id: o._key,
    name: o.name,
    displayNames: o.displayName || {},
    unitID: o.unitID ?? null,
    defaultValue: o.defaultValue ?? 0,
  }));

  console.log('Loading all types...');
  const types = new Map();
  const ships = [];
  await stream('types.jsonl', (o) => {
    if (!o.name?.en) return;
    const group = groups.get(o.groupID);
    const categoryID = group?.categoryID ?? null;
    const entry = {
      id: o._key,
      names: o.name,
      groupID: o.groupID,
      categoryID,
      metaGroupID: o.metaGroupID ?? null,
      published: !!o.published,
      techLevel: o.techLevel ?? null,
      basePrice: o.basePrice ?? 0,
      iconID: o.iconID ?? o.graphicID ?? null,
      radius: o.radius ?? null,
      mass: o.mass ?? null,
      volume: o.volume ?? null,
      packagedVolume: o.packagedVolume ?? null,
      capacity: o.capacity ?? null,
      raceID: o.raceID ?? null,
      factionID: o.factionID ?? null,
      description: categoryID === SHIP_CATEGORY ? (o.description || null) : null,
      marketGroupID: o.marketGroupID ?? null,
    };
    types.set(o._key, entry);
    if (categoryID === SHIP_CATEGORY && o.published && o.techLevel != null) ships.push(entry);
  });

  console.log(`Types: ${types.size}; published ships: ${ships.length}`);

  console.log('Loading ship dogma attributes and module fit restrictions...');
  const shipAttrs = new Map();
  const fitRestrictions = new Map();
  await stream('typeDogma.jsonl', (o) => {
    const t = types.get(o._key);
    if (!t) return;
    const attrs = {};
    const canFitShipTypes = [];
    const canFitShipGroups = [];
    for (const a of o.dogmaAttributes || []) {
      const id = a.attributeID;
      if (t.categoryID === SHIP_CATEGORY) attrs[id] = a.value;
      if (/^canFitShipType\d+$/.test(attributes.get(id)?.name || '') || id === 1380) {
        if (a.value) canFitShipTypes.push(Number(a.value));
      }
      if (/^canFitShipGroup\d+$/.test(attributes.get(id)?.name || '') || [666, 667, 668].includes(id)) {
        if (a.value) canFitShipGroups.push(Number(a.value));
      }
    }
    if (t.categoryID === SHIP_CATEGORY) shipAttrs.set(o._key, attrs);
    if (canFitShipTypes.length || canFitShipGroups.length) {
      fitRestrictions.set(o._key, { shipTypes: canFitShipTypes, shipGroups: canFitShipGroups });
    }
  });

  console.log('Loading ship bonuses...');
  const bonuses = new Map();
  await stream('typeBonus.jsonl', (o) => {
    if (!types.has(o._key) || types.get(o._key).categoryID !== SHIP_CATEGORY) return;
    const out = {};
    for (const locale of LOCALES) {
      const lines = [];
      const renderBonus = (b, skillName, isRole) => {
        if (!b?.bonusText) return;
        const raw = b.bonusText[locale] || b.bonusText.en;
        const text = localizeBonusText(raw, types, locale);
        if (!text) return;
        const unit = units.get(b.unitID)?.names?.[locale] || units.get(b.unitID)?.names?.en || '';
        const value = b.bonus;
        let amount = '';
        if (Number.isFinite(value)) {
          if (unit === '%') amount = `${value > 0 ? '+' : ''}${value}%`;
          else if (unit) amount = `${value > 0 ? '+' : ''}${value} ${unit}`;
          else amount = `${value > 0 ? '+' : ''}${value}`;
        }
        const prefix = isRole ? '' : (skillName ? `${skillName}: ` : '');
        lines.push(`${prefix}${amount} ${text}`.replace(/\s+/g, ' ').trim());
      };
      for (const b of o.roleBonuses || []) {
        const raw = b.bonusText?.[locale] || b.bonusText?.en;
        const text = localizeBonusText(raw, types, locale);
        if (!text) continue;
        const unit = units.get(b.unitID)?.names?.[locale] || units.get(b.unitID)?.names?.en || '';
        const value = b.bonus;
        let amount = Number.isFinite(value)
          ? (unit === '%' ? `${value > 0 ? '+' : ''}${value}%` : `${value > 0 ? '+' : ''}${value}${unit ? ' ' + unit : ''}`)
          : '';
        lines.push(`${amount} ${text}`.replace(/\s+/g, ' ').trim());
      }
      for (const group of o.types || []) {
        const skill = types.get(group._key);
        for (const b of group._value || []) {
          renderBonus(b, skill?.names?.[locale] || skill?.names?.en, false);
        }
      }
      out[locale] = [...new Set(lines)].slice(0, 4);
    }
    bonuses.set(o._key, out);
  });

  const shipPayload = ships.map((s) => {
    const attrs = shipAttrs.get(s.id) || {};
    const restrictions = fitRestrictions.get(s.id) || null;
    const number = (id) => (attrs[id] == null ? null : Number(attrs[id]));
    return {
      id: s.id,
      names: s.names,
      groupID: s.groupID,
      metaGroupID: s.metaGroupID,
      techLevel: s.techLevel,
      raceID: s.raceID,
      factionID: s.factionID,
      basePrice: s.basePrice,
      iconID: s.iconID,
      radius: s.radius,
      mass: s.mass ?? number(4),
      volume: s.volume ?? number(161),
      packagedVolume: s.packagedVolume,
      capacity: s.capacity ?? number(38),
      description: s.description,
      bonuses: bonuses.get(s.id) || {},
      attrs: {
        structureHP: number(9),
        powerOutput: number(11),
        lowSlots: number(12),
        medSlots: number(13),
        hiSlots: number(14),
        maxVelocity: number(37),
        cpuOutput: number(48),
        capacitorRecharge: number(55),
        agility: number(70),
        maxTargetRange: number(76),
        launcherHardpoints: number(101),
        turretHardpoints: number(102),
        shieldCapacity: number(263),
        armorHP: number(265),
        droneCapacity: number(283),
        techLevelAttr: number(422),
        capacitorCapacity: number(482),
        signatureRadius: number(552),
        scanResolution: number(564),
        warpSpeedMultiplier: number(600),
        calibration: number(1132),
        rigSlots: number(1137),
        droneBandwidth: number(1271),
        baseWarpSpeed: number(1281),
        cargoCapacity: s.capacity ?? number(38),
        massAttr: s.mass ?? number(4),
        maxLockedTargets: number(192),
        shieldEmResonance: number(271),
        shieldExplosiveResonance: number(272),
        shieldKineticResonance: number(273),
        shieldThermalResonance: number(274),
        armorEmResonance: number(267),
        armorExplosiveResonance: number(268),
        armorKineticResonance: number(269),
        armorThermalResonance: number(270),
        structureEmResonance: number(109),
        structureExplosiveResonance: number(110),
        structureKineticResonance: number(111),
        structureThermalResonance: number(113),
      },
      fitRestrictions: restrictions,
    };
  });

  const moduleTypes = [];
  for (const t of types.values()) {
    if (!t.published) continue;
    if (!MODULE_CATEGORIES.has(t.categoryID) && t.categoryID !== 8) continue;
    moduleTypes.push({
      id: t.id,
      names: t.names,
      groupID: t.groupID,
      categoryID: t.categoryID,
      metaGroupID: t.metaGroupID,
      basePrice: t.basePrice,
      iconID: t.iconID,
      fitRestrictions: fitRestrictions.get(t.id) || null,
    });
  }

  const usedGroupIDs = new Set([
    ...shipPayload.map((s) => s.groupID),
    ...moduleTypes.map((t) => t.groupID),
  ]);
  const usedRaceIDs = new Set(shipPayload.map((s) => s.raceID).filter(Boolean));
  const usedFactionIDs = new Set(shipPayload.map((s) => s.factionID).filter(Boolean));
  const usedMetaGroupIDs = new Set(shipPayload.map((s) => s.metaGroupID).filter(Boolean));

  const sourceMeta = archiveMeta || (fs.existsSync(META) ? JSON.parse(await fsp.readFile(META, 'utf8')) : {});
  const sourceStamp = sourceMeta.etag || sourceMeta.lastModified || null;
  const payload = {
    // Stable source stamp, not the moment this script happened to run.
    generatedAt: sourceStamp || new Date().toISOString(),
    sourceEtag: sourceMeta.etag || null,
    locales: LOCALES,
    ships: shipPayload,
    moduleTypes,
    groups: Object.fromEntries([...usedGroupIDs].map((id) => [id, groups.get(id)]).filter(([, v]) => v)),
    races: Object.fromEntries([...usedRaceIDs].map((id) => [id, races.get(id)]).filter(([, v]) => v)),
    factions: Object.fromEntries([...usedFactionIDs].map((id) => [id, factions.get(id)]).filter(([, v]) => v)),
    metaGroups: Object.fromEntries([...usedMetaGroupIDs].map((id) => [id, metaGroups.get(id)]).filter(([, v]) => v)),
    attributes: Object.fromEntries(
      [4, 9, 11, 12, 13, 14, 37, 38, 48, 55, 70, 76, 101, 102, 263, 265, 283, 422, 482, 552, 564, 600, 1132, 1137, 1271, 1281]
        .map((id) => [id, attributes.get(id)])
        .filter(([, v]) => v)
    ),
    units: Object.fromEntries([...units.entries()].filter(([id]) => [1, 2, 9, 11, 101, 102, 104, 105, 106, 107, 113, 114, 128, 140, 141, 144].includes(id))),
  };

  await fsp.mkdir(path.dirname(OUT), { recursive: true });
  await fsp.writeFile(OUT, JSON.stringify(payload));
  console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MiB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
