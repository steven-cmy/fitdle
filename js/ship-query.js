import { normalizeText, searchShips } from './game.js';

/**
 * The hull a typed guess stands for. Full names win; an abbreviation, alias or
 * partial name is only used when it leaves exactly one hull. `ambiguous` asks the
 * player to choose; a selected hull keeps a name that several hulls share.
 */
export function resolveShipQuery(index, query, { exclude = new Set(), selectedId = null } = {}) {
  const text = normalizeText(query);
  if (!text) return { ship: null, ambiguous: false };
  const named = index.filter((entry) => entry.names.includes(text));
  if (named.length) {
    const entry = named.find((item) => item.ship.id === selectedId) || named[0];
    return { ship: entry.ship, ambiguous: false };
  }
  const short = index
    .filter((entry) => entry.acronyms.includes(text) || entry.nameAliases.includes(text))
    .map((entry) => entry.ship);
  const matches = short.length ? short : searchShips(index, query, { exclude, limit: 2 });
  const open = matches.filter((ship) => !exclude.has(ship.id));
  if (open.length > 1) return { ship: null, ambiguous: true };
  // An abbreviation of one already guessed hull still names that hull.
  return { ship: open[0] || (matches.length === 1 ? matches[0] : null), ambiguous: false };
}
