import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_SDE_BASE = 'https://sde.evetech.net/tranquility';
export const SDE_TABLES = Object.freeze([
  'groups',
  'categories',
  'metaGroups',
  'races',
  'factions',
  'dogmaUnits',
  'dogmaAttributes',
  'types',
  'typeDogma',
  'typeBonus',
]);

export function sdeBase(value = process.env.EVE_SDE_BASE) {
  return String(value || DEFAULT_SDE_BASE).replace(/\/+$/, '');
}

function safeTableUrl(latest, table) {
  const url = latest?.tables?.[table]?.jsonl?.url;
  if (!url) throw new Error(`SDE latest release is missing table ${table}`);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error(`SDE table ${table} must use HTTPS`);
  return parsed.toString();
}

export function tableUrl(latest, table) {
  return safeTableUrl(latest, table);
}

export async function fetchLatestRelease({
  base = sdeBase(),
  userAgent = 'FITDLE/dev',
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const latestUrl = `${String(base).replace(/\/+$/, '')}/latest/`;
  const response = await fetchImpl(latestUrl, {
    cache: 'no-store',
    headers: { Accept: 'application/json', 'User-Agent': userAgent },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`SDE latest returned ${response.status}`);
  const latest = await response.json();
  const release = String(latest?.release || '').trim();
  const buildNumber = Number(latest?.buildNumber);
  if (!release) throw new Error('SDE latest is missing release');
  if (!Number.isInteger(buildNumber) || buildNumber < 1) throw new Error('SDE latest is missing buildNumber');
  if (!latest?.tables || typeof latest.tables !== 'object') throw new Error('SDE latest is missing tables');
  for (const table of SDE_TABLES) safeTableUrl(latest, table);
  return {
    ...latest,
    apiBase: String(base).replace(/\/+$/, ''),
    latestUrl,
    release,
    buildNumber,
    releaseDate: latest.releaseDate || null,
    etag: response.headers.get('etag') || '',
  };
}

async function firstAndLastLine(file) {
  const stat = await fsp.stat(file);
  if (!stat.size) throw new Error(`SDE table is empty: ${file}`);
  const handle = await fsp.open(file, 'r');
  try {
    const headSize = Math.min(stat.size, 64 * 1024);
    const head = Buffer.alloc(headSize);
    await handle.read(head, 0, headSize, 0);
    const first = head.toString('utf8').split(/\r?\n/).find((line) => line.trim());
    if (!first) throw new Error(`SDE table has no records: ${file}`);
    JSON.parse(first);
    const tailSize = Math.min(stat.size, 64 * 1024);
    const tail = Buffer.alloc(tailSize);
    await handle.read(tail, 0, tailSize, Math.max(0, stat.size - tailSize));
    const lines = tail.toString('utf8').split(/\r?\n/).filter((line) => line.trim());
    const last = lines[lines.length - 1];
    if (!last) throw new Error(`SDE table has no complete last line: ${file}`);
    JSON.parse(last);
  } finally {
    await handle.close();
  }
}

export async function downloadTable(latest, table, destination, {
  userAgent = 'FITDLE/dev',
  fetchImpl = globalThis.fetch,
  timeoutMs = 10 * 60 * 1000,
} = {}) {
  const url = tableUrl(latest, table);
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: { Accept: 'application/x-ndjson, application/json', 'User-Agent': userAgent },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) throw new Error(`SDE table ${table} returned ${response.status}`);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
    await firstAndLastLine(temporary);
    await fsp.rename(temporary, destination);
  } catch (error) {
    await fsp.rm(temporary, { force: true });
    throw error;
  }
}

/** Link an unchanged table into staging; false means it must be downloaded. */
async function reuseTable(latest, table, sourceDir, stagingDir, previousVersions) {
  const version = latest.tables[table]?.version;
  if (!version || previousVersions?.[table] !== version) return false;
  const source = path.join(sourceDir, `${table}.jsonl`);
  const target = path.join(stagingDir, `${table}.jsonl`);
  try {
    await firstAndLastLine(source);
    await fsp.link(source, target).catch(() => fsp.copyFile(source, target));
    return true;
  } catch {
    await fsp.rm(target, { force: true });
    return false;
  }
}

export async function downloadRelease(latest, destinationDir, {
  tables = SDE_TABLES,
  previousVersions = null,
  userAgent = 'FITDLE/dev',
  fetchImpl = globalThis.fetch,
  concurrency = 4,
  onTable = () => {},
} = {}) {
  const staging = `${destinationDir}.next`;
  await fsp.rm(staging, { recursive: true, force: true });
  await fsp.mkdir(staging, { recursive: true });
  let cursor = 0;
  const worker = async () => {
    while (cursor < tables.length) {
      const table = tables[cursor++];
      if (await reuseTable(latest, table, destinationDir, staging, previousVersions)) {
        onTable(table, true);
        continue;
      }
      onTable(table, false);
      await downloadTable(latest, table, path.join(staging, `${table}.jsonl`), { userAgent, fetchImpl });
    }
  };
  let firstError = null;
  const workers = Array.from({ length: Math.min(concurrency, tables.length) }, () => worker()
    .catch((error) => {
      firstError = firstError || error;
    }));
  try {
    await Promise.all(workers);
    if (firstError) throw firstError;
    await fsp.rm(destinationDir, { recursive: true, force: true });
    await fsp.rename(staging, destinationDir);
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true });
    throw error;
  }
  return {
    source: 'sde-api',
    apiBase: latest.apiBase,
    latestUrl: latest.latestUrl,
    release: latest.release,
    buildNumber: latest.buildNumber,
    releaseDate: latest.releaseDate,
    latestEtag: latest.etag || '',
    tableVersions: Object.fromEntries(tables.map((table) => [table, latest.tables[table]?.version || null])),
    downloadedAt: new Date().toISOString(),
  };
}
