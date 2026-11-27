import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
process.env.FITDLE_GAME_DAY_START_UTC = '11:00';
process.env.FITDLE_DAILY_ALLOW_EMPTY = '';
process.env.ROOM_ARBITRATION_BIG_ROUNDS = '2';
process.env.ROOM_ARBITRATION_MAX_BIG_ROUNDS = '4';
process.env.ROOM_TIMED_DURATION_MINUTES = '15';
process.env.ROOM_TIMED_MAX_DURATION_MINUTES = '30';
process.env.ROOM_RECONNECT_GRACE_MS = '5000';
process.env.TARGET_SPARES = '0';
process.env.API_CONTACT = 'ops@example.test';
process.env.API_CONTACT_PUBLIC = '0';
process.env.ZKILL_MIN_INTERVAL_MS = '0';
process.env.NODE_ENV = 'test';

const { config, parseFlag } = await import('../src/config.mjs');
const { characterIdFromSubject } = await import('../src/auth.mjs');
const {
  ROOMS, evictExpiredRooms, flushRooms, normalizeRoomSettings, nextBigRoundStep,
} = await import('../src/rooms.mjs');
const { zkill } = await import('../src/zkill.mjs');
const { clearHulls, getDailyTarget, getRandomTarget } = await import('../src/targets.mjs');
const { expireRuns = () => {} } = await import('../src/runs.mjs');
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

