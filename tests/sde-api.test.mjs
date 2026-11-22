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
