/**
 * Pure Fitdle game logic. No DOM access here so the rules can be unit-tested.
 */

export const ATTEMPT_LIMIT = 6;
export const INITIAL_REVEAL = 3;
export const REVEAL_PER_MISS = 6;
export const CLUE_REVEAL_STOPS = [3, 9, 15, 21, 27, 33];
export const DOWNTIME_HOUR_UTC = 11;

/** Number of dossier fragments visible after N incorrect acquisitions. */
export function revealCountFor(misses, totalClues, mode = 'normal') {
  const safeMisses = Math.max(0, misses);
  const count = mode === 'audit'
    ? INITIAL_REVEAL + (safeMisses * (safeMisses + 1)) / 2 + safeMisses
    : INITIAL_REVEAL + safeMisses * REVEAL_PER_MISS;
  return Math.min(totalClues, count);
}

/** Number of new fragments a miss unlocks (for the toast). */
export function newlyRevealedFor(misses, totalClues, mode = 'normal') {
  const before = revealCountFor(misses - 1, totalClues, mode);
  const after = revealCountFor(misses, totalClues, mode);
  return Math.max(0, after - before);
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Game day runs from the configured UTC boundary (minutes) to the next. */
export function gameDateKey(date = new Date(), resetMinutesUtc = DOWNTIME_HOUR_UTC * 60) {
  const shifted = new Date(date.getTime() - Number(resetMinutesUtc) * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function msUntilNextDowntime(now = new Date(), resetMinutesUtc = DOWNTIME_HOUR_UTC * 60) {
  const minutes = Number(resetMinutesUtc);
  let next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0
  );
  if (next <= now.getTime()) next += 24 * 60 * 60 * 1000;
  return Math.max(0, next - now.getTime());
}

export function modeFromLocation(search = '') {
  const params = new URLSearchParams(search);
  const claim = params.get('claim');
  if (claim === 'audit') return 'audit';
  if (claim === 'timed' || claim === 'standard' || claim === 'daily') return 'normal';
  const rule = params.get('rule');
  if (rule === 'audit') return 'audit';
  if (rule === 'timed' || rule === 'standard') return 'normal';
  return 'normal';
}

export function shiftDateKey(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function lastCompleteMonth(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function shiftMonth(year, month, by = 0) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1 + Number(by || 0), 1, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Last day of the most recent completed calendar month. */
export function lastCompleteMonthEnd(dateKey) {
  const last = lastCompleteMonth(dateKey);
  if (!last) return null;
  const next = shiftMonth(last.year, last.month, 1);
  return new Date(Date.UTC(next.year, next.month - 1, 0, 12)).toISOString().slice(0, 10);
}

export function killOnOrAfter(kill, earliestDate) {
  if (!earliestDate) return true;
  return String(kill?.killmail_time || '') >= `${earliestDate}T00:00:00Z`;
}

function killOnOrBefore(kill, latestDate) {
  if (!latestDate) return true;
  return String(kill?.killmail_time || '').slice(0, 10) <= latestDate;
}

/**
 * Weighted rendezvous over a pool where repeated IDs are weights. Every copy
 * gets an independent integer hash; the highest score wins, with ship ID as
 * the deterministic tie-break. No floating-point weights or array ordering.
 */
export function pickWeightedRendezvous(pool, seed, salt = 0x2f6e2b1) {
  if (!Array.isArray(pool) || !pool.length) return null;
  const counts = new Map();
  for (const raw of pool) {
    const id = Number(raw);
    if (!Number.isFinite(id)) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  let bestId = null;
  let bestScore = -1;
  for (const [id, count] of counts) {
    for (let copy = 0; copy < count; copy++) {
      const score = cyrb53(`${seed}:ship:${id}:${copy}`, salt);
      if (score > bestScore || (score === bestScore && (bestId == null || id < bestId))) {
        bestScore = score;
        bestId = id;
      }
    }
  }
  return bestId;
}

export function weightedRendezvousOrder(pool, seed, salt = 0x2f6e2b1) {
  if (!Array.isArray(pool) || !pool.length) return [];
  const counts = new Map();
  for (const raw of pool) {
    const id = Number(raw);
    if (!Number.isFinite(id)) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const scored = [];
  for (const [id, count] of counts) {
    let bestScore = -1;
    for (let copy = 0; copy < count; copy++) {
      const score = cyrb53(`${seed}:ship:${id}:${copy}`, salt);
      if (score > bestScore) bestScore = score;
    }
    scored.push({ id, score: bestScore });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score > b.score ? -1 : 1;
    return a.id - b.id;
  });
  return scored.map((entry) => entry.id);
}

export function pickKillBySeed(candidates, seed, shipId, { allowEmpty = true, earliestDate = '', latestDate = '' } = {}) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  let best = null;
  let bestScore = -1;
  for (const kill of candidates) {
    if (!kill || Number(kill?.victim?.ship_type_id) !== Number(shipId)) continue;
    if (!killOnOrAfter(kill, earliestDate)) continue;
    if (!killOnOrBefore(kill, latestDate)) continue;
    if (!allowEmpty && !killHasFittedModules(kill)) continue;
    const killId = Number(kill.killmail_id);
    if (!Number.isFinite(killId)) continue;
    const score = cyrb53(`${seed}:kill:${killId}`, 0x4b1d5eed);
    if (score > bestScore || (score === bestScore && best && killId < Number(best.killmail_id))) {
      bestScore = score;
      best = kill;
    }
  }
  return best;
}

export function sampleTargetTime(seed, shipId, earliestDate, latestDate, halfLifeDays = 365) {
  const latest = Date.parse(`${latestDate}T12:00:00Z`);
  if (!Number.isFinite(latest)) return null;
  const earliest = Date.parse(`${earliestDate}T00:00:00Z`);
  if (!Number.isFinite(earliest) || earliest >= latest) return latest;
  const halfLife = Number(halfLifeDays) > 0 ? Number(halfLifeDays) : 365;
  const maxAgeDays = (latest - earliest) / 86400000;
  const lambda = Math.LN2 / halfLife;
  const u = (cyrb53(`${seed}:target-time:${shipId}`, 0x51ed270b) + 0.5) / 9007199254740992;
  const age = -Math.log(1 - u * (1 - Math.exp(-lambda * maxAgeDays))) / lambda;
  return Math.min(latest, Math.max(earliest, latest - age * 86400000));
}

function killTimeMs(kill) {
  const time = Date.parse(String(kill?.killmail_time || ''));
  return Number.isFinite(time) ? time : null;
}

function killInTargetRange(kill, shipId, earliestDate, latestDate, allowEmpty) {
  if (!kill || Number(kill?.victim?.ship_type_id) !== Number(shipId)) return false;
  if (!Number.isFinite(Number(kill.killmail_id))) return false;
  const date = String(kill?.killmail_time || '').slice(0, 10);
  if (!date) return false;
  if (earliestDate && date < earliestDate) return false;
  if (latestDate && date > latestDate) return false;
  if (!allowEmpty && !killHasFittedModules(kill)) return false;
  return true;
}

export function chooseClosestKill(records, shipId, targetTime, earliestDate, latestDate, { allowEmpty = true, seed = '' } = {}) {
  if (!Array.isArray(records) || !records.length || !Number.isFinite(targetTime)) return null;
  let best = null;
  let bestDistance = Infinity;
  let bestTie = -1;
  for (const kill of records) {
    if (!killInTargetRange(kill, shipId, earliestDate, latestDate, allowEmpty)) continue;
    const time = killTimeMs(kill);
    if (time == null) continue;
    const distance = Math.abs(time - targetTime);
    const tie = cyrb53(`${seed}:closest:${kill.killmail_id}`, 0x4b1d5eed);
    if (distance < bestDistance || (distance === bestDistance && tie > bestTie)) {
      best = kill;
      bestDistance = distance;
      bestTie = tie;
    }
  }
  return best;
}

export function pickWeightedKillByRecency(records, seed, shipId, latestDate, halfLifeDays = 365, { allowEmpty = true, earliestDate = '' } = {}) {
  if (!Array.isArray(records) || !records.length) return null;
  const latest = Date.parse(`${latestDate}T12:00:00Z`);
  if (!Number.isFinite(latest)) return null;
  const halfLife = Number(halfLifeDays) > 0 ? Number(halfLifeDays) : 365;
  const candidates = [];
  for (const kill of records) {
    if (!killInTargetRange(kill, shipId, earliestDate, latestDate, allowEmpty)) continue;
    const time = killTimeMs(kill);
    if (time == null) continue;
    const ageDays = Math.max(0, (latest - time) / 86400000);
    const weight = Math.max(1, Math.round(1000 * Math.pow(0.5, ageDays / halfLife)));
    candidates.push({ kill, weight });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => Number(a.kill.killmail_id) - Number(b.kill.killmail_id));
  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = cyrb53(`${seed}:recency:${shipId}`, 0x2f6e2b1) % total;
  for (const entry of candidates) {
    roll -= entry.weight;
    if (roll < 0) return entry.kill;
  }
  return candidates[candidates.length - 1].kill;
}

const FREE_KILL_SALT = 0x5bd1e995;

export function freeKillToken(id) {
  const value = Number(id) >>> 0;
  const mixed = (value ^ FREE_KILL_SALT) >>> 0;
  const check = (((mixed >>> 16) ^ mixed) & 0xffff).toString(36).slice(-2).padStart(2, '0');
  return `k${mixed.toString(36)}${check}`;
}

const CLAIM_KB_SALT = 0x6c61696d;

export function ycDateLabel(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '').trim());
  if (!match) return '';
  const year = Number(match[1]) - 1898;
  if (year < 0) return '';
  return `YC${year}.${match[2]}.${match[3]}`;
}

export function kbCaseHash(killId) {
  const id = Number(killId);
  if (!Number.isSafeInteger(id) || id <= 0) return '';
  return cyrb53(`fitdle:claim-kb:${id}`, CLAIM_KB_SALT)
    .toString(36)
    .toUpperCase()
    .padStart(8, '0')
    .slice(-8);
}

export function claimCaseNumber({ gameplay = 'standard', day = '', killId = null, killHash = '' } = {}) {
  const date = ycDateLabel(day) || 'YC000.00.00';
  const opaque = String(killHash || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 8)
    || kbCaseHash(killId)
    || 'OPEN';
  if (gameplay === 'daily') return `PI-${date}-${opaque}`;
  return `PI-${opaque}`;
}

export function freeKillIdFromToken(raw) {
  const value = String(raw || '').trim();
  const match = /^k([0-9a-z]+)([0-9a-z]{2})$/.exec(value);
  if (!match) return null;
  const mixed = Number.parseInt(match[1], 36) >>> 0;
  const check = (((mixed >>> 16) ^ mixed) & 0xffff).toString(36).slice(-2).padStart(2, '0');
  if (match[2] !== check) return null;
  return (mixed ^ FREE_KILL_SALT) >>> 0;
}

export function parseKillId(raw) {
  const value = String(raw || '').trim();
  if (/^\d+$/.test(value) && Number(value) > 0) return Number(value);
  const bare = value.match(/(?:zkillboard\.com\/)?(?:api\/)?kill(?:ID)?\/(\d+)/i);
  if (bare) return Number(bare[1]);
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/(?:kill|api\/killID)\/(\d+)\/?/i);
    if (match) return Number(match[1]);
    const query = url.searchParams.get('killID') || url.searchParams.get('killmail_id');
    if (query && /^\d+$/.test(query)) return Number(query);
  } catch {
    // not a URL
  }
  return null;
}

