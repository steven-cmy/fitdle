/**
 * Pure multiplayer rules. Kept free of DOM and network so every scoring
 * decision can be unit tested and reused by both room types.
 */

export const RANK_POINTS = Object.freeze([10, 8, 6, 4, 2, 1, 1, 1]);
export const DEFAULT_SCORE_TARGET = 20;
export const DEFAULT_RACE_ROUND_MS = 180000;
export const DEFAULT_DEAL_MS = 120000;
export const MAX_PLAYERS = 8;
export const ROOM_SCORE_PER_KB = 3000;
export const ARBITRATION_ROUNDS = 6;

/** Integer points for one non-arbitration endless round. */
export function endlessRoundScore({ status, attempts, x = ROOM_SCORE_PER_KB } = {}) {
  if (status !== 'won') return 0;
  const total = Math.max(1, Math.floor(Number(x) || ROOM_SCORE_PER_KB));
  const wrong = Math.max(0, Math.min(6, Math.floor(Number(attempts) || 0) - 1));
  return Math.max(0, Math.floor(total - wrong * (total / 6)));
}

function allocateByWeights(weights, budget) {
  const totalBudget = Math.max(0, Math.floor(Number(budget) || 0));
  const list = Array.isArray(weights) ? weights.map((value) => Math.max(0, Number(value) || 0)) : [];
  if (!list.length) return [];
  const result = Array(list.length).fill(0);
  const totalWeight = list.reduce((sum, value) => sum + value, 0);
  if (!totalWeight) {
    result[0] = totalBudget;
    return result;
  }
  const fractions = [];
  let assigned = 0;
  list.forEach((weight, index) => {
    const raw = (totalBudget * weight) / totalWeight;
    const base = Math.floor(raw);
    result[index] = base;
    assigned += base;
    fractions.push({ index, fraction: raw - base });
  });
  fractions.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let remaining = totalBudget - assigned;
  for (let index = 0; remaining > 0 && index < fractions.length; index += 1) {
    result[fractions[index].index] += 1;
    remaining -= 1;
  }
  return result;
}

/**
 * Split X across every (round, non-dealer) bucket, then split each bucket
 * across all clues by weight. All values are integers and every bucket sums
 * exactly to its assigned budget.
 */
export function allocatePlayerRoundScores({
  clues,
  players,
  rounds = ARBITRATION_ROUNDS,
  x = ROOM_SCORE_PER_KB,
} = {}) {
  const list = Array.isArray(clues) ? clues : [];
  const ids = [...new Set((Array.isArray(players) ? players : []).map(String))].filter(Boolean);
  const roundCount = Math.max(1, Math.floor(Number(rounds) || ARBITRATION_ROUNDS));
  const total = Math.max(0, Math.floor(Number(x) || ROOM_SCORE_PER_KB));
  if (!ids.length || !list.length) {
    return { budgets: {}, scores: {}, total: 0 };
  }
  const bucketCount = ids.length * roundCount;
  const base = Math.floor(total / bucketCount);
  let remainder = total - base * bucketCount;
  const budgets = {};
  const scores = {};
  const weights = list.map((clue) => Math.max(0, Number(clue?.w) || 0));
  for (const id of ids) {
    budgets[id] = Array(roundCount).fill(base);
    scores[id] = Array.from({ length: roundCount }, () => Array(list.length).fill(0));
  }
  // Remainder buckets are assigned deterministically by round then player order.
  for (let round = 0; round < roundCount && remainder > 0; round += 1) {
    for (const id of ids) {
      if (remainder <= 0) break;
      budgets[id][round] += 1;
      remainder -= 1;
    }
  }
  for (const id of ids) {
    for (let round = 0; round < roundCount; round += 1) {
      scores[id][round] = allocateByWeights(weights, budgets[id][round]);
    }
  }
  return { budgets, scores, total };
}

export function allocateClueScores(clues, x = ROOM_SCORE_PER_KB) {
  return allocateByWeights(
    (Array.isArray(clues) ? clues : []).map((clue) => Math.max(0, Number(clue?.w) || 0)),
    x,
  );
}

