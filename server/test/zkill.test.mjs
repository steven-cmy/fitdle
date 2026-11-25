import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const dbFile = path.join(ROOT, '.cache', `zkill-test-${process.pid}.sqlite`);
process.env.DATABASE_PATH = dbFile;
process.env.SESSION_SECRET = 'test-secret';
process.env.PUBLIC_ORIGIN = 'http://127.0.0.1:8790';
process.env.NODE_ENV = 'test';
const { ZkillClient, zkillFetch, zkill } = await import('../src/zkill.mjs');
const { freshnessMs, retryAfterMs } = await import('../../js/retry-after.js');
const { config } = await import('../src/config.mjs');

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

function setup(options = {}) {
  let time = 1_000_000;
  const client = new ZkillClient({
    base: () => 'https://zkill.test',
    userAgent: 'FITDLE/test (+https://example.test)',
    minIntervalMs: 250,
    clock: () => time,
    sleep: async (ms) => { time += ms; await new Promise((resolve) => setImmediate(resolve)); },
    ...options,
  });
  const calls = [];
  const respond = (handler) => {
    globalThis.fetch = async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      calls.push({ pathname, at: time, headers: init.headers });
      return handler(pathname, calls.length);
    };
  };
  return { client, calls, respond, advance: (ms) => { time += ms; } };
}
const json = (value, headers = {}, status = 200) => new Response(JSON.stringify(value), { status, headers });

test('Retry-After accepts seconds and dates', () => {
  assert.equal(retryAfterMs('3'), 3000);
  assert.equal(retryAfterMs(new Date(60_000).toUTCString(), { now: 20_000 }), 40_000);
  assert.equal(retryAfterMs(null, { fallbackMs: 7 }), 7);
  assert.equal(retryAfterMs('99999'), 15 * 60_000);
});

test('freshness follows Cache-Control, Age and Expires', () => {
  const headers = (entries) => new Headers(entries);
  assert.equal(freshnessMs(headers({ 'cache-control': 'public, max-age=3600' })), 3_600_000);
  assert.equal(freshnessMs(headers({ 'cache-control': 'public, max-age=3600', age: '600' })), 3_000_000);
  assert.equal(freshnessMs(headers({ expires: new Date(90_000).toUTCString() }), { now: 30_000 }), 60_000);
  assert.equal(freshnessMs(headers({ 'cache-control': 'no-store' })), 0);
  assert.equal(freshnessMs(headers({})), 3_600_000);
});

test('a path is requested once per upstream lifetime and always identified', async () => {
  const { client, calls, respond, advance } = setup();
  respond(() => json([{ a: 1 }], { 'cache-control': 'public, max-age=3600' }));
  const [a, b] = await Promise.all([client.get('/api/x/'), client.get('/api/x/')]);
  assert.deepEqual(a.data, b.data);
  advance(3_599_000);
  assert.deepEqual((await client.get('/api/x/')).data, [{ a: 1 }]);
  assert.equal(calls.length, 1);
  advance(2000);
  await client.get('/api/x/');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.headers['User-Agent'].startsWith('FITDLE/')));
});

test('requests are spaced and limited in concurrency', async () => {
  // Real time: concurrent waiters must not share one fake clock.
  const { client, calls, respond } = setup({ minIntervalMs: 30, clock: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) });
  const starts = [];
  let running = 0;
  let peak = 0;
  respond(async () => {
    starts.push(performance.now());
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 80));
    running -= 1;
    return json([]);
  });
  await Promise.all(Array.from({ length: 8 }, (_, index) => client.get(`/api/${index}/`)));
  assert.equal(calls.length, 8);
  assert.equal(peak, 2);
  for (let i = 1; i < starts.length; i += 1) assert.ok(starts[i] - starts[i - 1] >= 15, `gap ${starts[i] - starts[i - 1]}`);
});

