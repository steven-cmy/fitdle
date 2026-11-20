/**
 * Reveal planning for normal, abyssal and timed modes.
 *
 * The queue order is fixed at the start of an answer. Guesses never re-roll a
 * queue; they only add matching clues and are skipped when a queue is consumed.
 */
import { clueMatchesShip } from './clues.js';
import { cyrb53 } from './game.js';

export const INITIAL_WEIGHT_THRESHOLD = 9;
export const INITIAL_MAX_WEIGHT = 13;
export const INITIAL_MAX_CLUES = 7;
export const INITIAL_MIN_CANDIDATES = 6;

export const DEFAULT_REVEAL_CONFIG = Object.freeze({
  openingBudget: 9,
  openingMaxWeight: 13,
  openingMinClues: 3,
  openingMaxClues: 7,
  candidateFloor: 6,
  queueWeightPower: 1.8,
  standardEquipmentBase: 4,
  standardEquipmentMax: 9,
  standardEquipmentDivisor: 8,
  standardCargoBudget: 6,
  abyssEquipmentPerMiss: 1,
  abyssOtherBase: 1,
  abyssShortfallDivisor: 2,
  abyssCargoDivisor: 10,
});

const STATIC_CATEGORIES = new Set(['identity', 'hull', 'slots', 'nav', 'defense', 'targeting', 'fitting']);

function isStatic(clue) {
  return STATIC_CATEGORIES.has(clue?.c);
}

function makeRandom(seed) {
  let state = cyrb53(String(seed || 'reveal'), 0x51f15e);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function weightedPick(entries, random, power = DEFAULT_REVEAL_CONFIG.queueWeightPower) {
  if (!entries.length) return null;
  const exponent = Math.max(0.5, Math.min(8, Number(power) || DEFAULT_REVEAL_CONFIG.queueWeightPower));
  const scored = entries.map((entry) => ({
    entry,
    score: 1 / Math.pow(Math.max(0.5, Number(entry.clue.w) || 1), exponent),
  }));
  const total = scored.reduce((sum, item) => sum + item.score, 0);
  let roll = random() * total;
  for (const item of scored) {
    roll -= item.score;
    if (roll <= 0) return item.entry;
  }
  return scored[scored.length - 1].entry;
}

export function normalizeRevealConfig(input = null) {
  const raw = input && typeof input === 'object' ? input : {};
  const number = (key, fallback, min = 0) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) && value >= min ? value : fallback;
  };
  return {
    openingBudget: number('openingBudget', DEFAULT_REVEAL_CONFIG.openingBudget, 1),
    openingMaxWeight: number('openingMaxWeight', DEFAULT_REVEAL_CONFIG.openingMaxWeight, 1),
    openingMinClues: number('openingMinClues', DEFAULT_REVEAL_CONFIG.openingMinClues, 1),
    openingMaxClues: number('openingMaxClues', DEFAULT_REVEAL_CONFIG.openingMaxClues, 1),
    candidateFloor: number('candidateFloor', DEFAULT_REVEAL_CONFIG.candidateFloor, 1),
    queueWeightPower: number('queueWeightPower', DEFAULT_REVEAL_CONFIG.queueWeightPower, 0.5),
    standardEquipmentBase: number('standardEquipmentBase', DEFAULT_REVEAL_CONFIG.standardEquipmentBase, 1),
    standardEquipmentMax: number('standardEquipmentMax', DEFAULT_REVEAL_CONFIG.standardEquipmentMax, 1),
    standardEquipmentDivisor: number('standardEquipmentDivisor', DEFAULT_REVEAL_CONFIG.standardEquipmentDivisor, 1),
    standardCargoBudget: number('standardCargoBudget', DEFAULT_REVEAL_CONFIG.standardCargoBudget, 1),
    abyssEquipmentPerMiss: number('abyssEquipmentPerMiss', DEFAULT_REVEAL_CONFIG.abyssEquipmentPerMiss, 1),
    abyssOtherBase: number('abyssOtherBase', DEFAULT_REVEAL_CONFIG.abyssOtherBase, 1),
    abyssShortfallDivisor: number('abyssShortfallDivisor', DEFAULT_REVEAL_CONFIG.abyssShortfallDivisor, 1),
    abyssCargoDivisor: number('abyssCargoDivisor', DEFAULT_REVEAL_CONFIG.abyssCargoDivisor, 1),
  };
}

