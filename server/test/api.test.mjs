import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
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
process.env.TARGET_SHELF_SIZE = '0';
process.env.TARGET_REFILL_INTERVAL_MS = '0';
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
const {
  resetTargets, shelfIdle, getDailyTarget, getRandomTarget, loadDailyPin, currentWeights,
} = await import('../src/targets.mjs');
const { expireRuns = () => {} } = await import('../src/runs.mjs');
const { buildApp } = await import('../src/index.mjs');
const { sessionSecretWarnings } = await import('../src/startup.mjs');
const { db, cleanupExpired } = await import('../src/db.mjs');
const { profileStats, recordPlay } = await import('../src/stats.mjs');
const { difficultyReport, parseArgs } = await import('../src/difficulty-report.mjs');
const { RUN_PROTOCOL_HEADER, RUN_PROTOCOL_VERSION } = await import('../../js/run-sync.js');
const RUN_HEADERS = { [RUN_PROTOCOL_HEADER]: String(RUN_PROTOCOL_VERSION) };
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
  const daily = await app.inject({ method: 'GET', url: '/api/v1/online/daily', headers: RUN_HEADERS });
  assert.equal(daily.statusCode, 401);
  const start = await app.inject({
    method: 'POST',
    url: '/api/v1/online/start',
    headers: { ...RUN_HEADERS, 'content-type': 'application/json' },
    payload: { gameplay: 'standard' },
  });
  assert.equal(start.statusCode, 401);
});