const FITTED_KILL_FLAGS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
  87, 92, 93, 94, 95, 96, 97, 98, 99,
  125, 126, 127, 128, 129, 130, 131, 132,
  158, 159, 160, 161,
]);

function itemHasQuantity(item) {
  const hasQuantity = item?.quantity_destroyed !== undefined
    || item?.quantity_dropped !== undefined;
  if (!hasQuantity) return true;
  return (Number(item.quantity_destroyed) || 0) + (Number(item.quantity_dropped) || 0) > 0;
}

export function victimIsWatched(victim, watchlist) {
  if (!victim || !watchlist) return false;
  const normalize = (values) => new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  const characterId = Number(victim.character_id);
  const corporationId = Number(victim.corporation_id);
  const allianceId = Number(victim.alliance_id);
  return normalize(watchlist.characters).has(characterId)
    || normalize(watchlist.corporations).has(corporationId)
    || normalize(watchlist.alliances).has(allianceId);
}

export function killHasFittedModules(killmail) {
  // Cargo (flag 5), spare fighter-bay contents (155) and zero-quantity records
  // do not make a hull non-empty.
  return (killmail?.victim?.items || []).some((item) => (
    FITTED_KILL_FLAGS.has(Number(item.flag)) && itemHasQuantity(item)
  ));
}

