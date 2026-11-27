/**
 * Clue set of an arbitration round. The target itself comes from the shared
 * server-side selection (server/src/targets.mjs); this only turns its real
 * killmail into the dealer's clues.
 */
import { buildClues } from '../clues.js';

/**
 * Dealer round for a target the shared selection already picked: builds the
 * complete clue set from its real killmail. Only published clues are sent on.
 */
export async function buildDealerRound({
  target,
  manifest,
  catalog,
  refsEn,
  mode = 'normal',
  simulate = null,
  moduleFallbacks = {},
  weaponUpgradeGroups = null,
  weaponGroups = null,
} = {}) {
  const ship = (catalog || []).find((entry) => Number(entry.id) === Number(target.shipId));
  if (!ship) throw new Error('target hull missing from catalog');
  const simulated = simulate ? await simulate(ship, target) : {};
  const built = buildClues({
    ship,
    catalog,
    refs: refsEn,
    stats: null,
    losses: [target.killmail],
    dateKey: `mp:${target.killId}`,
    dataVersion: manifest?.clueVersion || 'mp',
    targetKillId: target.killId,
    mode,
    fittedAttrs: simulated.fittedAttrs || null,
    baselineAttrs: simulated.baselineAttrs || null,
    moduleFallbacks,
    weaponUpgradeGroups: weaponUpgradeGroups || manifest?.weaponUpgradeGroups || null,
    weaponGroups: weaponGroups || manifest?.weaponGroups || null,
  });
  const clues = built.clues.map((clue, index) => {
    const entry = ship.bonusEntries?.[clue.v];
    const text = clue.k === 'bonus' && entry?.text ? entry.text : null;
    return { ...clue, i: index, ...(text ? { text } : {}) };
  });
  return { ...target, ship, clues };
}
