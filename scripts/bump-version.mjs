#!/usr/bin/env node
/**
 * Bump the package version. Run by hand when a program change is merged into
 * the local dev branch (see AGENTS.md, Version numbers); nothing runs it on its
 * own.
 *
 * Usage: node scripts/bump-version.mjs <patch|minor|major>
 *
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
const level = process.argv[2];

let next;
if (level === 'major') next = `${major + 1}.0.0`;
else if (level === 'minor') next = `${major}.${minor + 1}.0`;
else if (level === 'patch') next = `${major}.${minor}.${patch + 1}`;
else {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major>');
  process.exit(1);
}

// One change gets one version: refuse while an earlier bump is uncommitted.
const head = spawnSync('git', ['show', 'HEAD:package.json'], { cwd: ROOT, encoding: 'utf8' });
const committed = head.status === 0 ? JSON.parse(head.stdout).version : current;
if (committed !== current) {
  console.error(`The version already differs from HEAD (${committed} -> ${current}); commit it first.`);
  process.exit(1);
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
