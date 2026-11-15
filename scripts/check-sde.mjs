#!/usr/bin/env node
/**
 * GitLab CI helper: compare the current SDE release with the deployed Pages
 * manifest. Writes .cache/sde-check.env for downstream jobs.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(CACHE, 'sde-check.env');
const URL = process.env.EVE_SDE_URL || 'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip';
const PAGES = (process.env.CI_PAGES_URL || process.env.PAGES_URL || '').replace(/\/$/, '');
const FORCE = process.env.FORCE_SDE === '1' || process.env.FORCE_SDE === 'true';

async function remoteVersion() {
  try {
    let method = 'HEAD';
    let response = await fetch(URL, { method, redirect: 'follow' });
    if (!response.ok) {
      method = 'GET';
      response = await fetch(URL, { method, redirect: 'follow' });
    }
    const version = response.headers.get('etag')
      || response.headers.get('last-modified')
      || response.headers.get('content-length');
    if (method !== 'HEAD') response.body?.cancel?.();
    return version || '';
  } catch (error) {
    console.warn(`SDE HEAD failed: ${error.message}`);
    return '';
  }
}

async function deployedVersion() {
  if (!PAGES) return '';
  try {
    const response = await fetch(`${PAGES}/data/manifest.json`, { cache: 'no-store' });
    if (!response.ok) return '';
    const manifest = await response.json();
    return manifest?.sde?.etag || manifest?.sdeEtag || '';
  } catch {
    return '';
  }
}

const remote = await remoteVersion();
const deployed = await deployedVersion();
const changed = FORCE || !remote || !deployed || remote !== deployed;
fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(OUT, [
  `SDE_CHANGED=${changed ? '1' : '0'}`,
  `SDE_VERSION=${String(remote).replace(/[^A-Za-z0-9._-]+/g, '_')}`,
  `SDE_DEPLOYED_VERSION=${String(deployed).replace(/[^A-Za-z0-9._-]+/g, '_')}`,
  '',
].join('\n'));
console.log(`SDE remote: ${remote || '(unavailable)'}`);
console.log(`SDE deployed: ${deployed || '(none)'}`);
console.log(`SDE changed: ${changed}`);
