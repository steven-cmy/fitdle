/**
 * Reveal planning for normal and abyssal modes.
 *
 * Normal mode only releases equipment proactively. Other static clues are
 * released when the guessed hull shares the same value as the answer. Initial
 * random clues are allowed, but a static clue is never added if it would leave
 * exactly one candidate in the SDE catalog.
 */
import { clueMatchesShip } from './clues.js';
import { cyrb53 } from './game.js';

export const INITIAL_WEIGHT_THRESHOLD = 9;
export const INITIAL_MAX_WEIGHT = 13;
export const INITIAL_MAX_CLUES = 7;
export const INITIAL_MIN_CANDIDATES = 6;

const STATIC_CATEGORIES = new Set(['identity', 'hull', 'slots', 'nav', 'defense', 'fitting']);

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

function weightedPick(entries, random) {
  if (!entries.length) return null;
  const scored = entries.map((entry) => ({
    entry,
    score: 1 / Math.pow(Math.max(0.5, Number(entry.clue.w) || 1), 1.8),
  }));
  const total = scored.reduce((sum, item) => sum + item.score, 0);
  let roll = random() * total;
  for (const item of scored) {
    roll -= item.score;
    if (roll <= 0) return item.entry;
  }
  return scored[scored.length - 1].entry;
}

function candidatesFor(set, clues, catalog, fitDelta) {
  const active = [...set]
    .map((index) => clues[index])
    .filter((clue) => isStatic(clue));
  if (!active.length) return catalog;
  return catalog.filter((ship) => active.every((clue) => clueMatchesShip(clue, ship, fitDelta)));
}

function wouldLeaveTooFew(set, index, clues, catalog, fitDelta) {
  const clue = clues[index];
  if (!isStatic(clue)) return false;
  const current = candidatesFor(set, clues, catalog, fitDelta);
  if (current.length <= INITIAL_MIN_CANDIDATES) return true;
  const next = current.filter((ship) => clueMatchesShip(clue, ship, fitDelta));
  return next.length < INITIAL_MIN_CANDIDATES;
}

function chooseInitial({ clues, catalog, fitDelta }) {
  const revealed = new Set();
  const identity = (clue) => ['tech', 'race', 'faction', 'group'].includes(clue.k);
  let hasIdentity = false;
  let hasEquipment = false;
  let weight = 0;
  for (let index = 0; index < clues.length; index++) {
    if (weight >= INITIAL_WEIGHT_THRESHOLD) break;
    if (revealed.size >= INITIAL_MAX_CLUES) break;
    const clue = clues[index];
    if (clue.k === 'bonus') continue;
    if (clue.k === 'equipment' && clue.tag) continue;
    if (identity(clue) && hasIdentity) continue;
    if (clue.k === 'equipment' && hasEquipment) continue;
    if (wouldLeaveTooFew(revealed, index, clues, catalog, fitDelta)) continue;
    const clueWeight = Math.max(0, Number(clue.w) || 0);
    if (weight > 0 && weight + clueWeight > INITIAL_MAX_WEIGHT) {
      continue;
    }
    revealed.add(index);
    weight += clueWeight;
    if (identity(clue)) hasIdentity = true;
    if (clue.k === 'equipment') hasEquipment = true;
  }
  if (weight < INITIAL_WEIGHT_THRESHOLD && revealed.size < INITIAL_MAX_CLUES) {
    const fallback = clues
      .map((clue, index) => ({ clue, index }))
      .filter(({ clue, index }) => (
        !revealed.has(index)
        && clue.k !== 'bonus'
        && !(clue.k === 'equipment' && clue.tag)
        && !(identity(clue) && hasIdentity)
        && !(clue.k === 'equipment' && hasEquipment)
        && !wouldLeaveTooFew(revealed, index, clues, catalog, fitDelta)
      ))
      .sort((a, b) => (Number(a.clue.w) || 0) - (Number(b.clue.w) || 0));
    if (fallback.length) revealed.add(fallback[0].index);
  }
  return revealed;
}

function replacementFor({ equipment, revealed, clues, catalog, fitDelta }) {
  for (let index = 0; index < clues.length; index++) {
    if (revealed.has(index)) continue;
    const clue = clues[index];
    if ((clue.k === 'equipment') !== equipment) continue;
    if (clue.k !== 'equipment' && wouldLeaveTooFew(revealed, index, clues, catalog, fitDelta)) continue;
    if (clue.k === 'bonus') continue;
    return index;
  }
  return -1;
}