test('the API contact stays on the server unless it is published', async () => {
  const meta = async () => JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/meta' })).body);
  assert.match(config.userAgent, /\(ops@example\.test; \+https:/);
  assert.equal('contact' in await meta(), false);
  for (const url of ['/', '/data/manifest.json', '/api/v1/health', '/api/v1/auth/me']) {
    assert.equal((await app.inject({ method: 'GET', url })).body.includes('ops@example.test'), false, url);
  }
  config.publicContact = 'ops@example.test';
  assert.equal((await meta()).contact, 'ops@example.test');
  config.publicContact = '';
});

test('the game day start is a runtime setting published in meta', async () => {
  assert.equal(config.gameDayStartMinutes, 660);
  assert.equal(config.warnings.some((warning) => warning.includes('FITDLE_GAME_DAY_START_UTC')), false);
  const read = async (url) => JSON.parse((await app.inject({ method: 'GET', url })).body);
  assert.equal((await read('/api/v1/meta')).gameDayStartMinutes, 660);
  config.gameDayStartMinutes = 630;
  try {
    const meta = await read('/api/v1/meta');
    assert.equal(meta.gameDayStartMinutes, 630);
    assert.match(meta.nextReset, /T10:30:00/);
  } finally {
    config.gameDayStartMinutes = 660;
  }
});

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
  assert.equal(normalizeRoomSettings(base, { allowEmpty: false }).allowEmpty, false);
  assert.equal(normalizeRoomSettings({ ...base, allowEmpty: false }, { allowEmpty: true }).allowEmpty, true);
  assert.equal(normalizeRoomSettings({ ...base, allowEmpty: false }, { allowEmpty: 'yes' }).allowEmpty, false);
  assert.equal('allowEmpty' in normalizeRoomSettings(base, { allowEmpty: 1 }), false);
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
  zkill.reset();
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
      for (let i = 0; i < 15; i += 1) seen.add((await getRandomTarget('standard')).killId);
      assert.equal(seen.size, 20, 'the whole page is used before anything repeats');
      await getRandomTarget('standard');
      assert.equal(requests.length, 1, 'drawing again never requests the page within its lifetime');
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

test('running out of fitted losses does not repeat the remaining empty ones', async () => {
  const pool = config.manifest.normalShipPool;
  config.manifest.normalShipPool = [900030];
  try {
    // Two fitted and ten empty losses.
    await withLossPages((ship) => lossPage(ship, [true, true, ...Array(10).fill(false)]), async () => {
      const seen = new Set();
      for (let i = 0; i < 4; i += 1) await getRandomTarget('standard', { allowEmpty: false });
      for (let i = 0; i < 10; i += 1) {
        const { killId } = await getRandomTarget('standard');
        assert.equal(seen.has(killId), false, 'no repeat before the page is used up');
        seen.add(killId);
      }
    });
  } finally {
    config.manifest.normalShipPool = pool;
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

const REAL_SHIP = 587;
const OTHER_SHIPS = [588, 589, 590, 591, 592, 593, 594];

/** A single-hull pool with one fitted loss page per run. */
async function withSoloPool(run, flags = Array(40).fill(true)) {
  const saved = [config.manifest.normalShipPool, config.manifest.auditKillShipPool];
  config.manifest.normalShipPool = [REAL_SHIP];
  config.manifest.auditKillShipPool = [REAL_SHIP];
  clearHulls();
  try {
    return await withLossPages((ship) => lossPage(ship, flags), run);
  } finally {
    [config.manifest.normalShipPool, config.manifest.auditKillShipPool] = saved;
    clearHulls();
  }
}

/** Calls the online API as one pilot. */
async function soloPilot(name) {
  const cookie = await login(name);
  const call = async (method, url, payload) => {
    const response = await app.inject({
      method, url, headers: { cookie, ...(payload ? { 'content-type': 'application/json' } : {}) }, payload,
    });
    return { status: response.statusCode, body: JSON.parse(response.body || 'null') };
  };
  return {
    start: async (gameplay, extra = {}) => (await call('POST', '/api/v1/online/start', { gameplay, allowEmpty: true, ...extra })).body,
    custom: (gameplay, kb) => call('POST', '/api/v1/online/custom', { gameplay, kb: String(kb) }),
    daily: () => call('GET', '/api/v1/online/daily'),
    run: (id) => call('GET', `/api/v1/online/runs/${id}`),
    guess: (id, shipId, extra = {}) => call('POST', `/api/v1/online/runs/${id}/guess`, { shipId, ...extra }),
    finish: (id, payload) => call('POST', `/api/v1/online/runs/${id}/finish`, payload),
    begin: (id, extra = {}) => call('POST', `/api/v1/online/runs/${id}/begin`, extra),
    abandon: (id) => call('POST', `/api/v1/online/runs/${id}/abandon`, {}),
    stats: async () => (await call('GET', '/api/v1/stats/me')).body,
  };
}

test('the service counts, checks and judges solo guesses', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Guess Pilot');
    const run = await pilot.start('standard');
    assert.equal((await pilot.guess(run.runId, 1)).status, 400, 'unknown ship');
    assert.equal((await pilot.guess(run.runId, 'cni')).status, 400);
    const first = await pilot.guess(run.runId, OTHER_SHIPS[0]);
    assert.equal(first.status, 200);
    assert.equal(first.body.attempts, 1);
    const again = await pilot.guess(run.runId, OTHER_SHIPS[0]);
    assert.deepEqual([again.status, again.body.attempts], [200, 1], 'a repeated submission is not counted twice');
    const won = await pilot.guess(run.runId, REAL_SHIP);
    assert.equal(won.body.status, 'won');
    assert.deepEqual(won.body.guesses, [OTHER_SHIPS[0], REAL_SHIP]);
    assert.equal((await pilot.guess(run.runId, REAL_SHIP)).status, 200, 'a retried last guess stays a success');
    const late = await pilot.guess(run.runId, OTHER_SHIPS[1]);
    assert.deepEqual([late.status, late.body.error, late.body.run?.status], [409, 'run-already-finished', 'won']);
    assert.equal((await pilot.stats()).streaks.standard, 1);

    const next = await pilot.start('standard');
    for (const ship of OTHER_SHIPS.slice(0, 6)) await pilot.guess(next.runId, ship);
    assert.equal((await pilot.run(next.runId)).body.status, 'lost', 'six misses lose');
    assert.equal((await pilot.guess(next.runId, REAL_SHIP)).status, 409);
    assert.equal((await pilot.stats()).streaks.standard, 0);
  });
});

test('a result cannot be claimed without the guesses', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Claim Pilot');
    const run = await pilot.start('standard');
    const claim = await pilot.finish(run.runId, {
      status: 'won', attempts: 1, elapsedMs: 0, answerId: REAL_SHIP, guesses: [OTHER_SHIPS[0]],
    });
    assert.equal(claim.status, 400);
    assert.equal((await pilot.run(run.runId)).body.status, 'playing');
    assert.equal((await pilot.finish(run.runId, { status: 'lost' })).status, 400, 'standard has no giving up');
    assert.equal((await pilot.stats()).streaks.standard, 0);

    const timed = await pilot.start('timed');
    await pilot.guess(timed.runId, OTHER_SHIPS[0], { elapsedMs: 5 });
    const lost = await pilot.finish(timed.runId, { status: 'lost', elapsedMs: 9e9 });
    assert.equal(lost.body.status, 'lost');
    assert.ok(lost.body.elapsedMs < 10_000, 'time cannot exceed the time since the start');
    assert.equal((await pilot.finish(timed.runId, { status: 'lost' })).status, 200, 'a retried give-up stays a success');
  });
});

