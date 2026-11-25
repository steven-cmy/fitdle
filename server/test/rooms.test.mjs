import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const dbFile = path.join(ROOT, '.cache', `rooms-test-${process.pid}.sqlite`);
process.env.DATABASE_PATH = dbFile;
process.env.SESSION_SECRET = 'test-secret';
process.env.FITDLE_DEV_AUTH = '1';
process.env.PUBLIC_ORIGIN = 'http://127.0.0.1:8790';
process.env.ROOM_MAX_PLAYERS = '6';
process.env.ROOM_RECONNECT_GRACE_MS = '5000';
process.env.TARGET_SPARES = '0';
process.env.ZKILL_MIN_INTERVAL_MS = '0';
process.env.NODE_ENV = 'test';

const { config } = await import('../src/config.mjs');
const { ROOMS, acceptedNames } = await import('../src/rooms.mjs');
const { zkill } = await import('../src/zkill.mjs');
const { clearHulls } = await import('../src/targets.mjs');
const { buildApp } = await import('../src/index.mjs');
const { db } = await import('../src/db.mjs');

const GRACE = 250;
config.roomReconnectGraceMs = GRACE;
config.roomHeartbeatMs = 60;

// Synthetic upstream: every hull has fitted losses; `gate` can hold responses.
const realFetch = globalThis.fetch;
let gate = null;
let failNext = false;
let pageRequests = 0;
let killSerial = 5000;
const items = [[27, 2048], [19, 5973], [11, 519]].map(([flag, item_type_id]) => ({
  flag, item_type_id, quantity_destroyed: 1, quantity_dropped: 0,
}));
globalThis.fetch = async (url, options) => {
  const { pathname, host } = new URL(String(url));
  if (!host.includes('zkillboard')) return realFetch(url, options);
  const ship = Number(/shipTypeID\/(\d+)\//.exec(pathname)?.[1]);
  pageRequests += 1;
  if (gate) await gate;
  if (failNext) return new Response('{}', { status: 404 });
  return new Response(JSON.stringify(Array.from({ length: 12 }, () => ({
    killmail_id: killSerial += 1,
    killmail_time: '2026-06-01T00:00:00Z',
    zkb: { totalValue: 1000 },
    victim: { ship_type_id: ship, items },
  }))), { status: 200 });
};
function holdUpstream() {
  // A cached page would answer without reaching the held upstream.
  zkill.reset();
  clearHulls();
  let release;
  gate = new Promise((resolve) => { release = resolve; });
  return () => { gate = null; release(); };
}

const app = await buildApp();
await app.listen({ port: 0, host: '127.0.0.1' });
const { port } = app.server.address();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, label, timeout = 4000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await wait(10);
  }
  throw new Error(`timed out: ${label}`);
}

let serial = 0;
class Pilot {
  static async create(label) {
    const pilot = new Pilot();
    pilot.name = `${label} ${serial += 1}`;
    const response = await app.inject({ method: 'GET', url: `/api/v1/auth/dev?name=${encodeURIComponent(pilot.name)}` });
    const raw = response.headers['set-cookie'];
    pilot.cookie = String(Array.isArray(raw) ? raw[0] : raw).split(';')[0];
    pilot.log = [];
    return pilot;
  }

  async post(url, payload = {}) {
    const response = await app.inject({
      method: 'POST', url, headers: { cookie: this.cookie, 'content-type': 'application/json' }, payload,
    });
    return { status: response.statusCode, body: JSON.parse(response.body) };
  }

