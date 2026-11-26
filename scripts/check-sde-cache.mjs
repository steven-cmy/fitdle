#!/usr/bin/env node
/**
 * Compare the cached SDE metadata with the official SDE API latest release.
 *
 * Exit 0 when the cache is current or the check cannot be completed.
 * Exit 1 when the cache is missing or the official release is newer, so the
 * deployment/build tooling knows it must download the SDE again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBuildEnv } from './build-env.mjs';
import { fetchLatestRelease, sdeBase, SDE_TABLES } from './sde-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV = loadBuildEnv(ROOT);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const USER_AGENT = `FITDLE/${pkg.version} (+https://github.com/steven-cmy/fitdle)`;
const META = path.join(ROOT, '.cache', 'sde-meta.json');
const SOURCE = path.join(ROOT, '.cache', 'sde-source');

function readCachedMeta() {
  try {
    const data = JSON.parse(fs.readFileSync(META, 'utf8'));
    return {
      release: data?.release == null ? null : String(data.release),
      buildNumber: data?.buildNumber == null ? null : String(data.buildNumber),
    };
  } catch {
    return null;
  }
}

const cached = readCachedMeta();
if (!cached?.release || !cached?.buildNumber) {
  console.log('No cached SDE API metadata; a fresh SDE download is required.');
  process.exit(1);
}

if (!fs.existsSync(SOURCE) || !SDE_TABLES.every((table) => fs.existsSync(path.join(SOURCE, `${table}.jsonl`)))) {
  console.log('Cached SDE source is incomplete; a fresh SDE download is required.');
  process.exit(1);
}

let official;
try {
  official = await fetchLatestRelease({
    base: sdeBase(ENV.EVE_SDE_BASE),
    userAgent: USER_AGENT,
  });
} catch (error) {
  // A temporary network problem must not force a large re-download or block a
  // rebuild that can still use the last complete cache.
  console.log(`Could not check the SDE API (${error.message}); using cached SDE ${cached.release}.`);
  process.exit(0);
}

const changed = cached.release !== String(official.release)
  || cached.buildNumber !== String(official.buildNumber);

if (!changed) {
  console.log(`SDE cache is current (${cached.release}, build ${cached.buildNumber}).`);
  process.exit(0);
}

console.log(`SDE cache is stale (${cached.release}/${cached.buildNumber} -> ${official.release}/${official.buildNumber}); refreshing.`);
process.exit(1);
