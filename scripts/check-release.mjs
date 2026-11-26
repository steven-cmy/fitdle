#!/usr/bin/env node
/**
 * Pull request gate for releases: the version in package.json must be newer
 * than the base branch's and CHANGELOG.md must have a matching section, so a
 * merge to main can never overwrite published image tags or skip the Release.
 *
 * Usage: node scripts/check-release.mjs <base-ref>   (e.g. origin/main)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const base = process.argv[2] || 'origin/main';

const parse = (version) => String(version).split('.').map((part) => Number(part) || 0);
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const baseVersion = JSON.parse(
  execFileSync('git', ['show', `${base}:package.json`], { cwd: ROOT, encoding: 'utf8' }),
).version;

const errors = [];
if (!newer(current, baseVersion)) {
  errors.push(`package.json version ${current} must be newer than ${base} (${baseVersion}).`);
}
const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const section = changelog.split(/\r?\n/);
const start = section.findIndex((line) => line.trim() === `## v${current}`);
let body = '';
if (start >= 0) {
  for (const line of section.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    body += line;
  }
}
if (!body.trim()) errors.push(`CHANGELOG.md needs a non-empty "## v${current}" section.`);

if (errors.length) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}
console.log(`Release check passed: ${baseVersion} -> ${current}.`);
