import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
process.env.NODE_ENV = 'test';

const { config } = await import('../src/config.mjs');
const { characterIdFromSubject } = await import('../src/auth.mjs');
const { normalizeRoomSettings, nextBigRoundStep } = await import('../src/rooms.mjs');
const { buildApp } = await import('../src/index.mjs');
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

test.after(async () => {
  await app.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbFile}${suffix}`, { force: true }); } catch {}
  }
});
