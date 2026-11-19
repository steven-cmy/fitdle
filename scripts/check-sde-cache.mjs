#!/usr/bin/env node
/**
 * Compare the cached SDE metadata with the official latest release.
 *
 * Exit 0 when the cache is current or the check cannot be completed.
 * Exit 1 when the cache is missing or the official build is newer, so the
 * one-shot builder knows it must download the SDE again.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const USER_AGENT = `FITDLE/${pkg.version} (+https://gitlab.com/cmy/fitdle)`;
const META = path.join(ROOT, '.cache', 'sde-meta.json');
const SOURCE = path.join(ROOT, '.cache', 'sde-source');
const OFFICIAL = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';

function readCachedMeta() {
  try {
    const data = JSON.parse(fs.readFileSync(META, 'utf8'));
    return {
      buildNumber: data?.buildNumber == null ? null : String(data.buildNumber),
      releaseDate: data?.releaseDate == null ? null : String(data.releaseDate),
    };
  } catch {
    return null;
  }
}

async function readOfficialMeta() {
  const response = await fetch(OFFICIAL, {
    cache: 'no-store',
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`latest.jsonl returned ${response.status}`);
  const line = (await response.text()).split('\n').find(Boolean);
  if (!line) throw new Error('latest.jsonl is empty');
  const data = JSON.parse(line);
  return {
    buildNumber: data?.buildNumber == null ? null : String(data.buildNumber),
    releaseDate: data?.releaseDate == null ? null : String(data.releaseDate),
  };
}

const cached = readCachedMeta();
if (!cached?.buildNumber) {
  console.log('No cached SDE metadata; a fresh SDE download is required.');
  process.exit(1);
}

if (!fs.existsSync(SOURCE)) {
  console.log('Cached SDE source is missing; a fresh SDE download is required.');
  process.exit(1);
}

let official;
try {
  official = await readOfficialMeta();
} catch (error) {
  // A temporary network problem must not force a 95 MB download or block a
  // rebuild that can still use the last complete cache.
  console.log(`Could not check the official SDE (${error.message}); using cached SDE ${cached.buildNumber}.`);
  process.exit(0);
}

if (!official.buildNumber) {
  console.log(`Official SDE build is unknown; using cached SDE ${cached.buildNumber}.`);
  process.exit(0);
}

const changed = cached.buildNumber !== official.buildNumber
  || (cached.releaseDate && official.releaseDate && cached.releaseDate !== official.releaseDate);

if (!changed) {
  console.log(`SDE cache is current (${cached.buildNumber}).`);
  process.exit(0);
}

console.log(`SDE cache is stale (${cached.buildNumber} -> ${official.buildNumber}); refreshing.`);
process.exit(1);
