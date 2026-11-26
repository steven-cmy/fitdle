import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { formatGameDayStart, resolveGameDayStart } from '../js/game.js';

export const ORIGIN_SENTINEL = '__FITDLE_PUBLIC_ORIGIN__';

export function normalizePublicOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('PUBLIC_ORIGIN is required');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PUBLIC_ORIGIN is not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PUBLIC_ORIGIN must use http or https');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('PUBLIC_ORIGIN must not contain credentials, query or hash');
  }
  if (url.pathname !== '/') {
    throw new Error('PUBLIC_ORIGIN must be an origin without a path');
  }
  return url.origin;
}

async function renderDirectory(root, origin) {
  let changed = 0;
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      changed += await renderDirectory(full, origin);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = await fs.promises.readFile(full, 'utf8');
      if (html.includes(ORIGIN_SENTINEL)) {
        await fs.promises.writeFile(full, html.replaceAll(ORIGIN_SENTINEL, origin));
        changed += 1;
      }
    }
  }
  return changed;
}

export async function renderRuntimeOrigin({ root, origin }) {
  const safeOrigin = normalizePublicOrigin(origin);
  const dist = path.resolve(root);
  if (!fs.existsSync(dist)) throw new Error(`Static directory not found: ${dist}`);
  return { origin: safeOrigin, changed: await renderDirectory(dist, safeOrigin) };
}

/**
 * Writes the runtime FITDLE_GAME_DAY_START_UTC into the shipped manifest (and
 * its .br/.gz copies), so the page and the server agree without a rebuild.
 * `fallback` is the build-time value (data/manifest.json), the same one the
 * server falls back to, so unsetting or mistyping the variable restores it.
 */
export function renderRuntimeGameDay({ root, value, fallback }) {
  const file = path.join(path.resolve(root), 'data', 'manifest.json');
  if (!fs.existsSync(file)) return { minutes: null, changed: false, warning: null };
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const shipped = Number.isInteger(manifest.gameDayStartMinutes) ? manifest.gameDayStartMinutes : 11 * 60;
  const built = Number.isInteger(fallback) ? fallback : shipped;
  const { minutes, warning } = resolveGameDayStart(value, built);
  if (minutes === manifest.gameDayStartMinutes) return { minutes, changed: false, warning };
  manifest.gameDayStartMinutes = minutes;
  manifest.gameDayStartUtc = formatGameDayStart(minutes);
  manifest.downtimeUtcHour = Math.floor(minutes / 60);
  const source = Buffer.from(JSON.stringify(manifest));
  fs.writeFileSync(file, source);
  if (fs.existsSync(`${file}.br`)) fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(source));
  if (fs.existsSync(`${file}.gz`)) fs.writeFileSync(`${file}.gz`, zlib.gzipSync(source, { level: zlib.constants.Z_BEST_COMPRESSION }));
  return { minutes, changed: true, warning };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    const root = path.resolve(import.meta.dirname, '..', 'dist');
    const result = await renderRuntimeOrigin({ root, origin: process.env.PUBLIC_ORIGIN });
    console.log(`Runtime origin: ${result.origin} (${result.changed} HTML files)`);
    let fallback;
    try {
      const built = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'manifest.json'), 'utf8'));
      fallback = built.gameDayStartMinutes;
    } catch {
      // No build data next to dist/: the shipped manifest is the fallback.
    }
    const day = renderRuntimeGameDay({ root, value: process.env.FITDLE_GAME_DAY_START_UTC, fallback });
    if (day.warning) console.warn(`FITDLE startup: ${day.warning}`);
    if (day.minutes != null) console.log(`Game day starts at ${formatGameDayStart(day.minutes)} UTC${day.changed ? ' (manifest updated)' : ''}`);
  } catch (error) {
    console.error(`FITDLE startup: ${error.message}`);
    process.exit(1);
  }
}
