#!/usr/bin/env node
/**
 * Pull request gate for releases. A pull request that changes the program needs
 * a version in package.json newer than the base branch's and a matching
 * CHANGELOG.md section. One that changes only documentation or GitHub
 * configuration passes without either (see NON_PROGRAM).
 *
 * Usage: node scripts/check-release.mjs <base-ref>   (e.g. origin/main)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const base = process.argv[2] || 'origin/main';
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

// Everything not listed here counts as a program change.
const NON_PROGRAM = [
  /^[^/]+\.md$/, // Markdown in the repository root only
  /^docs\//,
  /^\.github\//,
  /^LICENSE$/,
  /^scripts\/check-release\.mjs$/, // this CI gate; never built or shipped
];

// --no-renames lists both sides of a move, so moving a program file into docs/
// still counts.
const changed = git('diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`)
  .split('\0')
  .filter(Boolean);
const program = changed.filter((file) => !NON_PROGRAM.some((pattern) => pattern.test(file)));

if (!program.length) {
  console.log(`Release check skipped: no program changes in ${changed.length} changed file(s).`);
  process.exit(0);
}
console.log(`Program changes:\n${program.map((file) => `  ${file}`).join('\n')}`);

const parse = (version) => String(version).split('.').map((part) => Number(part) || 0);
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const baseVersion = JSON.parse(git('show', `${base}:package.json`)).version;

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
