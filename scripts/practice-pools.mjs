/**
 * Hull pools of the browser's own random pick (static build and Practice), from
 * the monthly usage file of the `data` branch. A hull appears in a pool as often
 * as its weight says; the browser draws from the pool.
 */
import {
  DEFAULT_GROUP_FACTORS, normalizeUsage, parseGroupFactors, recentMonthKeys, shipWeights, usageOver,
} from '../server/src/selection.mjs';

export const WINDOW_MONTHS = 3;
/** Standard favours used hulls: the most used one weighs this much, an unused one 1. */
const NORMAL_BONUS = 2.2;
/** Audit favours the others: an unused hull weighs 1 + this, the most used one 1. */
const AUDIT_BONUS = 1.8;
const COPIES_PER_WEIGHT = 10;

const sortedIds = (ships) => ships.map((ship) => Number(ship.id)).sort((a, b) => a - b);

/** Every hull once: all weights are 1. */
function flatPools(ships, reason) {
  const ids = sortedIds(ships);
  return {
    source: 'none', reason, generatedAt: null, eligible: ids, normal: [...ids], audit: [...ids],
  };
}

/**
 * `usage` is the parsed usage file, or null when there is none. Without usable
 * data every hull weighs 1. With it, usage is the kills a hull took part in over
 * the last complete months before the file was made, and capsules, shuttles and
 * rookie ships are turned down by the same group factors the service uses.
 */
export function practicePools({ ships, usage = null }) {
  const data = normalizeUsage(usage);
  if (!data) return flatPools(ships, 'no usage file in the expected format');
  const day = new Date(Date.parse(data.generatedAt) || 0).toISOString().slice(0, 10);
  const keys = recentMonthKeys(day, WINDOW_MONTHS);
  if (!ships.some((ship) => usageOver(data.ships[String(ship.id)], keys) > 0)) {
    return flatPools(ships, 'the usage file holds no recent usage');
  }
  // A hull whose months show no loss at all has no killmail to guess. A hull
  // without months (new, or unknown to zKillboard) stays in.
  const eligible = ships.filter((ship) => {
    const months = Object.values(data.ships[String(ship.id)]?.m || {});
    return !months.length || months.some((month) => Number(month?.[1]) > 0);
  });
  const { factors } = parseGroupFactors(DEFAULT_GROUP_FACTORS);
  const weights = shipWeights({
    ships, usage: data, day, windowMonths: WINDOW_MONTHS, maxRatio: 1 + NORMAL_BONUS, groupFactors: factors,
  });
  const pool = (weightOf) => sortedIds(eligible).flatMap((id) => (
    Array.from({ length: Math.max(1, Math.round(weightOf(id) * COPIES_PER_WEIGHT)) }, () => id)
  ));
  const groups = new Map(ships.map((ship) => [Number(ship.id), Number(ship.groupID)]));
  const factorOf = (id) => factors.get(groups.get(id)) ?? 1;
  return {
    source: 'usage',
    reason: '',
    generatedAt: data.generatedAt,
    eligible: sortedIds(eligible),
    normal: pool((id) => weights.get(id)),
    audit: pool((id) => {
      const share = (weights.get(id) / factorOf(id) - 1) / NORMAL_BONUS;
      return (1 + AUDIT_BONUS * (1 - share)) * factorOf(id);
    }),
  };
}