test('an unfinished started run is resumed; only abandoning it is a loss', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Resume Pilot');
    const run = await pilot.start('standard');
    await pilot.guess(run.runId, REAL_SHIP);
    const second = await pilot.start('standard');
    assert.notEqual(second.runId, run.runId);
    assert.equal((await pilot.start('standard')).runId, second.runId, 'a reload keeps the target');
    assert.equal((await pilot.abandon(second.runId)).status, 200);
    assert.equal((await pilot.run(second.runId)).status, 404, 'an unguessed run leaves no record');
    assert.equal((await pilot.stats()).streaks.standard, 1);

    const third = await pilot.start('standard');
    assert.notEqual(third.runId, second.runId);
    await pilot.guess(third.runId, OTHER_SHIPS[0]);
    await pilot.start('audit');
    const resumed = await pilot.start('standard');
    assert.deepEqual([resumed.runId, resumed.guesses], [third.runId, [OTHER_SHIPS[0]]]);
    assert.equal((await pilot.abandon(third.runId)).body.status, 'lost');
    assert.equal((await pilot.stats()).streaks.standard, 0);
    assert.equal((await pilot.abandon(third.runId)).status, 200, 'abandoning twice is harmless');
    assert.notEqual((await pilot.start('standard')).runId, third.runId);

    const stranger = await soloPilot('Solo Stranger Pilot');
    const open = await pilot.start('standard');
    assert.equal((await stranger.abandon(open.runId)).status, 404);
    assert.equal((await stranger.guess(open.runId, REAL_SHIP)).status, 404);
  });
});

test('starting the clock starts a timed run', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Clock Pilot');
    const won = await pilot.start('timed');
    await pilot.guess(won.runId, REAL_SHIP);
    assert.equal((await pilot.stats()).streaks.timed, 1);

    const run = await pilot.start('timed');
    assert.equal(run.begun, false);
    db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 3 * 86400e3, run.runId);
    const begun = await pilot.begin(run.runId, { elapsedMs: 5000 });
    assert.deepEqual([begun.status, begun.body.begun, begun.body.attempts], [200, true, 0]);
    assert.ok(Math.abs(Date.now() - 5000 - begun.body.startedAt) < 1500, 'the clock started when the player pressed start');
    const again = await pilot.begin(run.runId, { elapsedMs: 0 });
    assert.deepEqual([again.status, again.body.startedAt], [200, begun.body.startedAt], 'pressed once');
    expireRuns();
    const resumed = await pilot.start('timed', { allowEmpty: false });
    assert.deepEqual([resumed.runId, resumed.begun], [run.runId, true], 'a reload continues it');
    assert.equal((await pilot.abandon(run.runId)).body.status, 'lost');
    assert.equal((await pilot.stats()).streaks.timed, 0);
    assert.equal((await pilot.begin(run.runId)).status, 409);

    const left = await pilot.start('timed');
    await pilot.begin(left.runId);
    db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 25 * 3600e3, left.runId);
    expireRuns();
    assert.equal((await pilot.run(left.runId)).body.status, 'lost', 'unfinished for a day');

    const fresh = await pilot.start('timed');
    await pilot.abandon(fresh.runId);
    assert.equal((await pilot.run(fresh.runId)).status, 404, 'before the clock a target can be changed freely');
    const standard = await pilot.start('standard');
    assert.equal((await pilot.begin(standard.runId)).status, 400);
    const stranger = await soloPilot('Solo Clock Stranger');
    assert.equal((await stranger.begin(standard.runId)).status, 404);
  });
});

