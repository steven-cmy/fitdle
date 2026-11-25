#!/usr/bin/env node
/**
 * Bump the package version. Called by .githooks/pre-commit.
 *
 * Default: patch. Set VERSION_BUMP=minor|major|none to override.
 * server/package.json and its lockfile follow the root version, because the
 * test suite requires them to be identical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkgFile = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const current = String(pkg.version || '0.0.0');
const [major, minor, patch] = current.split('.').map((part) => Number(part) || 0);
const bump = String(process.env.VERSION_BUMP || 'patch').toLowerCase();

if (bump === 'none') {
  console.log('Version bump skipped (VERSION_BUMP=none).');
  process.exit(0);
}

let next;
if (bump === 'major') next = `${major + 1}.0.0`;
else if (bump === 'minor') next = `${major}.${minor + 1}.0`;
else if (bump === 'patch') next = `${major}.${minor}.${patch + 1}`;
else {
  console.error(`Unknown VERSION_BUMP=${bump}; use patch, minor, major or none.`);
  process.exit(1);
}

// A release commit that already changes package.json owns its version.
const staged = spawnSync('git', ['diff', '--cached', '--quiet', '--', 'package.json'], {
  cwd: ROOT,
  stdio: 'ignore',
});
if (staged.status === 1) {
  console.log('Version bump skipped: package.json is already staged.');
  process.exit(0);
}

pkg.version = next;
fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
const bumped = ['package.json'];
for (const [file, apply] of [
  ['server/package.json', (json) => { json.version = next; }],
  ['server/package-lock.json', (json) => {
    json.version = next;
    if (json.packages?.['']) json.packages[''].version = next;
  }],
]) {
  const target = path.join(ROOT, file);
  if (!fs.existsSync(target)) continue;
  const json = JSON.parse(fs.readFileSync(target, 'utf8'));
  apply(json);
  fs.writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`);
  bumped.push(file);
}
spawnSync('git', ['add', ...bumped], { cwd: ROOT, stdio: 'inherit' });
console.log(`Version ${current} -> ${next}`);
