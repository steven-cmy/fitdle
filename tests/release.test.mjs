/**
 * Versioning scripts, run in throwaway Git repositories: the release gate
 * (scripts/check-release.mjs) and the version bump (scripts/bump-version.mjs).
 * Skipped without Git, which the container image build does not have.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const skip = spawnSync('git', ['--version']).status === 0 ? false : 'Git is not installed';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const changelog = (...versions) =>
  `# Changelog\n\n${versions.map((version) => `## v${version}\n\n- change\n`).join('\n')}`;

/** A repository on `dev` whose `main` released version 1.1.0. */
function repository(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitdle-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const run = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  };
  const commit = (files) => {
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), content);
    }
    git('add', '-A');
    git('commit', '-q', '-m', 'change');
  };
  const run = (script, ...args) =>
    spawnSync(process.execPath, [path.join('scripts', script), ...args], { cwd: dir, encoding: 'utf8' });
  const version = (file = 'package.json') =>
    JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).version;

  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  const scripts = {};
  for (const name of ['check-release.mjs', 'bump-version.mjs']) {
    scripts[`scripts/${name}`] = fs.readFileSync(path.join(ROOT, 'scripts', name), 'utf8');
  }
  commit({
    ...scripts,
    'package.json': json({ version: '1.1.0' }),
    'server/package.json': json({ version: '1.1.0' }),
    'server/package-lock.json': json({ version: '1.1.0', packages: { '': { version: '1.1.0' } } }),
    'CHANGELOG.md': changelog('1.1.0'),
    'js/main.js': '// 1\n',
  });
  git('switch', '-q', '-c', 'dev');
  return { commit, run, version, check: () => run('check-release.mjs', 'main') };
}

test('a release needs one section, for the latest version only', { skip }, (t) => {
  const repo = repository(t);
  // Several merged changes, each with its own number and no changelog yet.
  repo.commit({ 'js/main.js': '// 2\n', 'package.json': json({ version: '1.1.1' }) });
  repo.commit({ 'js/main.js': '// 3\n', 'package.json': json({ version: '1.2.0' }) });
  repo.commit({ 'js/main.js': '// 4\n', 'package.json': json({ version: '1.2.3' }) });
  const missing = repo.check();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /needs a non-empty "## v1\.2\.3" section/);

  repo.commit({ 'CHANGELOG.md': changelog('1.2.3', '1.1.0') });
  const passed = repo.check();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /1\.1\.0 -> 1\.2\.3/);

  repo.commit({ 'CHANGELOG.md': changelog('1.2.3', '1.2.0', '1.1.0') });
  const split = repo.check();
  assert.equal(split.status, 1);
  assert.match(split.stderr, /has a "## v1\.2\.0" section/);
});

test('the release gate rejects an old version and an empty section', { skip }, (t) => {
  const repo = repository(t);
  repo.commit({ 'js/main.js': '// 2\n' });
  const stale = repo.check();
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /must be newer than main \(1\.1\.0\)/);

  repo.commit({
    'package.json': json({ version: '1.1.1' }),
    'CHANGELOG.md': `# Changelog\n\n## v1.1.1\n\n## v1.1.0\n\n- change\n`,
  });
  assert.match(repo.check().stderr, /needs a non-empty "## v1\.1\.1" section/);
});

test('documentation changes need no release', { skip }, (t) => {
  const repo = repository(t);
  repo.commit({ 'README.md': 'text\n', 'docs/notes.md': 'text\n' });
  const result = repo.check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Release check skipped/);
});

test('the version is raised only by a named level, once per commit', { skip }, (t) => {
  const repo = repository(t);
  for (const args of [[], ['none']]) assert.equal(repo.run('bump-version.mjs', ...args).status, 1);
  assert.equal(repo.version(), '1.1.0');

  for (const [level, expected] of [['patch', '1.1.1'], ['minor', '1.2.0'], ['major', '2.0.0']]) {
    const result = repo.run('bump-version.mjs', level);
    assert.equal(result.status, 0, result.stderr);
    for (const file of ['package.json', 'server/package.json', 'server/package-lock.json']) {
      assert.equal(repo.version(file), expected, file);
    }
    const again = repo.run('bump-version.mjs', level);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /commit it first/);
    assert.equal(repo.version(), expected);
    repo.commit({});
  }
});