test('a database of an older release gains the begun column', () => {
  const file = path.join(ROOT, '.cache', `online-old-${process.pid}.sqlite`);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
  const columns = db.prepare('PRAGMA table_info(online_runs)').all().filter((column) => column.name !== 'begun_at')
    .map((column) => `${column.name} ${column.type}`).join(', ');
  const script = [
    "const { DatabaseSync } = await import('node:sqlite');",
    `const old = new DatabaseSync(${JSON.stringify(file)}); old.exec(${JSON.stringify(`CREATE TABLE online_runs (${columns}); INSERT INTO online_runs(id, kind) VALUES ('keep', 'random')`)}); old.close();`,
    "for (let i = 0; i < 2; i += 1) { const { db } = await import('./server/src/db.mjs?' + i); if (i) console.log(JSON.stringify(db.prepare('SELECT id, begun_at FROM online_runs').all())); db.close(); }",
  ].join('\n');
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, env: { ...process.env, DATABASE_PATH: file }, encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(run.stdout || 'null'), [{ id: 'keep', begun_at: null }], run.stderr);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
});

test('an empty unguessed target is replaced when empty hulls are off', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Empty Pilot');
    const run = await pilot.start('standard');
    db.prepare('UPDATE online_runs SET target_json = ? WHERE id = ?').run(JSON.stringify({
      killId: run.target.killId, shipId: REAL_SHIP, killmail: { ...run.target.killmail, victim: { ship_type_id: REAL_SHIP, items: [cargoItem] } },
    }), run.runId);
    assert.equal((await pilot.start('standard')).runId, run.runId);
    assert.notEqual((await pilot.start('standard', { allowEmpty: false })).runId, run.runId);
  });
});

test('a run left unfinished for a day after its first guess is lost', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Expired Pilot');
    const run = await pilot.start('standard');
    // The day is counted from the first guess, not from handing out the target.
    db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 3 * 86400e3, run.runId);
    assert.equal((await pilot.guess(run.runId, OTHER_SHIPS[0])).body.status, 'playing');
    expireRuns();
    assert.equal((await pilot.run(run.runId)).body.status, 'playing');
    db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 25 * 3600e3, run.runId);
    expireRuns();
    assert.equal((await pilot.run(run.runId)).body.status, 'lost');
    const other = await pilot.start('standard');
    await pilot.guess(other.runId, OTHER_SHIPS[0]);
    db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 25 * 3600e3, other.runId);
    assert.equal((await pilot.guess(other.runId, REAL_SHIP)).status, 409);
    assert.notEqual((await pilot.start('standard')).runId, other.runId);
  });
});

test('custom killmails are playable and resumable but never counted', async () => {
  await withSoloPool(async () => {
    const pages = globalThis.fetch;
    globalThis.fetch = async (url) => (/killID/.test(String(url))
      ? new Response(JSON.stringify([{ ...lossPage(REAL_SHIP, [true])[0], killmail_id: 777001 }]))
      : pages(url));
    try {
      const pilot = await soloPilot('Solo Custom Pilot');
      const statRows = () => db.prepare('SELECT COUNT(*) AS n FROM target_stats WHERE target_kill_id = 777001').get().n;
      const run = (await pilot.custom('standard', 777001)).body;
      await pilot.guess(run.runId, OTHER_SHIPS[0]);
      const resumed = (await pilot.custom('standard', 777001)).body;
      assert.deepEqual([resumed.runId, resumed.guesses], [run.runId, [OTHER_SHIPS[0]]]);
      assert.equal((await pilot.guess(run.runId, REAL_SHIP)).body.status, 'won');
      const random = await pilot.start('standard');
      await pilot.guess(random.runId, REAL_SHIP);
      const replay = (await pilot.custom('standard', 777001)).body;
      assert.notEqual(replay.runId, run.runId);
      for (const ship of OTHER_SHIPS.slice(0, 6)) await pilot.guess(replay.runId, ship);
      const stats = await pilot.stats();
      assert.equal(stats.streaks.standard, 1, 'neither the win nor the loss of a custom killmail counts');
      assert.equal(stats.winStreak, 1);
      assert.equal(statRows(), 0);
      // A custom win alone is no winning day either.
      const other = await soloPilot('Solo Custom Only Pilot');
      const only = (await other.custom('standard', 777001)).body;
      await other.guess(only.runId, REAL_SHIP);
      assert.equal((await other.stats()).winStreak, 0);
    } finally {
      globalThis.fetch = pages;
    }
  });
});

