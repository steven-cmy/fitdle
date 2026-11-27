import crypto from 'node:crypto';
import {
  freeKillIdFromToken,
  killHasFittedModules,
  lastCompleteMonthEnd,
  utcDateKey,
} from '../../js/game.js';
import { config } from './config.mjs';
import { now, statement } from './db.mjs';
import {
  eligibleKills,
  fallbackMonths,
  makeRng,
  monthCandidates,
  pageCount,
  pickWeighted,
  shipWeights,
  weightedShipOrder,
} from './selection.mjs';
import { zkill } from './zkill.mjs';

/** Hulls tried per pick, and requests per hull, before the pick gives up. */
const MAX_SHIPS_PER_PICK = 12;
const MAX_REQUESTS_PER_SHIP = 3;
const PICK_DEADLINE_MS = 25_000;

export class TargetUnavailable extends Error {
  constructor(reason = 'target', message = reason) {
    super(message);
    this.name = 'TargetUnavailable';
    this.reason = reason;
  }
}

async function requestJson(pathname) {
  try {
    return await zkill.get(pathname);
  } catch (error) {
    throw new TargetUnavailable('zkill', error?.message || 'zKill unavailable');
  }
}

export async function fetchKill(killId) {
  const id = Number(killId);
  if (!Number.isInteger(id) || id <= 0) throw new TargetUnavailable('kill', 'invalid kill id');
  const { data } = await requestJson(`/api/killID/${id}/`);
  const killmail = Array.isArray(data) ? data[0] : null;
  if (!killmail?.victim?.ship_type_id) throw new TargetUnavailable('kill', 'kill has no victim hull');
  return killmail;
}

/** Spaces the requests of background work; live picks never wait on it. */
class Gate {
  constructor() {
    this.next = 0;
  }

