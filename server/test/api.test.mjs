import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import WebSocket from 'ws';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const dbFile = path.join(ROOT, '.cache', `online-test-${process.pid}.sqlite`);
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.rmSync(`${dbFile}${suffix}`, { force: true }); } catch {}
}
process.env.DATABASE_PATH = dbFile;
process.env.SESSION_SECRET = 'test-secret';
process.env.FITDLE_DEV_AUTH = '1';
process.env.PUBLIC_ORIGIN = 'http://127.0.0.1:8790';
process.env.ROOM_MAX_PLAYERS = '3';
process.env.ROOM_ARBITRATION_BIG_ROUNDS = '2';
process.env.ROOM_ARBITRATION_MAX_BIG_ROUNDS = '4';
process.env.ROOM_TIMED_DURATION_MINUTES = '15';
process.env.ROOM_TIMED_MAX_DURATION_MINUTES = '30';
process.env.ROOM_RECONNECT_GRACE_MS = '5000';
process.env.TARGET_SPARES = '0';
process.env.NODE_ENV = 'test';

const { config } = await import('../src/config.mjs');
const { characterIdFromSubject } = await import('../src/auth.mjs');
const {
  ROOMS, evictExpiredRooms, flushRooms, normalizeRoomSettings, nextBigRoundStep,
} = await import('../src/rooms.mjs');
const { TtlCache } = await import('../src/ttl-cache.mjs');
const { getRandomTarget } = await import('../src/targets.mjs');
const { buildApp } = await import('../src/index.mjs');
const { db } = await import('../src/db.mjs');
const { profileStats } = await import('../src/stats.mjs');
const app = await buildApp();
await app.ready();

test('single public origin derives callback and secure-cookie flag', () => {
  assert.equal(config.publicOrigin, 'http://127.0.0.1:8790');
  assert.equal(config.apiOrigin, 'http://127.0.0.1:8790');
  assert.equal(config.eve.redirectUri, 'http://127.0.0.1:8790/api/v1/auth/eve/callback');
  assert.equal(config.cookieSecure, false);
  assert.deepEqual(config.allowedOrigins, []);
});

function cookieFrom(response) {
  const raw = response.headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : [raw];
  return String(values[0] || '').split(';')[0];
}

