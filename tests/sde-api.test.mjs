import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  SDE_TABLES,
  downloadRelease,
  fetchLatestRelease,
  tableUrl,
} from '../scripts/sde-api.mjs';
import { sdeCacheState } from '../scripts/build-cache.mjs';
import { EARLY_BUDGET, mergeWeights, planWeights } from '../scripts/ship-weights.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = 'https://example.test/tranquility';
const RELEASE = '20260101T000000Z';

function latestPayload(overrides = {}) {
  return {
    release: RELEASE,
    buildNumber: 123456,
    releaseDate: '2026-01-01T00:00:00Z',
    tables: Object.fromEntries(SDE_TABLES.map((table) => [table, {
      version: `${table}-version`,
      jsonl: { url: `${BASE}/${RELEASE}/${table}.jsonl` },
    }])),
    ...overrides,
  };
}

function fakeFetch(latest = latestPayload(), { failTable = null } = {}) {
  return async (url) => {
    const text = String(url);
    if (text.endsWith('/latest/')) {
      return new Response(JSON.stringify(latest), { status: 200 });
    }
    if (failTable && text.endsWith(`/${failTable}.jsonl`)) {
      return new Response('failed', { status: 500 });
    }
    return new Response('{"typeID":1}\n', { status: 200 });
  };
}

test('SDE latest release exposes a pinned table URL', async () => {
  const latest = await fetchLatestRelease({ base: BASE, fetchImpl: fakeFetch() });
  assert.equal(latest.release, RELEASE);
  assert.equal(latest.buildNumber, 123456);
  assert.equal(tableUrl(latest, 'types'), `${BASE}/${RELEASE}/types.jsonl`);
});

test('SDE latest release rejects a missing table', async () => {
  const latest = latestPayload();
  delete latest.tables.typeBonus;
  await assert.rejects(
    fetchLatestRelease({ base: BASE, fetchImpl: fakeFetch(latest) }),
    /typeBonus/,
  );
});

test('SDE download writes all tables and metadata', async () => {
  const latest = await fetchLatestRelease({ base: BASE, fetchImpl: fakeFetch() });
  const destination = path.join(ROOT, '.cache', 'sde-api-test-ok');
  await fs.rm(destination, { recursive: true, force: true });
  try {
    const meta = await downloadRelease(latest, destination, { fetchImpl: fakeFetch() });
    assert.equal(meta.source, 'sde-api');
    assert.equal(meta.release, RELEASE);
    for (const table of SDE_TABLES) {
      const text = await fs.readFile(path.join(destination, `${table}.jsonl`), 'utf8');
      assert.match(text, /"typeID":1/);
    }
  } finally {
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rm(`${destination}.next`, { recursive: true, force: true });
  }
});

test('SDE download failure preserves the previous source directory', async () => {
  const latest = await fetchLatestRelease({ base: BASE, fetchImpl: fakeFetch() });
  const destination = path.join(ROOT, '.cache', 'sde-api-test-old');
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const marker = path.join(destination, 'keep.txt');
  await fs.writeFile(marker, 'old');
  try {
    await assert.rejects(
      downloadRelease(latest, destination, { fetchImpl: fakeFetch(latestPayload(), { failTable: 'types' }) }),
      /types/,
    );
    assert.equal(await fs.readFile(marker, 'utf8'), 'old');
  } finally {
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rm(`${destination}.next`, { recursive: true, force: true });
  }
});

test('SDE download reuses only unchanged tables', async () => {
  const destination = path.join(ROOT, '.cache', 'sde-api-test-reuse');
  await fs.rm(destination, { recursive: true, force: true });
  try {
    const latest = await fetchLatestRelease({ base: BASE, fetchImpl: fakeFetch() });
    const first = await downloadRelease(latest, destination, { fetchImpl: fakeFetch() });
    await fs.writeFile(path.join(destination, 'races.jsonl'), '{"kept":true}\n');
    await fs.writeFile(path.join(destination, 'groups.jsonl'), '{"broken\n');
    const payload = latestPayload({ release: '20260102T000000Z' });
    payload.tables.types.version = 'types-next';
    const next = await fetchLatestRelease({ base: BASE, fetchImpl: fakeFetch(payload) });
    const requested = [];
    const base = fakeFetch(payload);
    const meta = await downloadRelease(next, destination, {
      previousVersions: first.tableVersions,
      fetchImpl: (url) => { requested.push(String(url)); return base(url); },
    });
    // types changed, groups is unreadable; everything else is reused.
    assert.deepEqual(requested.map((url) => url.split('/').pop()).sort(), ['groups.jsonl', 'types.jsonl']);
    assert.match(await fs.readFile(path.join(destination, 'races.jsonl'), 'utf8'), /kept/);
    assert.equal(meta.release, '20260102T000000Z');
    assert.equal(meta.tableVersions.types, 'types-next');
  } finally {
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rm(`${destination}.next`, { recursive: true, force: true });
  }
});

