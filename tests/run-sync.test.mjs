import test from 'node:test';
import assert from 'node:assert/strict';
import { RunSync, mergeGuesses } from '../js/run-sync.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    size: () => data.size,
  };
}

function setup({ storage = memoryStorage(), user = 'A' } = {}) {
  const calls = [];
  const runs = [];
  const rejected = [];
  const timers = [];
  let fail = null;
  const answer = (call) => {
    calls.push(call);
    if (fail) throw Object.assign(new Error('fail'), fail);
    return { runId: call[1], completed: false };
  };
  const sync = new RunSync({
    storage,
    user,
    api: {
      begin: async (runId, elapsedMs) => answer(['begin', runId, elapsedMs]),
      guess: async (runId, shipId, elapsedMs) => answer(['guess', runId, shipId, elapsedMs]),
      finish: async (runId, payload) => answer(['finish', runId, payload.status, payload.elapsedMs]),
    },
    onRun: (runId) => runs.push(runId),
    onRejected: (runId, error) => rejected.push([runId, error.status]),
    setTimer: (fn, ms) => { timers.push([fn, ms]); return timers.length; },
    clearTimer: () => {},
  });
  return { sync, storage, calls, runs, rejected, timers, failWith: (value) => { fail = value; } };
}

test('guesses are delivered in order and once', async () => {
  const { sync, calls, storage, runs } = setup();
  const pending = [sync.guess('r', 1), sync.guess('r', 2), sync.guess('r', 2), sync.lose('r', 900)];
  assert.deepEqual(await Promise.all(pending), [true, true, true, true]);
  assert.deepEqual(calls, [['guess', 'r', 1, 0], ['guess', 'r', 2, 0], ['finish', 'r', 'lost', 900]]);
  assert.equal(runs.length, 3);
  assert.equal(storage.size(), 0, 'nothing stays stored after delivery');
});

test('the timed start is delivered before the guesses, with the time passed since', async () => {
  const first = setup();
  first.failWith({ status: 503 });
  const at = Date.now() - 4000;
  assert.equal(await first.sync.begin('r', at), false);
  await first.sync.guess('r', 1, 5000);
  const second = setup({ storage: first.storage });
  assert.equal(await second.sync.flush(), true);
  assert.deepEqual(second.calls.map((call) => call[0]), ['begin', 'guess']);
  assert.ok(second.calls[0][2] >= 4000 && second.calls[0][2] < 6000);
});

test('unsent guesses survive a reload and are retried', async () => {
  const first = setup();
  first.failWith({ status: undefined });
  assert.equal(await first.sync.guess('r', 1), false);
  await first.sync.guess('r', 2);
  assert.equal(first.timers.length > 0, true);
  assert.ok(first.timers.at(-1)[1] >= first.timers[0][1], 'retries back off');

  const second = setup({ storage: first.storage });
  assert.equal(second.sync.pending('r'), true);
  assert.equal(await second.sync.flush(), true);
  assert.deepEqual(second.calls.map((call) => call[2]), [1, 2]);
});

test('a refused run is dropped and does not block the others', async () => {
  const { sync, calls, rejected, failWith } = setup();
  failWith({ status: 503 });
  await sync.guess('a', 1);
  await sync.guess('b', 2);
  failWith({ status: 409 });
  assert.equal(await sync.flush(), true);
  assert.deepEqual(rejected, [['a', 409], ['b', 409]]);
  assert.equal(sync.pending('a'), false);
  assert.ok(calls.length >= 4);
});

test('a signed-out or different account keeps the queue without sending it', async () => {
  const first = setup();
  first.failWith({ status: 401 });
  assert.equal(await first.sync.guess('r', 1), false);
  assert.equal(first.timers.length, 0, 'no retry until signing in again');
  const other = setup({ storage: first.storage, user: 'B' });
  assert.equal(await other.sync.flush(), true);
  assert.equal(other.calls.length, 0);
  const back = setup({ storage: first.storage });
  await back.sync.flush();
  assert.equal(back.calls.length, 1);
});

test('merging keeps the confirmed order and adds unsent guesses', () => {
  assert.deepEqual(mergeGuesses([3, 1], [1, 2, '4', 0, null]), [3, 1, 2, 4]);
});

test('a page older than the service stops sending and is told so', async () => {
  const { sync, rejected, timers, failWith } = setup();
  failWith({ status: 426 });
  assert.equal(await sync.guess('a', 1), true);
  assert.deepEqual(rejected, [['a', 426]]);
  assert.equal(timers.length, 0, 'no retry: only a reload helps');
});
