/**
 * zKillboard target acquisition for multiplayer. There is deliberately no
 * static fallback: a round either starts from a real killmail or it fails.
 */
import { buildClues } from '../clues.js';
import { killHasFittedModules } from '../game.js';

export class KbUnavailableError extends Error {
  constructor(message = 'killboard unavailable', cause = null) {
    super(message);
    this.name = 'KbUnavailableError';
    this.source = 'zkill';
    this.cause = cause;
  }
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 12000;

function randomIndex(length) {
  if (length <= 1) return 0;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchZkill(manifest, path, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const base = String(manifest?.zkillboard?.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new KbUnavailableError('zKillboard base URL missing');
  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(`${base}${path}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after')) || 0;
        const error = new KbUnavailableError(`zKillboard HTTP ${response.status}`);
        error.status = response.status;
        error.retryable = response.status === 429 || response.status >= 500;
        lastError = error;
        if (attempt < MAX_ATTEMPTS - 1 && error.retryable) {
          await sleep(retryAfter * 1000 || 600 * (attempt + 1));
          continue;
        }
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error instanceof KbUnavailableError ? error : new KbUnavailableError('zKillboard request failed', error);
      if (attempt >= MAX_ATTEMPTS - 1 || lastError.retryable === false) break;
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastError || new KbUnavailableError();
}

export async function fetchKillmail(manifest, killId, options = {}) {
  const data = await fetchZkill(manifest, `/api/killID/${Number(killId)}/`, options);
  const killmail = Array.isArray(data) ? data[0] : null;
  if (!killmail?.victim?.ship_type_id) throw new KbUnavailableError('killmail missing victim hull');
  return killmail;
}

function hullPool(manifest, mode) {
  if (mode === 'audit') return manifest?.auditKillShipPool || manifest?.killShipPool || [];
  return manifest?.normalShipPool || manifest?.killShipPool || [];
}

export function pickHull(manifest, mode = 'standard', { usedShipIds = new Set() } = {}) {
  const pool = (hullPool(manifest, mode) || []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (!pool.length) throw new KbUnavailableError('no eligible hull pool');
  const candidates = [];
  const remaining = [];
  for (const id of pool) {
    if (usedShipIds.has(id)) continue;
    remaining.push(id);
  }
  for (const id of remaining.length ? remaining : pool) {
    if (!candidates.includes(id)) candidates.push(id);
  }
  return candidates[randomIndex(candidates.length)];
}

async function shipLosses(manifest, shipId, options = {}) {
  const data = await fetchZkill(manifest, `/api/losses/shipTypeID/${shipId}/page/1/`, options);
  if (!Array.isArray(data)) throw new KbUnavailableError('ship losses returned invalid payload');
  return data;
}

/**
 * Pick a real killmail the whole room can fetch. Prefers kills with fitted
 * modules, but a valid empty hull is still a real KB target (not a fallback).
 */
export async function pickRaceTarget({
  manifest,
  mode = 'standard',
  usedKillIds = new Set(),
  usedShipIds = new Set(),
  fetchImpl = fetch,
  random = randomIndex,
} = {}) {
  let fallback = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const shipId = pickHull(manifest, mode, { usedShipIds });
    let losses;
    try {
      losses = await shipLosses(manifest, shipId, { fetchImpl });
    } catch (error) {
      if (error instanceof KbUnavailableError) throw error;
      continue;
    }
    const candidates = losses.filter((kill) => (
      Number(kill?.victim?.ship_type_id) === Number(shipId)
      && !usedKillIds.has(Number(kill?.killmail_id))
    ));
    if (!candidates.length) {
      usedShipIds.add(shipId);
      continue;
    }
    const order = [...candidates].sort((a, b) => (
      Number(b?.zkb?.totalValue || 0) - Number(a?.zkb?.totalValue || 0)
    ));
    const tries = Math.min(3, order.length);
    for (let i = 0; i < tries; i++) {
      const choice = order[random(order.length - i)];
      const killId = Number(choice?.killmail_id);
      if (!killId) continue;
      try {
        const killmail = await fetchKillmail(manifest, killId, { fetchImpl });
        if (Number(killmail.victim.ship_type_id) !== Number(shipId)) continue;
        if (killHasFittedModules(killmail)) {
          return { killId, shipId, killmail };
        }
        if (!fallback) fallback = { killId, shipId, killmail };
      } catch {
        // Try the next candidate; the room reports failure only after all ships.
      }
    }
    usedShipIds.add(shipId);
  }
  if (fallback) return fallback;
  throw new KbUnavailableError('no usable killmail');
}

/**
 * Dealer round: the dealer fetches the real killmail and builds the complete
 * Standard clue set locally. Only published clues leave this client.
 */
export async function pickDealerRound({
  manifest,
  catalog,
  refsEn,
  usedKillIds = new Set(),
  usedShipIds = new Set(),
  fetchImpl = fetch,
  mode = 'normal',
  simulate = null,
  moduleFallbacks = {},
  weaponUpgradeGroups = null,
  weaponGroups = null,
} = {}) {
  const target = await pickRaceTarget({
    manifest, mode: mode === 'audit' ? 'audit' : 'standard', usedKillIds, usedShipIds, fetchImpl,
  });
  const ship = (catalog || []).find((entry) => Number(entry.id) === Number(target.shipId));
  if (!ship) throw new KbUnavailableError('target hull missing from catalog');
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