test('attackers never reach the cache, the database or a player', async () => {
  const makePage = (ship) => lossPage(ship, Array(5).fill(true)).map((kill) => ({ ...kill, attackers: [{ character_id: 90000077 }] }));
  const saved = config.manifest.normalShipPool;
  config.manifest.normalShipPool = [REAL_SHIP];
  clearHulls();
  try {
    await withLossPages(makePage, async () => {
      const pilot = await soloPilot('Solo Slim Pilot');
      const run = await pilot.start('standard');
      assert.ok(run.target.killmail.victim.items.length);
      assert.equal(JSON.stringify(run).includes('attackers'), false);
      const stored = db.prepare('SELECT target_json FROM online_runs WHERE id = ?').get(run.runId).target_json;
      assert.equal(stored.includes('90000077'), false);
      const entry = [...zkill.entries.values()][0];
      assert.equal(zlib.gunzipSync(entry.body).toString().includes('attackers'), false);
    });
  } finally {
    config.manifest.normalShipPool = saved;
    clearHulls();
  }
});

test('only files of the current release are cached for long', async () => {
  const cache = async (url) => (await app.inject({ method: 'GET', url })).headers['cache-control'];
  const version = /\/main\.js\?v=([\w.-]+)/.exec(fs.readFileSync(path.join(config.staticDir, 'index.html'), 'utf8'))[1];
  assert.match(await cache(`/js/main.js?v=${version}`), /max-age=31536000, immutable/);
  assert.match(await cache(`/styles/app.css?v=${version}`), /immutable/);
  for (const url of ['/', '/js/main.js', '/js/main.js?v=0.0.1-aaaa', `/data/manifest.json?v=${version}`, `/js/none.js?v=${version}`]) {
    assert.equal(/immutable/.test(await cache(url) || ''), false, url);
  }
});

test('a killmail this service knows opens although zKillboard finds nothing', async () => {
  await withSoloPool(async (requests) => {
    const pilot = await soloPilot('Solo Stored Pilot');
    const run = await pilot.start('standard');
    const before = requests.length;
    const other = await soloPilot('Solo Stored Friend');
    const custom = await other.custom('audit', run.target.killId);
    assert.deepEqual([custom.status, custom.body.kind, custom.body.target?.killId], [200, 'custom', run.target.killId]);
    assert.equal(requests.length, before);
    assert.equal((await other.custom('audit', 123456789)).status, 503);
  });
});

test('opening Daily in two pages at once yields one run', async () => {
  const day = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/meta' })).body).gameDay;
  db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
  const pool = config.manifest.normalShipPool;
  config.manifest.normalShipPool = [REAL_SHIP];
  const kills = lossPage(REAL_SHIP, Array(3).fill(true)).map((kill) => ({ ...kill, killmail_time: '2025-06-01T00:00:00Z' }));
  try {
    await withLossPages(() => kills, async () => {
      const pilot = await soloPilot('Solo Daily Pilot');
      const answers = await Promise.all([pilot.daily(), pilot.daily()]);
      assert.deepEqual(answers.map((item) => item.status), [200, 200]);
      assert.equal(answers[0].body.runId, answers[1].body.runId);
      await pilot.guess(answers[0].body.runId, OTHER_SHIPS[0]);
      const back = (await pilot.daily()).body;
      assert.deepEqual([back.guesses, back.attempts], [[OTHER_SHIPS[0]], 1]);
      assert.equal((await pilot.abandon(back.runId)).status, 400, 'Daily has no other target');
    });
  } finally {
    config.manifest.normalShipPool = pool;
    db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
  }
});