test('a page of another run protocol is asked to reload', async () => {
  const cookie = await login('Outdated Page Pilot');
  for (const headers of [{ cookie }, { cookie, [RUN_PROTOCOL_HEADER]: '1' }]) {
    const response = await app.inject({ method: 'GET', url: '/api/v1/online/daily', headers });
    assert.equal(response.statusCode, 426);
    assert.deepEqual(JSON.parse(response.body), { error: 'client-outdated', protocol: RUN_PROTOCOL_VERSION });
  }
  const meta = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/meta' })).body);
  assert.equal(meta.runProtocol, RUN_PROTOCOL_VERSION);
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
  const url = (playerId) => `ws://127.0.0.1:${port}/api/v1/rooms/${created.code}/ws?player=${playerId}&v=2`;
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
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/v1/rooms/${created.code}/ws?player=${playerId}&v=2`, {
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

const realShips = config.catalogShips;

/** Only these hulls are playable (without usage data: recent months, first page); null restores the catalog. */
function usePool(ids) {
  config.catalogShips = ids ? ids.map((id) => ({ id, groupID: 25 })) : realShips;
  config.shipUsage = null;
  resetTargets();
}

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
    return new Response(JSON.stringify(makePage(ship, pathname)), { status: 200 });
  };
  try {
    return await run(requests);
  } finally {
    globalThis.fetch = realFetch;
  }
}

const fittedItem = { flag: 19, item_type_id: 5973, quantity_destroyed: 1, quantity_dropped: 0 };
const cargoItem = { flag: 5, item_type_id: 34, quantity_destroyed: 10, quantity_dropped: 0 };
// Long ids: sealed answers are searched for the id as text, and a short one can
// turn up by chance inside a timestamp, a run id or a case number.
let killSerial = 9_990_000_000_000;
const lossPage = (ship, flags) => flags.map((fitted) => ({
  killmail_id: killSerial += 1,
  killmail_time: '2025-06-01T10:00:00Z',
  zkb: { totalValue: 1 },
  victim: { ship_type_id: ship, items: fitted ? [fittedItem] : [cargoItem] },
}));

test('random targets come from the loss page without per-kill requests', async () => {
  usePool([900001]);
  try {
    await withLossPages((ship) => lossPage(ship, Array(20).fill(true)), async (requests) => {
      for (let i = 0; i < 5; i += 1) {
        const target = await getRandomTarget('standard');
        assert.equal(target.shipId, 900001);
        assert.equal(target.killmail.killmail_id, target.killId);
        assert.equal(target.killmail.victim.items.length, 1);
      }
      // A hull without usage data is read month by month, never by the unfiltered newest page.
      assert.ok(requests.length >= 1 && requests.length <= 5);
      assert.ok(requests.every((pathname) => /^\/api\/losses\/shipTypeID\/900001\/year\/\d{4}\/month\/\d+\/page\/1\/$/.test(pathname)), requests.join());
    });
  } finally {
    usePool(null);
  }
});

test('a hull with usage data is asked for one month and page by its loss count', async () => {
  usePool([900040]);
  // Only 2025-03 and 2025-04 have losses; 450 losses of 2025-04 are three pages.
  config.shipUsage = { version: 1, ships: { 900040: { m: { 202503: [0, 5], 202504: [0, 450], 202505: [9, 0] } } } };
  try {
    await withLossPages((ship) => lossPage(ship, Array(30).fill(true)), async (requests) => {
      for (let i = 0; i < 20; i += 1) {
        resetTargets();
        config.shipUsage = { version: 1, ships: { 900040: { m: { 202503: [0, 5], 202504: [0, 450], 202505: [9, 0] } } } };
        await getRandomTarget('standard');
      }
      const seen = new Set(requests);
      assert.ok(requests.length > 0 && requests.every((pathname) => /^\/api\/losses\/shipTypeID\/900040\/year\/2025\/month\/[34]\/page\/[123]\/$/.test(pathname)), [...seen].join());
      assert.ok([...seen].every((pathname) => !pathname.includes('page/4') && !pathname.includes('month/5')));
      assert.ok(seen.size > 1, 'different months and pages are drawn');
    });
  } finally {
    usePool(null);
  }
});

test('the queue falls through hulls without killmails and remembers them', async () => {
  usePool(Array.from({ length: 6 }, (_, index) => 900100 + index));
  try {
    await withLossPages((ship) => (ship === 900103 ? lossPage(ship, [true, true]) : []), async (requests) => {
      const target = await getRandomTarget('standard');
      assert.equal(target.shipId, 900103, 'hulls without killmails are skipped');
      assert.ok(requests.length <= 18);
    });
    usePool(Array.from({ length: 30 }, (_, index) => 900100 + index));
    // Every hull is empty: a pick gives up after twelve hulls, the next one skips them.
    await withLossPages(() => [], async (requests) => {
      await assert.rejects(getRandomTarget('standard'), /no usable killmail/);
      const hulls = (list) => new Set(list.map((pathname) => /shipTypeID\/(\d+)\//.exec(pathname)[1]));
      assert.equal(hulls(requests).size, 12);
      const first = hulls(requests);
      const firstCount = requests.length;
      requests.length = 0;
      await assert.rejects(getRandomTarget('standard'), /no usable killmail/);
      assert.equal(hulls(requests).size, 12);
      assert.equal([...hulls(requests)].some((id) => first.has(id)), false, 'remembered hulls are not asked again');
      const count = requests.length;
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(requests.length, count, 'a failed pick starts no background requests');
      assert.ok(firstCount >= 12);
    });
  } finally {
    usePool(null);
  }
});

test('a room never gets the same killmail twice, but may get the same hull', async () => {
  usePool([900050]);
  // The same five killmails whatever month is asked for.
  const fixedPage = lossPage(900050, Array(5).fill(true));
  try {
    await withLossPages(() => fixedPage, async () => {
      const used = new Set();
      for (let i = 0; i < 5; i += 1) {
        const target = await getRandomTarget('standard', { excludeKillIds: used });
        assert.equal(target.shipId, 900050);
        assert.equal(used.has(target.killId), false);
        used.add(target.killId);
      }
      await assert.rejects(getRandomTarget('standard', { excludeKillIds: used }), /no usable killmail/);
      // A refusal caused by the room's own history is not remembered for everybody.
      assert.equal((await getRandomTarget('standard')).shipId, 900050);
    });
  } finally {
    usePool(null);
  }
});

test('the shelf hands out prepared targets once and refills below half', async () => {
  usePool([900060]);
  config.targetShelfSize = 4;
  try {
    await withLossPages((ship) => lossPage(ship, [...Array(10).fill(true), ...Array(10).fill(false)]), async (requests) => {
      const count = () => db.prepare('SELECT COUNT(*) AS n FROM target_shelf').get().n;
      assert.equal(count(), 0, 'nothing is prepared before the first pick');
      await getRandomTarget('standard');
      await shelfIdle();
      assert.equal(count(), 4, 'the first pick fills the shelf');
      requests.length = 0;
      // Without network the shelf still serves; each target once.
      const realFetch = globalThis.fetch;
      globalThis.fetch = () => Promise.reject(new Error('offline'));
      const seen = new Set();
      try {
        const a = await getRandomTarget('standard');
        const b = await getRandomTarget('standard');
        seen.add(a.killId).add(b.killId);
        assert.equal(seen.size, 2);
        assert.equal(count(), 2, 'two left, not yet below half');
      } finally {
        globalThis.fetch = realFetch;
      }
      // Entries expire: an old one is never handed out.
      const stale = new Set(db.prepare('SELECT kill_id FROM target_shelf').all().map((row) => Number(row.kill_id)));
      assert.ok(stale.size > 0);
      db.prepare('UPDATE target_shelf SET created_at = 1').run();
      // A live pick may draw any killmail of a page it reads. With the cached
      // pages dropped, new pages carry new ids, so only the shelf could still
      // yield an expired one.
      zkill.reset();
      requests.length = 0;
      const fresh = await getRandomTarget('standard');
      assert.ok(requests.length > 0, 'the target is picked live');
      assert.equal(stale.has(fresh.killId), false, 'an expired shelf entry is not served');
      const expired = db.prepare('SELECT COUNT(*) AS n FROM target_shelf WHERE created_at = 1').get().n;
      assert.equal(expired, stale.size, 'expired entries are not taken off the shelf');
      await shelfIdle();
      assert.equal(count() >= 2, true);
      // The empty-hull flag decides what a switched-off pick may take.
      db.prepare('DELETE FROM target_shelf').run();
      const fit = (killmail) => killmail.victim.items[0].flag !== 5;
      const row = (kill, hasFit) => db.prepare('INSERT INTO target_shelf(ship_id, kill_id, has_fit, killmail_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(900060, kill.killmail_id, hasFit, JSON.stringify(kill), Date.now());
      const [emptyKill, fitKill] = [lossPage(900060, [false])[0], lossPage(900060, [true])[0]];
      row(emptyKill, 0);
      row(fitKill, 1);
      globalThis.fetch = () => Promise.reject(new Error('offline'));
      try {
        assert.equal((await getRandomTarget('standard', { allowEmpty: false })).killId, fitKill.killmail_id);
        assert.equal(fit((await getRandomTarget('standard')).killmail), false, 'the empty one stayed on the shelf');
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  } finally {
    config.targetShelfSize = 0;
    await shelfIdle();
    usePool(null);
  }
});

test('the empty-hull setting reaches random target selection', async () => {
  const cookie = await login('Empty Hull Pilot');
  const start = async (body) => JSON.parse((await app.inject({
    method: 'POST', url: '/api/v1/online/start',
    headers: { cookie, ...RUN_HEADERS, 'content-type': 'application/json' },
    payload: { gameplay: 'standard', ...body },
  })).body);
  const isEmpty = (run) => truthOf(run.runId).killmail.victim.items[0].flag === 5;
  try {
    // One fitted loss among many empty hulls.
    usePool([900002]);
    await withLossPages((ship) => lossPage(ship, [true, ...Array(60).fill(false)]), async () => {
      for (let i = 0; i < 6; i += 1) assert.equal(isEmpty(await start({ allowEmpty: false })), false);
    });
    // Only empty hulls: refused when disabled, used when enabled or unspecified.
    usePool([900003]);
    await withLossPages((ship) => lossPage(ship, Array(8).fill(false)), async () => {
      assert.equal((await start({ allowEmpty: false })).error, 'target-unavailable');
      assert.equal(isEmpty(await start({ allowEmpty: true })), true);
      assert.equal(isEmpty(await start({})), true);
    });
    // A hull without fitted losses is skipped for the next one.
    usePool([900004, 900005]);
    await withLossPages((ship) => lossPage(ship, Array(8).fill(ship === 900005)), async () => {
      for (let i = 0; i < 4; i += 1) {
        const run = await start({ allowEmpty: false });
        assert.equal(truthOf(run.runId).shipId, 900005);
      }
    });
  } finally {
    usePool(null);
  }
});

/** What the service keeps of a run, whatever the player was sent. */
function truthOf(runId) {
  const row = db.prepare('SELECT target_json FROM online_runs WHERE id = ?').get(runId);
  return row ? JSON.parse(row.target_json) : null;
}

const REAL_SHIP = 587;
const OTHER_SHIPS = [588, 589, 590, 591, 592, 593, 594];

/** A single-hull pool with one fitted loss page per run. */
async function withSoloPool(run, flags = Array(40).fill(true)) {
  usePool([REAL_SHIP]);
  try {
    return await withLossPages((ship) => lossPage(ship, flags), run);
  } finally {
    usePool(null);
  }
}

/** Calls the online API as one pilot. */
async function soloPilot(name) {
  const cookie = await login(name);
  const call = async (method, url, payload) => {
    const response = await app.inject({
      method, url, headers: { cookie, ...RUN_HEADERS, ...(payload ? { 'content-type': 'application/json' } : {}) }, payload,
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

/** Everything of a run a player could read before it ends must hold no part of the answer. */
function assertSealed(run, label = '') {
  const target = truthOf(run.runId);
  const text = JSON.stringify(run);
  assert.equal(run.target, null, `${label} target`);
  assert.equal(run.answerId, null, `${label} answer`);
  for (const secret of [`${target.killId}`, target.killmail?.zkb?.hash, 'killmail', 'sampleKill', 'fittedKills']) {
    if (secret) assert.equal(text.includes(secret), false, `${label} leaks ${secret}`);
  }
  const puzzle = JSON.parse(db.prepare('SELECT puzzle_json FROM online_runs WHERE id = ?').get(run.runId).puzzle_json);
  const shown = new Set(puzzle.shown);
  const open = new Set(run.board.revealed);
  for (const clue of run.board.clues) {
    if (open.has(clue.i)) continue;
    assert.deepEqual(Object.keys(clue).sort(), ['c', 'hidden', 'i', 'k', 'w'], `${label} hidden clue carries only its kind`);
    assert.equal(['equipment', 'cargo', 'bonus'].includes(clue.k), false, `${label} sealed kinds are not listed`);
  }
  // Every value on the board is a released clue of the puzzle.
  const released = puzzle.clues.filter((_, index) => shown.has(index)).map((clue) => JSON.stringify(clue.v));
  for (const clue of run.board.clues.filter((item) => open.has(item.i))) {
    assert.ok(released.includes(JSON.stringify(clue.v)), `${label} ${clue.k} was released`);
  }
  // The released static clues still fit several hulls of the catalog.
  return { target, puzzle };
}

test('an open run sends only released clues; the answer follows the end', async () => {
  const { clueMatchesShip } = await import('../../js/clues.js');
  await withSoloPool(async () => {
    const pilot = await soloPilot('Sealed Board Pilot');
    const run = await pilot.start('standard');
    const { puzzle } = assertSealed(run, 'start');
    assert.ok(run.board.revealed.length >= 1 && run.board.revealed.length < run.board.clues.length);
    const statics = run.board.clues.filter((clue) => run.board.revealed.includes(clue.i)
      && ['identity', 'hull', 'slots', 'nav', 'defense', 'targeting', 'fitting'].includes(clue.c));
    const candidates = realShips.filter((ship) => statics.every((clue) => clueMatchesShip(clue, ship, puzzle.fitDelta)));
    assert.ok(candidates.length >= 2, 'the opening does not name the hull');
    assert.ok(run.board.sealed.length >= 1, 'sealed groups are only flagged');

    const reload = (await pilot.run(run.runId)).body;
    assert.deepEqual(reload.board, run.board, 'a reload shows the same board');
    assert.deepEqual((await pilot.start('standard')).board, run.board, 'so does asking for a target again');

    const miss = (await pilot.guess(run.runId, OTHER_SHIPS[0])).body;
    assertSealed(miss, 'miss');
    assert.deepEqual(miss.board.feedback.map((item) => [item.shipId, item.correct]), [[OTHER_SHIPS[0], false]]);
    assert.ok(miss.board.feedback[0].similarity >= 1 && miss.board.feedback[0].similarity <= 97);
    assert.ok(run.board.revealed.every((i) => miss.board.revealed.includes(i)), 'released clues stay released');
    assert.ok(miss.board.revealed.length > run.board.revealed.length, 'a miss releases more');
    for (const clue of run.board.clues) assert.deepEqual(miss.board.clues[clue.i].k, clue.k, 'board places are stable');
    assertSealed((await pilot.run(miss.runId)).body, 'reload after a miss');

    const won = (await pilot.guess(run.runId, REAL_SHIP)).body;
    assert.equal(won.status, 'won');
    assert.deepEqual([won.target.shipId, won.answerId], [REAL_SHIP, REAL_SHIP]);
    assert.equal(won.board.revealed.length, won.board.clues.length, 'every clue after the end');
    assert.deepEqual(won.board.sealed, []);
    assert.equal(won.board.sampleKill, truthOf(run.runId).killId);
    assert.deepEqual(won.board.feedback.at(-1), { shipId: REAL_SHIP, correct: true, similarity: 100 });
    for (const clue of miss.board.clues) assert.equal(won.board.clues[clue.i].k, clue.k, 'places survive the end');

    // Losing and abandoning end a run too.
    const lost = await pilot.start('standard');
    let last = lost;
    for (const ship of OTHER_SHIPS.slice(0, 5)) {
      last = (await pilot.guess(lost.runId, ship)).body;
      assertSealed(last, `miss ${ship}`);
    }
    last = (await pilot.guess(lost.runId, OTHER_SHIPS[5])).body;
    assert.deepEqual([last.status, last.target.shipId], ['lost', REAL_SHIP]);
    const left = await pilot.start('standard');
    await pilot.guess(left.runId, OTHER_SHIPS[0]);
    const abandoned = (await pilot.abandon(left.runId)).body;
    assert.deepEqual([abandoned.status, abandoned.endReason, abandoned.target.shipId], ['lost', 'abandoned', REAL_SHIP]);
    const stale = await pilot.start('standard');
    await pilot.guess(stale.runId, OTHER_SHIPS[0]);
    db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 25 * 3600e3, stale.runId);
    const expired = (await pilot.run(stale.runId)).body;
    assert.deepEqual([expired.status, expired.endReason, expired.target.shipId], ['lost', 'expired', REAL_SHIP]);
  });
});

test('Audit and Timed keep their answer on the service as well', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Sealed Audit Pilot');
    const audit = await pilot.start('audit');
    const { puzzle } = assertSealed(audit, 'audit');
    assert.equal(puzzle.revealMode, 'audit');
    const miss = (await pilot.guess(audit.runId, OTHER_SHIPS[0])).body;
    assertSealed(miss, 'audit miss');
    assert.ok(miss.board.revealed.length > audit.board.revealed.length, 'an audit miss releases more');

    const timed = await pilot.start('timed');
    assertSealed(timed, 'timed before the clock');
    assert.deepEqual(timed.board.revealed, [], 'nothing before the clock starts');
    const begun = (await pilot.begin(timed.runId)).body;
    assertSealed(begun, 'timed opening');
    assert.ok(begun.board.revealed.length > 0);
    const wrong = (await pilot.guess(timed.runId, OTHER_SHIPS[0], { elapsedMs: 1000 })).body;
    assert.deepEqual(wrong.board.revealed, begun.board.revealed, 'Timed guesses release nothing');
    // Two releases later the service's clock shows more.
    db.prepare('UPDATE online_runs SET started_at = started_at - 61000 WHERE id = ?').run(timed.runId);
    const later = (await pilot.run(timed.runId)).body;
    assertSealed(later, 'timed later');
    assert.ok(later.board.revealed.length > begun.board.revealed.length);
    const gaveUp = (await pilot.finish(timed.runId, { status: 'lost', elapsedMs: 62000 })).body;
    assert.deepEqual([gaveUp.status, gaveUp.endReason, gaveUp.target.shipId], ['lost', 'gave-up', REAL_SHIP]);

    // A clock that has released everything ends the run at the next release.
    const exhausted = await pilot.start('timed');
    await pilot.begin(exhausted.runId);
    db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 3 * 3600e3, exhausted.runId);
    const over = (await pilot.run(exhausted.runId)).body;
    assert.deepEqual([over.status, over.endReason, over.target.shipId], ['lost', 'exhausted', REAL_SHIP]);
    assert.equal(over.elapsedMs % 30000, 0);
    assert.ok(over.elapsedMs < 3 * 3600e3);
    assert.equal((await pilot.guess(exhausted.runId, REAL_SHIP)).status, 409, 'no guess after the end');
  });
});

test('Daily shows every player the same clues in the same order', async () => {
  const day = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/meta' })).body).gameDay;
  db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
  await withSoloPool(async () => {
    const first = (await (await soloPilot('Daily Order One')).daily()).body;
    const secondPilot = await soloPilot('Daily Order Two');
    const second = (await secondPilot.daily()).body;
    assertSealed(first, 'daily');
    assert.deepEqual(second.board.revealed, first.board.revealed);
    assert.deepEqual(second.board.clues, first.board.clues);
    assert.equal(second.board.caseId, first.board.caseId);
    const third = (await (await soloPilot('Daily Order Three')).daily()).body;
    const a = (await secondPilot.guess(second.runId, OTHER_SHIPS[1])).body;
    const thirdPilot = await soloPilot('Daily Order Three');
    const b = (await thirdPilot.guess(third.runId, OTHER_SHIPS[1])).body;
    assert.deepEqual(a.board.clues, b.board.clues, 'the same guess releases the same clues');
  });
  db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
});

test('a run of an older release gets its puzzle on the next visit', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Old Release Pilot');
    const run = await pilot.start('standard');
    await pilot.guess(run.runId, OTHER_SHIPS[0]);
    db.prepare('UPDATE online_runs SET puzzle_json = NULL WHERE id = ?').run(run.runId);
    const back = (await pilot.run(run.runId)).body;
    assertSealed(back, 'rebuilt');
    assert.deepEqual(back.guesses, [OTHER_SHIPS[0]]);
    assert.ok(back.board.revealed.length > 0);
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
    const target = truthOf(run.runId);
    db.prepare('UPDATE online_runs SET target_json = ? WHERE id = ?').run(JSON.stringify({
      killId: target.killId, shipId: REAL_SHIP, killmail: { ...target.killmail, victim: { ship_type_id: REAL_SHIP, items: [cargoItem] } },
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
      const statRows = () => db.prepare('SELECT COUNT(*) AS n FROM kill_difficulty WHERE kill_id = 777001').get().n;
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

/** The counters of one killmail and its hull in a gameplay, zero when nothing is recorded. */
function difficultyOf(killId, shipId, gameplay) {
  const zero = { won: 0, lost: 0, abandoned: 0, won_guesses_sum: 0, won_ms_sum: 0 };
  return {
    kill: db.prepare('SELECT * FROM kill_difficulty WHERE kill_id = ? AND gameplay = ?').get(killId, gameplay) || zero,
    ship: db.prepare('SELECT * FROM ship_difficulty WHERE ship_id = ? AND gameplay = ?').get(shipId, gameplay) || zero,
  };
}

const COUNTERS = ['won', 'lost', 'abandoned', 'won_guesses_sum', 'won_ms_sum'];

/** What a run did to the counters of its killmail and hull. */
async function difficultyChange(run, gameplay, act) {
  const target = truthOf(run.runId);
  const before = difficultyOf(target.killId, target.shipId, gameplay);
  await act();
  const after = difficultyOf(target.killId, target.shipId, gameplay);
  const delta = (a, b) => Object.fromEntries(COUNTERS.map((name) => [name, Number(b[name]) - Number(a[name])]));
  return { kill: delta(before.kill, after.kill), ship: delta(before.ship, after.ship) };
}

const only = (changes) => ({ won: 0, lost: 0, abandoned: 0, won_guesses_sum: 0, won_ms_sum: 0, ...changes });

test('solo runs add anonymous difficulty counters once they end', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Difficulty Pilot');
    const won = await pilot.start('standard');
    const change = await difficultyChange(won, 'standard', async () => {
      await pilot.guess(won.runId, OTHER_SHIPS[0]);
      await pilot.guess(won.runId, REAL_SHIP);
      await pilot.guess(won.runId, REAL_SHIP);
    });
    assert.deepEqual(change.kill, only({ won: 1, won_guesses_sum: 2 }), 'a retried last guess counts once');
    assert.deepEqual(change.ship, change.kill);

    const lost = await pilot.start('standard');
    assert.deepEqual((await difficultyChange(lost, 'standard', async () => {
      for (const ship of OTHER_SHIPS.slice(0, 6)) await pilot.guess(lost.runId, ship);
    })).kill, only({ lost: 1 }));

    // A started run that is given up is abandoned, not lost; an unguessed one leaves nothing.
    const left = await pilot.start('audit');
    assert.deepEqual((await difficultyChange(left, 'audit', async () => {
      await pilot.guess(left.runId, OTHER_SHIPS[0]);
      await pilot.abandon(left.runId);
      await pilot.abandon(left.runId);
    })).kill, only({ abandoned: 1 }));
    const unguessed = await pilot.start('audit');
    assert.deepEqual((await difficultyChange(unguessed, 'audit', async () => {
      await pilot.abandon(unguessed.runId);
    })).kill, only());

    // Timed: time counts for a win, giving up is a loss, expiry is an abandonment.
    const timed = await pilot.start('timed');
    const timedChange = await difficultyChange(timed, 'timed', async () => {
      db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 10_000, timed.runId);
      await pilot.guess(timed.runId, REAL_SHIP, { elapsedMs: 4200 });
    });
    assert.deepEqual(timedChange.kill, only({ won: 1, won_guesses_sum: 1, won_ms_sum: 4200 }));
    const gaveUp = await pilot.start('timed');
    assert.deepEqual((await difficultyChange(gaveUp, 'timed', async () => {
      await pilot.begin(gaveUp.runId);
      await pilot.finish(gaveUp.runId, { status: 'lost' });
    })).kill, only({ lost: 1 }));
    const expired = await pilot.start('timed');
    assert.deepEqual((await difficultyChange(expired, 'timed', async () => {
      await pilot.begin(expired.runId);
      db.prepare('UPDATE online_runs SET started_at = ? WHERE id = ?').run(Date.now() - 25 * 3600e3, expired.runId);
      expireRuns();
    })).kill, only({ abandoned: 1 }));
  });
});

test('difficulty counters hold no player and ignore bad or custom input', () => {
  for (const table of ['kill_difficulty', 'ship_difficulty']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
    assert.equal(columns.some((name) => /name|player|user|room|run|session/i.test(name)), false, table);
  }
  const rows = () => db.prepare('SELECT COUNT(*) AS n FROM kill_difficulty WHERE kill_id IN (880001, 880002)').get().n;
  const good = { killId: 880001, shipId: REAL_SHIP, gameplay: 'standard', outcome: 'won', attempts: 3, elapsedMs: 9000 };
  recordPlay({ ...good, gameplay: 'custom' });
  recordPlay({ ...good, outcome: 'draw' });
  recordPlay({ ...good, killId: 0 });
  recordPlay({ ...good, shipId: 'x' });
  recordPlay({ ...good, plays: 0 });
  assert.equal(rows(), 0);
  recordPlay(good);
  recordPlay({ ...good, killId: 880002, gameplay: 'timed', attempts: 2, elapsedMs: 3000 });
  recordPlay({ ...good, killId: 880002, outcome: 'lost' });
  const standard = difficultyOf(880001, REAL_SHIP, 'standard').kill;
  assert.deepEqual([standard.won, standard.won_guesses_sum, standard.won_ms_sum], [1, 3, 0], 'time is only kept for timed');
  assert.equal(difficultyOf(880002, REAL_SHIP, 'timed').kill.won_ms_sum, 3000);
});

test('stale killmail counters are cleaned up, hull totals stay', () => {
  const old = Date.now() - (config.statsKillRetentionDays + 1) * 86400e3;
  db.prepare("INSERT INTO kill_difficulty(kill_id, gameplay, ship_id, won, first_at, last_at) VALUES (880010, 'standard', 1, 1, ?, ?)").run(old, old);
  db.prepare("INSERT INTO kill_difficulty(kill_id, gameplay, ship_id, won, first_at, last_at) VALUES (880011, 'standard', 1, 1, ?, ?)").run(old, Date.now());
  const ships = db.prepare('SELECT COUNT(*) AS n FROM ship_difficulty').get().n;
  cleanupExpired();
  const left = db.prepare('SELECT kill_id FROM kill_difficulty WHERE kill_id IN (880010, 880011)').all().map((row) => row.kill_id);
  assert.deepEqual(left, [880011]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ship_difficulty').get().n, ships);
  db.prepare('DELETE FROM kill_difficulty WHERE kill_id = 880011').run();
});

test('the difficulty report ranks by win rate and keeps abandoned plays out of it', () => {
  const t = Date.now();
  db.exec('DELETE FROM ship_difficulty WHERE ship_id IN (990001, 990002, 990003)');
  const insert = db.prepare('INSERT INTO ship_difficulty(ship_id, gameplay, won, lost, abandoned, won_guesses_sum, won_ms_sum, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insert.run(990001, 'standard', 9, 1, 0, 27, 0, t);
  insert.run(990002, 'standard', 2, 8, 30, 8, 0, t);
  insert.run(990003, 'standard', 1, 0, 0, 1, 0, t);
  insert.run(990003, 'arbitration', 0, 9, 0, 0, 0, t);
  insert.run(990001, 'timed', 5, 0, 0, 10, 50000, t);
  const rows = difficultyReport(db, { by: 'ship', gameplay: 'standard', minFinished: 5 }).filter((row) => row.shipId >= 990000);
  assert.deepEqual(rows.map((row) => row.shipId), [990002, 990001], 'too few finished plays are left out');
  assert.equal(rows[0].winRate, 0.2);
  assert.equal(rows[0].abandonRate, 30 / 40);
  assert.equal(rows[1].avgGuessesToWin, 3);
  assert.equal(difficultyReport(db, { gameplay: 'standard', minFinished: 5, easiest: true }).find((row) => row.shipId >= 990000).shipId, 990001);
  const all = difficultyReport(db, { gameplay: 'all', minFinished: 5 }).filter((row) => row.shipId >= 990000);
  assert.equal(all.find((row) => row.shipId === 990001).won, 14, 'all is the sum of the player gameplays');
  assert.equal(all.some((row) => row.shipId === 990003), false, 'arbitration stays out of all');
  const timed = difficultyReport(db, { gameplay: 'timed', minFinished: 5 }).find((row) => row.shipId === 990001);
  assert.equal(timed.avgSecondsToWin, 10);
  assert.throws(() => difficultyReport(db, { by: 'player' }));
  assert.throws(() => difficultyReport(db, { gameplay: 'custom' }));
  db.exec('DELETE FROM ship_difficulty WHERE ship_id IN (990001, 990002, 990003)');
});

test('attackers never reach the cache, the database or a player', async () => {
  const makePage = (ship) => lossPage(ship, Array(5).fill(true)).map((kill) => ({ ...kill, attackers: [{ character_id: 90000077 }] }));
  usePool([REAL_SHIP]);
  resetTargets();
  try {
    await withLossPages(makePage, async () => {
      const pilot = await soloPilot('Solo Slim Pilot');
      const run = await pilot.start('standard');
      assert.ok(truthOf(run.runId).killmail.victim.items.length);
      assert.equal(JSON.stringify(run).includes('attackers'), false);
      const stored = db.prepare('SELECT target_json FROM online_runs WHERE id = ?').get(run.runId).target_json;
      assert.equal(stored.includes('90000077'), false);
      const entry = [...zkill.entries.values()][0];
      assert.equal(zlib.gunzipSync(entry.body).toString().includes('attackers'), false);
    });
  } finally {
    usePool(null);
    resetTargets();
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
    const { killId } = truthOf(run.runId);
    const before = requests.length;
    const other = await soloPilot('Solo Stored Friend');
    const custom = await other.custom('audit', killId);
    assert.deepEqual([custom.status, custom.body.kind, custom.body.target], [200, 'custom', null]);
    assert.equal(truthOf(custom.body.runId).killId, killId);
    assert.deepEqual(requests.slice(before).filter((url) => !url.startsWith('/api/stats/')), [], 'no killmail request');
    assert.equal((await other.custom('audit', 123456789)).status, 503);
  });
});

test('opening Daily in two pages at once yields one run', async () => {
  const day = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/meta' })).body).gameDay;
  db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
  usePool([REAL_SHIP]);
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
    usePool(null);
    db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
  }
});

test('the daily empty-hull setting parses flags and defaults to allowed', () => {
  assert.equal(config.dailyAllowEmpty, true);
  for (const value of ['true', 'TRUE', '1', 'yes', ' Yes ', 'on', 'ON']) assert.equal(parseFlag(value), true, value);
  for (const value of ['false', 'False', '0', 'no', ' NO ', 'off', ' Off ']) assert.equal(parseFlag(value), false, value);
  for (const value of [undefined, '', '2', 'nope']) assert.equal(parseFlag(value), null, String(value));
  const script = "const { config } = await import('./server/src/config.mjs');"
    + "console.log(JSON.stringify([config.dailyAllowEmpty, config.warnings.some((w) => w.includes('FITDLE_DAILY_ALLOW_EMPTY'))]));";
  const read = (value) => spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, FITDLE_DAILY_ALLOW_EMPTY: value },
  }).stdout.trim();
  assert.equal(read('no'), '[false,false]');
  assert.equal(read('1'), '[true,false]');
  assert.equal(read('maybe'), '[true,true]');
});

test('every boolean setting reads the same words and warns about others', () => {
  const script = "const { config } = await import('./server/src/config.mjs');"
    + "console.log(JSON.stringify([config.devAuth, config.warnings.filter((w) => w.includes('FITDLE_DEV_AUTH'))]));";
  const read = (value) => JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_ENV: '', FITDLE_DEV_AUTH: value },
  }).stdout);
  for (const value of ['yes', 'on', ' TRUE ', '1']) assert.deepEqual(read(value), [true, []], value);
  for (const value of ['no', 'off', '0', 'false', '']) assert.deepEqual(read(value), [false, []], value);
  const [flag, warnings] = read('maybe');
  assert.equal(flag, false);
  assert.match(warnings[0], /FITDLE_DEV_AUTH="maybe" is not true\/false/);
});

test('the daily empty-hull setting decides which killmail is pinned', async () => {
  const savedAllow = config.dailyAllowEmpty;
  const days = Array.from({ length: 5 }, (_, index) => `2031-0${index + 1}-15`);
  const dated = (flags, time = '2025-06-01T00:00:00Z') => lossPage(REAL_SHIP, flags)
    .map((kill) => ({ ...kill, killmail_time: time }));
  const isEmpty = (target) => target.killmail.victim.items[0].flag === cargoItem.flag;
  const pin = (day, kills) => withLossPages(() => kills, () => getDailyTarget(day));
  usePool([REAL_SHIP]);
  try {
    // One fitted loss among many empty hulls.
    config.dailyAllowEmpty = false;
    const oneFitted = [true, ...Array(60).fill(false)];
    for (const day of days.slice(0, 2)) assert.equal(isEmpty(await pin(day, dated(oneFitted))), false, day);
    await assert.rejects(pin(days[2], dated(Array(8).fill(false))), /no daily target/);

    config.dailyAllowEmpty = true;
    const allowed = await pin(days[4], dated(Array(8).fill(false)));
    assert.equal(isEmpty(allowed), true);
    // A stored day keeps its target after the setting changes.
    config.dailyAllowEmpty = false;
    assert.equal((await pin(days[4], dated([true]))).killId, allowed.killId);
  } finally {
    config.dailyAllowEmpty = savedAllow;
    usePool(null);
    for (const day of days) db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
  }
});

test('the same day and secret give the same Daily target, another day another one', async () => {
  const days = ['2031-06-15', '2031-06-16', '2031-06-17'];
  const ships = Array.from({ length: 10 }, (_, index) => 900200 + index);
  usePool(ships);
  const fixed = (ship) => Array.from({ length: 40 }, (_, index) => ({
    killmail_id: ship * 100 + index,
    killmail_time: '2025-06-01T10:00:00Z',
    zkb: { totalValue: 1 },
    victim: { ship_type_id: ship, items: [fittedItem] },
  }));
  try {
    const run = async (day) => {
      db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
      resetTargets();
      return withLossPages(fixed, async () => (await getDailyTarget(day)).killId);
    };
    const first = [];
    const again = [];
    for (const day of days) first.push(await run(day));
    for (const day of days) again.push(await run(day));
    assert.deepEqual(first, again, 'reproducible');
    assert.ok(new Set(first).size > 1, 'days differ');
  } finally {
    usePool(null);
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

test('startup lines summarise settings without secrets', async () => {
  const { startupLines } = await import('../src/startup.mjs');
  const text = startupLines({
    ...config,
    sessionSecret: 'SECRETVALUE',
    eve: { ...config.eve, clientSecret: 'SECRETCLIENT' },
    publicOrigin: 'https://fitdle.example',
  }).join('\n');
  assert.match(text, /^FITDLE \S+ · API v1 · run protocol v2 · WebSocket protocol v2 · algorithm online-v2 · Node v/);
  assert.ok(text.includes(config.version));
  assert.match(text, /Origin https:\/\/fitdle\.example/);
  assert.match(text, /session secret configured/);
  assert.match(text, /group factors g29×0\.2 g31×0\.3 g237×0\.5/);
  assert.equal(/SECRET/.test(text), false);
  const bare = startupLines({ ...config, publicOrigin: '', sessionSecret: '', shipUsage: null }).join('\n');
  assert.match(bare, /PUBLIC_ORIGIN not set/);
  assert.match(bare, /session secret NOT SET/);
  assert.match(bare, /every hull weighs 1/);
});

test('startup warns when the usage file is stale or undated', async () => {
  const { startupWarnings } = await import('../src/startup.mjs');
  const now = new Date('2026-11-27T00:00:00Z');
  const usage = (generatedAt) => ({ ...config, usageStaleDays: 45, shipUsage: { version: 1, ships: {}, generatedAt } });
  assert.deepEqual(startupWarnings(usage('2026-10-20T00:00:00Z'), { now }), []);
  const [stale] = startupWarnings(usage('2026-09-01T00:00:00Z'), { now });
  assert.match(stale, /87 days old \(generated 2026-09-01, limit 45 days\)/);
  assert.match(startupWarnings(usage('nope'), { now })[0], /age is unknown/);
  assert.deepEqual(startupWarnings({ ...config, shipUsage: null }, { now }), []);
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
  // A blank SESSION_SECRET gets a random in-memory one; its red warning is logged at start, not a config warning.
  assert.deepEqual(read({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://127.0.0.1:8787', SESSION_SECRET: ' ' }), [true, 0]);
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

test('a hull without usage data is read by month, so a busy hull still yields a killmail', async () => {
  const { lastCompleteMonthEnd, utcDateKey } = await import('../../js/game.js');
  const latest = lastCompleteMonthEnd(utcDateKey());
  const thisMonth = `${utcDateKey().slice(0, 8)}05T10:00:00Z`;
  usePool([900300]);
  try {
    // The newest page of a busy hull is all this month, which is never eligible.
    const page = (ship, pathname) => {
      const month = /year\/(\d+)\/month\/(\d+)\//.exec(pathname);
      const time = month ? `${month[1]}-${String(month[2]).padStart(2, '0')}-15T10:00:00Z` : thisMonth;
      return lossPage(ship, Array(10).fill(true)).map((kill) => ({ ...kill, killmail_time: time }));
    };
    await withLossPages(page, async (requests) => {
      for (let i = 0; i < 12; i += 1) {
        const target = await getRandomTarget('standard');
        assert.ok(target.killmail.killmail_time.slice(0, 10) <= latest, target.killmail.killmail_time);
      }
      assert.ok(requests.every((pathname) => pathname.includes('/year/')), requests.join());
    });
  } finally {
    usePool(null);
  }
});

test('a page past the end of a month starts over at its first page', async () => {
  usePool([900310]);
  try {
    // The usage file says 450 losses (three pages) but the month has only one page now.
    await withLossPages((ship, pathname) => (/page\/1\/$/.test(pathname) ? lossPage(ship, Array(5).fill(true)) : []), async (requests) => {
      for (let i = 0; i < 15; i += 1) {
        resetTargets();
        zkill.reset();
        config.shipUsage = { version: 1, ships: { 900310: { m: { 202504: [0, 450] } } } };
        assert.equal((await getRandomTarget('standard')).shipId, 900310);
      }
      const deeper = requests.findIndex((pathname) => /page\/[23]\/$/.test(pathname));
      assert.ok(deeper >= 0, 'a later page was tried');
      assert.match(requests[deeper + 1], /page\/1\/$/, 'and then the first one');
    });
  } finally {
    usePool(null);
  }
});

test('a hull whose months are all missing from the usage file falls back to recent months', async () => {
  usePool([900320]);
  config.shipUsage = { version: 1, ships: { 900320: { m: {} } } };
  try {
    await withLossPages((ship) => lossPage(ship, Array(5).fill(true)), async (requests) => {
      assert.equal((await getRandomTarget('standard')).shipId, 900320);
      assert.ok(requests.every((pathname) => pathname.includes('/year/')));
    });
  } finally {
    usePool(null);
  }
});

test('a Daily row already stored always wins over the pin just built', () => {
  const day = '2031-09-09';
  const insert = (id) => db.prepare(`INSERT INTO daily_pins(day, algorithm_version, data_version, seed, ship_id, kill_id, kill_hash, killmail_json, created_at)
    VALUES (?, 'online-v2', '', '1', 587, ?, '', ?, ?)`).run(day, id, JSON.stringify({ killmail_id: id, victim: { ship_type_id: 587 } }), Date.now());
  try {
    insert(111);
    const pin = loadDailyPin(day, { killmail: { killmail_id: 222 }, killId: 222 });
    assert.deepEqual([pin.killId, pin.killmail.killmail_id], [111, 111], 'kill id and killmail agree, from the row');
    assert.equal(loadDailyPin('2031-09-10', { killId: 5 }).killId, 5, 'no row: the fallback');
  } finally {
    db.prepare('DELETE FROM daily_pins WHERE day = ?').run(day);
  }
});

test('a missing SESSION_SECRET gets a random in-memory one and a red warning without the value', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitdle-secret-'));
  const script = "const { config } = await import('./server/src/config.mjs');"
    + "const { sessionSecretWarnings } = await import('./server/src/startup.mjs');"
    + "console.log(JSON.stringify({ source: config.sessionSecretSource, secret: config.sessionSecret,"
    + " red: sessionSecretWarnings(config, { color: true }), plain: sessionSecretWarnings(config, { color: false }) }));";
  const read = () => {
    // An empty value wins over any .env file and counts as not set.
    const env = { ...process.env, NODE_ENV: 'production', DATABASE_PATH: path.join(dir, 'x.sqlite'), SESSION_SECRET: '' };
    return JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8', env }).stdout);
  };
  try {
    const first = read();
    const second = read();
    assert.equal(first.source, 'random');
    assert.equal(first.secret.length, 43);
    assert.notEqual(first.secret, second.secret, 'a different secret at every start');
    assert.deepEqual(fs.readdirSync(dir), [], 'nothing is written');
    const text = first.red.join('\n');
    assert.ok(first.red.every((line) => line.startsWith('\u001b[1;31m') && line.endsWith('\u001b[0m')), 'red on a terminal');
    assert.equal(first.plain.some((line) => line.includes('\u001b')), false, 'plain text elsewhere');
    for (const part of [/SESSION_SECRET is not set/, /restart invalidates all sign-in sessions/, /predictable and sign-in sessions forgeable/, /randomBytes\(32\)/, /already stored are not affected/]) {
      assert.match(text, part);
    }
    assert.equal(text.includes(first.secret), false, 'the secret is never logged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // With a secret from the environment there is no warning.
  assert.deepEqual(sessionSecretWarnings({ ...config, sessionSecretSource: 'environment' }), []);
});

test('the usage file of the data branch is adopted only when valid and newer', async () => {
  const { refreshUsage, loadUsageCache, usageCacheFile } = await import('../src/usage-refresh.mjs');
  const savedUsage = config.shipUsage;
  const savedSource = config.shipUsageSource;
  const savedUrl = config.usageUrl;
  const file = (generatedAt, extra = {}) => JSON.stringify({
    version: 1,
    generatedAt,
    ships: { 587: { at: Date.parse(generatedAt), m: { 202609: [10, 1], 202610: [20, 2], 202611: [3, 0] } } },
    ...extra,
  });
  const answer = (body, init = {}) => async (url, options) => {
    answer.calls.push({ url: String(url), headers: options.headers });
    return new Response(body, { status: 200, ...init });
  };
  answer.calls = [];
  const quiet = console.warn;
  console.warn = () => {};
  config.usageUrl = 'https://data.example.test/ship-usage.json';
  config.shipUsage = { version: 1, generatedAt: '2026-10-02T00:00:00Z', ships: { 587: { at: 1, m: { 202509: [1, 1] } } } };
  config.shipUsageSource = 'image';
  try {
    const first = answer.calls;
    assert.equal(await refreshUsage({ fetchImpl: answer(file('2026-11-02T03:00:00Z'), { headers: { etag: '"v2"' } }) }), 'updated');
    assert.equal(config.shipUsageSource, 'remote');
    assert.equal(config.shipUsage.generatedAt, '2026-11-02T03:00:00Z');
    assert.deepEqual(Object.keys(config.shipUsage.ships[587].m).sort(), ['202609', '202610'], 'the month still running is dropped');
    assert.equal(first[0].url, config.usageUrl);
    assert.match(first[0].headers['User-Agent'], /^FITDLE\/\S+ \(\+https:\/\/github\.com\//);
    assert.equal(/@|ops@example/.test(JSON.stringify(first[0].headers)), false, 'no personal details');
    assert.equal(first[0].headers['If-None-Match'], undefined);
    // The ETag of that answer makes the next request conditional.
    const unchanged = async (url, options) => {
      assert.equal(options.headers['If-None-Match'], '"v2"');
      return new Response(null, { status: 304 });
    };
    assert.equal(await refreshUsage({ fetchImpl: unchanged }), 'unchanged');
    // Older, broken or unreachable answers change nothing.
    assert.equal(await refreshUsage({ fetchImpl: answer(file('2026-10-02T00:00:00Z')) }), 'older');
    assert.equal(await refreshUsage({ fetchImpl: answer('{"version":2}') }), 'failed');
    assert.equal(await refreshUsage({ fetchImpl: answer(file('2026-11-09T00:00:00Z', { ships: [] })) }), 'failed');
    assert.equal(await refreshUsage({ fetchImpl: answer('not json') }), 'failed');
    assert.equal(await refreshUsage({ fetchImpl: answer('x', { status: 503 }) }), 'failed');
    assert.equal(await refreshUsage({ fetchImpl: async () => { throw new Error('offline'); } }), 'failed');
    assert.equal(config.shipUsage.generatedAt, '2026-11-02T03:00:00Z');
    // After a restart the cached copy beats an older image file.
    config.shipUsage = { version: 1, generatedAt: '2026-10-02T00:00:00Z', ships: { 587: { m: {} } } };
    config.shipUsageSource = 'image';
    loadUsageCache();
    assert.equal(config.shipUsageSource, 'cache');
    assert.equal(config.shipUsage.generatedAt, '2026-11-02T03:00:00Z');
    // The weights follow the data in use.
    config.catalogShips = [{ id: 587, groupID: 25 }, { id: 588, groupID: 25 }];
    config.shipUsage = null;
    const flat = currentWeights('2026-11-27').get(587);
    loadUsageCache();
    assert.ok(currentWeights('2026-11-27').get(587) > flat, 'a newly loaded file changes the weights at once');
  } finally {
    console.warn = quiet;
    config.catalogShips = realShips;
    config.shipUsage = savedUsage;
    config.shipUsageSource = savedSource;
    config.usageUrl = savedUrl;
    fs.rmSync(usageCacheFile(), { force: true });
    resetTargets();
  }
});

test('difficulty counters are kept per day, count each gameplay and survive a failing write', async () => {
  const kill = 880030;
  recordPlay({ killId: kill, shipId: REAL_SHIP, gameplay: 'daily', outcome: 'won', attempts: 2 });
  recordPlay({ killId: kill, shipId: REAL_SHIP, gameplay: 'daily', outcome: 'lost' });
  const daily = difficultyOf(kill, REAL_SHIP, 'daily').kill;
  assert.deepEqual([daily.won, daily.lost, daily.won_guesses_sum], [1, 1, 2], 'Daily is counted too');
  assert.equal(daily.first_at % 86400000, 0, 'only the day is kept');
  assert.equal(daily.last_at % 86400000, 0);
  db.prepare('DELETE FROM kill_difficulty WHERE kill_id = ?').run(kill);

  // A failing write is only a warning: a solo round still works.
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Statistics Failure Pilot');
    const run = await pilot.start('standard');
    const warnings = [];
    const quiet = console.warn;
    console.warn = (message) => warnings.push(String(message));
    db.exec('ALTER TABLE kill_difficulty RENAME TO kill_difficulty_hidden');
    try {
      recordPlay({ killId: kill, shipId: REAL_SHIP, gameplay: 'standard', outcome: 'won' });
      const won = await pilot.guess(run.runId, REAL_SHIP);
      assert.deepEqual([won.status, won.body.status], [200, 'won']);
      assert.ok(warnings.length >= 2 && warnings.every((line) => /not written/.test(line)));
      assert.equal(warnings.some((line) => /\d{4,}/.test(line)), false, 'no ids in the warning');
    } finally {
      db.exec('ALTER TABLE kill_difficulty_hidden RENAME TO kill_difficulty');
      console.warn = quiet;
    }
  });
});

test('a timed run that never started and was given up leaves no counter', async () => {
  await withSoloPool(async () => {
    const pilot = await soloPilot('Solo Unstarted Timed Pilot');
    const run = await pilot.start('timed');
    const change = await difficultyChange(run, 'timed', async () => {
      await pilot.finish(run.runId, { status: 'lost' });
    });
    assert.deepEqual(change.kill, only());
    const daily = await pilot.start('standard');
    assert.deepEqual((await difficultyChange(daily, 'standard', async () => {
      await pilot.guess(daily.runId, REAL_SHIP, { elapsedMs: 5000 });
    })).kill, only({ won: 1, won_guesses_sum: 1 }), 'no time outside a timed round');
  });
});

test('the report averages only over plays that record the value', () => {
  const ids = [990011, 990012];
  db.exec(`DELETE FROM ship_difficulty WHERE ship_id IN (${ids.join(',')})`);
  const insert = db.prepare('INSERT INTO ship_difficulty(ship_id, gameplay, won, lost, abandoned, won_guesses_sum, won_ms_sum, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const t = Date.now();
  insert.run(990011, 'timed', 5, 0, 0, 10, 50000, t);
  insert.run(990011, 'standard', 5, 0, 0, 20, 0, t);
  insert.run(990012, 'arbitration', 6, 0, 0, 0, 0, t);
  insert.run(990012, 'standard', 1, 0, 0, 0, 0, t);
  const row = difficultyReport(db, { gameplay: 'all', minFinished: 1, limit: 1000 }).find((item) => item.shipId === 990011);
  assert.equal(row.avgSecondsToWin, 10, 'timed wins only: 50 s over 5 wins');
  assert.equal(row.avgGuessesToWin, 3, '30 guesses over 10 wins');
  const arbitration = difficultyReport(db, { gameplay: 'arbitration', minFinished: 1, limit: 1000 }).find((item) => item.shipId === 990012);
  assert.equal(arbitration.avgGuessesToWin, null, 'arbitration keeps no guesses');
  assert.equal(arbitration.avgSecondsToWin, null);
  db.exec(`DELETE FROM ship_difficulty WHERE ship_id IN (${ids.join(',')})`);
});

test('the report command line rejects what it does not know', () => {
  assert.deepEqual(parseArgs(['--by=kill', '--gameplay', 'timed', '--json', '--min', '3']), { by: 'kill', gameplay: 'timed', json: true, min: '3' });
  assert.throws(() => parseArgs(['--gamplay', 'timed']), /unknown option: --gamplay/);
  assert.throws(() => parseArgs(['--min', '--json']), /--min needs a value/);
  assert.throws(() => parseArgs(['--min']), /--min needs a value/);
  assert.throws(() => parseArgs(['--json=1']), /takes no value/);
  assert.throws(() => parseArgs(['ship']), /unexpected argument/);
});

test.after(async () => {
  await app.close();
  // Windows cannot delete an open database file.
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbFile}${suffix}`, { force: true }); } catch {}
  }
});