  async take(intervalMs) {
    const start = Math.max(Date.now(), this.next);
    this.next = start + intervalMs;
    const wait = start - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

const refillGate = new Gate();

function earliestDate() {
  return String(config.manifest?.kbSelectionStartDate || '');
}

function halfLifeDays() {
  const value = Number(config.manifest?.kbRecencyHalfLifeDays);
  return Number.isFinite(value) && value > 0 ? value : 365;
}

// ---------------------------------------------------------------- hull queue

const weightCache = { day: '', usage: null, weights: null };

/** Weight of every playable hull for today's usage window. */
export function currentWeights(day = utcDateKey()) {
  // A newly adopted usage file is a new object, so it is picked up here.
  if (weightCache.day !== day || weightCache.usage !== config.shipUsage || !weightCache.weights) {
    weightCache.day = day;
    weightCache.usage = config.shipUsage;
    weightCache.weights = shipWeights({
      ships: config.catalogShips,
      usage: config.shipUsage,
      day,
      windowMonths: config.usageWindowMonths,
      maxRatio: config.usageMaxRatio,
      groupFactors: config.groupFactors,
    });
  }
  return weightCache.weights;
}

// Hulls that had no usable killmail, remembered so the queue does not ask again.
const noKill = new Map();

const noKillKey = (shipId, allowEmpty) => `${shipId}:${allowEmpty ? 1 : 0}`;

function knownEmpty(shipId, allowEmpty) {
  const key = noKillKey(shipId, allowEmpty);
  const until = noKill.get(key);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  noKill.delete(key);
  return false;
}

// ---------------------------------------------------------- killmail of a hull

async function lossPage(shipId, month, page, background) {
  if (background) await refillGate.take(config.targetRefillIntervalMs);
  const pathname = `/api/losses/shipTypeID/${shipId}/year/${month.year}/month/${month.month}/page/${page}/`;
  const { data } = await requestJson(pathname);
  if (!Array.isArray(data)) throw new TargetUnavailable('zkill', 'invalid loss page');
  return data;
}

/**
 * One killmail of a hull: a month by time weight, a page of that month by its
 * loss count, then one eligible killmail of the page. A hull the usage file
 * cannot size (new in the SDE, or with no month in the file) reads the first
 * page of a recent month; the newest unfiltered page would be all of this
 * month, which is never eligible. Returns { kill, blocked }; blocked means
 * killmails were refused only because the room already used them.
 */
async function pickKillOfShip(shipId, { rng, allowEmpty, exclude, latestDate, background }) {
  const entry = config.shipUsage?.ships?.[String(shipId)];
  const filter = { earliestDate: earliestDate(), latestDate, allowEmpty, exclude };
  let blocked = false;
  let months = entry ? monthCandidates(entry, earliestDate(), latestDate, halfLifeDays()) : [];
  if (!months.length) months = fallbackMonths(earliestDate(), latestDate, halfLifeDays());
  for (let attempt = 0; attempt < MAX_REQUESTS_PER_SHIP && months.length; attempt += 1) {
    const month = pickWeighted(months, rng);
    months.splice(months.indexOf(month), 1);
    const pages = pageCount(month.losses);
    const page = 1 + Math.floor(rng() * pages);
    let data = await lossPage(shipId, month, page, background);
    // The loss count is a month old at most; an overshooting page starts over.
    if (!data.length && page > 1) data = await lossPage(shipId, month, 1, background);
    const result = eligibleKills(data, shipId, filter);
    blocked ||= result.blocked;
    if (result.kills.length) return { kill: result.kills[Math.floor(rng() * result.kills.length)], blocked };
  }
  return { kill: null, blocked };
}

/**
 * Walk the weighted hull queue from the top until one hull yields a killmail.
 * A hull without one is remembered for a while and the next hull is tried.
 */
async function pickFromQueue({ order, killSeed, allowEmpty, exclude = null, latestDate, background = false }) {
  const deadline = Date.now() + PICK_DEADLINE_MS;
  let tried = 0;
  for (const shipId of order) {
    if (tried >= MAX_SHIPS_PER_PICK || Date.now() > deadline) break;
    if (knownEmpty(shipId, allowEmpty)) continue;
    tried += 1;
    const { kill, blocked } = await pickKillOfShip(shipId, {
      rng: makeRng(`${killSeed}:${shipId}`),
      allowEmpty,
      exclude,
      latestDate,
      background,
    });
    if (kill) return { shipId, killmail: kill };
    if (!blocked) noKill.set(noKillKey(shipId, allowEmpty), Date.now() + config.noKillRetryMs);
  }
  return null;
}

function latestTargetDate(day = utcDateKey()) {
  const latest = lastCompleteMonthEnd(day);
  const earliest = earliestDate();
  if (!latest || (earliest && earliest > latest)) throw new TargetUnavailable('random', 'no selectable period');
  return latest;
}

// ---------------------------------------------------------------- daily target

function seedNumber(day) {
  const secret = config.sessionSecret || 'fitdle-development-secret'; // config generates a private one when none is set
  const digest = crypto.createHmac('sha256', secret)
    .update(`fitdle:online:daily:${day}:${config.algorithmVersion}`)
    .digest('hex');
  return Number.parseInt(digest.slice(0, 13), 16);
}

async function createDailyPin(day) {
  const seed = seedNumber(day);
  const picked = await pickFromQueue({
    order: weightedShipOrder(currentWeights(day), `${seed}:daily`),
    killSeed: `${seed}:daily:kill`,
    allowEmpty: config.dailyAllowEmpty,
    latestDate: latestTargetDate(day),
  });
  if (!picked) throw new TargetUnavailable('daily', 'no daily target');
  const { shipId, killmail } = picked;
  const pin = {
    day,
    algorithmVersion: config.algorithmVersion,
    dataVersion: String(config.manifest?.dataVersion || ''),
    seed: String(seed),
    shipId,
    killId: Number(killmail.killmail_id),
    killHash: String(killmail?.zkb?.hash || ''),
    killmail,
    createdAt: now(),
  };
  statement(`INSERT INTO daily_pins(day, algorithm_version, data_version, seed, ship_id, kill_id, kill_hash, killmail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day) DO NOTHING`)
    .run(pin.day, pin.algorithmVersion, pin.dataVersion, pin.seed, pin.shipId, pin.killId, pin.killHash, JSON.stringify(pin.killmail), pin.createdAt);
  return loadDailyPin(day, pin);
}

const dailyLocks = new Map();

export async function getDailyTarget(day) {
  const existing = loadDailyPin(day);
  if (existing) return existing;
  if (dailyLocks.has(day)) return dailyLocks.get(day);
  const promise = createDailyPin(day).finally(() => dailyLocks.delete(day));
  dailyLocks.set(day, promise);
  return promise;
}

/** The stored pin of a day; a row that is already there always wins over `fallback`. */
export function loadDailyPin(day, fallback = null) {
  const row = statement('SELECT * FROM daily_pins WHERE day = ?').get(day);
  if (!row) return fallback;
  let killmail;
  try {
    killmail = JSON.parse(row.killmail_json);
  } catch {
    killmail = null;
  }
  if (!killmail) return fallback;
  return {
    day: row.day,
    algorithmVersion: row.algorithm_version,
    dataVersion: row.data_version,
    seed: row.seed,
    shipId: Number(row.ship_id),
    killId: Number(row.kill_id),
    killHash: row.kill_hash || '',
    killmail,
    createdAt: Number(row.created_at),
  };
}

// ------------------------------------------------------------- random targets

/** A fresh pick by the shared rules; the hull queue is shuffled by a random seed. */
async function pickRandomTarget({ allowEmpty, exclude, background = false }) {
  const seed = crypto.randomBytes(12).toString('hex');
  const picked = await pickFromQueue({
    order: weightedShipOrder(currentWeights(), seed),
    killSeed: `${seed}:kill`,
    allowEmpty,
    exclude,
    latestDate: latestTargetDate(),
    background,
  });
  if (!picked) throw new TargetUnavailable('random', 'no usable killmail');
  return { shipId: picked.shipId, killId: Number(picked.killmail.killmail_id), killmail: picked.killmail };
}

// Prepared targets live in SQLite: each is handed out once, none lives past its
// TTL, and a restart keeps them.
const shelfState = { filling: false };

function shelfCount() {
  return Number(statement('SELECT COUNT(*) AS n FROM target_shelf WHERE created_at > ?')
    .get(Date.now() - config.targetShelfTtlMs).n);
}

function takeFromShelf(allowEmpty, exclude) {
  const rows = statement(`SELECT id, ship_id, kill_id, killmail_json FROM target_shelf
    WHERE created_at > ? ${allowEmpty ? '' : 'AND has_fit = 1'} ORDER BY id LIMIT 60`)
    .all(Date.now() - config.targetShelfTtlMs);
  for (const row of rows) {
    if (exclude?.has(Number(row.kill_id))) continue;
    // Another caller may have taken the row meanwhile.
    if (!statement('DELETE FROM target_shelf WHERE id = ?').run(row.id).changes) continue;
    try {
      return { shipId: Number(row.ship_id), killId: Number(row.kill_id), killmail: JSON.parse(row.killmail_json) };
    } catch {
      // A damaged row is dropped.
    }
  }
  return null;
}

/** Below half full, fill up in the background, paced by the shared request gate. */
function refillShelf() {
  const size = config.targetShelfSize;
  if (!size || shelfState.filling || shelfCount() >= size / 2) return;
  shelfState.filling = true;
  (async () => {
    // A killmail already on the shelf is skipped; the guard bounds a small history.
    for (let attempts = 0; shelfCount() < size && attempts < size * 3; attempts += 1) {
      const target = await pickRandomTarget({ allowEmpty: true, exclude: null, background: true });
      if (statement('SELECT 1 FROM target_shelf WHERE kill_id = ?').get(target.killId)) continue;
      statement(`INSERT INTO target_shelf(ship_id, kill_id, has_fit, killmail_json, created_at)
        VALUES (?, ?, ?, ?, ?)`)
        .run(target.shipId, target.killId, killHasFittedModules(target.killmail) ? 1 : 0, JSON.stringify(target.killmail), Date.now());
    }
  })()
    // Nothing retries while nobody plays; the next hand-out starts it again.
    .catch(() => {})
    .finally(() => { shelfState.filling = false; });
}

/**
 * Random target for one run or room round, by the same rules as the Daily.
 * `excludeKillIds` are killmails a room already played. The shelf is tried
 * first; when it has nothing suitable the target is picked at once.
 */
export async function getRandomTarget(gameplay, { allowEmpty = true, excludeKillIds = null } = {}) {
  const exclude = excludeKillIds?.size ? excludeKillIds : null;
  const prepared = config.targetShelfSize ? takeFromShelf(allowEmpty, exclude) : null;
  const target = prepared || await pickRandomTarget({ allowEmpty, exclude });
  // Only after a success, so an upstream outage is not multiplied.
  refillShelf();
  return target;
}

/** A killmail this service already handed out; killmails never change. */
function storedKill(killId) {
  const row = statement('SELECT target_json FROM online_runs WHERE target_kill_id = ? ORDER BY started_at DESC LIMIT 1').get(killId);
  try {
    const killmail = JSON.parse(row?.target_json || 'null')?.killmail;
    return Number(killmail?.killmail_id) === killId && killmail.victim?.ship_type_id ? killmail : null;
  } catch {
    return null;
  }
}

export async function getCustomTarget(kb) {
  let killId = Number(kb);
  if (!Number.isInteger(killId) || killId <= 0) {
    try {
      killId = Number(freeKillIdFromToken(String(kb)));
    } catch {
      killId = 0;
    }
  }
  if (!Number.isInteger(killId) || killId <= 0) throw new TargetUnavailable('custom', 'invalid kb token');
  // Looking a killmail up by its number sometimes finds nothing upstream.
  const killmail = storedKill(killId) || await fetchKill(killId);
  return {
    shipId: Number(killmail.victim.ship_type_id),
    killId,
    killmail,
  };
}

export function pruneTargetCaches() {
  zkill.prune();
  const at = Date.now();
  for (const [key, until] of noKill) if (until <= at) noKill.delete(key);
  statement('DELETE FROM target_shelf WHERE created_at <= ?').run(at - config.targetShelfTtlMs);
}

/** Forget remembered hulls, weights and the shelf (tests and data reloads). */
export function resetTargets() {
  noKill.clear();
  weightCache.weights = null;
  statement('DELETE FROM target_shelf').run();
}

/** Resolves once a running shelf refill has stopped (tests). */
export async function shelfIdle() {
  while (shelfState.filling) await new Promise((resolve) => setTimeout(resolve, 5));
}