test('the daily empty-hull setting parses flags and defaults to allowed', () => {
  assert.equal(config.dailyAllowEmpty, true);
  for (const value of ['true', 'TRUE', '1', 'yes', ' Yes ']) assert.equal(parseFlag(value), true, value);
  for (const value of ['false', 'False', '0', 'no', ' NO ']) assert.equal(parseFlag(value), false, value);
  for (const value of [undefined, '', 'off', '2', 'nope']) assert.equal(parseFlag(value), null, String(value));
  const script = "const { config } = await import('./server/src/config.mjs');"
    + "console.log(JSON.stringify([config.dailyAllowEmpty, config.warnings.some((w) => w.includes('FITDLE_DAILY_ALLOW_EMPTY'))]));";
  const read = (value) => spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, FITDLE_DAILY_ALLOW_EMPTY: value },
  }).stdout.trim();
  assert.equal(read('no'), '[false,false]');
  assert.equal(read('1'), '[true,false]');
  assert.equal(read('maybe'), '[true,true]');
});

test('the daily empty-hull setting decides which killmail is pinned', async () => {
  const saved = [config.manifest.normalShipPool, config.manifest.kbMaxScanPages, config.dailyAllowEmpty];
  const days = Array.from({ length: 5 }, (_, index) => `2031-0${index + 1}-15`);
  const dated = (flags, time = '2025-06-01T00:00:00Z') => lossPage(REAL_SHIP, flags)
    .map((kill) => ({ ...kill, killmail_time: time }));
  const isEmpty = (target) => target.killmail.victim.items[0].flag === cargoItem.flag;
  const pin = (day, kills) => withLossPages(() => kills, () => getDailyTarget(day));
  config.manifest.normalShipPool = [REAL_SHIP];
  try {
    // One fitted loss among many empty hulls.
    config.dailyAllowEmpty = false;
    const oneFitted = [true, ...Array(60).fill(false)];
    for (const day of days.slice(0, 2)) assert.equal(isEmpty(await pin(day, dated(oneFitted))), false, day);
    await assert.rejects(pin(days[2], dated(Array(8).fill(false))), /no daily target/);
    // The scan cap leaves the target time unreached, so the fallback pick chooses.
    config.manifest.kbMaxScanPages = 1;
    const capped = dated([true, ...Array(199).fill(false)], '2030-12-31T23:00:00Z');
    assert.equal(isEmpty(await pin(days[3], capped)), false);
    config.manifest.kbMaxScanPages = saved[1];

    config.dailyAllowEmpty = true;
    const allowed = await pin(days[4], dated(Array(8).fill(false)));
    assert.equal(isEmpty(allowed), true);
    // A stored day keeps its target after the setting changes.
    config.dailyAllowEmpty = false;
    assert.equal((await pin(days[4], dated([true]))).killId, allowed.killId);
  } finally {
    [config.manifest.normalShipPool, config.manifest.kbMaxScanPages, config.dailyAllowEmpty] = saved;
    for (const day of days) db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
  }
});

test('logs carry paths without query strings', async () => {
  const lines = [];
  const logged = await buildApp({ logStream: { write: (line) => lines.push(line) } });
  await logged.inject({ method: 'GET', url: '/api/v1/auth/eve/callback?code=SECRETCODE&state=SECRETSTATE' });
  await logged.inject({ method: 'GET', url: '/api/v1/rooms/ABCD2345/ws?player=SECRETPLAYER' });
  await logged.inject({ method: 'POST', url: '/api/v1/online/start?x=SECRETQUERY', headers: { 'content-type': 'application/json' }, payload: '{bad' });
  await logged.close();
  const text = lines.join('');
  assert.match(text, /\/api\/v1\/auth\/eve\/callback/);
  assert.equal(/SECRET|ops@example/.test(text), false);
});

test('security headers are present on pages, assets and API answers', async () => {
  for (const url of ['/', '/api/v1/meta', '/data/manifest.json', '/api/v1/none']) {
    const { headers } = await app.inject({ method: 'GET', url });
    assert.equal(headers['x-content-type-options'], 'nosniff', url);
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin', url);
    assert.equal(headers['x-frame-options'], 'SAMEORIGIN', url);
    assert.equal(headers['content-security-policy'], undefined, url);
  }
});

