import crypto from 'node:crypto';
import {
  chooseClosestKill,
  freeKillIdFromToken,
  lastCompleteMonthEnd,
  pickWeightedKillByRecency,
  sampleTargetTime,
  killHasFittedModules,
  weightedRendezvousOrder,
} from '../../js/game.js';
import { config } from './config.mjs';
import { now, statement } from './db.mjs';
import { TtlCache } from './ttl-cache.mjs';

const PAGE_TTL_MS = 10 * 60 * 1000;
const KILL_TTL_MS = 60 * 60 * 1000;
const SAMPLE_SIZE = 5;
// Full loss pages (up to 200 killmails each) are only needed by the Daily scan.
const pageCache = new TtlCache({ ttlMs: PAGE_TTL_MS, max: 32 });
// Random targets keep a few killmails per hull, so every hull fits.
const sampleCache = new TtlCache({ ttlMs: PAGE_TTL_MS, max: 1024 });
const killCache = new TtlCache({ ttlMs: KILL_TTL_MS, max: 512 });

export class TargetUnavailable extends Error {
  constructor(reason = 'target', message = reason) {
    super(message);
    this.name = 'TargetUnavailable';
    this.reason = reason;
  }
}

function zkillBase() {
  return String(config.manifest?.zkillboard?.baseUrl || 'https://zkillboard.com').replace(/\/$/, '');
}

