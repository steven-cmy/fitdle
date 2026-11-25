/** Drop the attacker lists, which no part of the game uses, from zKillboard killmails. */
export function slimKillmails(data) {
  if (!Array.isArray(data)) return data;
  for (const entry of data) if (entry && typeof entry === 'object') delete entry.attackers;
  return data;
}