function queueEntries(clues, predicate) {
  return clues
    .map((clue, index) => ({ clue, index }))
    .filter(({ clue }) => (Number(clue?.w) || 0) > 0 && predicate(clue));
}

function buildQueue(entries, seed, power) {
  if (!entries.length) return [];
  const random = makeRandom(seed);
  const pool = [...entries];
  const order = [];
  while (pool.length) {
    const chosen = weightedPick(pool, random, power);
    if (!chosen) break;
    order.push(chosen.index);
    const at = pool.indexOf(chosen);
    if (at >= 0) pool.splice(at, 1);
    else break;
  }
  return order;
}

/**
 * Build the immutable queue order for one answer. The plan contains only
 * indices and configuration; it never contains the answer ship or killmail.
 */
export function buildRevealPlan({
  clues,
  seed = 'reveal',
  mode = 'normal',
  timed = false,
  config = null,
}) {
  const cfg = normalizeRevealConfig(config);
  const base = `${seed}:${mode}:${timed ? 'timed' : 'standard'}`;
  const queueSeeds = {
    opening: `${base}:opening`,
    equipment: `${base}:equipment`,
    cargo: `${base}:cargo`,
    other: `${base}:other`,
    timed: `${base}:timed`,
  };
  const all = clues.map((clue, index) => ({ clue, index }));
  const openingEntries = all.filter(({ clue }) => (
    (Number(clue?.w) || 0) > 0
    && clue.k !== 'cargo'
    && clue.c !== 'cargo'
    && (mode !== 'normal' || timed || clue.k !== 'bonus')
  ));
  const queues = {
    equipment: buildQueue(queueEntries(clues, (clue) => clue.k === 'equipment'), queueSeeds.equipment, cfg.queueWeightPower),
    cargo: buildQueue(queueEntries(clues, (clue) => clue.k === 'cargo'), queueSeeds.cargo, cfg.queueWeightPower),
    other: mode === 'abyss'
      ? buildQueue(queueEntries(clues, (clue) => clue.k !== 'equipment' && clue.k !== 'cargo'), queueSeeds.other, cfg.queueWeightPower)
      : [],
    timed: timed
      ? buildQueue(queueEntries(clues, () => true), queueSeeds.timed, cfg.queueWeightPower)
      : [],
  };
  const equipmentCount = clues.filter((clue) => clue.k === 'equipment').length;
  const equipmentBudget = Math.min(
    cfg.standardEquipmentMax,
    cfg.standardEquipmentBase + Math.floor(equipmentCount / cfg.standardEquipmentDivisor),
  );
  return {
    opening: buildQueue(openingEntries, queueSeeds.opening, cfg.queueWeightPower),
    queues,
    queueSeeds,
    equipmentBudget,
    config: cfg,
    clueCount: clues.length,
    mode,
    timed,
    baseSeed: base,
  };
}

function candidatesFor(set, clues, catalog, fitDelta) {
  const active = [...set]
    .map((index) => clues[index])
    .filter((clue) => isStatic(clue));
  if (!active.length) return catalog;
  return catalog.filter((ship) => active.every((clue) => clueMatchesShip(clue, ship, fitDelta)));
}

function wouldLeaveTooFew(set, index, clues, catalog, fitDelta, floor) {
  const clue = clues[index];
  if (!isStatic(clue)) return false;
  const current = candidatesFor(set, clues, catalog, fitDelta);
  if (current.length <= floor) return true;
  const next = current.filter((ship) => clueMatchesShip(clue, ship, fitDelta));
  return next.length < floor;
}

function addStructureResists(revealed, clues) {
  const index = clues.findIndex((clue) => clue.k === 'structureResists');
  if (index >= 0) revealed.add(index);
}