async function requestJson(pathname) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${zkillBase()}${pathname}`, {
        headers: { Accept: 'application/json', 'User-Agent': config.userAgent },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const error = new Error(`zKill ${response.status}`);
        error.status = response.status;
        lastError = error;
        if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
          const retryAfter = Number(response.headers.get('retry-after')) || 0;
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 || 700 * (attempt + 1)));
          continue;
        }
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  throw new TargetUnavailable('zkill', lastError?.message || 'zKill unavailable');
}

export async function fetchKill(killId) {
  const id = Number(killId);
  if (!Number.isInteger(id) || id <= 0) throw new TargetUnavailable('kill', 'invalid kill id');
  return killCache.load(id, async () => {
    const payload = await requestJson(`/api/killID/${id}/`);
    const killmail = Array.isArray(payload) ? payload[0] : null;
    if (!killmail?.victim?.ship_type_id) throw new TargetUnavailable('kill', 'kill has no victim hull');
    return killmail;
  });
}

async function requestShipPage(shipId, page) {
  const payload = await requestJson(`/api/losses/shipTypeID/${Number(shipId)}/page/${Number(page)}/`);
  if (!Array.isArray(payload)) throw new TargetUnavailable('zkill', 'invalid loss page');
  return payload;
}

async function fetchShipPage(shipId, page) {
  return pageCache.load(`${shipId}:${page}`, () => requestShipPage(shipId, page));
}

/** Uniform draw without replacement. */
function sample(list, size) {
  const pool = [...list];
  const picked = [];
  while (picked.length < size && pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool[index]);
    pool[index] = pool[pool.length - 1];
    pool.pop();
  }
  return picked;
}

/**
 * Take one random killmail from a hull's latest loss page. The page already
 * carries complete killmails, so no per-kill request is needed. Returns null
 * when the page has no eligible killmail.
 */
async function takeRandomKill(shipId, allowEmpty) {
  for (let round = 0; round < 2; round++) {
    const entry = await sampleCache.load(shipId, async () => {
      const page = await requestShipPage(shipId, 1);
      const any = page.filter((kill) => Number(kill?.victim?.ship_type_id) === shipId
        && Number(kill?.killmail_id) > 0);
      const fitted = any.filter(killHasFittedModules);
      return {
        any: sample(any, SAMPLE_SIZE),
        fitted: sample(fitted, SAMPLE_SIZE),
        hasAny: any.length > 0,
        hasFitted: fitted.length > 0,
      };
    });
    if (!(allowEmpty ? entry.hasAny : entry.hasFitted)) return null;
    const killmail = (allowEmpty ? entry.any : entry.fitted).pop();
    if (killmail) return killmail;
    // Every sampled killmail was used: draw a new sample.
    sampleCache.delete(shipId, entry);
  }
  return null;
}

function seedNumber(day) {
  const secret = config.sessionSecret || 'fitdle-development-secret';
  const digest = crypto.createHmac('sha256', secret)
    .update(`fitdle:online:daily:${day}:${config.algorithmVersion}`)
    .digest('hex');
  return Number.parseInt(digest.slice(0, 13), 16);
}

function earliestDate() {
  return String(config.manifest?.kbSelectionStartDate || '');
}

function halfLifeDays() {
  const value = Number(config.manifest?.kbRecencyHalfLifeDays);
  return Number.isFinite(value) && value > 0 ? value : 365;
}

function maxScanPages() {
  const value = Number(config.manifest?.kbMaxScanPages);
  return Number.isInteger(value) && value > 0 ? Math.min(100, value) : 20;
}

async function dailyKillForShip(shipId, seed, day) {
  const latestDate = lastCompleteMonthEnd(day);
  if (!latestDate) return null;
  const earliest = earliestDate();
  if (earliest && earliest > latestDate) return null;
  const targetTime = sampleTargetTime(String(seed), shipId, earliest, latestDate, halfLifeDays());
  if (!Number.isFinite(targetTime)) return null;
  const loaded = [];
  let targetPage = null;
  for (let page = 1; page <= maxScanPages(); page++) {
    const data = await fetchShipPage(shipId, page);
    if (!data.length) break;
    loaded.push(...data);
    const oldest = Date.parse(String(data[data.length - 1]?.killmail_time || ''));
    if (data.length < 200 || !Number.isFinite(oldest) || oldest <= targetTime) {
      targetPage = data;
      break;
    }
  }
  if (!loaded.length) return null;
  if (targetPage) {
    const chosen = chooseClosestKill(targetPage, shipId, targetTime, earliest, latestDate, {
      allowEmpty: true,
      seed: String(seed),
    });
    if (chosen) return chosen;
  }
  return pickWeightedKillByRecency(loaded, String(seed), shipId, latestDate, halfLifeDays(), {
    allowEmpty: true,
    earliestDate: earliest,
  });
}

async function createDailyPin(day) {
  const seed = seedNumber(day);
  const ships = weightedRendezvousOrder(config.manifest?.normalShipPool || [], `${seed}:daily:ships`);
  const known = new Set(config.catalogShips.map((ship) => Number(ship.id)));
  for (const shipId of ships) {
    if (!known.has(Number(shipId))) continue;
    let killmail = null;
    try {
      killmail = await dailyKillForShip(Number(shipId), seed, day);
    } catch (error) {
      throw error instanceof TargetUnavailable ? error : new TargetUnavailable('daily', error?.message);
    }
    if (!killmail) continue;
    const pin = {
      day,
      algorithmVersion: config.algorithmVersion,
      dataVersion: String(config.manifest?.dataVersion || ''),
      seed: String(seed),
      shipId: Number(shipId),
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
  throw new TargetUnavailable('daily', 'no daily target');
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

export function loadDailyPin(day, fallback = null) {
  const row = statement('SELECT * FROM daily_pins WHERE day = ?').get(day);
  if (!row) return fallback;
  let killmail = fallback?.killmail;
  if (!killmail) {
    try {
      killmail = JSON.parse(row.killmail_json);
    } catch {
      killmail = null;
    }
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

// Ready-made random targets per pool, filled only after that pool was used.
const spares = new Map();

function refillSpares(shelf, pick) {
  while (shelf.ready.length + shelf.pending < config.targetSpares) {
    shelf.pending += 1;
    pick()
      .then((target) => shelf.ready.push({ at: Date.now(), target }))
      // The next request refills again; nothing retries while nobody plays.
      .catch(() => {})
      .finally(() => { shelf.pending -= 1; });
  }
}

/**
 * Random target for one run or room round. Spares are drawn by the same rules
 * ahead of time, handed out once, and never change what can be picked.
 */
export async function getRandomTarget(gameplay, { allowEmpty = true } = {}) {
  const pick = () => pickRandomTarget(gameplay, allowEmpty);
  const key = `${gameplay === 'audit' ? 'audit' : 'normal'}:${allowEmpty}`;
  if (!spares.has(key)) spares.set(key, { ready: [], pending: 0 });
  const shelf = spares.get(key);
  while (shelf.ready.length && Date.now() - shelf.ready[0].at >= KILL_TTL_MS) shelf.ready.shift();
  // Refill only after a success, so an upstream outage is not multiplied.
  const target = shelf.ready.shift()?.target || await pick();
  refillSpares(shelf, pick);
  return target;
}

async function pickRandomTarget(gameplay, allowEmpty) {
  const pool = gameplay === 'audit'
    ? (config.manifest?.auditKillShipPool || config.manifest?.killShipPool || [])
    : (config.manifest?.normalShipPool || config.manifest?.killShipPool || []);
  const ships = (Array.isArray(pool) ? pool : []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!ships.length) throw new TargetUnavailable('random', 'no eligible hull pool');
  const deadline = Date.now() + 25000;
  const tried = new Set();
  for (let attempt = 0; attempt < 6 && Date.now() < deadline; attempt++) {
    let shipId = ships[Math.floor(Math.random() * ships.length)];
    if (tried.has(shipId) && tried.size < ships.length) {
      shipId = ships.find((id) => !tried.has(id)) || shipId;
    }
    tried.add(shipId);
    try {
      const killmail = await takeRandomKill(shipId, allowEmpty);
      if (killmail) return { shipId, killId: Number(killmail.killmail_id), killmail };
    } catch {
      // Try another hull.
    }
  }
  throw new TargetUnavailable('random', 'no usable killmail');
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
  const killmail = await fetchKill(killId);
  return {
    shipId: Number(killmail.victim.ship_type_id),
    killId,
    killmail,
  };
}

export function pruneTargetCaches() {
  pageCache.prune();
  sampleCache.prune();
  killCache.prune();
}