export function weightedHullOrder(pool, seed, limit = 8) {
  const counts = new Map();
  for (const id of pool || []) counts.set(Number(id), (counts.get(Number(id)) || 0) + 1);
  let state = cyrb53(String(seed || 'hulls'), 0x2f6e2b1);
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const order = [];
  while (order.length < Math.min(limit, counts.size)) {
    let total = 0;
    for (const weight of counts.values()) total += weight;
    let roll = random() * total;
    let picked = null;
    for (const [id, weight] of counts) {
      roll -= weight;
      if (roll <= 0) {
        picked = id;
        break;
      }
    }
    if (picked == null) picked = counts.keys().next().value;
    order.push(picked);
    counts.delete(picked);
  }
  return order;
}

export function msUntilNextUtcMidnight(now = new Date()) {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(0, next - now.getTime());
}

/**
 * cyrb53: a small, deterministic 53-bit string hash. The seed keeps the daily
 * selection independent from unrelated uses of the hash.
 */
export function cyrb53(input, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff]+/g, ' ')
    .trim();
}

function acronymsFor(value) {
  const words = normalizeText(value).split(' ').filter((word) => word && !/^\d+$/.test(word));
  if (words.length < 2) return [];
  const acronym = words.map((word) => word[0]).join('');
  return acronym.length >= 2 ? [acronym] : [];
}

