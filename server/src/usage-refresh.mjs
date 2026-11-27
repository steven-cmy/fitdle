import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { normalizeUsage } from './selection.mjs';

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 8 * 1024 * 1024;
// After a failed attempt the next one comes sooner than a full period, but never
// in a tight loop.
const RETRY_MS = 6 * 60 * 60 * 1000;

const generatedTime = (data) => {
  const time = Date.parse(data?.generatedAt);
  return Number.isFinite(time) ? time : null;
};

export const usageCacheFile = () => path.join(path.dirname(config.databasePath), 'ship-usage.cache.json');

/** The remote file is only usable with a generation date and at least one hull. */
function acceptable(data) {
  const clean = normalizeUsage(data);
  if (!clean || generatedTime(clean) === null || !Object.keys(clean.ships).length) return null;
  return clean;
}

/** Use `data` when it is newer than what is loaded. */
function adoptIfNewer(data, source) {
  const next = acceptable(data);
  if (!next) return false;
  const current = generatedTime(config.shipUsage);
  if (current !== null && generatedTime(next) <= current) return false;
  config.shipUsage = next;
  config.shipUsageSource = source;
  return true;
}

let etag = '';

/** Read the cached copy from the data directory; it wins over the image only when newer. */
export function loadUsageCache() {
  try {
    const saved = JSON.parse(fs.readFileSync(usageCacheFile(), 'utf8'));
    if (adoptIfNewer(saved?.usage, 'cache')) etag = String(saved.etag || '');
    else if (config.shipUsageSource === 'cache') etag = String(saved?.etag || '');
  } catch {
    // No cache yet, or it is damaged: the image's file stays.
  }
}

function saveUsageCache(usage) {
  try {
    const file = usageCacheFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ etag, usage }));
    fs.renameSync(temp, file);
  } catch (error) {
    console.warn(`ship usage cache not written: ${error.code || error.message}`);
  }
}

/**
 * One polite request for the usage file of the data branch: generic
 * User-Agent, conditional on the last ETag, a timeout and no retry here.
 * Returns 'updated', 'unchanged', 'older' or 'failed'.
 */
export async function refreshUsage({ fetchImpl = fetch } = {}) {
  try {
    const headers = {
      'User-Agent': `FITDLE/${config.version || 'dev'} (+https://github.com/steven-cmy/fitdle)`,
      Accept: 'application/json',
    };
    if (etag) headers['If-None-Match'] = etag;
    const response = await fetchImpl(config.usageUrl, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 304) return 'unchanged';
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('file too large');
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new Error('file too large');
    const data = JSON.parse(text);
    if (!acceptable(data)) throw new Error('unexpected file format');
    const previousEtag = etag;
    etag = response.headers.get('etag') || '';
    if (!adoptIfNewer(data, 'remote')) {
      etag = previousEtag;
      return 'older';
    }
    saveUsageCache(config.shipUsage);
    return 'updated';
  } catch (error) {
    console.warn(`ship usage not refreshed (${error.message}); keeping ${config.shipUsageSource} data`);
    return 'failed';
  }
}

/**
 * Loads the cache, then refreshes from the data branch at startup and every
 * FITDLE_USAGE_REFRESH_HOURS. Nothing here can stop the service.
 */
export function startUsageRefresh({ log = console, fetchImpl = fetch } = {}) {
  loadUsageCache();
  if (!config.usageRefreshMs) return () => {};
  let timer = null;
  let stopped = false;
  const run = async () => {
    const result = await refreshUsage({ fetchImpl });
    if (result === 'updated') log.info?.(`ship usage refreshed from ${config.usageUrl}: generated ${config.shipUsage.generatedAt}`);
    if (stopped) return;
    timer = setTimeout(run, result === 'failed' ? Math.min(RETRY_MS, config.usageRefreshMs) : config.usageRefreshMs);
    timer.unref?.();
  };
  timer = setTimeout(run, 0);
  timer.unref?.();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
