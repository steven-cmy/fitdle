/**
 * Browser adapter for EVEShip.fit's dogma-engine (MIT).
 *
 * The engine and its SDE are vendored under vendor/dogma-engine and loaded
 * lazily, only for Abyssal mode. The target killmail is the fit input, so
 * module state, charges and quantities come from the actual loss.
 */
let enginePromise = null;

const ATTR_KEYS = {
  4: 'mass',
  9: 'structure',
  11: 'pg',
  37: 'speed',
  38: 'cargo',
  48: 'cpu',
  76: 'targetRange',
  263: 'shield',
  265: 'armor',
  482: 'capacitor',
  552: 'sig',
  564: 'scanRes',
  1132: 'calibration',
};

function attrValue(attributes, id) {
  if (!attributes) return null;
  let entry;
  if (attributes instanceof Map) entry = attributes.get(id);
  else if (Array.isArray(attributes)) entry = attributes.find((item) => Number(item?.attribute_id ?? item?.id) === id);
  else entry = attributes[id] ?? attributes[String(id)];
  if (entry == null) return null;
  const value = typeof entry === 'object' ? entry.value : entry;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

async function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const module = await import(new URL('../vendor/dogma-engine/esf_dogma_engine.js', import.meta.url).toString());
      await module.default();
      const [response, skillsResponse] = await Promise.all([
        fetch(new URL('../vendor/dogma-engine/sde.dat', import.meta.url), { cache: 'force-cache' }),
        fetch(new URL('../vendor/dogma-engine/skills.json', import.meta.url), { cache: 'force-cache' }),
      ]);
      if (!response.ok) throw new Error(`dogma SDE unavailable (${response.status})`);
      module.load_sde(new Uint8Array(await response.arrayBuffer()));
      const skills = skillsResponse.ok ? await skillsResponse.json() : [];
      return { module, skills };
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

function applyAllVSkills(fit, skills) {
  // Abyssal mode is a max-performance simulation: all skills V and every
  // fitted module active. Killmails do not carry the victim's skill sheet.
  fit.character = {
    ...(fit.character || {}),
    skills: Object.fromEntries(skills.map((id) => [id, 5])),
  };
  if (Array.isArray(fit.items)) {
    // Every fitted module is online and active, but never overheated. Cargo
    // (including fuel and spare fighter-bay modules) stays offline.
    fit.items = fit.items.map((item) => {
      const cargo = String(item.slot?.type || '').toLowerCase() === 'cargo';
      return {
        ...item,
        state: cargo ? 'offline' : 'active',
        overheated: false,
        overload: false,
      };
    });
  }
  return fit;
}

function attrsFromCalculation(ship, calculation) {
  const attributes = calculation?.ship?.attributes;
  const attrs = { ...(ship.attrs || {}) };
  for (const [id, key] of Object.entries(ATTR_KEYS)) {
    const value = attrValue(attributes, Number(id));
    if (value != null) attrs[key] = value;
  }
  const mass = attrValue(attributes, 4);
  const agility = attrValue(attributes, 70);
  if (mass && agility) {
    attrs.align = Math.round(1.386 * agility * mass / 1e6 * 100) / 100;
  }
  const warpMultiplier = attrValue(attributes, 600);
  const baseWarp = attrValue(attributes, 1281);
  if (warpMultiplier != null) {
    attrs.warp = Math.round((baseWarp || 1) * warpMultiplier * 100) / 100;
  }
  const resist = (id) => {
    const value = attrValue(attributes, id);
    return value == null ? null : Math.round((1 - value) * 1000) / 10;
  };
  const resistLayer = (ids) => {
    const values = ids.map(resist);
    if (values.some((value) => value == null)) return null;
    return { em: values[0], thermal: values[1], kinetic: values[2], explosive: values[3] };
  };
  attrs.shieldResists = resistLayer([271, 274, 273, 272]) || attrs.shieldResists;
  attrs.armorResists = resistLayer([267, 270, 269, 268]) || attrs.armorResists;
  attrs.structureResists = resistLayer([109, 113, 111, 110]) || attrs.structureResists;
  const shieldRecharge = attrValue(attributes, 479);
  if (shieldRecharge != null) attrs.shieldRecharge = Math.round(shieldRecharge / 10) / 100;
  const sensorStrength = {
    radar: attrValue(attributes, 208),
    ladar: attrValue(attributes, 209),
    magnetometric: attrValue(attributes, 210),
    gravimetric: attrValue(attributes, 211),
  };
  if (Object.values(sensorStrength).every((value) => value != null)) {
    attrs.sensorStrength = sensorStrength;
  }
  const maxLocked = attrValue(attributes, 192);
  if (maxLocked != null) attrs.maxLockedTargets = maxLocked;
  return attrs;
}

export async function calculateDogmaFit(ship, killmail) {
  if (!killmail?.victim) return null;
  const { module: engine, skills } = await loadEngine();
  const fit = engine.load_killmail({
    killmail_id: Number(killmail.killmail_id),
    victim: {
      ship_type_id: Number(killmail.victim.ship_type_id),
      items: (killmail.victim.items || []).map((item) => ({
        flag: Number(item.flag),
        item_type_id: Number(item.item_type_id),
        quantity_destroyed: Number(item.quantity_destroyed || 0),
        quantity_dropped: Number(item.quantity_dropped || 0),
      })),
    },
  });
  applyAllVSkills(fit, skills);
  return attrsFromCalculation(ship, engine.calculate(fit));
}

/** All-V skills only, with no fitted modules. Used to isolate equipment effects. */
export async function calculateDogmaBaseline(ship) {
  const { module: engine, skills } = await loadEngine();
  const fit = engine.load_killmail({
    killmail_id: 0,
    victim: {
      ship_type_id: Number(ship.id),
      items: [],
    },
  });
  applyAllVSkills(fit, skills);
  return attrsFromCalculation(ship, engine.calculate(fit));
}
