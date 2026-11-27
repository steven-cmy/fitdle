import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eligibleKills, fallbackMonths, makeRng, monthCandidates, normalizeUsage, pageCount, parseGroupFactors,
  pickWeighted, recentMonthKeys, shipWeights, weightedShipOrder,
} from '../src/selection.mjs';

const ship = (id, groupID = 25) => ({ id, groupID });
const usage = (entries) => ({ version: 1, ships: Object.fromEntries(Object.entries(entries).map(([id, destroyed]) => [id, { m: { 202610: [destroyed, 0] } }])) });

test('group factors parse, skip junk and allow zero', () => {
  const { factors, warnings } = parseGroupFactors('29:0.2, 31=0.3,237:0,x:1,5:-1');
  assert.deepEqual([...factors], [[29, 0.2], [31, 0.3], [237, 0]]);
  assert.equal(warnings.length, 2);
  assert.equal(parseGroupFactors('').factors.size, 0);
});

test('the usage window is the last complete months', () => {
  assert.deepEqual(recentMonthKeys('2026-11-27', 3), ['202610', '202609', '202608']);
  assert.deepEqual(recentMonthKeys('2026-01-02', 3), ['202512', '202511', '202510']);
});

test('weights start at 1, the usage bonus is capped by the ratio, groups multiply', () => {
  const ships = [ship(1), ship(2), ship(3), ship(4, 29), ship(5, 31)];
  const data = usage({ 1: 0, 2: 100, 3: 100000, 4: 5000000, 5: 100000 });
  const weights = shipWeights({ ships, usage: data, day: '2026-11-27', maxRatio: 3, groupFactors: new Map([[29, 0.2], [31, 0]]) });
  assert.equal(weights.get(1), 1, 'unused hull stays at the start weight');
  assert.ok(weights.get(2) > 1 && weights.get(2) < weights.get(3));
  assert.equal(weights.get(3), 3, 'the heaviest ordinary hull is exactly the ratio');
  assert.ok(Math.abs(weights.get(4) - 0.6) < 1e-9, 'a factored group does not set the scale and is clamped: 3 * 0.2');
  assert.equal(weights.get(5), 0, 'factor 0 excludes');
  const flat = shipWeights({ ships, usage: data, day: '2026-11-27', maxRatio: 1 });
  assert.ok([...flat.values()].every((value) => value === 1), 'ratio 1 turns the bonus off');
  const none = shipWeights({ ships, usage: null, day: '2026-11-27' });
  assert.ok([...none.values()].every((value) => value === 1), 'no data: all equal');
  const old = shipWeights({ ships, usage: { version: 1, ships: { 3: { m: { 202401: [9999, 0] } } } }, day: '2026-11-27' });
  assert.equal(old.get(3), 1, 'usage outside the window does not count');
});

test('the weighted order is a reproducible permutation that favors heavy hulls', () => {
  const weights = new Map([[1, 1], [2, 1], [3, 3], [4, 0], [5, 1]]);
  const order = weightedShipOrder(weights, 'seed-a');
  assert.deepEqual([...order].sort(), [1, 2, 3, 5], 'zero weight is left out, no repeats');
  assert.deepEqual(weightedShipOrder(weights, 'seed-a'), order);
  let heavyFirst = 0;
  let lightFirst = 0;
  for (let i = 0; i < 2000; i += 1) {
    const first = weightedShipOrder(weights, `s${i}`)[0];
    if (first === 3) heavyFirst += 1;
    if (first === 1) lightFirst += 1;
  }
  assert.ok(heavyFirst > lightFirst * 2 && heavyFirst < lightFirst * 4, `3x weight is first about 3x as often (${heavyFirst}/${lightFirst})`);
});

test('months are weighted by age, skip empty months and the window bounds', () => {
  const entry = { m: { 202511: [0, 400], 202411: [0, 400], 201001: [0, 50], 202601: [0, 0], 202612: [0, 9] } };
  const months = monthCandidates(entry, '2012-05-22', '2026-10-31', 365);
  assert.deepEqual(months.map((m) => m.key), ['202411', '202511']);
  const [old, recent] = months;
  assert.ok(recent.weight > old.weight && old.weight > 0, 'older months count less but never zero');
  assert.ok(Math.abs(recent.weight / old.weight - 2) < 0.05, 'a year older is half as likely');
  assert.equal(monthCandidates(entry, '2012-05-22', '2026-10-31', 365).length, 2);
  assert.deepEqual(monthCandidates(entry, '2025-11-15', '2026-10-31').map((m) => m.key), ['202511']);
  const rng = makeRng('x');
  const counts = { 202411: 0, 202511: 0 };
  for (let i = 0; i < 3000; i += 1) counts[pickWeighted(months, rng).key] += 1;
  assert.ok(counts[202511] > counts[202411] * 1.6 && counts[202411] > 500);
});