function chineseNameAliases(value) {
  const match = /^(.+?)[级級](.+?)[型]$/.exec(String(value || ''));
  if (!match) return [];
  const base = match[1];
  const variant = match[2];
  const aliases = new Set();
  const maxVariant = Math.min(2, variant.length);
  const maxBase = Math.min(2, base.length);
  for (let vi = 1; vi <= maxVariant; vi++) {
    for (let bi = 1; bi <= maxBase; bi++) {
      const variantPart = variant.slice(0, vi);
      const basePart = base.slice(0, bi);
      if (variantPart.length + basePart.length >= 2) aliases.add(variantPart + basePart);
    }
  }
  aliases.add(variant + base);
  aliases.add(variant[0] + base);
  return [...aliases];
}

export function buildSearchIndex(catalog, groupNames = {}, { races = {}, factions = {}, locale = 'en', aliases = null } = {}) {
  const termsFor = (id, localizedName, aliasMap) => [...new Set([
    localizedName,
    ...(aliasMap?.[id] || []),
  ].map(normalizeText).filter(Boolean))];
  return catalog.map((ship) => {
    const names = [...new Set(Object.values(ship.names || {}).map(normalizeText).filter(Boolean))];
    const groupTerms = termsFor(ship.groupID, groupNames[ship.groupID] || '', aliases?.groups);
    const raceTerms = termsFor(ship.raceID, races[ship.raceID] || '', aliases?.races);
    const factionTerms = termsFor(ship.factionID, factions[ship.factionID] || '', aliases?.factions);
    const acronyms = [...new Set(names.flatMap(acronymsFor))];
    const groupAcronyms = [...new Set(groupTerms.flatMap(acronymsFor))];
    const nameAliases = [...new Set(names.flatMap(chineseNameAliases))];
    return {
      ship,
      names,
      group: groupTerms[0] || '',
      race: raceTerms[0] || '',
      faction: factionTerms[0] || '',
      groupTerms,
      raceTerms,
      factionTerms,
      acronyms,
      groupAcronyms,
      nameAliases,
      sortGroup: groupNames[ship.groupID] || '',
      sortRace: races[ship.raceID] || '',
      sortFaction: factions[ship.factionID] || '',
      sortName: ship.names?.[locale] || ship.names?.en || '',
      haystack: [...names, ...groupTerms, ...raceTerms, ...factionTerms, ...acronyms, ...groupAcronyms, ...nameAliases].join(' '),
    };
  });
}