function consumeOpening({ revealed, clues, plan, catalog, fitDelta }) {
  const cfg = plan.config;
  const identity = (clue) => ['tech', 'race', 'faction', 'group'].includes(clue.k);
  const hasIdentity = [...revealed].some((index) => identity(clues[index]));
  const hasEquipment = [...revealed].some((index) => clues[index]?.k === 'equipment');
  let identitySeen = hasIdentity;
  let equipmentSeen = hasEquipment;
  let spent = 0;
  let count = 0;

  for (const index of plan.opening) {
    if (revealed.has(index)) continue;
    const clue = clues[index];
    if (!clue || (Number(clue.w) || 0) <= 0) continue;
    if (clue.c === 'cargo') continue;
    if (clue.k === 'bonus' && plan.mode === 'normal' && !plan.timed) continue;
    if (clue.k === 'equipment' && clue.tag) continue;
    if (identity(clue) && identitySeen) continue;
    if (clue.k === 'equipment' && equipmentSeen) continue;
    if (wouldLeaveTooFew(revealed, index, clues, catalog, fitDelta, cfg.candidateFloor)) continue;
    const cost = Math.max(1, Number(clue.w) || 1);
    if (count > 0 && spent + cost > cfg.openingMaxWeight) continue;
    revealed.add(index);
    spent += cost;
    count += 1;
    if (identity(clue)) identitySeen = true;
    if (clue.k === 'equipment') equipmentSeen = true;
    if (count >= cfg.openingMaxClues) break;
    if (count >= cfg.openingMinClues && spent >= cfg.openingBudget) break;
  }
}

function consumeWeightQueue({
  revealed,
  queue,
  clues,
  catalog,
  fitDelta,
  budget,
  guard = false,
}) {
  let spent = 0;
  let count = 0;
  for (const index of queue) {
    if (revealed.has(index)) continue;
    const clue = clues[index];
    if (!clue || (Number(clue.w) || 0) <= 0) continue;
    if (guard && wouldLeaveTooFew(revealed, index, clues, catalog, fitDelta, INITIAL_MIN_CANDIDATES)) continue;
    const cost = Math.max(1, Number(clue.w) || 1);
    if (count === 0) {
      revealed.add(index);
      spent = cost;
      count = 1;
      if (spent >= budget) break;
      continue;
    }
    if (spent + cost > budget) break;
    revealed.add(index);
    spent += cost;
    count += 1;
  }
  return { added: count, spent };
}

function consumeCountQueue({
  revealed,
  queue,
  count,
  clues,
  catalog,
  fitDelta,
  guard = false,
  candidateFloor = INITIAL_MIN_CANDIDATES,
}) {
  let added = 0;
  for (const index of queue) {
    if (added >= count) break;
    if (revealed.has(index)) continue;
    const clue = clues[index];
    if (!clue || (Number(clue.w) || 0) <= 0) continue;
    if (guard && wouldLeaveTooFew(revealed, index, clues, catalog, fitDelta, candidateFloor)) continue;
    revealed.add(index);
    added += 1;
  }
  return added;
}

function addMatching({ revealed, guess, answer, clues, catalog, locale, fitDelta }) {
  if (!guess) return;
  const matches = [];
  for (let index = 0; index < clues.length; index++) {
    if (revealed.has(index)) continue;
    const clue = clues[index];
    if (clue.c === 'equipment' || clue.c === 'economy') continue;
    if (clue.k === 'bonus') {
      const answerEntry = answer.bonusEntries?.[clue.v];
      const termKey = clue.bonusTermKey || answerEntry?.termKey;
      const guessEntries = guess.bonusEntries || [];
      const matched = Boolean(termKey)
        && guessEntries.some((entry) => entry?.termKey === termKey);
      if (matched) matches.push({ index, clue, static: false, weight: 0 });
      continue;
    }
    if (clueMatchesShip(clue, guess, fitDelta)) {
      matches.push({ index, clue, static: isStatic(clue), weight: 0 });
    }
  }

  const current = candidatesFor(revealed, clues, catalog, fitDelta);
  for (const entry of matches) {
    if (entry.static && current.length > 1) {
      entry.weight = current.filter((ship) => clueMatchesShip(entry.clue, ship, fitDelta)).length;
    }
  }
  matches.sort((a, b) => (a.static === b.static ? b.weight - a.weight : Number(a.static) - Number(b.static)));

  for (const entry of matches) {
    // A clue earned by the player's own guess is always shown.
    revealed.add(entry.index);
  }
}

