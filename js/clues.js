/**
 * Runtime clue factory.
 *
 * CCP SDE data is static and comes from the generated catalog.  Killmail
 * fittings and kill value come from the target kill; live zKill aggregate stats
 * are not required for Daily mode. This module merges both into the dossier and
 * is pure so the rules can be tested without a browser.
 */
import { cyrb53 } from './game.js';

export const CLUE_VERSION = 5;

const FITTED_FLAGS = (() => {
  const map = new Map();
  for (let i = 0; i < 8; i++) map.set(11 + i, 'low');
  for (let i = 0; i < 8; i++) map.set(19 + i, 'mid');
  for (let i = 0; i < 8; i++) map.set(27 + i, 'high');
  for (let i = 0; i < 8; i++) map.set(92 + i, 'rig');
  for (let i = 0; i < 8; i++) map.set(125 + i, 'subsystem');
  map.set(87, 'drone');
  map.set(5, 'cargo');
  map.set(133, 'fuelBay');
  map.set(155, 'fighterBay');
  for (const flag of [158, 159, 160, 161]) map.set(flag, 'fighter');
  return map;
})();

export const EQUIPMENT_SLOT_ORDER = {
  high: 0,
  mid: 1,
  low: 2,
  rig: 3,
  subsystem: 4,
  fighter: 5,
  fighterBay: 6,
  drone: 7,
  fuelBay: 8,
  cargo: 9,
};

// Modules whose groups are fitted on a very large fraction of hulls.  They
// are still useful clues, but should never dominate the dossier.
const COMMON_MODULE_GROUPS = new Set([46, 52, 57, 38, 60, 62, 65]);

// Low-slot weapon upgrades and the weapon family they improve.
// Hulls with built-in equipment. Their fitted modules are effectively
// hull-limited even when the module itself has no SDE fit restriction.
const BUILTIN_EQUIPMENT_GROUPS = new Set([237, 1022]); // Corvette, Zephyr

const WEAPON_UPGRADE_FAMILIES = new Map([
  [59, 'projectile'],   // Gyrostabilizer
  [205, 'energy'],      // Heat Sink
  [302, 'hybrid'],      // Magnetic Field Stabilizer
  [367, 'missile'],     // Ballistic Control System
  [645, 'drone'],       // Drone Damage Amplifier
  [1988, 'disintegrator'], // Entropic Radiation Sink
  [211, 'turret'],      // Tracking Enhancer
  [1292, 'drone'],      // Omnidirectional Tracking Enhancer
  [1395, 'missile'],    // Missile Guidance Enhancer
]);

