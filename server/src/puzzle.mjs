import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { auditSimulationItems, buildClues, getEquipment, selectAuditFallbacks } from '../../js/clues.js';
import { calculateDogmaBaseline, calculateDogmaFit } from '../../js/dogma.js';
import { profileSimilarity } from '../../js/game.js';
import { buildRevealPlan, computeRevealed, computeTimedRevealed } from '../../js/reveal.js';
import { config } from './config.mjs';
import { zkill } from './zkill.mjs';

/**
 * The puzzle of an online run, kept by the service from the start: the clue set,
 * its reveal plan and a snapshot of the live statistics. A player only ever gets
 * the clues the plan has released so far; the answer follows when the run ends.
 */

export const PUZZLE_VERSION = 1;
export const TIMED_RELEASE_MS = 30_000;
const STATS_TIMEOUT_MS = 6000;
// Clues whose kind and place are part of the board before they are revealed.
const SEALED_KINDS = new Set(['equipment', 'cargo', 'bonus']);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

let refsEn = null;
let moduleAttrs = null;
function refs() {
  refsEn ||= readJson(path.join(config.dataDir, 'refs', 'en.json'), { groups: {}, races: {}, factions: {}, modules: {} });
  return refsEn;
}
function fallbackAttrs() {
  moduleAttrs ||= readJson(path.join(config.dataDir, 'module-fallback.json'), {});
  return moduleAttrs;
}

// The complete catalog of this release; the target selection may use a narrower pool.
const CATALOG = config.catalogShips;
const SHIPS_BY_ID = new Map(CATALOG.map((ship) => [Number(ship.id), ship]));
export function shipById(id) {
  return SHIPS_BY_ID.get(Number(id))
    || config.catalogShips.find((ship) => Number(ship.id) === Number(id))
    || null;
}

const isSealedKind = (clue) => SEALED_KINDS.has(clue?.k);

/** Opaque case number of a killmail; the same for every player, useless to look it up. */
export function caseIdFor(killId) {
  const secret = config.sessionSecret || 'fitdle-development-secret';
  return BigInt(`0x${crypto.createHmac('sha256', secret).update(`case:${Number(killId)}`).digest('hex').slice(0, 12)}`)
    .toString(36).toUpperCase().padStart(8, '0').slice(-8);
}

async function liveStats(shipId) {
  let timer;
  try {
    const request = zkill.get(`/api/stats/shipTypeID/${Number(shipId)}/`).then(({ data }) => data);
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), STATS_TIMEOUT_MS); });
    const stats = await Promise.race([request.catch(() => null), timeout]);
    return stats?.type === 'shipTypeID' ? stats : null;
  } finally {
    clearTimeout(timer);
  }
}

/** The audit input of the browser version: mutated modules stand in by their slot-tier representative. */
export function auditKillmail(killmail, refsData) {
  const equipment = getEquipment([killmail], refsData).equipment;
  const fallbacks = selectAuditFallbacks(equipment, refsData, config.manifest?.moduleFallbacks || {});
  if (!fallbacks.size || !killmail?.victim?.items) return killmail;
  return {
    ...killmail,
    victim: {
      ...killmail.victim,
      items: auditSimulationItems(killmail.victim.items.map((item) => {
        if (Number(item.flag) === 5) return item;
        const fallback = fallbacks.get(Number(item.item_type_id));
        return fallback ? { ...item, item_type_id: fallback } : item;
      }), refsData),
    },
  };
}

/** Module attributes for the built-in fit estimate when the dogma engine fails. */
function moduleDetailsFor(killmail, refsData) {
  const data = fallbackAttrs();
  const equipment = getEquipment([killmail], refsData).equipment;
  const fallbacks = selectAuditFallbacks(equipment, refsData, config.manifest?.moduleFallbacks || {});
  const toDetail = (attributes) => (attributes ? {
    dogma_attributes: Object.entries(attributes).map(([id, value]) => ({ attribute_id: Number(id), value: Number(value) })),
  } : null);
  const details = {};
  for (const id of new Set(equipment.map((item) => item.module))) {
    const own = toDetail(data[id]);
    if (own) {
      details[id] = own;
      continue;
    }
    const resolved = fallbacks.get(id);
    const representative = toDetail(data[resolved]);
    if (representative) details[id] = { ...representative, fallbackType: resolved };
  }
  return details;
}

