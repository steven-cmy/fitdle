#!/usr/bin/env node
/**
 * Decide whether the normalized SDE in .cache can be reused.
 *
 * Usage: node scripts/build-cache.mjs [--release <sde release>]
 * Exit 0 = reusable, exit 1 = run prepare:sde. Without a release (for example
 * when the SDE API was unreachable) any complete cache is accepted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const NORMALIZED_VERSION = 3;

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

export function sdeCacheState(cacheDir, release = '') {
  const meta = readJson(path.join(cacheDir, 'sde-meta.json'));
  if (!meta?.release || !meta?.buildNumber) return { reusable: false, reason: 'no SDE metadata' };
  const normalized = readJson(path.join(cacheDir, 'normalized.json'));
  if (normalized?.normalizedVersion !== NORMALIZED_VERSION) {
    return { reusable: false, reason: 'no normalized SDE for this schema' };
  }
  const wanted = String(release || '').trim();
  if (wanted && wanted !== String(meta.release)) {
    return { reusable: false, reason: `cached ${meta.release}, latest ${wanted}` };
  }
  return { reusable: true, reason: `release ${meta.release}` };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const flag = process.argv.indexOf('--release');
  const release = flag > -1 ? process.argv[flag + 1] : '';
  const state = sdeCacheState(path.resolve(import.meta.dirname, '..', '.cache'), release);
  console.log(`SDE cache ${state.reusable ? 'reused' : 'not reusable'}: ${state.reason}`);
  process.exit(state.reusable ? 0 : 1);
}