  async open() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/rooms/${this.code}/ws?player=${this.id}`, {
      headers: { Cookie: this.cookie },
    });
    const log = [];
    ws.on('message', (raw) => { const message = JSON.parse(String(raw)); log.push(message); this.log.push(message); });
    ws.log = log;
    ws.closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    this.ws = ws;
    await until(() => log.some((message) => message.t === 'welcome'), 'welcome');
    return ws;
  }

  send(message) { this.ws.send(JSON.stringify(message)); }

  count(type) { return this.log.filter((message) => message.t === type).length; }

  last(type) { return this.log.filter((message) => message.t === type).at(-1); }
}

async function makeRoom(size, { connect = true } = {}) {
  const pilots = [];
  for (let i = 0; i < size; i += 1) pilots.push(await Pilot.create('Pilot'));
  const created = (await pilots[0].post('/api/v1/rooms')).body;
  pilots.forEach((pilot) => { pilot.code = created.code; });
  pilots[0].id = created.playerId;
  if (connect) await pilots[0].open();
  for (const pilot of pilots.slice(1)) {
    pilot.id = (await pilot.post(`/api/v1/rooms/${created.code}/join`)).body.playerId;
    if (connect) await pilot.open();
  }
  return { pilots, room: ROOMS.get(created.code), code: created.code };
}

async function closeAll(pilots, code) {
  for (const pilot of pilots) pilot.ws?.terminate();
  await wait(20);
  const room = ROOMS.get(code);
  if (room) for (const player of room.players.values()) clearTimeout(player.reconnectTimer);
  ROOMS.delete(code);
}

async function startArbitration(size) {
  const setup = await makeRoom(size);
  setup.pilots[0].send({ t: 'start', gameplay: 'arbitration', settings: {} });
  await until(() => setup.room.match?.rule === 'arbitration', 'arbitration start');
  setup.dealer = setup.pilots[0];
  return setup;
}

async function publish({ dealer, room }) {
  const index = room.match.clues.findIndex((clue, i) => clue.k !== 'equipment' && clue.k !== 'cargo' && !room.match.published.has(i));
  dealer.send({ t: 'publish', indices: [index] });
  await until(() => room.match?.phase === 'player', 'player phase');
}

async function startEndless(size, gameplay) {
  const setup = await makeRoom(size);
  setup.pilots[0].send({ t: 'start', gameplay, settings: {} });
  await until(() => setup.pilots.every((pilot) => pilot.last('endlessPrepare')), 'endless prepare');
  return setup;
}

async function readyAll({ pilots, room }) {
  for (const pilot of pilots) pilot.send({ t: 'ready', roundId: room.match.roundId });
}

/** Ships that are not the target of the running round. */
function wrongShips(room) {
  return [587, 588, 589, 590, 591, 592, 593, 594].filter((id) => id !== Number(room.match.target.shipId));
}

function loseRound(pilot, room) {
  for (const shipId of wrongShips(room).slice(0, 6)) pilot.send({ t: 'raceGuess', roundId: room.match.roundId, shipId });
}

async function playing(size, gameplay) {
  const setup = await startEndless(size, gameplay);
  await readyAll(setup);
  if (gameplay === 'timed') {
    await until(() => setup.room.match.phase === 'ready', 'ready');
    for (const pilot of setup.pilots) pilot.send({ t: 'prepare' });
  }
  await until(() => setup.room.match.phase === 'playing', 'playing', 5000);
  return setup;
}

// --- The server counts and judges race guesses ------------------------------

test('room guesses are counted, deduplicated and judged by the server', async () => {
  const { pilots, room, code } = await playing(2, 'standard');
  const { roundId, target } = room.match;
  const [a, b] = wrongShips(room);
  for (const shipId of [a, a, b, 1, 'cni', b]) pilots[0].send({ t: 'raceGuess', roundId, shipId });
  pilots[0].send({ t: 'raceGuess', roundId: 'other', shipId: target.shipId });
  await until(() => pilots[0].last('raceGuesses')?.guesses?.length === 2, 'two guesses');
  assert.equal(room.match.results.length, 0);
  pilots[0].send({ t: 'raceGuess', roundId, shipId: target.shipId });
  await until(() => room.match.results.length === 1, 'won');
  const { playerId, status, attempts } = room.match.results[0];
  assert.deepEqual([playerId, status, attempts], [pilots[0].id, 'won', 3]);
  assert.equal(pilots[0].last('raceGuesses').status, 'won');
  assert.equal(pilots[1].count('raceGuesses'), 0, 'guesses stay private');
  // Nothing is accepted after the result.
  pilots[0].send({ t: 'raceGuess', roundId, shipId: wrongShips(room)[4] });
  loseRound(pilots[1], room);
  await until(() => room.match.phase === 'finished', 'finished');
  const result = pilots[0].last('endlessRoundResult').result;
  assert.deepEqual(result.results.map((item) => [item.status, item.attempts]), [['won', 3], ['lost', 6]]);
  assert.deepEqual([result.points[pilots[0].id], result.points[pilots[1].id]], [2000, 0]);
  await closeAll(pilots, code);
});

test('a claimed result is ignored outside giving up a timed round', async () => {
  const standard = await playing(2, 'standard');
  const claim = (pilot, room, extra) => pilot.send({ t: 'raceResult', roundId: room.match.roundId, attempts: 1, elapsedMs: 1, ...extra });
  claim(standard.pilots[0], standard.room, { status: 'won', answerId: standard.room.match.target.shipId });
  claim(standard.pilots[0], standard.room, { status: 'lost' });
  await wait(80);
  assert.equal(standard.room.match.results.length, 0);
  await closeAll(standard.pilots, standard.code);

  const timed = await playing(2, 'timed');
  claim(timed.pilots[0], timed.room, { status: 'won', answerId: timed.room.match.target.shipId });
  await wait(80);
  assert.equal(timed.room.match.results.length, 0);
  claim(timed.pilots[0], timed.room, { status: 'lost' });
  await until(() => timed.room.match.results.length === 1, 'gave up');
  assert.deepEqual([timed.room.match.results[0].status, timed.room.match.results[0].attempts], ['lost', 0]);
  await closeAll(timed.pilots, timed.code);
});

test('timed guesses keep the cooldown on the server', async () => {
  const { pilots, room, code } = await playing(2, 'timed');
  const { roundId, target } = room.match;
  const [a, b, c, d, e, f, g] = wrongShips(room);
  pilots[0].send({ t: 'raceGuess', roundId, shipId: a });
  pilots[0].send({ t: 'raceGuess', roundId, shipId: target.shipId });
  await until(() => pilots[0].count('raceGuesses') === 2, 'answers');
  const early = pilots[0].last('raceGuesses');
  assert.deepEqual(early.guesses, [a], 'the early guess is not judged');
  assert.ok(early.retryMs > 3000 && early.retryMs <= 5000);
  assert.equal(room.match.results.length, 0);
  // Six misses do not end a timed round.
  for (const shipId of [b, c, d, e, f, g]) {
    room.match.lastGuessAt.set(pilots[0].id, 0);
    pilots[0].send({ t: 'raceGuess', roundId, shipId });
    await until(() => pilots[0].last('raceGuesses').guesses.includes(shipId), 'guess');
  }
  assert.equal(room.match.results.length, 0);
  await closeAll(pilots, code);
});

test('a reload returns the guesses already made', async () => {
  const { pilots, room, code } = await playing(2, 'standard');
  const ships = wrongShips(room);
  for (const shipId of ships.slice(0, 4)) pilots[0].send({ t: 'raceGuess', roundId: room.match.roundId, shipId });
  await until(() => pilots[0].last('raceGuesses')?.guesses.length === 4, 'four');
  pilots[0].ws.terminate();
  await wait(30);
  const ws = await pilots[0].open();
  await until(() => ws.log.some((message) => message.t === 'endlessPrepare'), 'resume');
  assert.deepEqual(ws.log.find((message) => message.t === 'endlessPrepare').guesses, ships.slice(0, 4));
  for (const shipId of ships.slice(4, 6)) pilots[0].send({ t: 'raceGuess', roundId: room.match.roundId, shipId });
  await until(() => room.match.results[0]?.status === 'lost', 'six in total lose');
  await closeAll(pilots, code);
});

test('leaving or timing out during a round is a loss, being kicked is not', async () => {
  const left = await playing(3, 'standard');
  left.pilots[2].send({ t: 'leave' });
  await until(() => left.pilots[0].last('endlessFinished')?.forfeit, 'forfeit');
  assert.equal(left.pilots[0].last('endlessFinished').name, left.pilots[2].name);
  left.pilots[1].ws.terminate();
  await until(() => left.room.match.results.length === 2, 'grace timeout');
  loseRound(left.pilots[0], left.room);
  await until(() => left.room.match.phase === 'finished', 'finished');
  const { results, points } = left.pilots[0].last('endlessRoundResult').result;
  assert.deepEqual(results.map((item) => [item.playerId, item.status, Boolean(item.forfeit)]), [
    [left.pilots[2].id, 'lost', true], [left.pilots[1].id, 'lost', true], [left.pilots[0].id, 'lost', false],
  ]);
  assert.equal(points[left.pilots[2].id], 0);
  await closeAll(left.pilots, left.code);

  const kicked = await playing(3, 'standard');
  kicked.pilots[0].send({ t: 'kick', playerId: kicked.pilots[2].id });
  await until(() => kicked.room.players.size === 2, 'kicked');
  assert.equal(kicked.room.match.results.length, 0);
  // A finished player keeps the result after leaving.
  loseRound(kicked.pilots[1], kicked.room);
  await until(() => kicked.room.match.results.length === 1, 'lost');
  kicked.pilots[1].send({ t: 'leave' });
  await until(() => kicked.room.players.size === 1, 'left');
  assert.equal(kicked.room.match.results.length, 1);
  assert.equal(Boolean(kicked.room.match.results[0].forfeit), false);
  await closeAll(kicked.pilots, kicked.code);
});

test('arbitration accepts full ship names only', async () => {
  const setup = await startArbitration(3);
  const { room, pilots } = setup;
  await publish(setup);
  const ship = config.catalogShips.find((item) => Number(item.id) === 17634);
  room.match.target.shipId = ship.id;
  room.match.accepted = acceptedNames(ship.id);
  pilots[1].send({ t: 'guess', text: ship.names.en.split(' ').map((word) => word[0]).join('') });
  await until(() => room.match.guessed.size === 1, 'abbreviation');
  assert.equal(room.match.solved.size, 0);
  pilots[2].send({ t: 'guess', text: ship.names.zh });
  await until(() => pilots[0].last('solved'), 'full name');
  assert.equal(pilots[0].last('solved').playerId, pilots[2].id);
  await closeAll(pilots, setup.code);
});

// --- H1 / H2 / M5: arbitration never stalls ---------------------------------

test('arbitration settles when the last pending guesser leaves', async () => {
  const setup = await startArbitration(3);
  const { room, pilots } = setup;
  await publish(setup);
  pilots[1].send({ t: 'guess', text: 'definitely wrong' });
  await until(() => room.match.guessed.size === 1, 'first guess');
  pilots[2].send({ t: 'leave' });
  await until(() => room.match?.round === 2 && room.match.phase === 'dealer', 'round advanced after leave');
  await closeAll(pilots, setup.code);
});

test('arbitration settles when the last pending guesser times out', async () => {
  const setup = await startArbitration(3);
  const { room, pilots } = setup;
  await publish(setup);
  pilots[1].send({ t: 'guess', text: 'definitely wrong' });
  await until(() => room.match.guessed.size === 1, 'first guess');
  pilots[2].ws.terminate();
  await wait(60);
  assert.equal(room.match.round, 1, 'a short drop keeps the turn open');
  await until(() => room.match?.round === 2, 'round advanced after the grace');
  await closeAll(pilots, setup.code);
});

test('arbitration settles after a disconnected dealer returns', async () => {
  const setup = await startArbitration(2);
  const { room, pilots } = setup;
  await publish(setup);
  pilots[0].ws.terminate();
  await until(() => room.match.dealerDisconnected, 'dealer dropped');
  pilots[1].send({ t: 'guess', text: 'definitely wrong' });
  await until(() => room.match.guessed.size === 1, 'guess');
  assert.equal(room.match.round, 1);
  await pilots[0].open();
  await until(() => room.match?.round === 2, 'round advanced after dealer reconnect');
  await closeAll(pilots, setup.code);
});

test('arbitration ends when no guesser remains', async () => {
  const setup = await startArbitration(2);
  const { room, pilots } = setup;
  await publish(setup);
  pilots[1].send({ t: 'leave' });
  await until(() => room.match === null && room.phase === 'between_matches', 'match ended');
  await closeAll(pilots, setup.code);
});

test('a leaver does not reset or block the arbitration ready check', async () => {
  const setup = await startArbitration(3);
  const { room, pilots } = setup;
  room.match.round = 6;
  await publish(setup);
  pilots[1].send({ t: 'guess', text: 'definitely wrong' });
  pilots[2].send({ t: 'guess', text: 'definitely wrong' });
  await until(() => room.match?.phase === 'reveal', 'reveal');
  pilots[0].send({ t: 'prepare' });
  pilots[1].send({ t: 'prepare' });
  await until(() => room.match.prepared.size === 2, 'two prepared');
  pilots[2].send({ t: 'leave' });
  const matchId = room.match.id;
  await until(() => room.match && room.match.id !== matchId, 'next dealer stint');
  await closeAll(pilots, setup.code);
});

// --- H3 / H4: loading is exclusive and cancellable ---------------------------

test('starting twice creates a single arbitration match', async () => {
  const { pilots, room, code } = await makeRoom(2);
  const release = holdUpstream();
  pilots[0].send({ t: 'start', gameplay: 'arbitration', settings: {} });
  pilots[0].send({ t: 'start', gameplay: 'arbitration', settings: {} });
  await wait(60);
  assert.equal(room.phase, 'playing', 'the room is reserved while the target loads');
  release();
  await until(() => room.match, 'match');
  await wait(60);
  assert.equal(pilots[1].count('start'), 1);
  await closeAll(pilots, code);
});

test('an arbitration dealer who leaves while loading is replaced', async () => {
  const { pilots, room, code } = await makeRoom(3);
  const release = holdUpstream();
  pilots[0].send({ t: 'start', gameplay: 'arbitration', settings: {} });
  await wait(40);
  pilots[0].send({ t: 'leave' });
  await until(() => !room.players.has(pilots[0].id), 'left');
  release();
  await until(() => room.match, 'match');
  assert.ok(room.players.has(room.match.dealerId), 'the dealer is still in the room');
  assert.equal(room.match.nonDealerIds.includes(room.match.dealerId), false);
  await closeAll(pilots, code);
});

test('ending while a target loads cancels it', async () => {
  const { pilots, room, code } = await makeRoom(2);
  const release = holdUpstream();
  pilots[0].send({ t: 'start', gameplay: 'arbitration', settings: {} });
  await wait(40);
  pilots[0].send({ t: 'end' });
  await until(() => room.phase === 'between_matches', 'cancelled');
  release();
  await wait(80);
  assert.equal(room.match, null, 'the late target is discarded');
  assert.equal(pilots[1].count('start'), 0);
  await closeAll(pilots, code);
});

test('a stale endless load neither broadcasts nor breaks a newer session', async () => {
  const { pilots, room, code } = await makeRoom(2);
  const release = holdUpstream();
  pilots[0].send({ t: 'start', gameplay: 'standard', settings: {} });
  await until(() => room.match, 'first session');
  const first = room.match.id;
  pilots[0].send({ t: 'end' });
  await until(() => room.match === null, 'ended');
  pilots[0].send({ t: 'start', gameplay: 'standard', settings: {} });
  await until(() => room.match && room.match.id !== first, 'second session');
  release();
  await until(() => pilots[1].last('endlessPrepare'), 'prepare');
  await wait(60);
  assert.equal(pilots[1].count('endlessPrepare'), 1);
  assert.equal(room.phase, 'playing');
  await closeAll(pilots, code);
});

test('repeated ready-for-next messages load one round', async () => {
  const { pilots, room, code } = await startEndless(2, 'standard');
  await readyAll({ pilots, room });
  await until(() => room.match.phase === 'playing', 'playing', 5000);
  for (const pilot of pilots) {
    loseRound(pilot, room);
  }
  await until(() => room.match.phase === 'finished', 'finished');
  const release = holdUpstream();
  pilots[0].send({ t: 'prepare' });
  for (let i = 0; i < 4; i += 1) pilots[1].send({ t: 'prepare' });
  await wait(60);
  release();
  await until(() => room.match.roundNo === 2, 'round two');
  await wait(80);
  assert.equal(pilots[0].count('endlessPrepare'), 2);
  await closeAll(pilots, code);
});

// --- H5: there is always a usable owner --------------------------------------

test('joining an abandoned room makes the newcomer its owner', async () => {
  const { pilots, room, code } = await makeRoom(1);
  pilots[0].send({ t: 'leave' });
  await until(() => room.players.size === 0, 'empty');
  const next = await Pilot.create('Newcomer');
  next.code = code;
  next.id = (await next.post(`/api/v1/rooms/${code}/join`)).body.playerId;
  await next.open();
  assert.equal(room.ownerId, next.id);
  await closeAll([...pilots, next], code);
});

test('a host who never connects is replaced after the grace', async () => {
  const { pilots, room, code } = await makeRoom(2, { connect: false });
  await pilots[1].open();
  await until(() => room.ownerId === pilots[1].id, 'owner moved');
  assert.equal(room.players.has(pilots[0].id), false);
  await closeAll(pilots, code);
});

// --- H6: one live connection per player ---------------------------------------

test('a second connection replaces the first one', async () => {
  const { pilots, room, code } = await makeRoom(2);
  const old = pilots[1].ws;
  await pilots[1].open();
  assert.equal(await old.closed, 4001);
  await wait(30);
  const player = room.players.get(pilots[1].id);
  assert.equal(player.connected, true, 'closing the old socket does not drop the player');
  await closeAll(pilots, code);
});

test('a removed player cannot act through a lingering socket', async () => {
  const { pilots, room, code } = await makeRoom(2);
  const player = room.players.get(pilots[1].id);
  player.removed = true;
  pilots[1].send({ t: 'chat', id: 'x', text: 'ghost' });
  await wait(60);
  assert.equal(pilots[0].count('chat'), 0);
  player.removed = false;
  await closeAll(pilots, code);
});

// --- H7: reconnects resume the right phase ------------------------------------

test('reconnecting while the target loads waits for it', async () => {
  const { pilots, room, code } = await makeRoom(2);
  const release = holdUpstream();
  pilots[0].send({ t: 'start', gameplay: 'standard', settings: {} });
  await until(() => room.match, 'session');
  pilots[1].ws.terminate();
  await wait(30);
  const ws = await pilots[1].open();
  await wait(40);
  assert.equal(ws.log.some((message) => message.t === 'endlessPrepare'), false, 'no empty target is sent');
  release();
  await until(() => ws.log.some((message) => message.t === 'endlessPrepare' && message.target), 'prepare');
  await closeAll(pilots, code);
});

test('reconnecting after submitting or after the round does not restart it', async () => {
  const { pilots, room, code } = await startEndless(2, 'standard');
  await readyAll({ pilots, room });
  await until(() => room.match.phase === 'playing', 'playing', 5000);
  loseRound(pilots[1], room);
  await until(() => room.match.results.length === 1, 'submitted');
  pilots[1].ws.terminate();
  await wait(30);
  let ws = await pilots[1].open();
  await wait(60);
  assert.equal(ws.log.find((message) => message.t === 'endlessPrepare')?.submitted?.status, 'lost');
  assert.equal(ws.log.some((message) => message.t === 'endlessStart'), false);
  loseRound(pilots[0], room);
  await until(() => room.match.phase === 'finished', 'finished');
  pilots[1].ws.terminate();
  await wait(30);
  ws = await pilots[1].open();
  await wait(60);
  assert.equal(ws.log.some((message) => message.t === 'endlessStart'), false);
  assert.equal(ws.log.find((message) => message.t === 'endlessRoundResult')?.result?.roundId, room.match.roundId);
  await closeAll(pilots, code);
});

// --- M1: heartbeat ------------------------------------------------------------

test('idle sockets are pinged and dead ones are dropped', async () => {
  const { pilots, room, code } = await makeRoom(2);
  let pings = 0;
  pilots[0].ws.on('ping', () => { pings += 1; });
  await until(() => pings >= 3, 'pings');
  assert.equal(room.players.get(pilots[0].id).connected, true);
  // Stop answering: the client no longer reads from the network.
  pilots[1].ws.pong = () => {};
  pilots[1].ws._autoPong = false;
  await until(() => !room.players.get(pilots[1].id)?.connected, 'dead socket dropped');
  await closeAll(pilots, code);
});

// --- M2 / M3: limits ----------------------------------------------------------

test('repeated wrong passwords are limited', async () => {
  const host = await Pilot.create('Locked');
  const guest = await Pilot.create('Guesser');
  const other = await Pilot.create('Friend');
  const { code } = (await host.post('/api/v1/rooms', { password: 'secret' })).body;
  const statuses = [];
  for (let i = 0; i < 12; i += 1) statuses.push((await guest.post(`/api/v1/rooms/${code}/join`, { password: `no${i}` })).status);
  assert.equal(statuses[0], 403);
  assert.equal(statuses.at(-1), 429);
  assert.equal((await guest.post(`/api/v1/rooms/${code}/join`, { password: 'secret' })).status, 429);
  assert.equal((await other.post(`/api/v1/rooms/${code}/join`, { password: 'secret' })).status, 200);
  await closeAll([], code);
});

test('seated players rejoin without the password and empty ones are not counted', async (t) => {
  // Nobody connects here and password hashing is slow on CI: keep the seats meanwhile.
  config.roomReconnectGraceMs = 60000;
  t.after(() => { config.roomReconnectGraceMs = GRACE; });
  const host = await Pilot.create('Keeper');
  const guest = await Pilot.create('Sitter');
  const { code } = (await host.post('/api/v1/rooms', { password: 'secret' })).body;
  const join = async (pilot, password) => (await pilot.post(`/api/v1/rooms/${code}/join`, password == null ? {} : { password })).status;
  for (let i = 0; i < 12; i += 1) assert.equal(await join(guest), 403, 'an invite link tries without a password first');
  for (let i = 0; i < 7; i += 1) assert.equal(await join(guest, 'wrong'), 403);
  assert.equal(await join(guest, 'secret'), 200);
  assert.equal(await join(guest), 200, 'the seat is kept');
  assert.equal(await join(host), 200);
  // A success starts the count again.
  const { code: second } = (await host.post('/api/v1/rooms', { password: 'other' })).body;
  for (let i = 0; i < 7; i += 1) {
    assert.equal((await guest.post(`/api/v1/rooms/${second}/join`, { password: 'wrong' })).status, 403);
  }
  assert.equal((await guest.post(`/api/v1/rooms/${second}/join`, { password: 'other' })).status, 200);
  await closeAll([], code);
  await closeAll([], second);
});

test('only players of a room can read its state', async () => {
  const { pilots, code } = await makeRoom(2);
  const outsider = await Pilot.create('Outsider');
  const read = async (pilot) => (await app.inject({ method: 'GET', url: `/api/v1/rooms/${code}`, headers: { cookie: pilot.cookie } }));
  assert.equal((await read(pilots[1])).statusCode, 200);
  const denied = await read(outsider);
  assert.deepEqual([denied.statusCode, JSON.parse(denied.body)], [404, { error: 'room-not-found' }]);
  await closeAll(pilots, code);
});

test('scores cannot be reset during a match', async () => {
  const { pilots, room, code } = await makeRoom(2);
  room.players.get(pilots[0].id).score = 7;
  pilots[0].send({ t: 'reset' });
  await until(() => room.players.get(pilots[0].id).score === 0, 'reset in the lobby');
  pilots[0].send({ t: 'start', gameplay: 'standard', settings: {} });
  await until(() => room.match, 'match');
  room.players.get(pilots[0].id).score = 7;
  pilots[0].send({ t: 'reset' });
  await wait(60);
  assert.equal(room.players.get(pilots[0].id).score, 7);
  await closeAll(pilots, code);
});

test('message floods are ignored without dropping normal use', async () => {
  const { pilots, room, code } = await makeRoom(2);
  const before = pilots[1].count('room');
  for (let i = 0; i < 600; i += 1) pilots[0].send({ t: 'settings', gameplay: 'standard', settings: {} });
  await wait(300);
  const received = pilots[1].count('room') - before;
  assert.ok(received < 200, `broadcasts stay bounded (${received})`);
  assert.equal(room.players.get(pilots[0].id).connected, true);
  await closeAll(pilots, code);
});

// --- M4: timed rooms keep their ready step ------------------------------------

test('a leaver during timed loading does not skip the ready step', async () => {
  const { pilots, room, code } = await startEndless(3, 'timed');
  pilots[0].send({ t: 'ready', roundId: room.match.roundId });
  pilots[1].send({ t: 'ready', roundId: room.match.roundId });
  await until(() => room.match.ready.size === 2, 'two ready');
  pilots[2].send({ t: 'leave' });
  await until(() => room.match.phase !== 'loading', 'left loading');
  assert.equal(room.match.phase, 'ready');
  await until(() => pilots[0].last('endlessLoaded'), 'loaded message');
  await closeAll(pilots, code);
});

test('a leaver does not block players who are ready for the next round', async () => {
  const { pilots, room, code } = await startEndless(3, 'standard');
  await readyAll({ pilots, room });
  await until(() => room.match.phase === 'playing', 'playing', 5000);
  for (const pilot of pilots) loseRound(pilot, room);
  await until(() => room.match.phase === 'finished', 'finished');
  pilots[0].send({ t: 'prepare' });
  pilots[1].send({ t: 'prepare' });
  await until(() => room.match.prepared.size === 2, 'two prepared');
  pilots[2].send({ t: 'leave' });
  await until(() => room.match?.roundNo === 2, 'next round');
  await closeAll(pilots, code);
});

test('a failed target returns the room to the lobby phase', async () => {
  const { pilots, room, code } = await makeRoom(2);
  config.manifest.savedPool = config.manifest.auditKillShipPool;
  config.manifest.auditKillShipPool = [999999991];
  failNext = true;
  pilots[0].send({ t: 'start', gameplay: 'arbitration', settings: {} });
  await until(() => pilots[0].last('error')?.code === 'target', 'error', 15000);
  assert.equal(room.phase, 'between_matches');
  failNext = false;
  config.manifest.auditKillShipPool = config.manifest.savedPool;
  delete config.manifest.savedPool;
  await closeAll(pilots, code);
});

test.after(async () => {
  globalThis.fetch = realFetch;
  await app.close();
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbFile}${suffix}`, { force: true }); } catch {}
  }
});