/** Points for a 1-based finish position. */
export function rankPoints(rank) {
  const position = Math.floor(Number(rank) || 0);
  if (position <= 0) return 0;
  const index = Math.min(position - 1, RANK_POINTS.length - 1);
  return RANK_POINTS[index] || 0;
}

/** Round a numeric score without negative zero. */
export function score(value) {
  const numeric = Number(value) || 0;
  return Math.round(numeric);
}

function clueWeight(clue) {
  return Math.max(0, Number(clue?.w) || 0);
}

/**
 * One race round. `results` contains the authority's received feed:
 * [{ playerId, status: 'solved'|'lost', at }].
 * Only players active at round start are ranked; spectators are excluded.
 */
export function raceRoundScores(activePlayerIds, results) {
  const active = new Set((activePlayerIds || []).map(String));
  const solved = (Array.isArray(results) ? results : [])
    .filter((entry) => entry && entry.status === 'solved' && active.has(String(entry.playerId)))
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0) || String(a.playerId).localeCompare(String(b.playerId)));
  const scores = {};
  const ranks = {};
  for (const id of active) scores[id] = 0;
  solved.forEach((entry, index) => {
    ranks[String(entry.playerId)] = index + 1;
    scores[String(entry.playerId)] = rankPoints(index + 1);
  });
  return { scores, ranks, solved: solved.map((entry) => String(entry.playerId)) };
}

/** True when a cumulative score has reached the configured target. */
export function raceTargetReached(scores, target) {
  const limit = Math.max(1, Number(target) || DEFAULT_SCORE_TARGET);
  return Object.values(scores || {}).some((value) => Number(value) >= limit);
}

/** Stable ranking for cumulative scores: score, solves, join order. */
export function rankPlayers(players, scores, solveCounts = {}) {
  return [...(players || [])]
    .map((player, index) => ({
      ...player,
      score: Number(scores?.[player.id]) || 0,
      solves: Number(solveCounts?.[player.id]) || 0,
      order: index,
    }))
    .sort((a, b) => (
      b.score - a.score
      || b.solves - a.solves
      || a.order - b.order
    ));
}

/**
 * One dealer round. Each solve carries the sum of clue weights that were still
 * unpublished when that player guessed correctly (`snapshot`). The dealer gets
 * the weight published by settlement; correct players split their snapshots.
 */
export function arbitrationRoundScores({ clues, publishedIndices, solves }) {
  const list = Array.isArray(clues) ? clues : [];
  const totalWeight = list.reduce((sum, clue) => sum + clueWeight(clue), 0);
  const published = new Set((publishedIndices || []).map(Number));
  const publishedWeight = list.reduce(
    (sum, clue, index) => sum + (published.has(index) ? clueWeight(clue) : 0),
    0,
  );
  const correct = (Array.isArray(solves) ? solves : [])
    .filter((entry) => entry && entry.playerId != null)
    .map((entry) => ({
      playerId: String(entry.playerId),
      snapshot: Math.max(0, Number(entry.snapshot) || 0),
    }));
  const count = correct.length;
  const playerScores = {};
  for (const entry of correct) {
    playerScores[entry.playerId] = count > 0 ? score(entry.snapshot / count) : 0;
  }
  return {
    totalWeight: score(totalWeight),
    publishedWeight: score(publishedWeight),
    unpublishedWeight: score(Math.max(0, totalWeight - publishedWeight)),
    dealerScore: score(publishedWeight),
    playerScores,
    correctCount: count,
  };
}

/** Weight left unpublished at a given published set. */
export function unpublishedWeight(clues, publishedIndices) {
  const list = Array.isArray(clues) ? clues : [];
  const published = new Set((publishedIndices || []).map(Number));
  return score(list.reduce(
    (sum, clue, index) => sum + (published.has(index) ? 0 : clueWeight(clue)),
    0,
  ));
}