export function computeRevealed({
  clues,
  catalog,
  guesses,
  status,
  answerId,
  mode,
  locale,
  getShip,
  answerBonuses = [],
  answer = {},
  fitDelta = null,
  seed = 'reveal',
  plan = null,
  config = null,
  timed = false,
}) {
  const total = clues.length;
  if (!total) return new Set();
  if (status === 'won' || status === 'lost') {
    return new Set(Array.from({ length: total }, (_, index) => index));
  }
  const activePlan = plan && plan.clueCount === clues.length
    ? plan
    : buildRevealPlan({ clues, seed, mode, timed, config });
  const cfg = activePlan.config;
  const timedMode = Boolean(timed || activePlan.timed);
  const misses = guesses.filter((id) => Number(id) !== Number(answerId)).length;
  const revealed = new Set();

  if (mode !== 'abyss') addStructureResists(revealed, clues);

  // Only Standard reveals shared clues from guesses. Abyss and Timed have
  // their own reveal mechanisms.
  if (mode !== 'abyss' && !timedMode) {
    for (const id of guesses) {
      if (Number(id) === Number(answerId)) continue;
      addMatching({
        revealed,
        guess: getShip(Number(id)),
        answer: { ...answer, bonuses: answerBonuses },
        clues,
        catalog,
        locale,
        fitDelta,
      });
    }
  }

  consumeOpening({ revealed, clues, plan: activePlan, catalog, fitDelta });

  if (timedMode) return revealed;

  if (mode === 'abyss') {
    for (let miss = 1; miss <= misses; miss++) {
      const requested = miss * cfg.abyssEquipmentPerMiss;
      const added = consumeCountQueue({
        revealed,
        queue: activePlan.queues.equipment,
        count: requested,
        clues,
        catalog,
        fitDelta,
      });
      const shortfall = Math.max(0, requested - added);
      const otherCount = cfg.abyssOtherBase + Math.ceil(shortfall / cfg.abyssShortfallDivisor);
      consumeCountQueue({
        revealed,
        queue: activePlan.queues.other,
        count: otherCount,
        clues,
        catalog,
        fitDelta,
        guard: true,
        candidateFloor: cfg.candidateFloor,
      });
      const cargoCount = clues.filter((clue) => clue.k === 'cargo').length;
      consumeCountQueue({
        revealed,
        queue: activePlan.queues.cargo,
        count: Math.max(1, Math.ceil(cargoCount / cfg.abyssCargoDivisor)),
        clues,
        catalog,
        fitDelta,
      });
    }
    return revealed;
  }

  for (let miss = 1; miss <= misses; miss++) {
    consumeWeightQueue({
      revealed,
      queue: activePlan.queues.equipment,
      clues,
      catalog,
      fitDelta,
      budget: activePlan.equipmentBudget,
    });
    consumeWeightQueue({
      revealed,
      queue: activePlan.queues.cargo,
      clues,
      catalog,
      fitDelta,
      budget: cfg.standardCargoBudget,
    });
  }
  return revealed;
}

/**
 * Cumulative clues released after N timed release events:
 * 1, 1, 2, 2, 3, 3, ... clues per event.
 */
export function timedRevealTotal(releases) {
  const count = Math.max(0, Math.floor(Number(releases) || 0));
  const pairs = Math.floor(count / 2);
  return count % 2 === 0 ? pairs * (pairs + 1) : (pairs + 1) * (pairs + 1);
}

/**
 * Timed mode releases a fixed mixed queue. Guesses do not release clues.
 * Returns only the newly released indices; callers union them with `exclude`.
 */
export function computeTimedRevealed({
  clues,
  plan = null,
  releases = 0,
  exclude = new Set(),
  seed = 'timed',
  config = null,
}) {
  const total = Array.isArray(clues) ? clues.length : 0;
  if (!total || releases <= 0) return new Set();
  const activePlan = plan && plan.clueCount === clues.length
    ? plan
    : buildRevealPlan({ clues, seed, mode: 'normal', timed: true, config });
  const revealed = new Set(exclude);
  for (let release = 1; release <= releases; release++) {
    const quota = timedRevealTotal(release) - timedRevealTotal(release - 1);
    consumeCountQueue({
      revealed,
      queue: activePlan.queues.timed,
      count: quota,
      clues,
    });
  }
  return new Set([...revealed].filter((index) => !exclude.has(index)));
}