test('the SSO state belongs to the browser that started the login', async () => {
  const saved = { ...config.eve };
  Object.assign(config.eve, { clientId: 'client', clientSecret: 'secret' });
  const realFetch = globalThis.fetch;
  let tokenRequests = 0;
  let metadataFails = true;
  globalThis.fetch = async (url) => {
    if (String(url).includes('.well-known')) {
      if (metadataFails) return new Response('down', { status: 503 });
      return new Response(JSON.stringify({
        authorization_endpoint: 'https://login.eveonline.com/v2/oauth/authorize',
        token_endpoint: 'https://login.eveonline.com/v2/oauth/token',
        jwks_uri: 'https://login.eveonline.com/oauth/jwks',
      }));
    }
    tokenRequests += 1;
    return new Response('no', { status: 400 });
  };
  const start = (cookie) => app.inject({ method: 'GET', url: '/api/v1/auth/eve/start', headers: cookie ? { cookie } : {} });
  const callback = (state, cookie) => app.inject({
    method: 'GET', url: `/api/v1/auth/eve/callback?code=c&state=${state}`, headers: cookie ? { cookie } : {},
  });
  try {
    const down = await start();
    assert.equal(down.statusCode, 302);
    assert.match(down.headers.location, /\/\?auth_error=sso$/, 'a failing SSO leads back to the page');
    metadataFails = false;

    const first = await start();
    const state = new URL(first.headers.location).searchParams.get('state');
    const raw = String([].concat(first.headers['set-cookie'])[0]);
    assert.match(raw, /HttpOnly/i);
    assert.match(raw, /SameSite=Lax/i);
    const cookie = raw.split(';')[0];
    assert.match((await callback(state)).headers.location, /auth_error=state/, 'another browser');
    assert.equal(tokenRequests, 0);

    // Two tabs of the same browser may log in side by side.
    const second = await start(cookie);
    const both = String([].concat(second.headers['set-cookie'])[0]).split(';')[0];
    const secondState = new URL(second.headers.location).searchParams.get('state');
    assert.match((await callback(secondState, both)).headers.location, /auth_error=sso/, 'reached the token request');
    assert.equal(tokenRequests, 1);
    assert.match((await callback(secondState, both)).headers.location, /auth_error=state/, 'used once');
    const third = await start(cookie);
    const thirdCookie = String([].concat(third.headers['set-cookie'])[0]).split(';')[0];
    assert.match(decodeURIComponent(thirdCookie), new RegExp(state), 'the other tab stays valid');
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(config.eve, saved);
  }
});

test('starting runs and creating rooms is limited per player', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Flood Pilot');
    const answers = [];
    for (let i = 0; i < 32; i += 1) answers.push(await pilot.start('standard'));
    assert.ok(answers.slice(0, 30).every((item) => item.runId));
    assert.equal(answers[31].error, 'rate-limited');
    assert.ok((await (await soloPilot('Calm Pilot')).start('standard')).runId);
  });
  const cookie = await login('Room Flood Pilot');
  const create = async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/rooms', headers: { cookie, 'content-type': 'application/json' }, payload: {},
    });
    const code = JSON.parse(response.body).code;
    const room = ROOMS.get(code);
    if (room) for (const player of room.players.values()) clearTimeout(player.reconnectTimer);
    ROOMS.delete(code);
    return response.statusCode;
  };
  const statuses = [];
  for (let i = 0; i < 12; i += 1) statuses.push(await create());
  assert.ok(statuses.slice(0, 10).every((status) => status === 200));
  assert.equal(statuses.at(-1), 429);
});

test('development login needs a loopback origin in production', () => {
  const read = (env) => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e',
      "const { config } = await import('./server/src/config.mjs'); console.log(JSON.stringify([config.devAuth, config.warnings.length]));"], {
      cwd: ROOT,
      env: { ...process.env, SESSION_SECRET: 'x', FITDLE_DEV_AUTH: '1', ...env },
      encoding: 'utf8',
    });
    return JSON.parse(run.stdout);
  };
  assert.deepEqual(read({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://fitdle.test' }), [false, 1]);
  assert.deepEqual(read({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://127.0.0.1:8787' }), [true, 0]);
  assert.deepEqual(read({ NODE_ENV: '', PUBLIC_ORIGIN: 'https://fitdle.test' }), [true, 0]);
  assert.deepEqual(read({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://127.0.0.1:8787', SESSION_SECRET: ' ' }), [true, 1]);
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