function addWeightedSequential({ revealed, target, clues, catalog, fitDelta, random }) {
  const additions = [];
  while (revealed.size < target) {
    const candidates = clues
      .map((clue, index) => ({ clue, index }))
      .filter(({ clue, index }) => (
        !revealed.has(index)
        && !wouldLeaveTooFew(revealed, index, clues, catalog, fitDelta)
      ));
    if (!candidates.length) break;
    const chosen = weightedPick(candidates, random);
    if (!chosen) break;
    revealed.add(chosen.index);
    additions.push(chosen.index);
  }
  if (additions.length < 2) return;

  const equipment = additions.filter((index) => clues[index].k === 'equipment');
  const nonEquipment = additions.filter((index) => clues[index].k !== 'equipment');
  if (equipment.length > nonEquipment.length && nonEquipment.length === 0) {
    const replacement = replacementFor({ equipment: false, revealed, clues, catalog, fitDelta });
    if (replacement >= 0) {
      revealed.delete(equipment[0]);
      revealed.add(replacement);
    }
  } else if (nonEquipment.length > equipment.length && equipment.length === 0) {
    const replacement = replacementFor({ equipment: true, revealed, clues, catalog, fitDelta });
    if (replacement >= 0) {
      revealed.delete(nonEquipment[0]);
      revealed.add(replacement);
    }
  }
}

function addAbyssEquipment({ revealed, count, clues, random }) {
  let added = 0;
  for (let picked = 0; picked < count; picked++) {
    const candidates = clues
      .map((clue, index) => ({ clue, index }))
      .filter(({ clue, index }) => clue.k === 'equipment' && !revealed.has(index));
    const chosen = weightedPick(candidates, random);
    if (!chosen) break;
    revealed.add(chosen.index);
    added += 1;
  }
  return added;
}

function addAbyssOther({ revealed, clues, catalog, fitDelta, random }) {
  const candidates = clues
    .map((clue, index) => ({ clue, index }))
    .filter(({ clue, index }) => (
      clue.k !== 'equipment'
      && clue.k !== 'bonus'
      && !revealed.has(index)
      && !wouldLeaveTooFew(revealed, index, clues, catalog, fitDelta)
    ));
  const chosen = weightedPick(candidates, random);
  if (chosen) revealed.add(chosen.index);
}

function addEquipment({ revealed, misses, clues, random }) {
  const equipment = clues
    .map((clue, index) => ({ clue, index }))
    .filter(({ clue }) => clue.k === 'equipment');
  if (!equipment.length) return;

  // More fitted items means a slightly larger budget, but expensive/rare
  // (high-weight) items consume more of it. Low-weight items are picked first.
  const budget = Math.max(4, Math.min(9, 4 + Math.floor(equipment.length / 8)));
  for (let miss = 0; miss < misses; miss++) {
    let spent = 0;
    let picked = 0;
    while (spent < budget) {
      const candidates = equipment.filter(({ index }) => !revealed.has(index));
      if (!candidates.length) break;
      const chosen = weightedPick(candidates, random);
      if (!chosen) break;
      const cost = Math.max(1, Number(chosen.clue.w) || 1);
      if (picked > 0 && spent + cost > budget) break;
      revealed.add(chosen.index);
      spent += cost;
      picked++;
      if (cost >= budget) break;
    }
  }
}

function addMatching({ revealed, guess, answer, clues, catalog, locale, fitDelta }) {
  if (!guess) return;
  const matches = [];
  for (let index = 0; index < clues.length; index++) {
    if (revealed.has(index)) continue;
    const clue = clues[index];
    if (clue.c === 'equipment' || clue.c === 'economy') continue;
    if (clue.k === 'bonus') {
      const line = answer.bonuses?.[clue.v];
      const guessLines = guess.bonuses?.[locale] || guess.bonuses?.en || [];
      if (line && guessLines.includes(line)) matches.push({ index, clue, static: false, weight: 0, line });
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
    // A clue earned by the player's own guess is always shown, including race
    // and other entries that may leave only one hull in combination. The
    // one-hull guard is for random/proactive reveals, not player matches.
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
}) {
  const total = clues.length;
  if (!total) return new Set();
  if (status === 'won' || status === 'lost') {
    return new Set(Array.from({ length: total }, (_, index) => index));
  }

  const random = makeRandom(`${seed}:${mode}:${answerId}`);
  const misses = guesses.filter((id) => Number(id) !== Number(answerId)).length;
  if (mode === 'abyss') {
    const revealed = chooseInitial({ clues, catalog, fitDelta });
    // Miss 1..5 adds 1..5 equipment clues, plus one weighted non-equipment
    // clue each time.
    for (let miss = 1; miss <= misses; miss++) {
      const added = addAbyssEquipment({ revealed, count: miss, clues, random });
      const shortfall = Math.max(0, miss - added);
      const others = 1 + Math.ceil(shortfall / 2);
      for (let index = 0; index < others; index++) {
        addAbyssOther({ revealed, clues, catalog, fitDelta, random });
      }
    }
    return revealed;
  }

  const revealed = chooseInitial({ clues, catalog, fitDelta });
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
  addEquipment({ revealed, misses, clues, random });
  return revealed;
}