/**
 * Build the puzzle of a target once. Audit and Timed simulate the actual fit
 * (all skills V), as the browser did before. Rooms give their own reveal seed
 * and simulate only in Audit, as their rounds always did.
 */
export async function buildPuzzle({
  target, gameplay, gameDay, stats: givenStats, seed: givenSeed, simulated: givenSimulated,
} = {}) {
  const ship = shipById(target.shipId);
  if (!ship) throw new Error('target hull missing from catalog');
  const refsData = refs();
  const timed = gameplay === 'timed';
  const revealMode = gameplay === 'audit' ? 'audit' : 'normal';
  const simulated = givenSimulated ?? (gameplay === 'audit' || timed);
  const killmail = target.killmail;
  let fittedAttrs = null;
  let baselineAttrs = null;
  let moduleDetails = null;
  if (simulated && killmail?.victim) {
    try {
      fittedAttrs = await calculateDogmaFit(ship, auditKillmail(killmail, refsData));
    } catch {
      fittedAttrs = null;
    }
    try {
      baselineAttrs = await calculateDogmaBaseline(ship);
    } catch {
      baselineAttrs = null;
    }
    if (!fittedAttrs) moduleDetails = moduleDetailsFor(killmail, refsData);
  }
  const stats = givenStats === undefined ? await liveStats(ship.id) : givenStats;
  const seed = givenSeed || `online:${gameDay}:${Number(target.killId)}`;
  const built = buildClues({
    ship,
    catalog: CATALOG,
    refs: refsData,
    stats,
    losses: killmail ? [killmail] : [],
    dateKey: seed,
    dataVersion: config.manifest?.clueVersion || '5',
    targetKillId: Number(target.killId),
    mode: simulated ? 'audit' : 'normal',
    moduleDetails,
    fittedAttrs,
    baselineAttrs,
    moduleFallbacks: simulated ? config.manifest?.moduleFallbacks || {} : {},
    weaponUpgradeGroups: config.manifest?.weaponUpgradeGroups || null,
    weaponGroups: config.manifest?.weaponGroups || null,
  });
  const plan = buildRevealPlan({
    clues: built.clues,
    seed,
    mode: revealMode,
    timed,
    config: config.manifest?.reveal,
  });
  return {
    v: PUZZLE_VERSION,
    revealMode,
    timed,
    seed,
    clues: built.clues,
    plan,
    fitDelta: built.fitDelta || null,
    sampleKill: built.sampleKill,
    fittedKills: built.fittedKills,
    caseId: caseIdFor(target.killId),
    wire: [],
    shown: [],
  };
}

export function parsePuzzle(text) {
  try {
    const puzzle = JSON.parse(text || 'null');
    return puzzle?.v === PUZZLE_VERSION && Array.isArray(puzzle.clues) ? puzzle : null;
  } catch {
    return null;
  }
}

const weighted = (clue) => (Number(clue?.w) || 0) > 0;

/**
 * Clue indices the plan has released. `releases` counts the Timed releases
 * (one every 30 s of the clock); a Timed run shows nothing before its clock.
 */
