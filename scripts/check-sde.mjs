#!/usr/bin/env node
/**
 * GitLab CI helper: compare the SDE API latest release with the deployed
 * manifest. Writes .cache/sde-check.env for downstream jobs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBuildEnv } from './build-env.mjs';
import { fetchLatestRelease, sdeBase } from './sde-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV = loadBuildEnv(ROOT);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const USER_AGENT = `FITDLE/${pkg.version} (+https://gitlab.com/cmy/fitdle)`;
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(CACHE, 'sde-check.env');
const PAGES = (process.env.CI_PAGES_URL || process.env.PAGES_URL || '').replace(/\/$/, '');
const FORCE = process.env.FORCE_SDE === '1' || process.env.FORCE_SDE === 'true';

async function remoteRelease() {
  try {
    return await fetchLatestRelease({
      base: sdeBase(ENV.EVE_SDE_BASE),
      userAgent: USER_AGENT,
    });
  } catch (error) {
    console.warn(`SDE latest check failed: ${error.message}`);
    return null;
  }
}

async function deployedManifest() {
  if (!PAGES) return null;
  try {
    const response = await fetch(`${PAGES}/data/manifest.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

const remote = await remoteRelease();
const deployed = await deployedManifest();
const deployedSde = deployed?.sde || {};
const deployedVersion = deployedSde.release || deployedSde.buildNumber || '';
const remoteVersion = remote?.release || remote?.buildNumber || '';
const changed = FORCE || !remoteVersion || !deployedVersion || String(remoteVersion) !== String(deployedVersion);
fs.mkdirSync(CACHE, { recursive: true });
const safe = (value) => String(value || '').replace(/[^A-Za-z0-9._-]+/g, '_');
fs.writeFileSync(OUT, [
  `SDE_CHANGED=${changed ? '1' : '0'}`,
  `SDE_RELEASE=${safe(remote?.release)}`,
  `SDE_BUILD_NUMBER=${safe(remote?.buildNumber)}`,
  `SDE_VERSION=${safe(remoteVersion)}`,
  `SDE_DEPLOYED_VERSION=${safe(deployedVersion)}`,
  '',
].join('\n'));
console.log(`SDE API latest: ${remote?.release || '(unavailable)'} (build ${remote?.buildNumber || 'unknown'})`);
console.log(`SDE deployed: ${deployedVersion || '(none)'}`);
console.log(`SDE changed: ${changed}`);
