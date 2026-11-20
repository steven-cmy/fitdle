/**
 * Pure multiplayer rules. Kept free of DOM and network so every scoring
 * decision can be unit tested and reused by both room types.
 */

export const RANK_POINTS = Object.freeze([10, 8, 6, 4, 2, 1, 1, 1]);
export const DEFAULT_SCORE_TARGET = 20;
export const DEFAULT_RACE_ROUND_MS = 180000;
export const DEFAULT_DEAL_MS = 120000;
export const MAX_PLAYERS = 8;

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
export function pvpRoundScores({ clues, publishedIndices, solves }) {
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