function weaponFamilyOf(module) {
  const name = String(module?.name || '');
  if (/disintegrator/i.test(name)) return 'disintegrator';
  if (/missile|rocket|torpedo|launcher/i.test(name)) return 'missile';
  if (/autocannon|artillery/i.test(name)) return 'projectile';
  if (/blaster|railgun/i.test(name)) return 'hybrid';
  if (/laser|beam|pulse/i.test(name)) return 'energy';
  return null;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const VALUE_TOLERANCE = {
  speed: 0.05, sig: 0.05, align: 0.05, warp: 0.05, mass: 0.05,
  cargo: 0.05, shield: 0.05, armor: 0.05, structure: 0.05,
  capacitor: 0.05, targetRange: 0.05, scanRes: 0.05,
  pg: 0.05, cpu: 0.05, calibration: 0.05, resist: 0.05,
  sensor: 0.05, shieldRecharge: 0.01,
};
const VALUE_MIN_TOLERANCE = {
  speed: 5, sig: 5, align: 0.1, warp: 0.1, mass: 1000,
  cargo: 10, shield: 10, armor: 10, structure: 10,
  capacitor: 10, targetRange: 1000, scanRes: 10,
  pg: 1, cpu: 1, calibration: 1,
  sensor: 0.5, shieldRecharge: 0.1,
};
const FIT_ADDITIVE = ['mass', 'sig', 'shield', 'armor', 'structure', 'capacitor', 'cargo', 'targetRange', 'scanRes', 'pg', 'cpu', 'calibration'];
const FIT_RATIO = ['speed', 'align', 'warp', 'shieldRecharge'];
const AUDIT_FITTED_WEIGHT_FACTOR = 0.7;
export const STANDARD_DEFENSE_RANGE = 4;
const STANDARD_DEFENSE_AUX_RANGE = 2;

// Human-discriminable buckets. Tiny differences inside one bucket must not
// create a high-weight "unique" clue.
const HUMAN_BUCKETS = {
  mass: { relative: 0.12 },
  speed: { relative: 0.1 },
  sig: { relative: 0.1 },
  align: { absolute: 0.25 },
  warp: { absolute: 0.4 },
  shield: { relative: 0.4 },
  armor: { relative: 0.4 },
  structure: { relative: 0.4 },
  shieldRecharge: { relative: 0.15 },
  capacitor: { relative: 0.15 },
  cargoCapacity: { relative: 0.2 },
  targetRange: { relative: 0.15 },
  scanRes: { relative: 0.1 },
  pg: { relative: 0.1 },
  cpu: { relative: 0.1 },
  calibration: { relative: 0.1 },
};
const BRACKET_BONUS_KINDS = new Set([
  'cargoCapacity', 'rigSlots', 'maxLockedTargets', 'calibration', 'hiSlots',
  'targetRange', 'cpu', 'droneBandwidth', 'lowSlots', 'medSlots',
  'droneCapacity', 'turretHardpoints', 'launcherHardpoints',
]);
const RESIST_KEYS = ['em', 'thermal', 'kinetic', 'explosive'];
const SENSOR_KEYS = ['radar', 'ladar', 'magnetometric', 'gravimetric'];

function deriveFitDelta(base = {}, fitted = null) {
  const delta = { add: {}, ratio: {}, resist: {} };
  if (!fitted) return delta;
  for (const layer of ['shieldResists', 'armorResists', 'structureResists']) {
    if (!base[layer] || !fitted[layer]) continue;
    delta.resist[layer] = Object.fromEntries(
      ['em', 'thermal', 'kinetic', 'explosive'].map((key) => [
        key,
        (Number(fitted[layer][key]) || 0) - (Number(base[layer][key]) || 0),
      ])
    );
  }
  for (const key of FIT_ADDITIVE) {
    const before = Number(base[key]);
    const after = Number(fitted[key]);
    if (Number.isFinite(before) && Number.isFinite(after)) delta.add[key] = after - before;
  }
  for (const key of FIT_RATIO) {
    const before = Number(base[key]);
    const after = Number(fitted[key]);
    if (before && Number.isFinite(after)) delta.ratio[key] = after / before;
  }
  delta.sensorStrength = {};
  for (const key of ['radar', 'ladar', 'magnetometric', 'gravimetric']) {
    const before = Number(base.sensorStrength?.[key]);
    const after = Number(fitted.sensorStrength?.[key]);
    if (before > 0 && Number.isFinite(after)) delta.sensorStrength[key] = after / before;
  }
  return delta;
}

function adjustedAttr(kind, attrs, fitDelta) {
  let value = Number(attrs?.[kind] || 0);
  const add = Number(fitDelta?.add?.[kind]);
  if (Number.isFinite(add)) value += add;
  const ratio = Number(fitDelta?.ratio?.[kind]);
  if (Number.isFinite(ratio) && ratio > 0) value *= ratio;
  return value;
}

function sameClueValue(kind, a, b) {
  if ((a && typeof a === 'object') || (b && typeof b === 'object')) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return sameValue(kind, a, b);
}

function sameValue(kind, a, b, rangeScale = 1) {
  if (kind === 'slots' || kind === 'hardpoints' || kind === 'drones') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  const left = Number(a) || 0;
  const right = Number(b) || 0;
  const ratio = (VALUE_TOLERANCE[kind] ?? 0.03) * rangeScale;
  const minimum = (VALUE_MIN_TOLERANCE[kind] ?? 0) * rangeScale;
  const tolerance = Math.max(minimum, Math.max(Math.abs(left), Math.abs(right)) * ratio);
  return Math.abs(left - right) <= tolerance;
}

function adjustedSensorStrength(value, fitDelta) {
  if (!value) return null;
  return Object.fromEntries(SENSOR_KEYS.map((key) => {
    const ratio = Number(fitDelta?.sensorStrength?.[key]);
    const base = Number(value[key]) || 0;
    return [key, Number.isFinite(ratio) && ratio > 0 ? base * ratio : base];
  }));
}

function sameSensorStrength(left, right) {
  if (!left || !right) return false;
  return SENSOR_KEYS.every((key) => sameValue('sensor', left[key], right[key]));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resistsAreUniform(value) {
  if (!value) return true;
  const values = ['em', 'thermal', 'kinetic', 'explosive'].map((key) => Number(value[key]) || 0);
  return Math.max(...values) - Math.min(...values) <= 0.5;
}

function sameResists(left, right, delta = null, rangeScale = 1) {
  if (!left || !right) return false;
  return ['em', 'thermal', 'kinetic', 'explosive'].every((key) => (
    sameValue('resist', (Number(left[key]) || 0) + (Number(delta?.[key]) || 0), right[key], rangeScale)
  ));
}

const FIT_SIZE_FLOOR = { 1: 0, 2: 6.2, 3: 7.4, 4: 8.8 };

export function moduleFitSize(module, catalog) {
  const power = Number(module?.power || 0);
  const cpu = Number(module?.cpu || 0);
  if (!power && !cpu) return 0;
  const brackets = { 1: [], 2: [], 3: [], 4: [] };
  for (const ship of catalog) {
    const size = Math.min(4, Math.max(1, Number(ship?.attrs?.rigSize) || 1));
    brackets[size].push(ship);
  }
  for (const size of [1, 2, 3, 4]) {
    const ships = brackets[size];
    if (ships.length < 3) continue;
    const fit = ships.filter((ship) => (
      Number(ship.attrs?.pg) >= power && Number(ship.attrs?.cpu) >= cpu
    )).length;
    if (fit / ships.length >= 0.5) return size;
  }
  return 0;
}

function moduleSizeRank(name) {
  const text = String(name || '');
  if (/\b(capital|extra large|x-large|xl)\b/i.test(text)) return 7;
  if (/\blarge\b/i.test(text)) return 2.2;
  if (/\bmedium\b/i.test(text)) return 0.8;
  return 0;
}

const MICRO_JUMP_GROUPS = new Set([1189, 4769]);
const PLEX_TYPES = new Set([29668, 44992]);

const DAMAGE_CONTROL_GROUP = 60;
const HIGH_END_META_GROUP = 4;
const LOW_RESIST_WEIGHT = 3.2;
const RESIST_MODULE_FLOOR = 5.8;
const HIGH_END_RESIST_FLOOR = 8.2;
const RESIST_KIND_LAYER = {
  shieldResists: 'shield',
  armorResists: 'armor',
  structureResists: 'structure',
};

/**
 * Audit modules use the representative matching the highest meta module in
 * the same slot, or the closest available meta tier. Representatives are always
 * from the same module group (and therefore the same module variant).
 */
export function selectAuditFallbacks(equipment, refs, moduleFallbacks = {}) {
  const metaLevelOf = (module) => {
    if (module?.metaLevel == null) return null;
    const level = Number(module.metaLevel);
    return Number.isFinite(level) && level >= 0 ? level : null;
  };
  const groupOf = (module) => {
    const group = Number(module?.metaGroupID);
    return group >= 1 && group <= 6 ? group : null;
  };
  const slotMeta = new Map();
  const slotLevel = new Map();
  for (const item of equipment) {
    if (item.slot === 'cargo') continue;
    const module = refs.modules?.[item.module];
    const group = groupOf(module);
    const level = metaLevelOf(module);
    if (group && (!slotMeta.has(item.slot) || group > slotMeta.get(item.slot))) slotMeta.set(item.slot, group);
    if (level != null && (!slotLevel.has(item.slot) || level > slotLevel.get(item.slot))) slotLevel.set(item.slot, level);
  }
  const result = new Map();
  for (const item of equipment) {
    if (item.slot === 'cargo') continue;
    const entry = moduleFallbacks[item.module];
    if (!entry) continue;
    const targetGroup = slotMeta.get(item.slot) ?? 4;
    const targetLevel = slotLevel.get(item.slot) ?? 8;
    const sourceGroup = refs.modules?.[item.module]?.groupID;
    // One fixed hierarchy. Never use a higher meta group than the slot already
    // contains; walk downward from the slot's highest group.
    const tierRank = { officer: 6, deadspace: 5, faction: 4, t2: 3, highMeta: 2, t1: 1 };
    const groupRank = { 5: 6, 6: 5, 4: 4, 2: 3, 3: 2, 1: 1 };
    const targetRank = groupRank[targetGroup] ?? 4;
    const tierOrder = ['officer', 'deadspace', 'faction', 't2', 'highMeta', 't1']
      .filter((tier) => tierRank[tier] <= targetRank);
    let best = null;
    let bestDistance = Infinity;
    let bestLevel = -1;
    for (const tier of tierOrder) {
      const candidates = Array.isArray(entry[tier])
        ? entry[tier]
        : entry[tier]
          ? [entry[tier]]
          : [];
      for (const representative of candidates) {
        const level = metaLevelOf(refs.modules?.[representative]);
        if (level == null) continue;
        const distance = Math.abs(level - targetLevel);
        if (distance < bestDistance || (distance === bestDistance && level > bestLevel)) {
          best = representative;
          bestDistance = distance;
          bestLevel = level;
        }
      }
      if (best) break;
    }
    if (best && Number(refs.modules?.[best]?.groupID) === Number(sourceGroup)) result.set(item.module, best);
  }
  return result;
}

function isDamageControl(module) {
  if (Number(module?.groupID) !== DAMAGE_CONTROL_GROUP) return false;
  const layers = module?.resistLayers;
  // Capital emergency hull energizers and similar group-60 modules only move
  // structure resists; do not treat them as a plain/T1/T2 damage control.
  if (layers) return Boolean(layers.shield && layers.armor && layers.structure);
  return true;
}

function isAssaultDamageControl(module) {
  return module?.assaultDamageControl === true
    || /assault damage control/i.test(module?.name || '');
}

function isResistGear(module) {
  const layers = module?.resistLayers;
  return Boolean(layers && (layers.shield || layers.armor || layers.structure));
}

/**
 * Collect the fitted modules that can move a resist layer. Cargo, spare
 * fighter-bay modules and fuel do not affect the simulated fit.
 */
function resistanceInfluences(equipmentClues, refs) {
  const byLayer = { shield: [], armor: [], structure: [] };
  for (const clue of equipmentClues) {
    const slot = clue?.v?.slot;
    if (!slot || ['cargo', 'fighterBay', 'fuelBay'].includes(slot)) continue;
    const module = refs?.modules?.[clue.v.module];
    if (Number(module?.categoryID) !== 7) continue;
    const layers = module?.resistLayers
      || (isDamageControl(module) ? { shield: true, armor: true, structure: true } : null);
    if (!layers) continue;
    const entry = {
      clue,
      weight: Math.max(0, Number(clue.w) || 0),
      damageControl: isDamageControl(module),
      assault: isAssaultDamageControl(module),
      highEnd: Number(module?.metaGroupID || 0) >= HIGH_END_META_GROUP,
    };
    for (const layer of Object.keys(byLayer)) {
      if (layers[layer]) byLayer[layer].push(entry);
    }
  }
  return byLayer;
}

/**
 * Resist clues are only as strong as the fit that produced them.
 *
 * - No resist gear, or only a plain/T1/T2 damage control: calculated values
 *   are shared by many hulls, so keep the clue quiet.
 * - Faction+ damage control, any resistance module, ADC or a non-uniform
 *   structure profile (audit weather) is a deliberate fit signal: never let
 *   it weigh less than the module that caused it.
 */
function resistanceWeight(clue, baseWeight, influences) {
  const layer = RESIST_KIND_LAYER[clue.k];
  const entries = influences?.[layer] || [];
  const meaningful = entries.filter((entry) => entry.weight > 0);
  const maxEquipmentWeight = meaningful.reduce((max, entry) => Math.max(max, entry.weight), 0);
  const hasHighEnd = meaningful.some((entry) => entry.highEnd);
  const hasAssault = meaningful.some((entry) => entry.assault);
  const hasResistModule = meaningful.some((entry) => !entry.damageControl);
  const onlyLowDamageControl = meaningful.length > 0
    && !hasHighEnd
    && !hasAssault
    && !hasResistModule;
  let weight = Number(baseWeight) || 0;

  if (!meaningful.length || onlyLowDamageControl) {
    weight = Math.min(weight, LOW_RESIST_WEIGHT);
  }
  if (hasHighEnd || hasResistModule) {
    const moduleFloor = hasHighEnd ? HIGH_END_RESIST_FLOOR : RESIST_MODULE_FLOOR;
    weight = Math.max(weight, maxEquipmentWeight, moduleFloor);
  }
  if (hasAssault) {
    weight = Math.max(weight, maxEquipmentWeight, layer === 'structure' ? 9.5 : 8.8);
  }
  // Base structure resists are uniform, so a skew is audit weather rather
  // than a hull trait. Shield/armour are naturally asymmetric and keep their
  // equipment-derived weight.
  if (layer === 'structure' && !resistsAreUniform(clue.v)) {
    weight = Math.max(weight, 9.8);
  }
  return clamp(round(weight, 1), 1, 10);
}

function restrictionBreadth(module, catalog) {
  const restrictions = module?.fitRestrictions;
  if (!restrictions) return 0;
  const groups = new Set((restrictions.shipGroups || []).map(Number).filter(Boolean));
  const types = new Set((restrictions.shipTypes || []).map(Number).filter(Boolean));
  if (!groups.size && !types.size) return 0;
  let count = 0;
  for (const ship of catalog || []) {
    if (types.has(Number(ship.id)) || groups.has(Number(ship.groupID))) count += 1;
  }
  return count || groups.size + types.size;
}

function equipmentRestriction(module) {
  // Micro Jump Drives fit several ship classes: limited, not unique.
  if (MICRO_JUMP_GROUPS.has(module?.groupID) || /micro jump drive/i.test(module?.name || '')) return 'limited';
  const restrictions = module?.fitRestrictions;
  if (!restrictions) return null;
  const groups = [...new Set(restrictions.shipGroups || [])].filter(Boolean);
  const types = [...new Set(restrictions.shipTypes || [])].filter(Boolean);
  if (!groups.length && !types.length) return null;
  // One ship group is a class-limited module, even when that class contains
  // several hulls; the marker describes the restriction shape, not hull count.
  if (groups.length === 1) return 'unique';
  if (!groups.length && types.length === 1) return 'unique';
  return 'limited';
}

function restrictedEquipmentWeight(module, catalog, forceLimited = false) {
  const restriction = equipmentRestriction(module);
  if (restriction === 'unique') return 10;
  if (restriction !== 'limited' && !forceLimited) return 0;
  const breadth = restrictionBreadth(module, catalog);
  const scarcity = 1 - Math.log2(1 + breadth) / Math.log2(1 + Math.max(1, catalog.length));
  return clamp(8.2 + 1.6 * scarcity + moduleSizeRank(module?.name) * 0.2, 8.2, 9.8);
}

export function getEquipment(losses, refs = null) {
  return parseFittings(losses, refs);
}

function parseFittings(losses, refs = null) {
  const list = Array.isArray(losses) ? losses : [];
  const values = [];
  const moduleKills = new Map();
  let fittedKills = 0;
  for (const kill of list) {
    const total = Number(kill?.zkb?.totalValue || 0);
    if (total > 0) values.push(total);
    const seen = new Set();
    for (const item of kill?.victim?.items || []) {
      if (!FITTED_FLAGS.has(Number(item.flag))) continue;
      const moduleID = Number(item.item_type_id);
      if (Number.isFinite(moduleID)) seen.add(moduleID);
    }
    if (!seen.size) continue;
    fittedKills++;
    for (const moduleID of seen) moduleKills.set(moduleID, (moduleKills.get(moduleID) || 0) + 1);
  }

  // Equipment belongs to one killmail victim, not to an aggregate of every
  // historical loss. The sample kill is also the one linked from the debrief.
  const sample = list[0];
  const sampleModules = new Map();
  for (const item of sample?.victim?.items || []) {
    let slot = FITTED_FLAGS.get(Number(item.flag));
    if (!slot) continue;
    const moduleID = Number(item.item_type_id);
    if (!Number.isFinite(moduleID)) continue;
    // Only real fighters occupy the fighter bay/tubes. Spare modules, charges
    // and scripts at these flags are ordinary cargo, not fighter equipment.
    if ((slot === 'fighterBay' || slot === 'fighter')
      && Number(refs?.modules?.[moduleID]?.categoryID) !== 87) slot = 'cargo';
    // Keep the same type separate when it appears both fitted and in cargo.
    const key = `${moduleID}:${slot}`;
    if (!sampleModules.has(key)) sampleModules.set(key, { module: moduleID, slot, qty: 0 });
    const entry = sampleModules.get(key);
    entry.qty += Math.max(1, Number(item.quantity_destroyed || 0) + Number(item.quantity_dropped || 0) || 1);
  }

  const equipment = [];
  for (const info of sampleModules.values()) {
    equipment.push({
      module: info.module,
      slot: info.slot,
      count: Math.max(1, info.qty),
      rate: (moduleKills.get(info.module) || 0) / Math.max(1, fittedKills),
    });
  }
  equipment.sort((a, b) => b.rate - a.rate || b.count - a.count || a.module - b.module
    || (EQUIPMENT_SLOT_ORDER[a.slot] ?? 99) - (EQUIPMENT_SLOT_ORDER[b.slot] ?? 99));
  return { equipment, fittedKills, medianValue: median(values) };
}

function moduleAttribute(module, id) {
  const attribute = (module?.dogma_attributes || []).find((entry) => Number(entry.attribute_id) === id);
  return Number(attribute?.value || 0);
}

function simulateFitting(ship, equipment, moduleDetails) {
  const attrs = { ...(ship.attrs || {}) };
  if (!equipment.length || !moduleDetails) return attrs;
  let massAddition = 0;
  let speedBonus = 0;
  let sigBonus = 0;
  let sigAdd = 0;
  let shieldAdd = 0;
  let armorAdd = 0;
  let capacitorAdd = 0;
  let agility = 0;
  let structureMultiplier = 1;
  let warpMultiplier = 1;

  for (const item of equipment) {
    if (['cargo', 'fighterBay', 'fuelBay'].includes(item.slot)) continue;
    const module = moduleDetails[item.module];
    if (!module) continue;
    massAddition += moduleAttribute(module, 4) + moduleAttribute(module, 796);
    speedBonus += moduleAttribute(module, 20) + moduleAttribute(module, 1076);
    sigBonus += moduleAttribute(module, 554);
    sigAdd += moduleAttribute(module, 983);
    shieldAdd += moduleAttribute(module, 72);
    armorAdd += moduleAttribute(module, 1159);
    capacitorAdd += moduleAttribute(module, 67);
    agility += moduleAttribute(module, 169);
    const structure = moduleAttribute(module, 150);
    if (structure) structureMultiplier *= structure;
    const warp = moduleAttribute(module, 600);
    if (warp) warpMultiplier *= 1 + warp / 100;
  }

  const baseMass = Math.max(1, attrs.mass || 1);
  const effectiveMass = baseMass + Math.max(0, massAddition);
  const massRatio = baseMass / effectiveMass;
  attrs.mass = Math.round(effectiveMass);
  attrs.speed = Math.round((attrs.speed || 0) * (1 + speedBonus / 100) * massRatio);
  attrs.sig = Math.round(((attrs.sig || 0) + sigAdd) * (1 + sigBonus / 100));
  attrs.align = round((attrs.align || 0) * massRatio * (1 + agility / 100), 2);
  attrs.warp = round((attrs.warp || 0) * warpMultiplier, 2);
  attrs.shield = Math.round((attrs.shield || 0) + shieldAdd);
  attrs.armor = Math.round((attrs.armor || 0) + armorAdd);
  attrs.structure = Math.round((attrs.structure || 0) * structureMultiplier);
  attrs.capacitor = Math.round((attrs.capacitor || 0) + capacitorAdd);
  return attrs;
}

function staticClues(ship, attrs = ship.attrs || {}) {
  const clues = [];
  const add = (k, c, v, prior) => {
    if (v == null) return;
    if (typeof v === 'number' && !Number.isFinite(v)) return;
    clues.push({ k, c, v, prior });
  };

  if (ship.techLevel != null) add('tech', 'identity', Number(ship.techLevel), 0.35);
  if (ship.raceID != null) add('race', 'identity', Number(ship.raceID), 0.55);
  if (ship.factionID != null) add('faction', 'identity', Number(ship.factionID), 0.85);
  if (ship.groupID != null) add('group', 'hull', Number(ship.groupID), 0.95);

  add('hiSlots', 'slots', attrs.hi || 0, 1.1);
  add('medSlots', 'slots', attrs.med || 0, 1.1);
  add('lowSlots', 'slots', attrs.low || 0, 1.1);
  add('rigSlots', 'slots', attrs.rig || 0, 1.1);
  add('turretHardpoints', 'slots', attrs.turret || 0, 1.15);
  add('launcherHardpoints', 'slots', attrs.launcher || 0, 1.15);
  add('drones', 'slots', {
    bandwidth: attrs.droneBandwidth || 0,
    capacity: attrs.droneCapacity || 0,
  }, 1.5);

  if (attrs.speed) add('speed', 'nav', attrs.speed, 1.35);
  if (attrs.align) add('align', 'nav', attrs.align, 1.5);
  if (attrs.warp) add('warp', 'nav', attrs.warp, 1.45);
  if (attrs.mass) add('mass', 'nav', attrs.mass, 1.4);
  if (attrs.cargo != null) add('cargoCapacity', 'cargo', attrs.cargo, 1.4);
  if (attrs.capacitor) add('capacitor', 'fitting', attrs.capacitor, 1.4);

  if (attrs.sig) add('sig', 'targeting', attrs.sig, 1.35);
  if (attrs.sensorStrength) add('sensorStrength', 'targeting', attrs.sensorStrength, 2.2);
  if (attrs.targetRange) add('targetRange', 'targeting', attrs.targetRange, 2.0);
  if (attrs.scanRes) add('scanRes', 'targeting', attrs.scanRes, 2.0);
  if (attrs.maxLockedTargets) add('maxLockedTargets', 'targeting', attrs.maxLockedTargets, 1.8);

  if (attrs.shield) add('shield', 'defense', attrs.shield, 1.25);
  if (attrs.shieldRecharge) add('shieldRecharge', 'defense', attrs.shieldRecharge, 1.6);
  if (attrs.armor) add('armor', 'defense', attrs.armor, 1.25);
  if (attrs.structure) add('structure', 'defense', attrs.structure, 1.25);
  if (attrs.shieldResists) add('shieldResists', 'defense', attrs.shieldResists, 2.4);
  if (attrs.armorResists) add('armorResists', 'defense', attrs.armorResists, 2.4);
  if (attrs.structureResists) add('structureResists', 'defense', attrs.structureResists, 2.4);

  if (attrs.pg) add('pg', 'fitting', attrs.pg, 1.8);
  if (attrs.cpu) add('cpu', 'fitting', attrs.cpu, 1.8);
  if (attrs.calibration) add('calibration', 'fitting', attrs.calibration, 3.0);

  return clues;
}

function matchesCatalog(clue, other, fitDelta = null) {
  const attrs = other.attrs || {};
  switch (clue.k) {
    case 'tech': return Number(other.techLevel) === clue.v;
    case 'race': return Number(other.raceID) === clue.v;
    case 'faction': return Number(other.factionID) === clue.v;
    case 'group': return Number(other.groupID) === clue.v;
    case 'hiSlots': return Number(attrs.hi || 0) === Number(clue.v);
    case 'medSlots': return Number(attrs.med || 0) === Number(clue.v);
    case 'lowSlots': return Number(attrs.low || 0) === Number(clue.v);
    case 'rigSlots': return Number(attrs.rig || 0) === Number(clue.v);
    case 'turretHardpoints': return Number(attrs.turret || 0) === Number(clue.v);
    case 'launcherHardpoints': return Number(attrs.launcher || 0) === Number(clue.v);
    case 'drones':
      return sameValue('drones', {
        bandwidth: attrs.droneBandwidth || 0, capacity: attrs.droneCapacity || 0,
      }, clue.v);
    case 'speed': return sameValue('speed', adjustedAttr('speed', attrs, fitDelta), clue.v);
    case 'sig': return sameValue('sig', adjustedAttr('sig', attrs, fitDelta), clue.v);
    case 'sensorStrength': return sameSensorStrength(adjustedSensorStrength(attrs.sensorStrength, fitDelta), clue.v);
    case 'align': return sameValue('align', adjustedAttr('align', attrs, fitDelta), clue.v);
    case 'warp': return sameValue('warp', adjustedAttr('warp', attrs, fitDelta), clue.v);
    case 'mass': return sameValue('mass', adjustedAttr('mass', attrs, fitDelta), clue.v);
    case 'cargoCapacity': return sameValue('cargo', adjustedAttr('cargo', attrs, fitDelta), clue.v);
    case 'shield': return sameValue('shield', adjustedAttr('shield', attrs, fitDelta), clue.v, clue.range);
    case 'shieldRecharge': return sameValue('shieldRecharge', adjustedAttr('shieldRecharge', attrs, fitDelta), clue.v, clue.range);
    case 'armor': return sameValue('armor', adjustedAttr('armor', attrs, fitDelta), clue.v, clue.range);
    case 'structure': return sameValue('structure', adjustedAttr('structure', attrs, fitDelta), clue.v, clue.range);
    case 'capacitor': return sameValue('capacitor', adjustedAttr('capacitor', attrs, fitDelta), clue.v);
    case 'targetRange': return sameValue('targetRange', adjustedAttr('targetRange', attrs, fitDelta), clue.v);
    case 'scanRes': return sameValue('scanRes', adjustedAttr('scanRes', attrs, fitDelta), clue.v);
    case 'maxLockedTargets': return Number(attrs.maxLockedTargets || 0) === Number(clue.v);
    case 'shieldResists':
    case 'armorResists':
    case 'structureResists':
      return sameResists(attrs[clue.k], clue.v, fitDelta?.resist?.[clue.k], clue.range);
    case 'pg': return sameValue('pg', adjustedAttr('pg', attrs, fitDelta), clue.v);
    case 'cpu': return sameValue('cpu', adjustedAttr('cpu', attrs, fitDelta), clue.v);
    case 'calibration': return sameValue('calibration', adjustedAttr('calibration', attrs, fitDelta), clue.v);
    default: return false;
  }
}

export function clueMatchesShip(clue, ship, fitDelta = null) {
  return matchesCatalog(clue, ship, fitDelta);
}

function bucketValueForShip(kind, ship) {
  const attrs = ship?.attrs || {};
  switch (kind) {
    case 'drones':
      return {
        bandwidth: Number(attrs.droneBandwidth) || 0,
        capacity: Number(attrs.droneCapacity) || 0,
      };
    case 'sensorStrength':
      return attrs.sensorStrength || null;
    case 'shieldResists':
    case 'armorResists':
    case 'structureResists':
      return attrs[kind] || null;
    case 'tech': return ship?.techLevel;
    case 'race': return ship?.raceID;
    case 'faction': return ship?.factionID;
    case 'group': return ship?.groupID;
    case 'hiSlots': return attrs.hi;
    case 'medSlots': return attrs.med;
    case 'lowSlots': return attrs.low;
    case 'rigSlots': return attrs.rig;
    case 'turretHardpoints': return attrs.turret;
    case 'launcherHardpoints': return attrs.launcher;
    case 'maxLockedTargets': return attrs.maxLockedTargets;
    case 'cargoCapacity': return attrs.cargo;
    case 'droneBandwidth': return attrs.droneBandwidth;
    case 'droneCapacity': return attrs.droneCapacity;
    default: return attrs[kind];
  }
}

export function humanBucketKey(kind, value) {
  if (value == null) return null;
  if (kind === 'drones') {
    return `${Math.round(Number(value.bandwidth) || 0)}:${Math.round(Number(value.capacity) || 0)}`;
  }
  if (kind === 'sensorStrength') {
    return SENSOR_KEYS.map((key) => Math.round((Number(value[key]) || 0) / 5) * 5).join('/');
  }
  if (kind === 'shieldResists' || kind === 'armorResists' || kind === 'structureResists') {
    return RESIST_KEYS.map((key) => Math.round((Number(value[key]) || 0) / 10) * 10).join('/');
  }
  if (['tech', 'race', 'faction', 'group', 'hiSlots', 'medSlots', 'lowSlots',
    'rigSlots', 'turretHardpoints', 'launcherHardpoints', 'maxLockedTargets',
    'droneBandwidth', 'droneCapacity'].includes(kind)) {
    return String(Math.round(Number(value)));
  }
  const bucket = HUMAN_BUCKETS[kind];
  if (!bucket) return String(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (bucket.absolute) return String(Math.round(number / bucket.absolute));
  if (number <= 0) return '0';
  return String(Math.round(Math.log(number) / Math.log(1 + bucket.relative)));
}

function bucketNear(target, candidate, kind) {
  if (!HUMAN_BUCKETS[kind]) return target === candidate;
  const a = Number(target);
  const b = Number(candidate);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return target === candidate;
  return Math.abs(a - b) <= 1;
}

function humanBucketMatches(clue, catalog) {
  const target = humanBucketKey(clue.k, clue.v);
  if (target == null) return 1;
  let count = 0;
  for (const other of catalog) {
    const key = humanBucketKey(clue.k, bucketValueForShip(clue.k, other));
    if (bucketNear(target, key, clue.k)) count++;
  }
  return Math.max(1, count);
}

function classBucketCount(clue, ship, catalog) {
  const target = humanBucketKey(clue.k, clue.v);
  if (target == null) return { count: 1, size: 1 };
  const sameClass = catalog.filter((other) => Number(other.groupID) === Number(ship?.groupID));
  let count = 0;
  for (const other of sameClass) {
    const key = humanBucketKey(clue.k, bucketValueForShip(clue.k, other));
    if (bucketNear(target, key, clue.k)) count++;
  }
  return { count: Math.max(1, count), size: Math.max(1, sameClass.length) };
}

function weightFor(clue, ship, catalog, fitDelta = null) {
  if (clue.missing) return 1;
  if (clue.k === 'bonus') return 9.5;
  if (clue.k === 'equipment') return clue.w;
  if (clue.k === 'usageRank') {
    // Asymmetric U: rank 1 is the strongest signal (10), rank 100 peaks at 8.
    const rank = clamp(Number(clue.v) || 50, 1, 100);
    if (rank <= 50) return round(4 + 6 * ((50 - rank) / 49), 1);
    return round(4 + 4 * ((rank - 50) / 50), 1);
  }
  // zKillboard's "recent" bucket is a 90-day window; losses30 is a legacy key.
  const economyWeights = { losses30: 7.5, danger: 6.8, avgValue: 8.2 };
  if (economyWeights[clue.k] != null) return economyWeights[clue.k];
  const matches = humanBucketMatches(clue, catalog);
  let weight = (Number(clue.prior) || 1) + 1.8 * Math.log2(catalog.length / matches);
  if (BRACKET_BONUS_KINDS.has(clue.k) && ship) {
    const bracket = classBucketCount(clue, ship, catalog);
    if (bracket.size >= 3) {
      weight += 0.35 * (1 - bracket.count / bracket.size);
    }
  }
  return round(clamp(weight, 1, 10), 1);
}

function orderClues(clues, seed, mode = 'normal') {
  const random = seededRandom(cyrb53(seed, 0x0b1d1e));
  const scored = clues.map((clue, index) => ({
    clue,
    index,
    key: clue.w + (random() - 0.5) * 2.8,
    tie: cyrb53(`${seed}:order:${index}:${clue.k}:${clue.v}`, 0x7f1a2b3),
  }));
  scored.sort((a, b) => a.key - b.key || a.tie - b.tie || a.index - b.index);
  const ordered = scored.map((entry) => entry.clue);
  const identity = (clue) => ['tech', 'race', 'faction', 'group'].includes(clue.k);
  const hardAudit = (clue) => mode === 'audit' && (
    clue.k === 'race'
    || clue.k === 'group'
    || (clue.k === 'equipment' && (clue.tags || [clue.tag]).some((tag) => tag === 'unique' || tag === 'limited'))
  );
  const opening = [];
  const rest = [];
  for (const clue of ordered) {
    const canOpen = opening.length < 3
      && clue.k !== 'bonus'
      && !hardAudit(clue)
      && !(identity(clue) && opening.some(identity))
      && !(clue.k === 'equipment' && opening.some((entry) => entry.k === 'equipment'));
    if (canOpen) opening.push(clue);
    else rest.push(clue);
  }
  return [...opening, ...rest];
}

export function buildClues({
  ship,
  catalog,
  refs,
  stats,
  losses,
  dateKey,
  dataVersion,
  targetKillId = null,
  mode = 'normal',
  moduleDetails = null,
  fittedAttrs = null,
  baselineAttrs = null,
  moduleFallbacks = {},
}) {
  const { equipment, fittedKills } = parseFittings(losses, refs);
  const auditFallbacks = mode === 'audit' ? selectAuditFallbacks(equipment, refs, moduleFallbacks) : new Map();
  const attrs = mode === 'audit'
    ? (fittedAttrs || simulateFitting(ship, equipment, moduleDetails))
    : ship.attrs;
  const fitDelta = mode === 'audit' ? deriveFitDelta(ship.attrs || {}, attrs) : null;
  const baseClueValues = mode === 'audit'
    ? new Map(staticClues(ship, ship.attrs || {}).map((clue) => [clue.k, clue.v]))
    : null;
  const skillClueValues = mode === 'audit'
    ? new Map(staticClues(ship, baselineAttrs || ship.attrs || {}).map((clue) => [clue.k, clue.v]))
    : null;
  const clues = staticClues(ship, attrs);
  if (mode !== 'audit') {
    for (const clue of clues) {
      if (clue.c !== 'defense') continue;
      clue.range = ['shield', 'armor', 'structure'].includes(clue.k)
        ? STANDARD_DEFENSE_RANGE
        : STANDARD_DEFENSE_AUX_RANGE;
    }
  }

  const equipmentClues = [];
  const highWeapons = [];
  const weaponCounts = new Map();
  for (const item of equipment) {
    if (item.slot !== 'high') continue;
    const family = weaponFamilyOf(refs.modules?.[item.module]);
    if (family) weaponCounts.set(family, (weaponCounts.get(family) || 0) + 1);
  }
  const turretCount = (weaponCounts.get('energy') || 0)
    + (weaponCounts.get('hybrid') || 0)
    + (weaponCounts.get('projectile') || 0);
  const droneBoat = equipment.some((item) => item.slot === 'drone')
    || Number(ship.attrs?.drones?.bandwidth) > 0
    || Number(ship.attrs?.drones?.capacity) > 0;
  for (const item of equipment) {
    const module = refs.modules?.[item.module];
    const isCharge = !module || Number(module.categoryID) === 8;
    const isFighter = Number(module?.categoryID) === 87;
    const isMiningSpecial = Number(module?.categoryID) === 18
      && /excavator|pluto|mutated.*mining drone/i.test(module?.name || '');
    let restriction = equipmentRestriction(module);
    // Fighters fit every carrier/supercarrier family, but no other hull class:
    // limited. Specialized capital mining drones are Rorqual-only: unique.
    if (isFighter) restriction = 'limited';
    if (isMiningSpecial) restriction = 'unique';
    if (BUILTIN_EQUIPMENT_GROUPS.has(Number(ship.groupID)) && item.slot !== 'cargo') {
      restriction = 'limited';
    }
    const common = COMMON_MODULE_GROUPS.has(module?.groupID);
    const meta = Number(module?.metaGroupID || 0);
    const tags = [];
    if (restriction) tags.push(restriction);
    if (meta === 5) tags.push('officer');
    if (meta === 15) tags.push('audit');
    if (item.slot === 'cargo' && (PLEX_TYPES.has(Number(item.module)) || /plex|pilot'?s license/i.test(module?.name || ''))) {
      tags.push('plex');
    }
    let weight = restriction === 'unique' ? 10 : restriction === 'limited' ? 8.2 : common ? 1.2 : 3.0;
    if (!restriction) {
      weight += item.slot === 'rig' ? 0.3 : item.slot === 'subsystem' ? 0.45 : 0;
      weight += moduleSizeRank(module?.name);
      weight -= Math.min(common ? 0.4 : 1.2, item.rate * (common ? 0.4 : 1.2));
      weight = clamp(weight, 1, 7.8);
    } else if (restriction === 'limited') {
      weight = restrictedEquipmentWeight(module, catalog, true);
    }
    // A fitted module's PG/CPU requirement is a soft lower bound on hull size.
    // Cargo spare modules are ignored; cargo charges/scripts inherit a fitted
    // weapon's weight below.
    if (!['cargo', 'fighterBay', 'fuelBay'].includes(item.slot)) {
      const fitSize = moduleFitSize(module, catalog);
      if (fitSize >= 2) weight = Math.max(weight, FIT_SIZE_FLOOR[fitSize]);
    }
    // Rigs narrow the hull class strongly; capital/XL rigs are near-unique.
    if (item.slot === 'rig') {
      weight = Math.max(weight, 8.5 + Math.min(1.5, moduleSizeRank(module?.name)));
    }
    // Jump fuel only exists on capital hulls; actual fighters are handled below.
    if (item.slot === 'fuelBay') weight = Math.max(weight, 10);
    if (isFighter) weight = Math.max(weight, module?.groupID === 1653 ? 10.8 : 10.4);
    if (isMiningSpecial) weight = Math.max(weight, 10.8);
    // Low-slot weapon upgrades narrow the weapon family (and therefore hull).
    if (item.slot === 'low') {
      const upgrade = WEAPON_UPGRADE_FAMILIES.get(Number(module?.groupID));
      if (upgrade) {
        const count = upgrade === 'turret'
          ? turretCount
          : upgrade === 'drone'
            ? (droneBoat ? 1 : 0)
            : (weaponCounts.get(upgrade) || 0);
        weight = Math.max(weight, count > 0 ? 7.4 + Math.min(1.4, count * 0.35) : 5.8);
      }
    }
    if (mode === 'audit' && restriction === 'unique') weight = Math.max(weight, 10);
    if (mode === 'audit' && restriction === 'limited') weight = Math.max(weight, 8.8);
    // Faction+ damage controls and resistance modules are rare even when their
    // module group is common; the resistance clue inherits this floor.
    if (item.slot !== 'cargo' && Number(module?.categoryID) === 7 && meta >= HIGH_END_META_GROUP
      && (isDamageControl(module) || isResistGear(module))) {
      weight = Math.max(weight, HIGH_END_RESIST_FLOOR);
    }
    const cargo = item.slot === 'cargo';
    const clue = {
      k: cargo ? 'cargo' : 'equipment',
      c: cargo ? 'cargo' : 'equipment',
      v: { module: item.module, count: item.count, slot: item.slot },
      w: round(clamp(weight, 1, 10), 1),
      tag: restriction,
      tags,
      sig: restriction === 'unique',
      charge: isCharge && !['cargo', 'fighterBay', 'fuelBay'].includes(item.slot),
      calcModule: item.slot === 'cargo' ? null : (auditFallbacks.get(item.module) || null),
    };
    equipmentClues.push(clue);
    if (item.slot === 'high' && !isCharge && Array.isArray(module?.chargeGroups) && module.chargeGroups.length) {
      highWeapons.push(clue);
    }
  }

  // Loaded ammunition reveals the weapon family and size. It follows the
  // strongest restriction of the high-slot weapons; a unique weapon (for
  // example an interdiction sphere launcher) makes its probes unique too.
  const uniqueWeapon = highWeapons.find((clue) => clue.tag === 'unique');
  const limitedWeapon = highWeapons.find((clue) => clue.tag === 'limited');
  const ammoWeight = uniqueWeapon
    ? 10
    : limitedWeapon
      ? Math.max(...highWeapons.filter((clue) => clue.tag === 'limited').map((clue) => clue.w))
      : highWeapons.length
        ? Math.min(...highWeapons.map((clue) => clue.w))
        : 3;
  const ammoTag = uniqueWeapon ? 'unique' : limitedWeapon ? 'limited' : null;
  for (const clue of equipmentClues) {
    if (clue.charge) {
      clue.w = round(ammoWeight, 1);
      // Ammo inherits the weapon's weight, but never displays its marker.
      clue.sig = ammoTag === 'unique';
      clue.tag = null;
      clue.tags = [];
    }
    clues.push(clue);
  }

  // Cargo ammo, cap-booster charges and scripts describe a fitted module.
  // They inherit its weight, but never its marker.
  const fittedWithCharges = equipmentClues.filter((clue) => {
    if (['cargo', 'fighterBay', 'fuelBay'].includes(clue.v.slot)) return false;
    const module = refs.modules?.[clue.v.module];
    return Array.isArray(module?.chargeGroups) && module.chargeGroups.length;
  });
  for (const clue of equipmentClues) {
    if (clue.v.slot !== 'cargo') continue;
    const cargoModule = refs.modules?.[clue.v.module];
    if (!cargoModule || Number(cargoModule.categoryID) !== 8) continue;
    const compatible = fittedWithCharges.filter((fitted) => {
      const module = refs.modules?.[fitted.v.module];
      return module?.chargeGroups?.includes(cargoModule.groupID);
    });
    if (!compatible.length) continue;
    clue.w = Math.max(...compatible.map((fitted) => fitted.w));
    clue.tag = null;
    clue.tags = [];
    clue.sig = false;
  }
  const resistanceContext = mode === 'audit'
    ? resistanceInfluences(equipmentClues, refs)
    : null;

  const recent = stats?.rankings?.recent?.all;
  const losses30 = Number(recent?.metrics?.shipsLost || 0);
  const rank = Number(recent?.ranks?.shipsLost || 0);
  const danger = Number(stats?.dangerRatio || 0);
  if (stats) {
    clues.push({ k: 'losses30', c: 'economy', v: losses30, prior: 2.9 });
    clues.push({
      k: 'usageRank', c: 'economy',
      v: rank > 0 ? clamp(Math.round((rank / Math.max(1, catalog.length)) * 100), 1, 100) : 0,
      prior: 2.2,
      ...(rank > 0 ? {} : { missing: true }),
    });
    clues.push({
      k: 'danger', c: 'economy', v: danger, prior: 2.1,
      ...(danger ? {} : { missing: true }),
    });
  }
  // Daily mode deliberately does not request live zKill stats. Only the real
  // killmail value is shown; do not render an empty "data missing" category.
  const killValue = Number(losses?.[0]?.zkb?.totalValue || 0);
  if (killValue > 0 || stats) {
    clues.push({
      k: 'kbValue', c: 'economy', v: killValue, prior: 2.6,
      ...(killValue > 0 ? {} : { missing: true }),
    });
  }

  const bonusEntries = ship.bonusEntries || [];
  if (bonusEntries.length) {
    const bonusStats = new Map();
    for (const other of catalog) {
      for (const entry of other.bonusEntries || []) {
        if (!entry?.termKey) continue;
        let stat = bonusStats.get(entry.termKey);
        if (!stat) {
          stat = { ships: new Set(), values: new Set(), valueShips: new Map() };
          bonusStats.set(entry.termKey, stat);
        }
        stat.ships.add(other.id);
        const valueKey = entry.bonusKey || `${entry.termKey}|${entry.bonus ?? ''}|${entry.unitID ?? ''}`;
        if (!stat.valueShips.has(valueKey)) stat.valueShips.set(valueKey, new Set());
        stat.valueShips.get(valueKey).add(other.id);
        if (Number.isFinite(entry.bonus)) stat.values.add(Number(entry.bonus));
      }
    }
    const raceNames = Object.values(refs.races || {}).map((name) => String(name).toLowerCase()).filter(Boolean);
    const groupNames = Object.values(refs.groups || {}).map((name) => String(name).toLowerCase()).filter(Boolean);
    for (let i = 0; i < bonusEntries.length; i++) {
      const entry = bonusEntries[i];
      const stat = bonusStats.get(entry.termKey);
      const termCount = Math.max(1, stat?.ships.size || 1);
      const valueKey = entry.bonusKey || `${entry.termKey}|${entry.bonus ?? ''}|${entry.unitID ?? ''}`;
      const exactCount = Math.max(1, stat?.valueShips.get(valueKey)?.size || 1);
      const numeric = [...(stat?.values || [])].filter(Number.isFinite);
      const spread = numeric.length > 1
        ? clamp(
          (Math.max(...numeric) - Math.min(...numeric))
            / Math.max(1, Math.abs(Math.max(...numeric)), Math.abs(Math.min(...numeric))),
          0,
          1,
        )
        : 0;
      const skillName = String(entry.skill?.[refs.lang] || entry.skill?.en || '').toLowerCase();
      const termText = String(entry.text?.[refs.lang] || entry.text?.en || '').toLowerCase();
      const targetNames = [...raceNames, ...groupNames].filter((name) => name.length >= 3);
      let restrictionBoost = 0;
      let equipmentUnique = false;
      let equipmentLimited = false;
      let equipmentRarityWeight = 0;
      for (const moduleID of entry.links || []) {
        const module = refs.modules?.[moduleID];
        if (!module) continue;
        const restriction = equipmentRestriction(module);
        if (restriction === 'unique') {
          equipmentUnique = true;
          equipmentRarityWeight = Math.max(equipmentRarityWeight, 10);
          continue;
        }
        if (restriction !== 'limited') continue;
        equipmentLimited = true;
        equipmentRarityWeight = Math.max(
          equipmentRarityWeight,
          restrictedEquipmentWeight(module, catalog),
        );
        const fit = module.fitRestrictions;
        if ((fit?.shipTypes || []).includes(ship.id)) {
          restrictionBoost = Math.max(restrictionBoost, 1.8);
        } else if ((fit?.shipGroups || []).includes(ship.groupID)) {
          const groupCount = (fit.shipGroups || []).length;
          restrictionBoost = Math.max(
            restrictionBoost,
            groupCount <= 2 ? 1.8 : groupCount <= 6 ? 1.4 : 0.8,
          );
        } else if ((fit?.shipGroups || []).length || (fit?.shipTypes || []).length) {
          restrictionBoost = Math.max(restrictionBoost, 1.0);
        }
      }
      const targetsHull = entry.section === 'role'
        || equipmentUnique
        || equipmentLimited
        || (skillName && targetNames.some((name) => skillName.includes(name)))
        || (termText && targetNames.some((name) => termText.includes(name)));
      const termRarity = clamp(1 - Math.log2(termCount) / Math.log2(32), 0, 1);
      const exactShare = exactCount > 1
        ? clamp(Math.log2(exactCount) / Math.log2(termCount + 1), 0, 1)
        : 0;
      let weight = 5.8
        + 2.0 * termRarity
        - 1.4 * exactShare
        + (exactCount === 1 ? 1.0 : 0)
        + 1.2 * spread;
      if (targetsHull) weight += 1.0;
      weight += restrictionBoost;
      if (equipmentRarityWeight) weight = Math.max(weight, equipmentRarityWeight);
      if (equipmentLimited) weight = Math.max(weight, 8.5);
      if (entry.section === 'role') {
        weight += 0.8;
        weight = Math.max(weight, 7.5);
      }
      if (equipmentUnique || termCount === 1) weight = 10;
      const uniqueBonus = equipmentUnique || termCount === 1;
      const tags = [];
      if (uniqueBonus) tags.push('unique');
      if (targetsHull && (!uniqueBonus || entry.section === 'role')) tags.push('limited');
      clues.push({
        k: 'bonus',
        c: 'traits',
        v: i,
        prior: 7,
        w: round(clamp(weight, 1, 10), 1),
        tags,
        bonusKey: entry.bonusKey,
        bonusTermKey: entry.termKey,
      });
    }
  }

  // Equipment and cargo affected by a ship bonus inherit at least that bonus
  // clue's weight. Skill links are resolved through module required-skill data;
  // module links also cover every variant in the linked module group.
  const moduleBonuses = clues.filter((clue) => clue.k === 'bonus');
  if (moduleBonuses.length) {
    const modulesBySkill = new Map();
    for (const [moduleID, module] of Object.entries(refs.modules || {})) {
      for (const skillID of module.requiredSkills || []) {
        if (!modulesBySkill.has(skillID)) modulesBySkill.set(skillID, new Set());
        modulesBySkill.get(skillID).add(Number(moduleID));
      }
    }
    const bonusByModule = new Map();
    const bonusByGroup = new Map();
    const addAffected = (moduleID, groupID, weight) => {
      bonusByModule.set(moduleID, Math.max(bonusByModule.get(moduleID) || 0, weight));
      if (groupID) bonusByGroup.set(groupID, Math.max(bonusByGroup.get(groupID) || 0, weight));
    };
    for (const clue of moduleBonuses) {
      const entry = bonusEntries[clue.v];
      if (!entry) continue;
      for (const linkID of entry.links || []) {
        const linked = refs.modules?.[linkID];
        if (linked) {
          addAffected(Number(linkID), Number(linked.groupID), clue.w);
          continue;
        }
        for (const moduleID of modulesBySkill.get(linkID) || []) {
          const module = refs.modules?.[moduleID];
          addAffected(moduleID, Number(module?.groupID), clue.w);
        }
      }
    }
    for (const clue of clues) {
      if (clue.k !== 'equipment' && clue.k !== 'cargo') continue;
      const module = refs.modules?.[clue.v.module];
      const boost = Math.max(
        bonusByModule.get(Number(clue.v.module)) || 0,
        bonusByGroup.get(Number(module?.groupID)) || 0,
      );
      if (boost) clue.w = round(clamp(Math.max(clue.w, boost), 1, 10), 1);
    }

    // Equipment weight boosts must flow into ammunition/charges as well.
    if (highWeapons.length) {
      const boostedUnique = highWeapons.find((clue) => clue.tag === 'unique');
      const boostedLimited = highWeapons.find((clue) => clue.tag === 'limited');
      const boostedAmmo = boostedUnique
        ? 10
        : boostedLimited
          ? Math.max(...highWeapons.filter((clue) => clue.tag === 'limited').map((clue) => clue.w))
          : Math.min(...highWeapons.map((clue) => clue.w));
      for (const clue of equipmentClues) {
        if (clue.charge) clue.w = round(Math.max(clue.w, boostedAmmo), 1);
      }
    }
    const chargedWeapons = equipmentClues.filter((clue) => {
      if (['cargo', 'fighterBay', 'fuelBay'].includes(clue.v.slot)) return false;
      const module = refs.modules?.[clue.v.module];
      return Array.isArray(module?.chargeGroups) && module.chargeGroups.length;
    });
    for (const clue of equipmentClues) {
      if (clue.v.slot !== 'cargo') continue;
      const cargoModule = refs.modules?.[clue.v.module];
      if (!cargoModule || Number(cargoModule.categoryID) !== 8) continue;
      const compatible = chargedWeapons.filter((fitted) => {
        const module = refs.modules?.[fitted.v.module];
        return module?.chargeGroups?.includes(cargoModule.groupID);
      });
      if (!compatible.length) continue;
      clue.w = round(Math.max(clue.w, ...compatible.map((fitted) => fitted.w)), 1);
    }
  }

  for (const clue of clues) {
    if (clue.w == null) {
      const weightClue = baseClueValues?.has(clue.k)
        ? { ...clue, v: baseClueValues.get(clue.k) }
        : clue;
      clue.w = round(weightFor(weightClue, ship, catalog, mode === 'audit' ? null : fitDelta), 1);
    }
    if (mode === 'audit') {
      if (clue.k === 'race' || clue.k === 'group') clue.w = 10;
      if (clue.k === 'equipment' && clue.sig) clue.w = 10;
      const baselineValue = skillClueValues?.get(clue.k);
      if (clue.k !== 'equipment' && clue.k !== 'bonus' && baselineValue !== undefined) {
        if (!sameClueValue(clue.k, baselineValue, clue.v)) {
          clue.w = round(Math.max(1, clue.w * AUDIT_FITTED_WEIGHT_FACTOR), 1);
        }
      }
    }
    if (mode === 'audit' && RESIST_KIND_LAYER[clue.k]) {
      // Resistance strength follows the fit, not only the base hull profile.
      clue.w = resistanceWeight(clue, clue.w, resistanceContext);
    } else if (clue.k === 'structureResists') {
      // Every hull starts with the same base structure resists. Show it as a
      // free opening fact in Standard mode, but never count it as valid intel.
      clue.w = 0;
    }
  }

  const ordered = orderClues(
    clues,
    `fitdle:order:${dateKey}:${ship.id}:${targetKillId || 'no-kill'}:${dataVersion}:${mode}`,
    mode
  );
  return {
    clues: ordered,
    sampleKill: Array.isArray(losses) && losses[0]?.killmail_id ? Number(losses[0].killmail_id) : null,
    fittedKills,
    fitDelta,
  };
}