export function releasedClues(puzzle, { answerId, guesses = [], begun = true, releases = 0 }) {
  const { clues } = puzzle;
  const ship = shipById(answerId) || {};
  const base = {
    clues,
    catalog: CATALOG,
    guesses,
    status: 'playing',
    answerId: Number(answerId),
    mode: puzzle.revealMode,
    getShip: (id) => shipById(id),
    answer: { bonusEntries: ship.bonusEntries || [] },
    fitDelta: puzzle.fitDelta || null,
    seed: puzzle.seed,
    plan: puzzle.plan,
    config: config.manifest?.reveal,
    timed: puzzle.timed,
  };
  if (!puzzle.timed) return computeRevealed(base);
  if (!begun) return new Set();
  const initial = computeRevealed({ ...base, guesses: [] });
  const extras = computeTimedRevealed({ clues, plan: puzzle.plan, releases, exclude: initial });
  return new Set([...initial, ...extras]);
}

/**
 * Timed runs end without the answer at the first release that finds nothing
 * left to show. Returns that release number, or 0 while clues remain.
 */
export function timedExhaustedAt(puzzle, { answerId, releases }) {
  const total = puzzle.clues.filter(weighted).length;
  for (let release = 1; release <= releases; release += 1) {
    const shown = releasedClues(puzzle, { answerId, releases: release - 1 });
    let count = 0;
    for (const index of shown) if (weighted(puzzle.clues[index])) count += 1;
    if (count >= total) return release;
  }
  return 0;
}

/**
 * Record what is now shown. Shown clues stay shown; sealed clues get board
 * positions in the order they appear, so nothing on the board tells how many
 * sealed clues there are. Returns true when the puzzle changed.
 */
export function markShown(puzzle, revealed) {
  const shown = new Set(puzzle.shown);
  let changed = false;
  for (const index of revealed) {
    if (shown.has(index)) continue;
    shown.add(index);
    changed = true;
  }
  if (!changed) return false;
  puzzle.shown = [...shown].sort((a, b) => a - b);
  const placed = new Set(puzzle.wire);
  for (const index of puzzle.shown) {
    if (isSealedKind(puzzle.clues[index]) && !placed.has(index)) puzzle.wire.push(index);
  }
  return true;
}

function bonusText(entry) {
  return entry ? { bonus: entry.bonus ?? null, unit: entry.unit ?? '', text: entry.text || {} } : null;
}

/** A revealed clue as the player sees it. */
function openClue(clue, i, ship, ended) {
  const out = { ...clue, i };
  if (!ended) {
    delete out.bonusKey;
    delete out.bonusTermKey;
  }
  if (clue.k === 'bonus') {
    const entry = bonusText(ship?.bonusEntries?.[clue.v]);
    if (entry) out.entry = entry;
  }
  return out;
}

/**
 * What the player may see of a puzzle: the kind of every open-board clue, the
 * released clues and, once the run is over, all of them.
 */
export function boardView(puzzle, { answerId, ended }) {
  const ship = shipById(answerId);
  const { clues } = puzzle;
  const shown = new Set(ended ? clues.map((_, index) => index) : puzzle.shown);
  const order = clues.map((clue, index) => index).filter((index) => !isSealedKind(clues[index]));
  order.push(...puzzle.wire);
  if (ended) {
    const placed = new Set(order);
    for (let index = 0; index < clues.length; index += 1) if (!placed.has(index)) order.push(index);
  }
  const board = [];
  const revealed = [];
  order.forEach((index, i) => {
    const clue = clues[index];
    if (shown.has(index)) {
      board.push(openClue(clue, i, ship, ended));
      revealed.push(i);
    } else {
      board.push({ i, k: clue.k, c: clue.c, w: weighted(clue) ? 1 : 0, hidden: true });
    }
  });
  const sealed = ended ? [] : [...new Set(clues
    .filter((clue, index) => isSealedKind(clue) && !shown.has(index))
    .map((clue) => clue.c))];
  return { clues: board, revealed, sealed };
}

/** The aggregate match of each guess, as the board shows it. */
export function guessFeedback(guesses, answerId) {
  const answer = shipById(answerId);
  return guesses.map((shipId) => {
    const correct = Number(shipId) === Number(answerId);
    const guess = shipById(shipId);
    return { shipId: Number(shipId), correct, similarity: correct ? 100 : profileSimilarity(guess, answer) };
  });
}
