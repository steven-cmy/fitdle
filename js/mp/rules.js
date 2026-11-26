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

/**
 * Arbitration scoring. f is the published share of the total clue weight
 * (0..1) after the dealer published in a round; n is the number of players
 * (not the dealer) when the stint started.
 * - A player who solves in round k scores solveBase x (1 - f_k) + solveEarly x (7 - k), once.
 * - After each round, every player still unsolved gives the dealer dealerRound x f_k.
 * - When the stint ends the dealer gets dealerEnd x n x f_end.
 * - The dealer's total is the sum above divided by n.
 */
export const ARBITRATION_SCORING = Object.freeze({
  solveBase: 1200,
  solveEarly: 20,
  dealerRound: 600,
  dealerEnd: 800,
  rounds: ARBITRATION_ROUNDS,
});

function clampShare(share) {
  const value = Number(share);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value);
}

/** Published share of the total clue weight, 0..1. */
export function arbitrationShare(clues, publishedIndices) {
  const list = Array.isArray(clues) ? clues : [];
  const total = list.reduce((sum, clue) => sum + Math.max(0, Number(clue?.w) || 0), 0);
  if (!total) return 0;
  const published = new Set([...(publishedIndices || [])].map(Number));
  const shown = list.reduce((sum, clue, index) => (
    sum + (published.has(index) ? Math.max(0, Number(clue?.w) || 0) : 0)
  ), 0);
  return clampShare(shown / total);
}

/** Integer points for a player who solves in 1-based round `round` at share f. */
export function arbitrationSolvePoints({ share, round, scoring = ARBITRATION_SCORING } = {}) {
  const rounds = Math.max(1, Math.floor(Number(scoring.rounds) || ARBITRATION_ROUNDS));
  const k = Math.min(rounds, Math.max(1, Math.floor(Number(round) || 1)));
  const raw = scoring.solveBase * (1 - clampShare(share)) + scoring.solveEarly * (rounds + 1 - k);
  return Math.max(0, Math.round(raw));
}

/** Unrounded dealer points for one settled round (before dividing by n). */
export function arbitrationDealerRoundRaw({ share, unsolved, scoring = ARBITRATION_SCORING } = {}) {
  return scoring.dealerRound * clampShare(share) * Math.max(0, Math.floor(Number(unsolved) || 0));
}

/** Unrounded dealer end bonus (before dividing by n). */
export function arbitrationEndBonusRaw({ share, players, scoring = ARBITRATION_SCORING } = {}) {
  return scoring.dealerEnd * Math.max(0, Math.floor(Number(players) || 0)) * clampShare(share);
}

/**
 * Integer points to add to the dealer now, so that the credited total always
 * equals round(raw / n) and rounding never drifts.
 */
export function arbitrationDealerCredit({ raw, players, credited = 0 } = {}) {
  const n = Math.max(1, Math.floor(Number(players) || 1));
  return Math.round((Math.max(0, Number(raw) || 0)) / n) - Math.floor(Number(credited) || 0);
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
