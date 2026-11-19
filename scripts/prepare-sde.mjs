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
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const USER_AGENT = `FITDLE/${pkg.version} (+https://gitlab.com/cmy/fitdle)`;
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
const SIMULATION_ATTRIBUTE_IDS = new Set([4, 20, 554, 796, 983, 1076]);
const NORMALIZED_VERSION = 2;
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

async function latestSdeRelease() {
  try {
    const response = await fetch('https://developers.eveonline.com/static-data/tranquility/latest.jsonl', {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) return null;
    const line = (await response.text()).split('\n').find(Boolean);
    const data = JSON.parse(line);
    return {
      buildNumber: data?.buildNumber || null,
      releaseDate: data?.releaseDate || null,
    };
  } catch {
    return null;
  }
}

async function downloadArchive() {
  console.log(`Downloading EVE SDE: ${SDE_URL}`);
  const response = await fetch(SDE_URL, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok || !response.body) throw new Error(`SDE download failed: ${response.status}`);
  const official = await latestSdeRelease();
  archiveMeta = {
    url: SDE_URL,
    etag: response.headers.get('etag') || '',
    lastModified: response.headers.get('last-modified') || '',
    buildNumber: official?.buildNumber || null,
    releaseDate: official?.releaseDate || null,
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
  if (!archiveMeta) {
    let meta = fs.existsSync(META)
      ? JSON.parse(await fsp.readFile(META, 'utf8'))
      : { url: SDE_URL, etag: '', lastModified: '', source: 'cached' };
    if (!meta.buildNumber) {
      const official = await latestSdeRelease();
      if (official) Object.assign(meta, official);
      await fsp.writeFile(META, `${JSON.stringify(meta, null, 2)}\n`);
    }
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

function normalizeBonusKey(text) {
  return String(text || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function bonusLinks(text) {
  return [...new Set([...String(text || '').matchAll(/showinfo:(\d+)/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite))];
}

function bonusAmount(bonus, unit, locale) {
  if (!Number.isFinite(bonus)) return '';
  const sign = bonus > 0 ? '+' : '';
  if (unit === '%') return `${sign}${bonus}%`;
  return unit ? `${sign}${bonus} ${unit}` : `${sign}${bonus}`;
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
  const moduleChargeGroups = new Map();
  const moduleMetaLevels = new Map();
  const moduleResistLayers = new Map();
  const moduleRequiredSkills = new Map();
  const modulePower = new Map();
  const moduleCpu = new Map();
  const moduleSimulationAttrs = new Map();
  const assaultDamageControls = new Set();
  await stream('typeDogma.jsonl', (o) => {
    const t = types.get(o._key);
    if (!t) return;
    const attrs = {};
    const canFitShipTypes = [];
    const canFitShipGroups = [];
    const chargeGroups = [];
    const requiredSkills = [];
    const resistLayers = { shield: false, armor: false, structure: false };
    const simulationAttrs = {};
    const groupName = String(groups.get(t.groupID)?.names?.en || '');
    const shieldGroup = /shield/i.test(groupName);
    const armorGroup = /armor/i.test(groupName);
    let metaLevel = null;
    let power = null;
    let cpu = null;
    for (const a of o.dogmaAttributes || []) {
      const id = a.attributeID;
      if (t.categoryID === SHIP_CATEGORY) attrs[id] = a.value;
      if (t.categoryID === 7 && id === 30) power = Number(a.value);
      if (t.categoryID === 7 && id === 50) cpu = Number(a.value);
      if (t.categoryID === 7 && id >= 182 && id <= 187 && a.value) {
        requiredSkills.push(Number(a.value));
      }
      if (t.categoryID === 7 && SIMULATION_ATTRIBUTE_IDS.has(id)) {
        simulationAttrs[id] = Number(a.value);
      }
      if (/^canFitShipType\d+$/.test(attributes.get(id)?.name || '') || id === 1380) {
        if (a.value) canFitShipTypes.push(Number(a.value));
      }
      if (/^canFitShipGroup\d+$/.test(attributes.get(id)?.name || '') || [666, 667, 668].includes(id)) {
        if (a.value) canFitShipGroups.push(Number(a.value));
      }
      // Modules with charge groups are actual weapons/launchers, not utility
      // high-slot modules such as Bastion or Command Bursts.
      if (/^chargeGroup\d+$/i.test(attributes.get(id)?.name || '') && a.value) {
        chargeGroups.push(Number(a.value));
      }
      if (id === 633 && a.value != null) metaLevel = Number(a.value);
      if (t.categoryID === 7) {
        const value = Number(a.value);
        if ([271, 272, 273, 274].includes(id) && value < 1) resistLayers.shield = true;
        if ([267, 268, 269, 270].includes(id) && value < 1) resistLayers.armor = true;
        if ([974, 975, 976, 977, 109, 110, 111, 113].includes(id) && value < 1) {
          resistLayers.structure = true;
        }
        // 984-987 are the generic "damage resistance bonus" used by both
        // shield and armor hardeners; the module group decides the layer.
        if ([984, 985, 986, 987].includes(id) && value !== 0) {
          if (shieldGroup) resistLayers.shield = true;
          else if (armorGroup) resistLayers.armor = true;
          else {
            resistLayers.shield = true;
            resistLayers.armor = true;
          }
        }
      }
    }
    if (t.categoryID === SHIP_CATEGORY) shipAttrs.set(o._key, attrs);
    if (canFitShipTypes.length || canFitShipGroups.length) {
      fitRestrictions.set(o._key, { shipTypes: canFitShipTypes, shipGroups: canFitShipGroups });
    }
    if (chargeGroups.length) {
      moduleChargeGroups.set(o._key, [...new Set(chargeGroups)]);
    }
    if (requiredSkills.length) {
      moduleRequiredSkills.set(o._key, [...new Set(requiredSkills)]);
    }
    if (metaLevel != null) moduleMetaLevels.set(o._key, metaLevel);
    if (power != null) modulePower.set(o._key, power);
    if (cpu != null) moduleCpu.set(o._key, cpu);
    if (Object.keys(simulationAttrs).length) moduleSimulationAttrs.set(o._key, simulationAttrs);
    if (t.categoryID === 7 && Object.values(resistLayers).some(Boolean)) {
      moduleResistLayers.set(o._key, resistLayers);
    }
    if (t.categoryID === 7 && /assault damage control/i.test(t.names?.en || '')) {
      assaultDamageControls.add(o._key);
    }
  });

  console.log('Loading ship bonuses...');
  const bonusEntries = new Map();
  const bonuses = new Map();
  await stream('typeBonus.jsonl', (o) => {
    if (!types.has(o._key) || types.get(o._key).categoryID !== SHIP_CATEGORY) return;
    const entries = [];
    const addEntry = (b, section, skill) => {
      if (!b?.bonusText) return;
      const text = {};
      for (const locale of LOCALES) {
        const localized = localizeBonusText(b.bonusText[locale] || b.bonusText.en, types, locale);
        if (localized) text[locale] = localized;
      }
      if (!text.en) return;
      const bonus = Number.isFinite(b.bonus) ? Number(b.bonus) : null;
      const unitID = Number.isFinite(b.unitID) ? Number(b.unitID) : null;
      const unitLabel = unitID != null
        ? (units.get(unitID)?.names?.['en'] || units.get(unitID)?.name || '')
        : '';
      const termKey = `${section}|${normalizeBonusKey(text.en)}`;
      entries.push({
        section,
        skillID: section === 'role' ? null : Number(skill?.id) || null,
        skill: section === 'role' ? null : (skill?.names || null),
        importance: Number(b.importance) || 0,
        bonus,
        unitID,
        unit: unitLabel,
        links: bonusLinks(b.bonusText.en),
        text,
        textKey: normalizeBonusKey(text.en),
        termKey,
        bonusKey: `${termKey}|${bonus ?? ''}|${unitID ?? ''}`,
      });
    };

    for (const b of o.roleBonuses || []) addEntry(b, 'role', null);
    for (const group of o.types || []) {
      const skill = types.get(group._key);
      for (const b of group._value || []) addEntry(b, 'types', skill);
    }
    bonusEntries.set(o._key, entries);

    const localized = {};
    for (const locale of LOCALES) {
      const lines = entries.map((entry) => {
        const text = entry.text[locale] || entry.text.en;
        const amount = bonusAmount(entry.bonus, entry.unit, locale);
        const prefix = entry.section === 'role'
          ? ''
          : `${entry.skill?.[locale] || entry.skill?.en || ''}: `;
        return `${prefix}${amount} ${text}`.replace(/\s+/g, ' ').trim();
      }).filter(Boolean);
      localized[locale] = [...new Set(lines)];
    }
    bonuses.set(o._key, localized);
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
      bonusEntries: bonusEntries.get(s.id) || [],
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
        sensorRadarStrength: number(208),
        sensorLadarStrength: number(209),
        sensorMagnetometricStrength: number(210),
        sensorGravimetricStrength: number(211),
        shieldRechargeRate: number(479),
        capacitorCapacity: number(482),
        signatureRadius: number(552),
        scanResolution: number(564),
        warpSpeedMultiplier: number(600),
        calibration: number(1132),
        rigSlots: number(1137),
        rigSize: number(1547),
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
      chargeGroups: moduleChargeGroups.get(t.id) || [],
      requiredSkills: moduleRequiredSkills.get(t.id) || [],
      metaLevel: moduleMetaLevels.get(t.id) ?? null,
      power: modulePower.get(t.id) ?? 0,
      cpu: moduleCpu.get(t.id) ?? 0,
      simulationAttributes: moduleSimulationAttrs.get(t.id) || null,
      resistLayers: moduleResistLayers.get(t.id) || null,
      assaultDamageControl: assaultDamageControls.has(t.id),
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
    normalizedVersion: NORMALIZED_VERSION,
    sourceEtag: sourceMeta.etag || null,
    locales: LOCALES,
    ships: shipPayload,
    moduleTypes,
    groups: Object.fromEntries([...usedGroupIDs].map((id) => [id, groups.get(id)]).filter(([, v]) => v)),
    races: Object.fromEntries([...usedRaceIDs].map((id) => [id, races.get(id)]).filter(([, v]) => v)),
    factions: Object.fromEntries([...usedFactionIDs].map((id) => [id, factions.get(id)]).filter(([, v]) => v)),
    metaGroups: Object.fromEntries([...usedMetaGroupIDs].map((id) => [id, metaGroups.get(id)]).filter(([, v]) => v)),
    attributes: Object.fromEntries(
      [4, 9, 11, 12, 13, 14, 37, 38, 48, 55, 70, 76, 101, 102, 208, 209, 210, 211, 263, 265, 283, 422, 479, 482, 552, 564, 600, 1132, 1137, 1271, 1281]
        .map((id) => [id, attributes.get(id)])
        .filter(([, v]) => v)
    ),
    units: Object.fromEntries([...units.entries()].filter(([id]) => [1, 2, 9, 11, 101, 102, 104, 105, 106, 107, 113, 114, 120, 128, 140, 141, 144].includes(id))),
  };

  await fsp.mkdir(path.dirname(OUT), { recursive: true });
  await fsp.writeFile(OUT, JSON.stringify(payload));
  console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MiB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
