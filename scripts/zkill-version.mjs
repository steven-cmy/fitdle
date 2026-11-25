import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE_FILE = path.join(ROOT, '.cache', 'zkill-version.json');
const SOURCE = 'https://zkillboard.com/api/version/';
const CACHE_MS = 60 * 60 * 1000;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const USER_AGENT = `FITDLE/${pkg.version} (+https://gitlab.com/cmy/fitdle)`;

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(value) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * zKillboard documents a one-hour client cache for /api/version/.
 * Builds reuse a fresh cache and only fall back to a stale cache on failure.
 */
export async function getZkillVersion({ fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache();
  const fetchedAt = Number(cache?.fetchedAtMs) || 0;
  if (cache?.version && fetchedAt && now - fetchedAt < CACHE_MS) {
    return { ...cache, cached: true };
  }
  try {
    const response = await fetchImpl(SOURCE, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`zKill version failed: ${response.status}`);
    const payload = await response.json();
    const version = String(payload?.version || '').trim();
    if (!version) throw new Error('zKill version missing');
    const value = {
      source: SOURCE,
      version,
      capturedAt: new Date(now).toISOString(),
      fetchedAtMs: now,
      cached: false,
    };
    writeCache(value);
    return value;
  } catch (error) {
    if (cache?.version) return { ...cache, stale: true };
    return { source: SOURCE, version: null, capturedAt: null, fetchedAtMs: 0, error: error.message };
  }
}