export function searchShips(index, query, { exclude = new Set(), limit = 8 } = {}) {
  const q = normalizeText(query);
  if (!q) return [];
  const terms = q.split(' ').filter(Boolean);
  const results = [];
  for (const entry of index) {
    const ship = entry.ship;
    if (exclude.has(ship.id)) continue;
    if (!terms.every((term) => entry.haystack.includes(term))) continue;
    let score = 0;
    for (const name of entry.names) {
      if (name === q) score = Math.max(score, 120);
      else if (name.startsWith(q)) score = Math.max(score, 100 - Math.min(20, name.length - q.length));
      else if (name.includes(q)) score = Math.max(score, 70 - Math.min(15, name.indexOf(q)));
      else if (terms.every((term) => name.includes(term))) score = Math.max(score, 55);
    }
    if (entry.nameAliases.includes(q)) score = Math.max(score, 108);
    else if (entry.nameAliases.some((alias) => alias.startsWith(q))) score = Math.max(score, 92);
    if (entry.acronyms.includes(q)) score = Math.max(score, 65);
    else if (q.length >= 2 && entry.acronyms.some((acronym) => acronym.startsWith(q))) {
      score = Math.max(score, 62);
    }
    if (entry.groupAcronyms.includes(q)) score = Math.max(score, 60);
    else if (q.length >= 2 && entry.groupAcronyms.some((acronym) => acronym.startsWith(q))) {
      score = Math.max(score, 44);
    }
    if (entry.groupTerms.some((term) => term === q)) score = Math.max(score, 65);
    else if (entry.groupTerms.some((term) => term.startsWith(q))) score = Math.max(score, 45);
    if (entry.raceTerms.some((term) => term === q)) score = Math.max(score, 60);
    else if (entry.raceTerms.some((term) => term.startsWith(q))) score = Math.max(score, 40);
    if (entry.factionTerms.some((term) => term === q)) score = Math.max(score, 58);
    else if (entry.factionTerms.some((term) => term.startsWith(q))) score = Math.max(score, 38);
    if (score > 0) results.push({ ship, score, entry });
  }

  // Race + hull-class combinations such as "艾玛战列" or "CaldariBattleship".
  const raceTerms = [...new Set(index.flatMap((entry) => entry.raceTerms))];
  const groupTerms = [...new Set(index.flatMap((entry) => [...entry.groupTerms, ...entry.groupAcronyms]))];
  const findTerm = (list, value) => list.find((term) => term === value)
    || list.find((term) => value.length >= 2 && term.startsWith(value));
  let combination = null;
  for (const race of raceTerms) {
    if (!q.startsWith(race) || q.length <= race.length) continue;
    const rest = q.slice(race.length).trim();
    const group = findTerm(groupTerms, rest);
    if (group) { combination = { race, group }; break; }
  }
  if (combination) {
    const seen = new Set(results.map((result) => result.ship.id));
    for (const entry of index) {
      if (exclude.has(entry.ship.id) || seen.has(entry.ship.id)) continue;
      const raceOk = entry.raceTerms.includes(combination.race);
      const groupOk = entry.groupTerms.includes(combination.group)
        || entry.groupAcronyms.includes(combination.group);
      if (raceOk && groupOk) results.push({ ship: entry.ship, score: 90, entry });
    }
  }

  // Browse order: tech level → hull class/group → race → faction. Localized
  // names are used when available, numeric IDs are the stable fallback.
  results.sort((a, b) => (
    b.score - a.score
    || Number(a.ship.techLevel || 0) - Number(b.ship.techLevel || 0)
    || a.entry.sortGroup.localeCompare(b.entry.sortGroup)
    || Number(a.ship.groupID || 0) - Number(b.ship.groupID || 0)
    || a.entry.sortRace.localeCompare(b.entry.sortRace)
    || Number(a.ship.raceID || 0) - Number(b.ship.raceID || 0)
    || a.entry.sortFaction.localeCompare(b.entry.sortFaction)
    || Number(a.ship.factionID || 0) - Number(b.ship.factionID || 0)
    || a.entry.sortName.localeCompare(b.entry.sortName)
    || a.ship.id - b.ship.id
  ));
  return results.slice(0, limit).map((r) => r.ship);
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

function closeness(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  return Math.exp(-Math.abs(Math.log(a / b)) * 1.7);
}

/**
 * Aggregate, spoiler-free profile similarity between a guess and the answer.
 * Individual values are never exposed; only the aggregate percentage is shown.
 */
export function profileSimilarity(guess, answer) {
  if (!guess || !answer) return 0;
  if (guess.id === answer.id) return 100;
  let earned = 0;
  let possible = 0;
  const add = (weight, ratio) => {
    possible += weight;
    earned += weight * Math.max(0, Math.min(1, ratio));
  };

  add(18, guess.groupID === answer.groupID ? 1 : 0);
  add(8, guess.raceID === answer.raceID ? 1 : 0);
  add(4, guess.factionID && guess.factionID === answer.factionID ? 1 : 0);
  const techDiff = Math.abs((guess.techLevel || 0) - (answer.techLevel || 0));
  add(6, techDiff === 0 ? 1 : techDiff <= 1 ? 0.45 : 0);

  const g = guess.attrs || {};
  const a = answer.attrs || {};
  const slotKeys = ['hi', 'med', 'low', 'rig'];
  const slotDiff = slotKeys.reduce((sum, key) => sum + Math.abs((g[key] || 0) - (a[key] || 0)), 0);
  const slotTotal = Math.max(1, slotKeys.reduce((sum, key) => sum + (a[key] || 0), 0));
  add(18, 1 - Math.min(1, slotDiff / slotTotal));
  const hardpointDiff = Math.abs((g.turret || 0) - (a.turret || 0)) + Math.abs((g.launcher || 0) - (a.launcher || 0));
  add(8, 1 - Math.min(1, hardpointDiff / Math.max(1, (a.turret || 0) + (a.launcher || 0))));
  add(12, closeness(g.speed, a.speed));
  add(12, closeness(g.sig, a.sig));
  add(5, closeness((g.droneBandwidth || 0) + 1, (a.droneBandwidth || 0) + 1));
  add(8, closeness((g.shield || 0) + (g.armor || 0) + 1, (a.shield || 0) + (a.armor || 0) + 1));
  add(4, closeness(g.mass, a.mass));

  const score = possible ? (earned / possible) * 100 : 0;
  return Math.min(97, Math.max(1, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Results and sharing
// ---------------------------------------------------------------------------

export function resultGrid(status, attempts, limit = ATTEMPT_LIMIT) {
  const used = Math.min(limit, Math.max(0, attempts));
  if (status === 'won') {
    return '🟧'.repeat(Math.max(0, used - 1)) + '🟩' + '⬛'.repeat(Math.max(0, limit - used));
  }
  return '🟧'.repeat(used) + '⬛'.repeat(Math.max(0, limit - used));
}

export function shareText({ date, status, attempts, url, t }) {
  const grid = resultGrid(status, attempts);
  const headline = status === 'won'
    ? t('end.shareScore', { date, score: attempts })
    : t('end.shareLoss', { date });
  return `${headline}\n${grid}\n${url}`;
}

export function shareUrl(locationLike, killId, mode = 'normal', status = 'playing', attempts = 0, locale = 'en', timed = false, free = false, elapsedSeconds = 0) {
  // A localized static page carries the Open Graph metadata used by Discord
  // and other link previews. The page itself redirects into the puzzle.
  const url = new URL(locationLike.href);
  const language = String(locale || 'en').toLowerCase().split(/[-_]/)[0];
  const safeLocale = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh'].includes(language) ? language : 'en';
  const rule = timed ? 'timed' : mode === 'audit' ? 'audit' : 'standard';
  url.search = '';
  url.hash = '';
  if (timed) {
    url.pathname = new URL(`share/timed/${safeLocale}.html`, url).pathname;
    url.searchParams.set('t', String(Math.max(0, Math.round(Number(elapsedSeconds) || 0))));
    if (free && Number(killId)) url.searchParams.set('kb', freeKillToken(killId));
    url.searchParams.set('rule', 'timed');
    return url.toString();
  }
  if (free) {
    url.pathname = new URL(`share/free/${safeLocale}.html`, url).pathname;
    if (Number(killId)) url.searchParams.set('kb', freeKillToken(killId));
    if (rule !== 'standard') url.searchParams.set('rule', rule);
    return url.toString();
  }
  const key = status === 'lost' ? 'lost' : String(Math.max(1, Math.min(6, Number(attempts) || 1)));
  url.pathname = new URL(`share/${key}/${safeLocale}.html`, url).pathname;
  if (rule !== 'standard') url.searchParams.set('rule', rule);
  return url.toString();
}

export function buildGuessResult(guess, answer, attempt) {
  if (guess.id === answer.id) {
    return { kind: 'correct', attempt, similarity: 100 };
  }
  return { kind: 'wrong', attempt, similarity: profileSimilarity(guess, answer) };
}

export function loadState(storage, date, dataVersion, mode = 'normal', target = null) {
  try {
    const raw = storage.getItem(`fitdle:v1:state:${date}:${mode}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (target?.dailySeed) {
      if (!data.dailySeed || String(data.dailySeed) !== String(target.dailySeed)) {
        return { invalidated: true };
      }
    } else if (data.dataVersion !== dataVersion) {
      return { invalidated: true };
    }
    if (target?.answerKillId && data.answerKillId
      && Number(data.answerKillId) !== Number(target.answerKillId)) {
      return { invalidated: true };
    }
    if (!Array.isArray(data.guesses)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveState(storage, date, state, mode = 'normal') {
  try {
    storage.setItem(`fitdle:v1:state:${date}:${mode}`, JSON.stringify(state));
  } catch {
    // best effort only
  }
}

const STAT_MODES = ['standard', 'audit', 'timed'];

function normalizeStatMode(mode) {
  return mode === 'audit' ? 'audit' : mode === 'timed' ? 'timed' : 'standard';
}

function statCounts(value) {
  return Object.fromEntries(STAT_MODES.map((mode) => [mode, Math.max(0, Number(value?.[mode]) || 0)]));
}

export function emptyStats() {
  return {
    played: statCounts(),
    wins: statCounts(),
    streak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0],
    days: {},
    lastWinDate: null,
  };
}

function cloneStats(stats) {
  const next = emptyStats();
  next.played = statCounts(stats?.played);
  next.wins = statCounts(stats?.wins);
  next.streak = Math.max(0, Number(stats?.streak) || 0);
  next.maxStreak = Math.max(next.streak, Number(stats?.maxStreak) || 0);
  next.distribution = Array.isArray(stats?.distribution)
    ? stats.distribution.slice(0, 6).map((value) => Math.max(0, Number(value) || 0))
    : [0, 0, 0, 0, 0, 0];
  while (next.distribution.length < 6) next.distribution.push(0);
  next.days = stats?.days && typeof stats.days === 'object' ? { ...stats.days } : {};
  next.lastWinDate = typeof stats?.lastWinDate === 'string' ? stats.lastWinDate : null;
  return next;
}

export function loadStats(storage) {
  try {
    const raw = storage.getItem('fitdle:v1:stats');
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed) return emptyStats();
    // Pre-v1 aggregate stats are discarded, never migrated.
    if (typeof parsed.played === 'number' || typeof parsed.wins === 'number') {
      return emptyStats();
    }
    return cloneStats(parsed);
  } catch {
    return emptyStats();
  }
}

export function settleStats(stats, today) {
  const next = cloneStats(stats);
  const yesterday = shiftDateKey(today, -1);
  if (!next.lastWinDate || next.lastWinDate < yesterday) next.streak = 0;
  return next;
}

export function saveStats(storage, stats) {
  try {
    storage.setItem('fitdle:v1:stats', JSON.stringify(stats));
  } catch {
    // best effort only
  }
}

/** Count a daily gameplay attempt when it actually starts. */
export function recordPlay(storage, stats, { date, mode = 'standard', isToday }) {
  if (!isToday) return stats;
  const modeKey = normalizeStatMode(mode);
  const next = cloneStats(stats);
  const day = { ...(next.days[date] || {}) };
  if (day[modeKey]) return stats;
  day[modeKey] = 'playing';
  next.days[date] = day;
  next.played[modeKey] += 1;
  saveStats(storage, next);
  return next;
}

/** Record a completed daily gameplay result. Free modes are not recorded. */
export function formatMass(value, unit = 't', tonnesLabel = 't') {
  const kg = Math.max(0, Number(value) || 0);
  if (unit === 'kg') {
    return {
      value: String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
      unit: 'kg',
    };
  }
  const text = (kg / 1000).toFixed(3).replace(/\.?0+$/, '');
  const [whole, fraction] = text.split('.');
  return {
    value: `${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${fraction ? `.${fraction}` : ''}`,
    unit: tonnesLabel,
  };
}

/** Record a completed daily gameplay result. Free modes are not recorded. */
export function recordResult(storage, stats, { date, status, attempts, isToday, mode = 'standard' }) {
  if (!isToday) return stats;
  const modeKey = normalizeStatMode(mode);
  const next = cloneStats(stats);
  const yesterday = shiftDateKey(date, -1);
  if (!next.lastWinDate || next.lastWinDate < yesterday) next.streak = 0;
  const day = { ...(next.days[date] || {}) };
  const previous = day[modeKey];
  if (!previous) {
    day[modeKey] = 'playing';
    next.played[modeKey] += 1;
  }
  if (status === 'won') {
    if (previous !== 'won') next.wins[modeKey] += 1;
    const alreadyWonToday = previous === 'won'
      || Object.entries(day).some(([key, value]) => key !== modeKey && value === 'won');
    day[modeKey] = 'won';
    next.days[date] = day;
    if (!alreadyWonToday) {
      next.streak = next.lastWinDate === yesterday ? next.streak + 1 : 1;
      next.lastWinDate = date;
      next.maxStreak = Math.max(next.maxStreak || 0, next.streak);
    }
    if (previous !== 'won') {
      const index = Math.max(0, Math.min(5, Number(attempts) - 1 || 0));
      next.distribution[index] += 1;
    }
  } else {
    day[modeKey] = 'lost';
    next.days[date] = day;
    if (STAT_MODES.every((key) => day[key] === 'lost')) next.streak = 0;
  }
  saveStats(storage, next);
  return next;
}
