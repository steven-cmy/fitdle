/**
 * Runtime clue factory.
 *
 * CCP SDE data is static and comes from the generated catalog.  Fittings and
 * economy stats are fetched live from zKillboard for the single daily target;
 * this module merges both into the dossier.  It is pure so the rules can be
 * tested without a browser.
 */
import { cyrb53 } from './game.js';

export const CLUE_VERSION = 2;

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
};
const VALUE_MIN_TOLERANCE = {
  speed: 5, sig: 5, align: 0.1, warp: 0.1, mass: 1000,
  cargo: 10, shield: 10, armor: 10, structure: 10,
  capacitor: 10, targetRange: 1000, scanRes: 10,
  pg: 1, cpu: 1, calibration: 1,
};
const FIT_ADDITIVE = ['mass', 'sig', 'shield', 'armor', 'structure', 'capacitor', 'cargo', 'targetRange', 'scanRes', 'pg', 'cpu', 'calibration'];
const FIT_RATIO = ['speed', 'align', 'warp'];
const ABYSS_FITTED_WEIGHT_FACTOR = 0.7;

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

function sameValue(kind, a, b) {
  if (kind === 'slots' || kind === 'hardpoints' || kind === 'drones') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  const left = Number(a) || 0;
  const right = Number(b) || 0;
  const ratio = VALUE_TOLERANCE[kind] ?? 0.03;
  const minimum = VALUE_MIN_TOLERANCE[kind] ?? 0;
  const tolerance = Math.max(minimum, Math.max(Math.abs(left), Math.abs(right)) * ratio);
  return Math.abs(left - right) <= tolerance;
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

function sameResists(left, right, delta = null) {
  if (!left || !right) return false;
  return ['em', 'thermal', 'kinetic', 'explosive'].every((key) => (
    sameValue('resist', (Number(left[key]) || 0) + (Number(delta?.[key]) || 0), right[key])
  ));
}

function normalizeBonusTemplate(line) {
  return String(line || '')
    .toLowerCase()
    .replace(/[+-]?\d+(?:[.,]\d+)?\s*%/g, '#%')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
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

/**
 * Abyssal modules use the representative matching the highest meta module in
 * the same slot, or the closest available meta tier. Representatives are always
 * from the same module group (and therefore the same module variant).
 */
export function selectAbyssFallbacks(equipment, refs, moduleFallbacks = {}) {
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
  if (types.length === 1 && groups.length <= 1) return 'unique';
  if (!types.length && groups.length === 1) return 'unique';
  return 'limited';
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
  equipment.sort((a, b) => b.rate - a.rate || b.count - a.count || a.module - b.module || a.slot.localeCompare(b.slot));
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
  if (attrs.cargo) add('cargo', 'fitting', attrs.cargo, 1.4);
  if (attrs.capacitor) add('capacitor', 'fitting', attrs.capacitor, 1.4);

  if (attrs.sig) add('sig', 'targeting', attrs.sig, 1.35);
  if (attrs.targetRange) add('targetRange', 'targeting', attrs.targetRange, 2.0);
  if (attrs.scanRes) add('scanRes', 'targeting', attrs.scanRes, 2.0);
  if (attrs.maxLockedTargets) add('maxLockedTargets', 'targeting', attrs.maxLockedTargets, 1.8);

  if (attrs.shield) add('shield', 'defense', attrs.shield, 1.25);
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
    case 'align': return sameValue('align', adjustedAttr('align', attrs, fitDelta), clue.v);
    case 'warp': return sameValue('warp', adjustedAttr('warp', attrs, fitDelta), clue.v);
    case 'mass': return sameValue('mass', adjustedAttr('mass', attrs, fitDelta), clue.v);
    case 'cargo': return sameValue('cargo', adjustedAttr('cargo', attrs, fitDelta), clue.v);
    case 'shield': return sameValue('shield', adjustedAttr('shield', attrs, fitDelta), clue.v);
    case 'armor': return sameValue('armor', adjustedAttr('armor', attrs, fitDelta), clue.v);
    case 'structure': return sameValue('structure', adjustedAttr('structure', attrs, fitDelta), clue.v);
    case 'capacitor': return sameValue('capacitor', adjustedAttr('capacitor', attrs, fitDelta), clue.v);
    case 'targetRange': return sameValue('targetRange', adjustedAttr('targetRange', attrs, fitDelta), clue.v);
    case 'scanRes': return sameValue('scanRes', adjustedAttr('scanRes', attrs, fitDelta), clue.v);
    case 'maxLockedTargets': return Number(attrs.maxLockedTargets || 0) === Number(clue.v);
    case 'shieldResists':
    case 'armorResists':
    case 'structureResists':
      return sameResists(attrs[clue.k], clue.v, fitDelta?.resist?.[clue.k]);
    case 'pg': return sameValue('pg', adjustedAttr('pg', attrs, fitDelta), clue.v);
    case 'cpu': return sameValue('cpu', adjustedAttr('cpu', attrs, fitDelta), clue.v);
    case 'calibration': return sameValue('calibration', adjustedAttr('calibration', attrs, fitDelta), clue.v);
    default: return false;
  }
}

export function clueMatchesShip(clue, ship, fitDelta = null) {
  return matchesCatalog(clue, ship, fitDelta);
}

function weightFor(clue, ship, catalog, fitDelta = null) {
  if (clue.k === 'bonus') return 9.5;
  if (clue.k === 'equipment') return clue.w;
  const economyWeights = { losses30: 7.5, usageRank: 7.0, danger: 6.8, avgValue: 8.2 };
  if (economyWeights[clue.k] != null) return economyWeights[clue.k];
  const matches = Math.max(1, catalog.reduce((count, other) => count + (matchesCatalog(clue, other, fitDelta) ? 1 : 0), 0));
  const weight = clue.prior + 1.8 * Math.log2(catalog.length / matches);
  return clamp(weight, 1, 10);
}

function orderClues(clues, seed, mode = 'normal') {
  const random = seededRandom(cyrb53(seed, 0x0b1d1e));
  const scored = clues.map((clue) => ({
    clue,
    key: clue.w + (random() - 0.5) * 2.8,
  }));
  scored.sort((a, b) => a.key - b.key || random() - 0.5);
  const ordered = scored.map((entry) => entry.clue);
  const identity = (clue) => ['tech', 'race', 'faction', 'group'].includes(clue.k);
  const hardAbyss = (clue) => mode === 'abyss' && (
    clue.k === 'race'
    || clue.k === 'group'
    || (clue.k === 'equipment' && (clue.tags || [clue.tag]).some((tag) => tag === 'unique' || tag === 'limited'))
  );
  const opening = [];
  const rest = [];
  for (const clue of ordered) {
    const canOpen = opening.length < 3
      && clue.k !== 'bonus'
      && !hardAbyss(clue)
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
  const abyssFallbacks = mode === 'abyss' ? selectAbyssFallbacks(equipment, refs, moduleFallbacks) : new Map();
  const attrs = mode === 'abyss'
    ? (fittedAttrs || simulateFitting(ship, equipment, moduleDetails))
    : ship.attrs;
  const fitDelta = mode === 'abyss' ? deriveFitDelta(ship.attrs || {}, attrs) : null;
  const baseClueValues = mode === 'abyss'
    ? new Map(staticClues(ship, ship.attrs || {}).map((clue) => [clue.k, clue.v]))
    : null;
  const skillClueValues = mode === 'abyss'
    ? new Map(staticClues(ship, baselineAttrs || ship.attrs || {}).map((clue) => [clue.k, clue.v]))
    : null;
  const clues = staticClues(ship, attrs);

  const equipmentClues = [];
  const highWeapons = [];
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
    const common = COMMON_MODULE_GROUPS.has(module?.groupID);
    const meta = Number(module?.metaGroupID || 0);
    const tags = [];
    if (restriction) tags.push(restriction);
    if (meta === 5) tags.push('officer');
    if (meta === 15) tags.push('abyss');
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
      const breadth = restrictionBreadth(module, catalog);
      const scarcity = 1 - Math.log2(1 + breadth) / Math.log2(1 + Math.max(1, catalog.length));
      weight = clamp(8.2 + 1.6 * scarcity + moduleSizeRank(module?.name) * 0.2, 8.2, 9.8);
    }
    // Rigs narrow the hull class strongly; capital/XL rigs are near-unique.
    if (item.slot === 'rig') {
      weight = Math.max(weight, 8.5 + Math.min(1.5, moduleSizeRank(module?.name)));
    }
    // Jump fuel only exists on capital hulls; actual fighters are handled below.
    if (item.slot === 'fuelBay') weight = Math.max(weight, 10);
    if (isFighter) weight = Math.max(weight, module?.groupID === 1653 ? 10.8 : 10.4);
    if (isMiningSpecial) weight = Math.max(weight, 10.8);
    if (mode === 'abyss' && restriction === 'unique') weight = Math.max(weight, 10);
    if (mode === 'abyss' && restriction === 'limited') weight = Math.max(weight, 8.8);
    const clue = {
      k: 'equipment',
      c: 'equipment',
      v: { module: item.module, count: item.count, slot: item.slot },
      w: round(clamp(weight, 1, 10), 1),
      tag: restriction,
      tags,
      sig: restriction === 'unique',
      charge: isCharge && !['cargo', 'fighterBay', 'fuelBay'].includes(item.slot),
      calcModule: item.slot === 'cargo' ? null : (abyssFallbacks.get(item.module) || null),
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

  if (stats) {
    const recent = stats.rankings?.recent?.all;
    const losses30 = Number(recent?.metrics?.shipsLost || 0);
    const rank = Number(recent?.ranks?.shipsLost || 0);
    const danger = Number(stats.dangerRatio || 0);
    clues.push({ k: 'losses30', c: 'economy', v: losses30, prior: 2.9 });
    if (rank > 0) {
      const usageRank = clamp(Math.round((rank / Math.max(1, catalog.length)) * 100), 1, 100);
      clues.push({ k: 'usageRank', c: 'economy', v: usageRank, prior: 2.2 });
    }
    if (danger) clues.push({ k: 'danger', c: 'economy', v: danger, prior: 2.1 });
  }
  const killValue = Number(losses?.[0]?.zkb?.totalValue || 0);
  if (killValue > 0) {
    clues.push({ k: 'kbValue', c: 'economy', v: killValue, prior: 2.6 });
  }

  const bonusLines = ship.bonuses?.[refs.lang] || ship.bonuses?.en || [];
  const raceName = String(refs.races?.[ship.raceID] || '').toLowerCase();
  const groupName = String(refs.groups?.[ship.groupID] || '').toLowerCase();
  for (let i = 0; i < bonusLines.length; i++) {
    const rawLine = String(bonusLines[i] || '');
    const line = rawLine.toLowerCase();
    const revealsRace = (raceName && line.includes(raceName)) || (groupName && line.includes(groupName));
    const template = normalizeBonusTemplate(rawLine);
    const shared = catalog.filter((entry) => (
      entry.bonuses?.[refs.lang] || entry.bonuses?.en || []
    ).some((otherLine) => normalizeBonusTemplate(otherLine) === template)).length;
    const sharedPenalty = Math.min(2.5, Math.max(0, Math.log2(shared / 6)));
    const weight = mode === 'abyss' && revealsRace ? 10 : Math.max(6.5, 9.5 - sharedPenalty);
    clues.push({ k: 'bonus', c: 'traits', v: i, prior: 7, w: weight });
  }

  for (const clue of clues) {
    if (clue.w == null) {
      const weightClue = baseClueValues?.has(clue.k)
        ? { ...clue, v: baseClueValues.get(clue.k) }
        : clue;
      clue.w = round(weightFor(weightClue, ship, catalog, mode === 'abyss' ? null : fitDelta), 1);
    }
    if (mode === 'abyss') {
      if (clue.k === 'race' || clue.k === 'group') clue.w = 10;
      if (clue.k === 'equipment' && clue.sig) clue.w = 10;
      const baselineValue = skillClueValues?.get(clue.k);
      if (clue.k !== 'equipment' && clue.k !== 'bonus' && baselineValue !== undefined) {
        if (!sameClueValue(clue.k, baselineValue, clue.v)) {
          clue.w = round(Math.max(1, clue.w * ABYSS_FITTED_WEIGHT_FACTOR), 1);
        }
      }
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