test('a long Retry-After silences every path until it passes', async () => {
  const { client, calls, respond, advance } = setup();
  respond((_, count) => (count === 1 ? json({}, { 'retry-after': '120' }, 429) : json([1])));
  await assert.rejects(client.get('/api/a/'), (error) => error.status === 429);
  await assert.rejects(client.get('/api/b/'), (error) => error.status === 429);
  assert.equal(calls.length, 1, 'nothing is sent while paused');
  advance(120_001);
  assert.deepEqual((await client.get('/api/b/')).data, [1]);
  assert.equal(calls.length, 2);
});

test('every queued request settles when the upstream asks to slow down', async () => {
  const real = { clock: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };
  const { client, calls, respond } = setup({ minIntervalMs: 0, ...real });
  let limited = true;
  respond(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return limited ? json({}, { 'retry-after': '120' }, 429) : json([1]);
  });
  const results = Promise.allSettled(Array.from({ length: 8 }, (_, index) => client.get(`/api/${index}/`)));
  const settled = await Promise.race([results, new Promise((resolve) => setTimeout(() => resolve(null), 1500))]);
  assert.ok(settled, 'no request may hang');
  assert.ok(settled.every((item) => item.status === 'rejected'));
  assert.equal(calls.length, 2, 'only the two running requests reached the upstream');
  assert.equal(client.active, 0);
  assert.equal(client.pending.size, 0);
  // The same paths work again once the pause is over.
  limited = false;
  client.pausedUntil = 0;
  assert.deepEqual((await client.get('/api/7/')).data, [1]);
});

test('a request waiting for its turn is not sent after a pause began', async () => {
  const real = { clock: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };
  const { client, calls, respond } = setup({ minIntervalMs: 120, ...real });
  respond(() => json({}, { 'retry-after': '120' }, 429));
  await Promise.allSettled([client.get('/api/a/'), client.get('/api/b/')]);
  assert.equal(calls.length, 1);
  assert.equal(client.active, 0);
});

test('a short Retry-After is waited out once', async () => {
  const { client, calls, respond } = setup();
  respond((_, count) => (count === 1 ? json({}, { 'retry-after': '3' }, 429) : json([1])));
  assert.deepEqual((await client.get('/api/a/')).data, [1]);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].at - calls[0].at >= 3000);
});

test('only transient failures are retried, and only once', async () => {
  for (const [status, expected] of [[404, 1], [400, 1], [403, 1], [500, 2], [502, 2]]) {
    const { client, calls, respond } = setup();
    respond(() => json({}, {}, status));
    await assert.rejects(client.get('/api/a/'));
    assert.equal(calls.length, expected, `status ${status}`);
  }
  const { client, calls } = setup();
  globalThis.fetch = async () => { calls.push(1); throw new Error('timeout'); };
  await assert.rejects(client.get('/api/a/'));
  assert.equal(calls.length, 2);
});

test('the response cache has a byte limit', async () => {
  const { client, respond } = setup({ cacheBytes: 4000, minIntervalMs: 0 });
  respond((pathname) => json(Array.from({ length: 200 }, (_, i) => `${pathname}${i}${Math.random()}`)));
  for (let i = 0; i < 10; i += 1) await client.get(`/api/${i}/`);
  assert.ok(client.entries.size >= 1 && client.entries.size < 10);
  assert.ok(client.bytes === [...client.entries.values()].reduce((sum, entry) => sum + entry.body.length, 0));
});

test('arbitration targets use the identified shared client', async () => {
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push(init.headers['User-Agent']); return json([{ ok: 1 }]); };
  zkill.reset();
  const base = String(config.manifest?.zkillboard?.baseUrl || 'https://zkillboard.com');
  const response = await zkillFetch(`${base}/api/losses/shipTypeID/1/page/1/`, {});
  assert.equal(response.ok, true);
  assert.deepEqual(await response.json(), [{ ok: 1 }]);
  await zkillFetch(`${base}/api/losses/shipTypeID/1/page/1/`, {});
  assert.equal(seen.length, 1);
  assert.match(seen[0], /^FITDLE\//);
});

test.after(async () => {
  const { db } = await import('../src/db.mjs');
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbFile}${suffix}`, { force: true }); } catch {}
  }
});