test('the page count follows the loss count and stops at the API limit', () => {
  assert.deepEqual([0, 1, 200, 201, 450, 20000, 99999].map(pageCount), [1, 1, 1, 2, 3, 100, 100]);
});

test('eligible killmails respect hull, period, fit and the room history', () => {
  const kill = (id, time, fitted = true, ship = 7) => ({
    killmail_id: id,
    killmail_time: time,
    victim: { ship_type_id: ship, items: fitted ? [{ flag: 19, item_type_id: 1, quantity_destroyed: 1 }] : [] },
  });
  const page = [kill(1, '2026-10-02T00:00:00Z'), kill(2, '2026-11-02T00:00:00Z'), kill(3, '2010-01-01T00:00:00Z'),
    kill(4, '2026-10-03T00:00:00Z', false), kill(5, '2026-10-04T00:00:00Z', true, 8), { killmail_id: 6 }];
  const base = { earliestDate: '2012-05-22', latestDate: '2026-10-31' };
  assert.deepEqual(eligibleKills(page, 7, base).kills.map((k) => k.killmail_id), [1, 4]);
  assert.deepEqual(eligibleKills(page, 7, { ...base, allowEmpty: false }).kills.map((k) => k.killmail_id), [1]);
  const room = eligibleKills(page, 7, { ...base, exclude: new Set([1, 4]) });
  assert.deepEqual(room.kills, []);
  assert.equal(room.blocked, true);
});

test('a usage file is checked, and months not over when fetched are dropped', () => {
  assert.equal(normalizeUsage(null), null);
  assert.equal(normalizeUsage({ version: 2, ships: {} }), null);
  assert.equal(normalizeUsage({ version: 1, ships: [] }), null);
  const file = {
    version: 1,
    generatedAt: '2026-11-02T03:00:00Z',
    ships: {
      1: { at: Date.parse('2026-11-02T03:10:00Z'), m: { 202609: [5, 1], 202610: [6, 1], 202611: [2, 0], 202612: [1, 0] } },
      // No fetch time of its own: the generation date counts.
      2: { m: { 202610: [3, 0], 202611: [1, 0] } },
      x: { m: {} },
      3: { m: 'bad' },
    },
  };
  const clean = normalizeUsage(file);
  assert.deepEqual(Object.keys(clean.ships[1].m), ['202609', '202610']);
  assert.deepEqual(Object.keys(clean.ships[2].m), ['202610']);
  assert.deepEqual(Object.keys(clean.ships), ['1', '2'], 'entries in the wrong shape are left out');
  // An older entry kept from an earlier run is cut at its own month.
  const old = normalizeUsage({ version: 1, generatedAt: '2026-11-02T00:00:00Z', ships: { 5: { at: Date.parse('2026-08-02T00:00:00Z'), m: { 202607: [1, 0], 202608: [9, 0] } } } });
  assert.deepEqual(Object.keys(old.ships[5].m), ['202607']);
});

test('stand-in months cover the last complete months, newest weighted most', () => {
  const months = fallbackMonths('2012-05-22', '2026-10-31', 365, 12);
  assert.equal(months.length, 12);
  assert.deepEqual([months.at(0).key, months.at(-1).key], ['202511', '202610']);
  assert.ok(months.every((month) => month.losses <= 200 && pageCount(month.losses) === 1), 'first page only');
  assert.ok(months.at(-1).weight > months.at(0).weight);
  assert.equal(fallbackMonths('2026-10-15', '2026-10-31', 365, 12).length, 1, 'the selection start date bounds them');
  assert.deepEqual(fallbackMonths('', 'nope'), []);
});

test('empty hulls are left out of a page only when they are switched off', () => {
  const fitted = { killmail_id: 1, killmail_time: '2026-01-01T00:00:00Z', victim: { ship_type_id: 5, items: [{ flag: 19, item_type_id: 1 }] } };
  const empty = { killmail_id: 2, killmail_time: '2026-01-01T00:00:00Z', victim: { ship_type_id: 5, items: [{ flag: 5, item_type_id: 1 }] } };
  const on = eligibleKills([fitted, empty], 5, { allowEmpty: true });
  const off = eligibleKills([fitted, empty], 5, { allowEmpty: false });
  assert.deepEqual(on.kills.map((kill) => kill.killmail_id), [1, 2]);
  assert.deepEqual(off.kills.map((kill) => kill.killmail_id), [1]);
  assert.equal(eligibleKills([empty], 5, { allowEmpty: false }).kills.length, 0);
});