async function login(name, characterId = null) {
  const suffix = characterId == null ? '' : `&characterId=${encodeURIComponent(characterId)}`;
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/dev?name=${encodeURIComponent(name)}${suffix}`,
  });
  assert.equal(response.statusCode, 200, response.body);
  return cookieFrom(response);
}

test('meta and health are available without a session', async () => {
  const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(health.statusCode, 200);
  const meta = await app.inject({ method: 'GET', url: '/api/v1/meta' });
  assert.equal(meta.statusCode, 200);
  const payload = JSON.parse(meta.body);
  assert.ok(payload.gameDay);
  assert.ok(payload.dataVersion);
  assert.equal(payload.limits.maxPlayers, 3);
  assert.equal(payload.limits.room.arbitrationBigRounds, 2);
  assert.equal(payload.limits.room.arbitrationBigRoundsMax, 4);
  assert.equal(payload.limits.room.timedDurationMinutes, 15);
  assert.equal(payload.limits.room.timedDurationMaxMinutes, 30);
  assert.equal(payload.limits.room.reconnectGraceMs, 5000);
});

test('SSO subject extraction and dev character profiles stay optional', async () => {
  assert.equal(characterIdFromSubject('CHARACTER:EVE:123456'), 123456);
  assert.equal(characterIdFromSubject('CHARACTER:EVE:not-a-number'), null);
  assert.equal(characterIdFromSubject('123456'), null);
  const cookie = await login('Avatar Pilot', 90000001);
  const me = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).body);
  assert.equal(me.characterId, 90000001);
  const noAvatar = await login('No Avatar Pilot');
  const noAvatarMe = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: noAvatar } })).body);
  assert.equal(noAvatarMe.characterId, null);
});

test('dev auth resolves to a name-keyed account and logout clears the session', async () => {
  const cookie = await login('Test Alt One');
  const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(JSON.parse(me.body).loggedIn, true);
  assert.equal(JSON.parse(me.body).name, 'Test Alt One');
  const other = await login('Test Alt Two');
  const otherMe = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: other } });
  assert.equal(JSON.parse(otherMe.body).nameKey, 'test alt two');
  const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
  assert.equal(logout.statusCode, 200);
  const after = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
  assert.equal(JSON.parse(after.body).loggedIn, false);
});

test('online endpoints require a session', async () => {
  const daily = await app.inject({ method: 'GET', url: '/api/v1/online/daily' });
  assert.equal(daily.statusCode, 401);
  const start = await app.inject({
    method: 'POST',
    url: '/api/v1/online/start',
    headers: { 'content-type': 'application/json' },
    payload: { gameplay: 'standard' },
  });
  assert.equal(start.statusCode, 401);
});

test('room settings allow only bounded big rounds and timed duration', () => {
  const base = { bigRounds: 2, raceDurationMs: 15 * 60 * 1000 };
  assert.deepEqual(normalizeRoomSettings(base, { bigRounds: 4 }), { ...base, bigRounds: 4 });
  assert.deepEqual(normalizeRoomSettings(base, { bigRounds: 5 }), base);
  assert.deepEqual(normalizeRoomSettings(base, { bigRounds: 0 }), base);
  assert.equal(normalizeRoomSettings(base, { raceDurationMs: 60_000 }).raceDurationMs, 60_000);
  assert.equal(normalizeRoomSettings(base, { raceDurationMs: 30 * 60 * 1000 }).raceDurationMs, 30 * 60 * 1000);
  assert.equal(normalizeRoomSettings(base, { raceDurationMs: 31 * 60 * 1000 }).raceDurationMs, 30 * 60 * 1000);
  const round = { order: ['a', 'b'], index: 0, number: 1, total: 2 };
  assert.deepEqual(nextBigRoundStep(round), { kind: 'dealer', index: 1, number: 1 });
  assert.deepEqual(nextBigRoundStep({ ...round, index: 1 }), { kind: 'big', index: 0, number: 2 });
  assert.deepEqual(nextBigRoundStep({ ...round, index: 1, number: 2 }), { kind: 'done' });
});

test('room creation starts with no gameplay and preserves host ownership', async () => {
  const host = await login('Room Host', 90000002);
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/rooms',
    headers: { cookie: host, 'content-type': 'application/json' },
    payload: { password: 'secret' },
  });
  assert.equal(created.statusCode, 200, created.body);
  const room = JSON.parse(created.body);
  assert.match(room.code, /^[A-Z0-9]{8}$/);
  assert.equal(room.room.gameplay, null);
  assert.equal(room.room.ownerId, room.playerId);
  assert.equal(room.room.players.length, 1);
  assert.equal(room.room.players[0].characterId, 90000002);
  assert.equal(room.room.settings.bigRounds, 2);
  assert.equal(room.room.settings.raceDurationMs, 15 * 60 * 1000);
  assert.equal(room.room.bigRound, null);

  const guest = await login('Room Guest');
  const joined = await app.inject({
    method: 'POST',
    url: `/api/v1/rooms/${room.code}/join`,
    headers: { cookie: guest, 'content-type': 'application/json' },
    payload: { password: 'secret' },
  });
  assert.equal(joined.statusCode, 200, joined.body);
  assert.equal(JSON.parse(joined.body).room.players.length, 2);
  assert.equal(JSON.parse(joined.body).room.gameplay, null);
});

test('room cap is enforced while existing players can rejoin', async () => {
  const host = await login('Cap Host');
  const created = JSON.parse((await app.inject({
    method: 'POST',
    url: '/api/v1/rooms',
    headers: { cookie: host, 'content-type': 'application/json' },
    payload: {},
  })).body);
  const guestOne = await login('Cap Guest One');
  const guestTwo = await login('Cap Guest Two');
  const guestThree = await login('Cap Guest Three');
  const join = (cookie) => app.inject({
    method: 'POST',
    url: `/api/v1/rooms/${created.code}/join`,
    headers: { cookie, 'content-type': 'application/json' },
    payload: {},
  });
  const firstJoin = await join(guestOne);
  assert.equal(firstJoin.statusCode, 200);
  const firstPlayerId = JSON.parse(firstJoin.body).playerId;
  assert.equal((await join(guestTwo)).statusCode, 200);
  const full = await join(guestThree);
  assert.equal(full.statusCode, 409);
  assert.equal(JSON.parse(full.body).error, 'room-full');
  const rejoin = await join(guestOne);
  assert.equal(rejoin.statusCode, 200);
  assert.equal(JSON.parse(rejoin.body).playerId, firstPlayerId);
  const room = JSON.parse((await app.inject({
    method: 'GET',
    url: `/api/v1/rooms/${created.code}`,
    headers: { cookie: host },
  })).body);
  assert.equal(room.players.length, 3);
  assert.equal(room.maxPlayers, 3);
});

test('room join rejects a wrong password', async () => {
  const host = await login('Password Host');
  const created = JSON.parse((await app.inject({
    method: 'POST',
    url: '/api/v1/rooms',
    headers: { cookie: host, 'content-type': 'application/json' },
    payload: { password: 'right' },
  })).body);
  const guest = await login('Password Guest');
  const joined = await app.inject({
    method: 'POST',
    url: `/api/v1/rooms/${created.code}/join`,
    headers: { cookie: guest, 'content-type': 'application/json' },
    payload: { password: 'wrong' },
  });
  assert.equal(joined.statusCode, 403);
});

test('profile stats expose only the five login records', async () => {
  const cookie = await login('Stats Pilot');
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/stats/me',
    headers: { cookie },
  });
  assert.equal(response.statusCode, 200);
  const stats = JSON.parse(response.body);
  assert.deepEqual(Object.keys(stats).sort(), ['dailyWins', 'streaks', 'winStreak']);
  assert.deepEqual(Object.keys(stats.streaks).sort(), ['audit', 'standard', 'timed']);
  assert.equal(stats.dailyWins, 0);
  assert.equal(stats.winStreak, 0);
});

test('profile stats count daily wins, daily streaks and per-mode streaks', () => {
  const nameKey = `profile-rules-${process.pid}`;
  const insert = (id, kind, gameplay, gameDay, status, finishedAt) => {
    db.prepare(`INSERT INTO online_runs(id, name_key, kind, gameplay, game_day, target_kill_id, target_ship_id, target_json, status, attempts, elapsed_ms, guesses_json, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, 1, 1, '{}', ?, 1, 0, '[]', ?, ?)`)
      .run(id, nameKey, kind, gameplay, gameDay, status, finishedAt - 1, finishedAt);
  };
  insert('profile-daily', 'daily', 'daily', '2026-11-21', 'won', 100);
  insert('profile-std-day1', 'random', 'standard', '2026-11-21', 'won', 200);
  insert('profile-std-day2-loss', 'random', 'standard', '2026-11-22', 'lost', 300);
  insert('profile-audit-day2', 'random', 'audit', '2026-11-22', 'won', 400);
  insert('profile-playing', 'random', 'timed', '2026-11-22', 'playing', 500);

  const stats = profileStats(nameKey, '2026-11-22');
  assert.equal(stats.dailyWins, 1);
  assert.equal(stats.winStreak, 2);
  assert.equal(stats.streaks.standard, 0);
  assert.equal(stats.streaks.audit, 1);
  assert.equal(stats.streaks.timed, 0);
  db.prepare('DELETE FROM online_runs WHERE name_key = ?').run(nameKey);
});

test('room disconnect grace, reconnect and kick are authoritative', async () => {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = app.server.address().port;
  const host = await login('Grace Host');
  const guest = await login('Grace Guest');
  const created = JSON.parse((await app.inject({
    method: 'POST',
    url: '/api/v1/rooms',
    headers: { cookie: host, 'content-type': 'application/json' },
    payload: {},
  })).body);
  const joined = JSON.parse((await app.inject({
    method: 'POST',
    url: `/api/v1/rooms/${created.code}/join`,
    headers: { cookie: guest, 'content-type': 'application/json' },
    payload: {},
  })).body);
  const url = (playerId) => `ws://127.0.0.1:${port}/api/v1/rooms/${created.code}/ws?player=${playerId}`;
  const open = (cookie, playerId) => new Promise((resolve, reject) => {
    const socket = new WebSocket(url(playerId), { headers: { Cookie: cookie } });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const room = async () => JSON.parse((await app.inject({
    method: 'GET',
    url: `/api/v1/rooms/${created.code}`,
    headers: { cookie: host },
  })).body);

  const hostSocket = await open(host, created.playerId);
  const guestSocket = await open(guest, joined.playerId);
  await wait(30);
  guestSocket.close();
  await wait(30);
  const during = await room();
  const guestDuring = during.players.find((player) => player.id === joined.playerId);
  assert.equal(during.ownerId, created.playerId);
  assert.equal(guestDuring.connected, false);
  assert.equal(guestDuring.reconnecting, true);

  const guestReconnect = await open(guest, joined.playerId);
  await wait(30);
  assert.equal((await room()).players.find((player) => player.id === joined.playerId).connected, true);

  hostSocket.send(JSON.stringify({ t: 'kick', playerId: joined.playerId }));
  const kicked = await new Promise((resolve) => {
    guestReconnect.once('message', (raw) => resolve(JSON.parse(String(raw))));
  });
  assert.equal(kicked.t, 'kicked');
  await wait(20);
  assert.equal((await room()).players.some((player) => player.id === joined.playerId), false);

  guestSocket.close();
  guestReconnect.close();
  hostSocket.close();
  await wait(50);
});

test('room owner transfer waits for the reconnect grace', async () => {
  const host = await login('Transfer Host');
  const guest = await login('Transfer Guest');
  const created = JSON.parse((await app.inject({
    method: 'POST',
    url: '/api/v1/rooms',
    headers: { cookie: host, 'content-type': 'application/json' },
    payload: {},
  })).body);
  const joined = JSON.parse((await app.inject({
    method: 'POST',
    url: `/api/v1/rooms/${created.code}/join`,
    headers: { cookie: guest, 'content-type': 'application/json' },
    payload: {},
  })).body);
  const port = app.server.address().port;
  const open = (cookie, playerId) => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/v1/rooms/${created.code}/ws?player=${playerId}`, {
      headers: { Cookie: cookie },
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const hostSocket = await open(host, created.playerId);
  const guestSocket = await open(guest, joined.playerId);
  await wait(30);
  hostSocket.close();
  await wait(30);
  let room = JSON.parse((await app.inject({
    method: 'GET', url: `/api/v1/rooms/${created.code}`, headers: { cookie: guest },
  })).body);
  assert.equal(room.ownerId, created.playerId);
  assert.equal(room.players.find((player) => player.id === created.playerId).reconnecting, true);
  await wait(5150);
  room = JSON.parse((await app.inject({
    method: 'GET', url: `/api/v1/rooms/${created.code}`, headers: { cookie: guest },
  })).body);
  assert.equal(room.ownerId, joined.playerId);
  assert.equal(room.players.some((player) => player.id === created.playerId), false);
  guestSocket.close();
});

test('upstream cache is bounded, expires entries and shares pending loads', async () => {
  let time = 0;
  let calls = 0;
  const cache = new TtlCache({ ttlMs: 100, max: 2, clock: () => time });
  const load = (key) => cache.load(key, async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return `${key}:${calls}`;
  });
  assert.deepEqual(await Promise.all([load('a'), load('a')]), ['a:1', 'a:1']);
  assert.equal(await load('a'), 'a:1');
  await load('b');
  await load('c');
  assert.equal(cache.size, 2);
  assert.equal(cache.get('a'), undefined);
  time = 100;
  assert.equal(cache.get('b'), undefined);
  cache.prune();
  assert.equal(cache.size, 0);
  await assert.rejects(cache.load('x', async () => { throw new Error('down'); }), /down/);
  assert.equal(await cache.load('x', async () => 'up'), 'up');
});

test('room snapshots are coalesced and expired empty rooms are dropped', async () => {
  const cookie = await login('Eviction Pilot');
  const create = async () => JSON.parse((await app.inject({
    method: 'POST', url: '/api/v1/rooms', headers: { cookie, 'content-type': 'application/json' }, payload: {},
  })).body).code;
  const idle = await create();
  const busy = await create();
  const fresh = await create();
  const stored = (code) => db.prepare('SELECT code FROM rooms WHERE code = ?').get(code);
  assert.equal(stored(idle), undefined, 'writes wait for the coalescing window');
  flushRooms();
  assert.equal(stored(idle).code, idle);
  ROOMS.get(idle).expiresAt = 1;
  ROOMS.get(busy).expiresAt = 1;
  [...ROOMS.get(busy).players.values()][0].connected = true;
  evictExpiredRooms();
  assert.equal(ROOMS.has(idle), false);
  assert.equal(ROOMS.has(busy), true, 'rooms with a connected player stay');
  assert.equal(ROOMS.has(fresh), true, 'rooms inside their TTL stay');
  const missing = await app.inject({ method: 'GET', url: `/api/v1/rooms/${idle}`, headers: { cookie } });
  assert.equal(missing.statusCode, 404);
  ROOMS.delete(busy);
  ROOMS.delete(fresh);
});

/** Replace zKill with synthetic loss pages and record every requested path. */
async function withLossPages(makePage, run) {
  const realFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    const { pathname } = new URL(String(url));
    requests.push(pathname);
    const ship = Number(/shipTypeID\/(\d+)\//.exec(pathname)?.[1]);
    if (!ship) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify(makePage(ship)), { status: 200 });
  };
  try {
    return await run(requests);
  } finally {
    globalThis.fetch = realFetch;
  }
}

const fittedItem = { flag: 19, item_type_id: 5973, quantity_destroyed: 1, quantity_dropped: 0 };
const cargoItem = { flag: 5, item_type_id: 34, quantity_destroyed: 10, quantity_dropped: 0 };
let killSerial = 1000;
const lossPage = (ship, flags) => flags.map((fitted) => ({
  killmail_id: killSerial += 1,
  zkb: { totalValue: 1 },
  victim: { ship_type_id: ship, items: fitted ? [fittedItem] : [cargoItem] },
}));

test('random targets come from the loss page without per-kill requests', async () => {
  const pool = config.manifest.normalShipPool;
  config.manifest.normalShipPool = [900001];
  try {
    await withLossPages((ship) => lossPage(ship, Array(20).fill(true)), async (requests) => {
      const seen = new Set();
      for (let i = 0; i < 5; i += 1) {
        const target = await getRandomTarget('standard');
        assert.equal(target.shipId, 900001);
        assert.equal(target.killmail.killmail_id, target.killId);
        assert.equal(target.killmail.victim.items.length, 1);
        seen.add(target.killId);
      }
      assert.equal(seen.size, 5, 'a cached sample never repeats a killmail');
      assert.equal(requests.length, 1, 'five targets share one page request');
      await getRandomTarget('standard');
      assert.equal(requests.length, 2, 'an exhausted sample is drawn again');
      assert.ok(requests.every((pathname) => pathname.startsWith('/api/losses/')));
    });
  } finally {
    config.manifest.normalShipPool = pool;
  }
});

test('spare targets are prepared after first use and handed out once', async () => {
  const pool = config.manifest.auditKillShipPool;
  config.manifest.auditKillShipPool = [900010, 900011, 900012];
  config.targetSpares = 2;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
  try {
    await withLossPages((ship) => lossPage(ship, Array(50).fill(true)), async (requests) => {
      await settle();
      assert.equal(requests.length, 0, 'nothing is requested before a pool is used');
      const seen = new Set();
      for (let i = 0; i < 12; i += 1) {
        const target = await getRandomTarget('audit');
        assert.equal(seen.has(target.killId), false, 'a target is handed out once');
        seen.add(target.killId);
        assert.ok(config.manifest.auditKillShipPool.includes(target.shipId));
        await settle();
      }
      // With spares ready the caller does not wait for the upstream service.
      globalThis.fetch = () => new Promise(() => {});
      const ready = await Promise.all([getRandomTarget('audit'), getRandomTarget('audit')]);
      assert.notEqual(ready[0].killId, ready[1].killId);
    });
  } finally {
    config.manifest.auditKillShipPool = pool;
    config.targetSpares = 0;
  }
});

test('a failed pick does not start background requests', async () => {
  const pool = config.manifest.normalShipPool;
  config.manifest.normalShipPool = Array.from({ length: 30 }, (_, index) => 900100 + index);
  config.targetSpares = 2;
  try {
    await withLossPages(() => [], async (requests) => {
      await assert.rejects(getRandomTarget('standard'), /no usable killmail/);
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(requests.length, 6, 'only the six hulls the caller tried');
    });
  } finally {
    config.manifest.normalShipPool = pool;
    config.targetSpares = 0;
  }
});

test('the empty-hull setting reaches random target selection', async () => {
  const cookie = await login('Empty Hull Pilot');
  const start = async (body) => JSON.parse((await app.inject({
    method: 'POST', url: '/api/v1/online/start',
    headers: { cookie, 'content-type': 'application/json' },
    payload: { gameplay: 'standard', ...body },
  })).body);
  const isEmpty = (run) => run.target.killmail.victim.items[0].flag === 5;
  const pool = config.manifest.normalShipPool;
  try {
    // One fitted loss among many empty hulls.
    config.manifest.normalShipPool = [900002];
    await withLossPages((ship) => lossPage(ship, [true, ...Array(60).fill(false)]), async () => {
      for (let i = 0; i < 6; i += 1) assert.equal(isEmpty(await start({ allowEmpty: false })), false);
    });
    // Only empty hulls: refused when disabled, used when enabled or unspecified.
    config.manifest.normalShipPool = [900003];
    await withLossPages((ship) => lossPage(ship, Array(8).fill(false)), async () => {
      assert.equal((await start({ allowEmpty: false })).error, 'target-unavailable');
      assert.equal(isEmpty(await start({ allowEmpty: true })), true);
      assert.equal(isEmpty(await start({})), true);
    });
    // A hull without fitted losses is skipped for the next one.
    config.manifest.normalShipPool = [900004, 900005];
    await withLossPages((ship) => lossPage(ship, Array(8).fill(ship === 900005)), async () => {
      for (let i = 0; i < 4; i += 1) {
        const run = await start({ allowEmpty: false });
        assert.equal(run.target.shipId, 900005);
      }
    });
  } finally {
    config.manifest.normalShipPool = pool;
  }
});

test('static assets are served precompressed with identical content', async () => {
  for (const [url, type] of [
    ['/js/main.js', /javascript/],
    ['/data/manifest.json', /application\/json/],
    ['/vendor/dogma-engine/esf_dogma_engine_bg.wasm', /application\/wasm/],
  ]) {
    const get = (encoding) => app.inject({ method: 'GET', url, headers: encoding ? { 'accept-encoding': encoding } : {} });
    const plain = await get('');
    assert.equal(plain.statusCode, 200, url);
    assert.equal(plain.headers['content-encoding'], undefined);
    for (const [encoding, decode] of [['br', zlib.brotliDecompressSync], ['gzip', zlib.gunzipSync]]) {
      const packed = await get(encoding);
      assert.equal(packed.headers['content-encoding'], encoding, url);
      assert.match(packed.headers['content-type'], type);
      assert.match(packed.headers.vary, /Accept-Encoding/);
      assert.ok(packed.rawPayload.length < plain.rawPayload.length);
      assert.ok(decode(packed.rawPayload).equals(plain.rawPayload), `${url} ${encoding}`);
      const cached = await app.inject({
        method: 'GET', url, headers: { 'accept-encoding': encoding, 'if-none-match': packed.headers.etag },
      });
      assert.equal(cached.statusCode, 304);
    }
    assert.match(plain.headers['content-type'], type);
  }
  for (const url of ['/', '/index.html', '/share/3/en.html']) {
    const html = await app.inject({ method: 'GET', url, headers: { 'accept-encoding': 'br, gzip' } });
    assert.equal(html.statusCode, 200, url);
    assert.equal(html.headers['content-encoding'], undefined);
    assert.match(html.headers['content-type'], /text\/html/);
  }
  const missing = await app.inject({ method: 'GET', url: '/js/nope.js', headers: { 'accept-encoding': 'br' } });
  assert.equal(missing.statusCode, 404);
});

test.after(async () => {
  await app.close();
  // Windows cannot delete an open database file.
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbFile}${suffix}`, { force: true }); } catch {}
  }
});