test('ship weights request only missing and aging hulls', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-01-31T00:00:00Z');
  const at = (days) => ({ recent: 5, all: 9, at: now - days * day });
  const ships = [1, 2, 3, 4, 5];
  assert.deepEqual(planWeights({ ships, now }), ships);
  const cache = { usage: { 1: at(0), 2: at(4.9), 3: at(6), 4: at(8) } };
  assert.deepEqual(planWeights({ ships, cache, now }), [5, 4, 3]);
  assert.deepEqual(planWeights({ ships: [1, 2], cache, now }), []);
  assert.deepEqual(planWeights({ ships: [1, 2], cache, now, refresh: true }), [1, 2]);
  assert.deepEqual(planWeights({ ships: [1], cache: { usage: { 1: at(-1) } }, now }), [1]);
  // Caches written before per-hull times fall back to generatedAt.
  const legacy = { generatedAt: new Date(now - 2 * day).toISOString(), usage: { 1: { recent: 1, all: 1 } } };
  assert.deepEqual(planWeights({ ships: [1], cache: legacy, now }), []);
  assert.deepEqual(planWeights({ ships: [1], cache: legacy, now: now + 6 * day }), [1]);
  const many = Array.from({ length: 200 }, (_, index) => index + 1);
  const aging = { usage: Object.fromEntries(many.map((id) => [id, at(6)])) };
  assert.equal(planWeights({ ships: many, cache: aging, now }).length, EARLY_BUDGET);
});

test('a failed ship weight request keeps the previous value', () => {
  const now = Date.parse('2026-01-31T00:00:00Z');
  const cache = { usage: { 1: { recent: 5, all: 9, at: 7 }, 2: { recent: 1, all: 1, at: 7 }, 99: { recent: 1, all: 1, at: 7 } } };
  const merged = mergeWeights({
    ships: [1, 2, 3], cache, now,
    rows: [{ id: 1, error: true }, { id: 2, recent: 4, all: 8 }, { id: 3, error: true }],
  });
  assert.deepEqual(merged.usage, { 1: { recent: 5, all: 9, at: 7 }, 2: { recent: 4, all: 8, at: now } });
  assert.equal(merged.failed, 2);
  assert.equal(merged.usage[3], undefined, 'an unknown hull stays eligible instead of becoming zero');
});

test('the SDE build cache is reused only for the same release and schema', async () => {
  const dir = path.join(ROOT, '.cache', 'build-cache-test');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  try {
    assert.equal(sdeCacheState(dir).reusable, false);
    await fs.writeFile(path.join(dir, 'sde-meta.json'), JSON.stringify({ release: 'r1', buildNumber: 1 }));
    assert.equal(sdeCacheState(dir, 'r1').reusable, false);
    await fs.writeFile(path.join(dir, 'normalized.json'), JSON.stringify({ normalizedVersion: 3 }));
    assert.equal(sdeCacheState(dir, 'r1').reusable, true);
    assert.equal(sdeCacheState(dir).reusable, true);
    assert.equal(sdeCacheState(dir, 'r2').reusable, false);
    await fs.writeFile(path.join(dir, 'normalized.json'), JSON.stringify({ normalizedVersion: 2 }));
    assert.equal(sdeCacheState(dir, 'r1').reusable, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('the image reuses CI data only when asked to', async () => {
  const dockerfile = await fs.readFile(path.join(ROOT, 'Dockerfile'), 'utf8');
  const ignore = await fs.readFile(path.join(ROOT, '.dockerignore'), 'utf8');
  const ci = await fs.readFile(path.join(ROOT, '.gitlab-ci.yml'), 'utf8');
  assert.match(dockerfile, /ARG REUSE_BUILD_CACHE=0/);
  assert.ok(dockerfile.includes('rm -rf .cache && npm run prepare:sde'));
  assert.ok(ci.includes('--build-arg "REUSE_BUILD_CACHE=1"'));
  for (const file of ['normalized', 'killpool', 'sde-meta', 'ship-weights', 'zkill-version']) {
    assert.ok(ignore.includes(`!.cache/${file}.json`), file);
    assert.equal(ci.split(`- .cache/${file}.json`).length - 1, 2, `${file} is cached and passed on`);
  }
});
