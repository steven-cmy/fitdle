import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ATTEMPT_LIMIT,
  INITIAL_REVEAL,
  DOWNTIME_HOUR_UTC,
  beaconRoundForStart,
  buildSearchIndex,
  buildGuessResult,
  freeKillIdFromToken,
  emptyStats,
  formatMass,
  freeKillToken,
  gameDateKey,
  killHasFittedModules,
  lastCompleteMonth,
  lastCompleteMonthEnd,
  loadState,
  loadStats,
  modeFromLocation,
  msUntilNextDowntime,
  msUntilNextUtcMidnight,
  newlyRevealedFor,
  parseKillId,
  pickKillBySeed,
  pickWeightedRendezvous,
  chooseClosestKill,
  pickWeightedKillByRecency,
  profileSimilarity,
  recordPlay,
  recordResult,
  resultGrid,
  revealCountFor,
  sampleTargetTime,
  saveState,
  saveStats,
  settleStats,
  searchShips,
  shareUrl,
  shiftDateKey,
  shiftMonth,
  utcDateKey,
  victimIsWatched,
  weightedRendezvousOrder,
} from '../js/game.js';
import { buildClues, clueMatchesShip, EQUIPMENT_SLOT_ORDER, getEquipment, humanBucketKey, moduleFitSize, selectAbyssFallbacks, STANDARD_DEFENSE_RANGE } from '../js/clues.js';
import { buildRevealPlan, computeRevealed, computeTimedRevealed, DEFAULT_REVEAL_CONFIG, timedRevealTotal } from '../js/reveal.js';
import { MESSAGES, resolveLocale } from '../js/i18n.js';
import { DEFAULT_REVEAL, DEFAULT_KB_RECENCY_HALF_LIFE_DAYS, DEFAULT_KB_MAX_SCAN_PAGES, loadBuildConfig, parseDateOnly, parseGameDayStart } from '../scripts/build-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'manifest.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8')).ships;
const refs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'refs', 'en.json'), 'utf8'));

function makeLosses() {
  return [{
    killmail_id: 424242,
    killmail_time: '2026-11-16T00:00:00Z',
    zkb: { totalValue: 12345678 },
    victim: {
      ship_type_id: 670,
      items: [
        { flag: 27, item_type_id: 2048, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 19, item_type_id: 5973, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 11, item_type_id: 519, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 92, item_type_id: 31358, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
}

test('date helpers follow EVE downtime and reject invalid/future dates', () => {
  assert.equal(DOWNTIME_HOUR_UTC, 11);
  assert.equal(utcDateKey(new Date('2026-11-14T23:59:59Z')), '2026-11-14');
  assert.equal(utcDateKey(new Date('2026-11-15T00:00:00Z')), '2026-11-15');
  assert.equal(gameDateKey(new Date('2026-11-14T10:59:59Z')), '2026-11-13');
  assert.equal(gameDateKey(new Date('2026-11-14T11:00:00Z')), '2026-11-14');
  assert.equal(gameDateKey(new Date('2026-11-14T10:29:59Z'), 10 * 60 + 30), '2026-11-13');
  assert.equal(gameDateKey(new Date('2026-11-14T10:30:00Z'), 10 * 60 + 30), '2026-11-14');
  assert.equal(gameDateKey(new Date('2026-11-14T00:14:59Z'), 15), '2026-11-13');
  assert.equal(gameDateKey(new Date('2026-11-14T00:15:00Z'), 15), '2026-11-14');
  assert.equal(msUntilNextDowntime(new Date('2026-11-14T00:00:00Z'), 15), 15 * 60 * 1000);
  assert.equal(msUntilNextDowntime(new Date('2026-11-14T00:15:00Z'), 15), 24 * 60 * 60 * 1000);
  assert.equal(msUntilNextUtcMidnight(new Date('2026-11-14T23:59:30Z')), 30000);
  assert.equal(msUntilNextDowntime(new Date('2026-11-14T10:30:00Z')), 30 * 60 * 1000);
  assert.equal(msUntilNextDowntime(new Date('2026-11-14T10:00:00Z'), 10 * 60 + 30), 30 * 60 * 1000);
  assert.equal(msUntilNextDowntime(new Date('2026-11-14T11:00:00Z')), 24 * 60 * 60 * 1000);
  assert.equal(modeFromLocation('?rule=abyss'), 'abyss');
  assert.equal(modeFromLocation('?rule=standard'), 'normal');
  assert.equal(modeFromLocation('?rule=timed'), 'normal');
  assert.equal(modeFromLocation('?mode=abyss'), 'abyss');
  assert.equal(modeFromLocation('?mode=normal'), 'normal');
  assert.equal(modeFromLocation('?mode=timed'), 'normal');
  assert.equal(shiftDateKey('2012-05-22', -1), '2012-05-21');
  assert.equal(shiftDateKey('2026-11-14', 1), '2026-11-15');
  assert.deepEqual(lastCompleteMonth('2026-11-14'), { year: 2026, month: 10 });
  assert.deepEqual(lastCompleteMonth('2026-01-01'), { year: 2025, month: 12 });
  assert.equal(lastCompleteMonthEnd('2026-11-14'), '2026-10-31');
  assert.equal(lastCompleteMonthEnd('2026-01-01'), '2025-12-31');
  assert.equal(lastCompleteMonthEnd('2026-03-01'), '2026-02-28');
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.equal(parseKillId('139037509'), 139037509);
  assert.equal(parseKillId('https://zkillboard.com/kill/139037509/'), 139037509);
  assert.equal(parseKillId('nope'), null);
  const freeToken = freeKillToken(139037509);
  assert.ok(!freeToken.includes('139037509'));
  assert.equal(freeKillIdFromToken(freeToken), 139037509);
  assert.equal(freeKillIdFromToken('kbad00'), null);
  assert.equal(killHasFittedModules({ victim: { items: [{ flag: 5, item_type_id: 1 }] } }), false);
  assert.equal(killHasFittedModules({ victim: { items: [{ flag: 19, item_type_id: 1 }] } }), true);
});

test('beacon rounds start after the configured boundary and grace', () => {
  const beacon = { genesisTime: 1692803367, period: 3, graceSeconds: 5 };
  const genesis = beacon.genesisTime;
  assert.equal(beaconRoundForStart(genesis, beacon), 3);
  assert.equal(beaconRoundForStart(genesis + 1, beacon), 3);
  assert.equal(beaconRoundForStart(genesis + 10, beacon), 6);
  assert.equal(beaconRoundForStart(genesis, { ...beacon, graceSeconds: 0 }), 1);
});

test('weighted rendezvous and kill selection are order independent', () => {
  const pool = [1, 1, 2, 3, 3, 3];
  const one = pickWeightedRendezvous(pool, 'seed', 7);
  assert.equal(one, pickWeightedRendezvous([...pool].reverse(), 'seed', 7));
  assert.ok([1, 2, 3].includes(one));
  assert.equal(pickWeightedRendezvous([], 'seed'), null);
  const queue = weightedRendezvousOrder(pool, 'seed', 7);
  assert.equal(queue[0], one);
  assert.deepEqual(queue, weightedRendezvousOrder([...pool].reverse(), 'seed', 7));
  assert.deepEqual([...queue].sort((a, b) => a - b), [1, 2, 3]);
  assert.deepEqual(weightedRendezvousOrder([], 'seed'), []);
  const candidates = makeLosses().concat([{
    ...makeLosses()[0],
    killmail_id: 424243,
    victim: { ship_type_id: 670, items: [] },
  }]);
  const chosen = pickKillBySeed(candidates, 'seed', 670, { allowEmpty: true, earliestDate: '2012-05-22' });
  assert.ok(chosen);
  assert.equal(chosen, pickKillBySeed([...candidates].reverse(), 'seed', 670, {
    allowEmpty: true,
    earliestDate: '2012-05-22',
  }));
  assert.equal(pickKillBySeed(candidates, 'seed', 670, {
    allowEmpty: true,
    earliestDate: '2012-05-22',
    latestDate: '2026-10-31',
  }), null);
  const fittedOnly = pickKillBySeed(candidates, 'seed', 670, {
    allowEmpty: false,
    earliestDate: '2012-05-22',
  });
  assert.ok(fittedOnly);
  assert.ok(fittedOnly.victim.items.length > 0);
  assert.equal(pickKillBySeed([{
    killmail_id: 424244,
    killmail_time: '2026-11-16T00:00:00Z',
    victim: { ship_type_id: 670, items: [] },
  }], 'seed', 670, {
    allowEmpty: false,
    earliestDate: '2012-05-22',
  }), null);
});

test('target time sampling is deterministic, bounded, and recency weighted', () => {
  const earliest = '2012-05-22';
  const latest = '2026-10-31';
  const lower = Date.parse(`${earliest}T00:00:00Z`);
  const upper = Date.parse(`${latest}T12:00:00Z`);
  const one = sampleTargetTime('seed', 670, earliest, latest, 365);
  assert.equal(one, sampleTargetTime('seed', 670, earliest, latest, 365));
  assert.ok(one >= lower && one <= upper);
  assert.notEqual(one, sampleTargetTime('other', 670, earliest, latest, 365));
  const recent = [];
  const old = [];
  for (let index = 0; index < 500; index++) {
    const time = sampleTargetTime(`seed-${index}`, 670, earliest, latest, 365);
    const age = upper - time;
    if (age <= 730 * 86400000) recent.push(time);
    else old.push(time);
  }
  assert.ok(recent.length > old.length);
  assert.ok(old.length > 0);
});

test('closest target and recency fallback pick valid kills deterministically', () => {
  const kills = [
    { killmail_id: 1, killmail_time: '2026-10-01T00:00:00Z', victim: { ship_type_id: 670, items: [] } },
    { killmail_id: 2, killmail_time: '2026-10-20T00:00:00Z', victim: { ship_type_id: 670, items: [] } },
    { killmail_id: 3, killmail_time: '2026-11-01T00:00:00Z', victim: { ship_type_id: 670, items: [] } },
  ];
  const target = Date.parse('2026-10-10T00:00:00Z');
  const closest = chooseClosestKill(kills, 670, target, '2012-05-22', '2026-10-31', { allowEmpty: true, seed: 's' });
  assert.equal(closest.killmail_id, 1);
  assert.equal(closest, chooseClosestKill([...kills].reverse(), 670, target, '2012-05-22', '2026-10-31', {
    allowEmpty: true,
    seed: 's',
  }));
  assert.equal(chooseClosestKill(kills, 670, target, '2026-10-05', '2026-10-31', { allowEmpty: true }), kills[1]);
  assert.equal(chooseClosestKill(kills, 670, target, '2012-05-22', '2026-10-31', { allowEmpty: false }), null);

  const weighted = pickWeightedKillByRecency(kills, 'seed', 670, '2026-10-31', 365, {
    allowEmpty: true,
    earliestDate: '2012-05-22',
  });
  assert.ok(weighted);
  assert.equal(weighted, pickWeightedKillByRecency([...kills].reverse(), 'seed', 670, '2026-10-31', 365, {
    allowEmpty: true,
    earliestDate: '2012-05-22',
  }));
});

test('daily selection uses time sampling and capped ship-page lookups', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /weightedRendezvousOrder/);
  assert.match(main, /lastCompleteMonthEnd/);
  assert.match(main, /sampleTargetTime/);
  assert.match(main, /pickWeightedKillByRecency/);
  assert.match(main, /fetchShipPage\(shipId, page\)/);
  assert.match(main, /page <= maxPages/);
  assert.match(main, /ship-page:\$\{shipId\}:\$\{page\}/);
  assert.doesNotMatch(main, /estimateMonthlyPageCount|probeMonthPageCount|monthPageTotal|monthRecordSlot/);
  assert.doesNotMatch(main, /year\/\$\{year\}\/month/);
  assert.equal(main.includes('step < 12'), false);
});

test('build configuration validates the game day and KB lower bound', () => {
  assert.deepEqual(parseGameDayStart('10:30'), { text: '10:30', minutes: 630 });
  assert.throws(() => parseGameDayStart('24:00'), /HH:MM/);
  assert.equal(parseDateOnly('2012-05-22'), '2012-05-22');
  assert.throws(() => parseDateOnly('2026-02-29'), /valid date/);
  assert.equal(manifest.gameDayStartUtc, '11:00');
  assert.equal(manifest.gameDayStartMinutes, 660);
  assert.equal(manifest.kbSelectionStartDate, '2012-05-22');
  assert.equal(manifest.kbRecencyHalfLifeDays, DEFAULT_KB_RECENCY_HALF_LIFE_DAYS);
  assert.equal(manifest.kbMaxScanPages, DEFAULT_KB_MAX_SCAN_PAGES);
  assert.equal(manifest.kbMaxScanPages, 20);
  assert.equal(manifest.beacon.baseUrls.length, 4);
  assert.match(manifest.beacon.chain, /^[0-9a-f]{64}$/);
  assert.deepEqual(manifest.reveal, { ...DEFAULT_REVEAL });
  assert.equal(manifest.reveal.standardCargoBudget, 6);
});

test('build-time reveal overrides are validated and exposed in the manifest shape', () => {
  const previous = process.env.FITDLE_REVEAL_STANDARD_CARGO_BUDGET;
  process.env.FITDLE_REVEAL_STANDARD_CARGO_BUDGET = '11';
  try {
    const config = loadBuildConfig(ROOT);
    assert.equal(config.reveal.standardCargoBudget, 11);
    assert.equal(config.reveal.openingBudget, DEFAULT_REVEAL.openingBudget);
  } finally {
    if (previous === undefined) delete process.env.FITDLE_REVEAL_STANDARD_CARGO_BUDGET;
    else process.env.FITDLE_REVEAL_STANDARD_CARGO_BUDGET = previous;
  }
  process.env.FITDLE_REVEAL_STANDARD_CARGO_BUDGET = '0';
  try {
    assert.throws(() => loadBuildConfig(ROOT), /FITDLE_REVEAL_STANDARD_CARGO_BUDGET/);
  } finally {
    delete process.env.FITDLE_REVEAL_STANDARD_CARGO_BUDGET;
  }
});

test('build-time KB weight and scan overrides are validated', () => {
  const half = process.env.FITDLE_KB_RECENCY_HALF_LIFE_DAYS;
  const pages = process.env.FITDLE_KB_MAX_SCAN_PAGES;
  process.env.FITDLE_KB_RECENCY_HALF_LIFE_DAYS = '180';
  process.env.FITDLE_KB_MAX_SCAN_PAGES = '32';
  try {
    const config = loadBuildConfig(ROOT);
    assert.equal(config.kbRecencyHalfLifeDays, 180);
    assert.equal(config.kbMaxScanPages, 32);
  } finally {
    if (half === undefined) delete process.env.FITDLE_KB_RECENCY_HALF_LIFE_DAYS;
    else process.env.FITDLE_KB_RECENCY_HALF_LIFE_DAYS = half;
    if (pages === undefined) delete process.env.FITDLE_KB_MAX_SCAN_PAGES;
    else process.env.FITDLE_KB_MAX_SCAN_PAGES = pages;
  }
  process.env.FITDLE_KB_MAX_SCAN_PAGES = '101';
  try {
    assert.throws(() => loadBuildConfig(ROOT), /FITDLE_KB_MAX_SCAN_PAGES/);
  } finally {
    delete process.env.FITDLE_KB_MAX_SCAN_PAGES;
  }
});

test('abyssal reveal cadence matches the six-attempt design', () => {
  assert.equal(revealCountFor(0, 40, 'abyss'), INITIAL_REVEAL);
  assert.equal(revealCountFor(1, 40, 'abyss'), 5);
  assert.equal(revealCountFor(2, 40, 'abyss'), 8);
  assert.equal(revealCountFor(3, 40, 'abyss'), 12);
  assert.equal(revealCountFor(5, 40, 'abyss'), 23);
  assert.equal(newlyRevealedFor(1, 40, 'abyss'), 2);
  assert.equal(newlyRevealedFor(2, 40, 'abyss'), 3);
  assert.equal(newlyRevealedFor(3, 40, 'abyss'), 4);
  assert.equal(INITIAL_REVEAL, 3);
});

test('timed reveal grows by release quota from a fixed queue', () => {
  const clues = Array.from({ length: 10 }, (_, index) => ({
    k: `timed${index}`, c: 'nav', v: index, w: 1 + (index % 5),
  }));
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7].map((n) => timedRevealTotal(n)),
    [0, 1, 2, 4, 6, 9, 12, 16],
  );
  const plan = buildRevealPlan({ clues, seed: 'test', mode: 'normal', timed: true });
  assert.equal(computeTimedRevealed({ clues, plan, releases: 0 }).size, 0);
  const one = computeTimedRevealed({ clues, plan, releases: 1 });
  assert.equal(one.size, 1);
  const two = computeTimedRevealed({ clues, plan, releases: 2 });
  assert.equal(two.size, 2);
  assert.deepEqual([...two].sort(), [...computeTimedRevealed({ clues, plan, releases: 2 })].sort());
  const four = computeTimedRevealed({ clues, plan, releases: 3 });
  assert.equal(four.size, 4);
  const six = computeTimedRevealed({ clues, plan, releases: 4 });
  assert.equal(six.size, 6);
  for (const index of four) assert.ok(six.has(index));
});

test('queue plans are deterministic per seed and mode', () => {
  const clues = [
    { k: 'speed', c: 'nav', v: 100, w: 8 },
    { k: 'sig', c: 'targeting', v: 50, w: 2 },
    { k: 'mass', c: 'nav', v: 1000, w: 5 },
    { k: 'equipment', c: 'equipment', v: { module: 1, slot: 'high' }, w: 3 },
    { k: 'cargo', c: 'cargo', v: { module: 2, slot: 'cargo' }, w: 4 },
    { k: 'bonus', c: 'traits', v: 0, bonusKey: 'term|5', bonusTermKey: 'term', w: 6 },
  ];
  const a = buildRevealPlan({ clues, seed: 'same-seed', mode: 'normal' });
  const b = buildRevealPlan({ clues, seed: 'same-seed', mode: 'normal' });
  assert.deepEqual(a.opening, b.opening);
  assert.deepEqual(a.queues, b.queues);
  assert.deepEqual(a.queueSeeds, b.queueSeeds);
  assert.equal(a.opening.includes(4), false, 'cargo is not in the Standard opening queue');
  assert.equal(a.opening.includes(5), false, 'bonus is not in the Standard opening queue');
  assert.equal(a.queues.equipment.length, 1);
  assert.equal(a.queues.cargo.length, 1);
  const abyss = buildRevealPlan({ clues, seed: 'same-seed', mode: 'abyss' });
  assert.ok(abyss.queues.other.length >= 1);
  const timed = buildRevealPlan({ clues, seed: 'same-seed', mode: 'normal', timed: true });
  assert.ok(timed.queues.timed.length >= 1);
  assert.notDeepEqual(timed.queueSeeds.timed, a.queueSeeds.timed);

  const weightedClues = Array.from({ length: 10 }, (_, index) => ({
    k: `weight${index}`, c: 'nav', v: index, w: index + 1,
  }));
  const weightedPlan = buildRevealPlan({ clues: weightedClues, seed: 'weighted-order', mode: 'normal' });
  const orderedWeights = weightedPlan.opening.map((index) => weightedClues[index].w);
  assert.notDeepEqual(orderedWeights, [...orderedWeights].sort((left, right) => left - right));
});

test('bonus reveals stay monotonic when a later guess matches another bonus', () => {
  const keys = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'];
  const clues = keys.map((key, index) => ({
    k: 'bonus', c: 'traits', v: index, bonusKey: `${key}|5`, bonusTermKey: key, w: 4 + (index % 3),
  }));
  const answer = {
    bonusEntries: keys.map((key) => ({ bonusKey: `${key}|5`, termKey: key, bonus: 5 })),
    bonuses: keys.map((key) => `bonus ${key}`),
  };
  const guess = (key, value = 10) => ({
    bonusEntries: [{ bonusKey: `${key}|${value}`, termKey: key, bonus: value }],
  });
  const guessShips = {
    1: guess('alpha'),
    2: guess('beta'),
  };
  const base = {
    clues,
    catalog: [],
    answerId: 999,
    mode: 'normal',
    locale: 'en',
    status: 'playing',
    answer,
    getShip: (id) => guessShips[id] || null,
  };
  for (let i = 0; i < 120; i++) {
    const seed = `bonus-monotonic-${i}`;
    const first = computeRevealed({ ...base, guesses: [1], seed });
    const second = computeRevealed({ ...base, guesses: [1, 2], seed });
    for (const index of first) {
      assert.equal(second.has(index), true, `${seed} lost clue ${index}`);
    }
    assert.ok(second.has(0) && second.has(1));
  }
});

test('Standard bonus matching uses the term, not the numeric value', () => {
  const clues = [
    { k: 'bonus', c: 'traits', v: 0, bonusKey: 'shield|5', bonusTermKey: 'roles|shield', w: 6 },
    { k: 'bonus', c: 'traits', v: 1, bonusKey: 'shield|10', bonusTermKey: 'roles|shield', w: 6 },
    { k: 'bonus', c: 'traits', v: 2, bonusKey: 'armor|5', bonusTermKey: 'roles|armor', w: 6 },
  ];
  const answer = {
    bonusEntries: [
      { bonusKey: 'shield|5', termKey: 'roles|shield', bonus: 5 },
      { bonusKey: 'shield|10', termKey: 'roles|shield', bonus: 10 },
      { bonusKey: 'armor|5', termKey: 'roles|armor', bonus: 5 },
    ],
  };
  const guess = {
    bonusEntries: [{ bonusKey: 'shield|7', termKey: 'roles|shield', bonus: 7 }],
  };
  const revealed = computeRevealed({
    clues,
    catalog: [],
    guesses: [42],
    status: 'playing',
    answerId: 1,
    mode: 'normal',
    locale: 'en',
    getShip: () => guess,
    answer,
    seed: 'bonus-term',
  });
  assert.equal(revealed.has(0), true);
  assert.equal(revealed.has(1), true);
  assert.equal(revealed.has(2), false);
});

test('only Standard applies shared-clue matching from guesses', () => {
  const clues = [{ k: 'speed', c: 'nav', v: 100, w: 5 }];
  const plan = {
    opening: [],
    queues: { equipment: [], cargo: [], other: [], timed: [] },
    clueCount: 1,
    config: DEFAULT_REVEAL_CONFIG,
    mode: 'normal',
    timed: false,
  };
  const guess = { attrs: { speed: 100 } };
  const base = {
    clues,
    catalog: [],
    guesses: [42],
    status: 'playing',
    answerId: 1,
    locale: 'en',
    getShip: () => guess,
    seed: 'matching-mode',
  };
  const standard = computeRevealed({ ...base, mode: 'normal', plan });
  assert.equal(standard.has(0), true);
  const abyss = computeRevealed({ ...base, mode: 'abyss', plan: { ...plan, mode: 'abyss' } });
  assert.equal(abyss.has(0), false);
  const timed = computeRevealed({
    ...base,
    mode: 'normal',
    timed: true,
    plan: { ...plan, mode: 'normal', timed: true },
  });
  assert.equal(timed.has(0), false);
});

test('abyss misses reveal nested equipment plus one other clue', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: makeLosses(),
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'abyss',
  });
  const wrong = catalog.find((entry) => entry.id !== 587).id;
  const run = (guesses) => computeRevealed({
    clues: built.clues, catalog, guesses, status: 'playing', answerId: 587,
    mode: 'abyss', locale: 'en', getShip: (id) => catalog.find((entry) => entry.id === id),
    seed: 'abyss-cadence',
  });
  const count = (set, equipment) => [...set]
    .filter((index) => (equipment
      ? built.clues[index].k === 'equipment'
      : built.clues[index].k !== 'equipment' && built.clues[index].k !== 'cargo')).length;
  const zero = run([]);
  const one = run([wrong]);
  const two = run([wrong, wrong]);
  assert.equal(count(one, true) - count(zero, true), 1);
  assert.ok(count(one, false) - count(zero, false) >= 1);
  assert.equal(count(two, true) - count(one, true), 2);
  assert.ok(count(two, false) - count(one, false) >= 1);

  const empty = buildClues({
    ship, catalog, refs, stats: null,
    losses: [{ killmail_id: 1, zkb: { totalValue: 0 }, victim: { items: [] } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'abyss',
  });
  const emptyRun = (guesses) => computeRevealed({
    clues: empty.clues, catalog, guesses, status: 'playing', answerId: 587,
    mode: 'abyss', locale: 'en', getShip: (id) => catalog.find((entry) => entry.id === id),
    seed: 'abyss-cadence',
  });
  const emptyZero = emptyRun([]);
  const emptyOne = emptyRun([wrong]);
  const otherDelta = [...emptyOne].filter((index) => !emptyZero.has(index)).length;
  assert.ok(otherDelta >= 2);
});

test('profile similarity is aggregate-only and exact on the answer', () => {
  const a = catalog[0];
  const b = catalog[1];
  assert.equal(profileSimilarity(a, a), 100);
  assert.ok(profileSimilarity(a, b) < 100);
  const wrong = buildGuessResult(a, b, 1);
  assert.equal(wrong.kind, 'wrong');
  assert.ok(wrong.similarity >= 0 && wrong.similarity <= 99);
});

test('search works across official language names', () => {
  const index = buildSearchIndex(catalog, refs.groups);
  for (const query of ['Rifter', '裂谷级', 'リフター', '리프터']) {
    const hits = searchShips(index, query, {});
    assert.ok(hits.some((ship) => ship.id === 587), `search missed ${query}`);
  }
});

test('ship search accepts race and hull class names', () => {
  const index = buildSearchIndex(catalog, refs.groups, {
    races: refs.races, factions: refs.factions,
  });
  const raceId = Object.entries(refs.races).find(([, name]) => /caldari/i.test(name))?.[0];
  const raceHits = searchShips(index, refs.races[raceId], { limit: 20 });
  assert.ok(raceHits.length > 0);
  assert.ok(raceHits.every((ship) => Number(ship.raceID) === Number(raceId)));
  const groupName = Object.values(refs.groups).find((name) => /frigate/i.test(name));
  assert.ok(groupName);
  const classHits = searchShips(index, groupName, { limit: 20 });
  assert.ok(classHits.length > 0);
  assert.ok(classHits.every((ship) => refs.groups[ship.groupID] === groupName));
});

test('race and class search accepts aliases from other languages', () => {
  const ships = [{ id: 99, names: { en: 'Alias Test' }, techLevel: 1, groupID: 1, raceID: 1 }];
  const index = buildSearchIndex(ships, { 1: 'Frigate' }, {
    races: { 1: 'Caldari' },
    aliases: { groups: { 1: ['フリゲート'] }, races: { 1: ['加达里'] } },
  });
  assert.deepEqual(searchShips(index, 'フリゲート', {}).map((ship) => ship.id), [99]);
  assert.deepEqual(searchShips(index, '加达里', {}).map((ship) => ship.id), [99]);
});

test('ship search supports initials, class abbreviations and race+class', () => {
  const index = buildSearchIndex(catalog, refs.groups, { races: refs.races, factions: refs.factions });
  const drake = catalog.find((ship) => ship.names?.en === 'Drake Navy Issue');
  assert.ok(drake);
  assert.ok(searchShips(index, 'dNi', { limit: 50 }).some((ship) => ship.id === drake.id));
  const firetail = catalog.find((ship) => ship.names?.en === 'Republic Fleet Firetail');
  assert.ok(firetail);
  for (const query of ['rff', 'rf']) {
    assert.ok(searchShips(index, query, { limit: 50 }).some((ship) => ship.id === firetail.id), query);
  }
  const dst = Object.entries(refs.groups).find(([, name]) => name === 'Deep Space Transport');
  assert.ok(dst);
  assert.ok(searchShips(index, 'dst', { limit: 50 }).some((ship) => ship.groupID === Number(dst[0])));

  const ships = [{ id: 42, names: { en: 'Amarr Battleship' }, raceID: 1, groupID: 1 }];
  const combo = buildSearchIndex(ships, { 1: 'Battleship' }, {
    races: { 1: 'Amarr' },
    aliases: { groups: { 1: ['战列舰'] }, races: { 1: ['艾玛'] } },
  });
  assert.deepEqual(searchShips(combo, '艾玛战列', {}).map((ship) => ship.id), [42]);
});

test('catalog preserves every ship bonus line, including ships with more than four', () => {
  const naga = catalog.find((ship) => ship.names?.en === 'Naga Navy Issue');
  assert.ok(naga);
  assert.ok(naga.bonuses.en.some((line) => /max velocity/i.test(line)));
  const python = catalog.find((ship) => ship.names?.en === 'Python');
  assert.ok(python);
  assert.ok(python.bonuses.en.length > 4);
});

test('bonus clues distinguish shared terms and value differences from SDE entries', () => {
  const build = (name) => {
    const ship = catalog.find((entry) => entry.names?.en === name);
    return {
      ship,
      clues: buildClues({
        ship,
        catalog,
        refs,
        stats: null,
        losses: null,
        dateKey: '2026-11-14',
        dataVersion: manifest.dataVersion,
      }).clues,
    };
  };
  const caracal = build('Caracal');
  const navy = build('Caracal Navy Issue');
  const caracalRate = caracal.clues.find((clue) => (
    clue.k === 'bonus'
    && caracal.ship.bonusEntries[clue.v].textKey.includes('rate of fire')
  ));
  const navyRate = navy.clues.find((clue) => (
    clue.k === 'bonus'
    && navy.ship.bonusEntries[clue.v].textKey.includes('rate of fire')
  ));
  assert.ok(caracalRate && navyRate);
  assert.ok(caracalRate.bonusTermKey);
  assert.ok(navyRate.bonusTermKey);
  assert.equal(caracalRate.bonusTermKey, navyRate.bonusTermKey);
  assert.ok(caracalRate.tags.includes('limited'));
  assert.ok(navyRate.w > caracalRate.w, 'different values should raise the clue weight');
  const naga = build('Naga Navy Issue');
  const role = naga.clues.find((clue) => (
    clue.k === 'bonus'
    && clue.tags.includes('unique')
    && naga.ship.bonusEntries[clue.v].section === 'role'
  ));
  assert.ok(role);
  assert.ok(role.tags.includes('limited'));
  const wolf = build('Wolf');
  const adc = wolf.clues.find((clue) => (
    clue.k === 'bonus'
    && wolf.ship.bonusEntries[clue.v].textKey.includes('assault damage control')
  ));
  assert.ok(adc);
  assert.ok(adc.tags.includes('limited'));
  assert.ok(adc.w >= 8.5, 'module-restricted bonus should carry a class-revealing weight');
  const perseverance = build('Perseverance');
  const mining = perseverance.clues.find((clue) => {
    if (clue.k !== 'bonus') return false;
    const entry = perseverance.ship.bonusEntries[clue.v];
    return entry.section === 'role'
      && /mining laser/i.test(entry.text.en);
  });
  assert.ok(mining);
  assert.ok(mining.tags.includes('unique'));
  assert.ok(mining.tags.includes('limited'));
  assert.equal(mining.w, 10);
  const fitted = buildClues({
    ship: wolf.ship,
    catalog,
    refs,
    stats: null,
    losses: [{
      killmail_id: 424245,
      victim: {
        items: [
          { flag: 27, item_type_id: 486, quantity_destroyed: 1 },
          { flag: 5, item_type_id: 486, quantity_destroyed: 1 },
        ],
      },
    }],
    dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const turretBonus = fitted.clues.find((clue) => (
    clue.k === 'bonus'
    && wolf.ship.bonusEntries[clue.v].textKey.includes('small projectile turret')
  ));
  assert.ok(turretBonus);
  const affected = fitted.clues.filter((clue) => (
    (clue.k === 'equipment' || clue.k === 'cargo') && clue.v.module === 486
  ));
  assert.ok(affected.length >= 2);
  assert.ok(affected.every((clue) => clue.w >= turretBonus.w));
});

test('ship search results follow tech, class, race and faction order', () => {
  const ships = [
    { id: 1, names: { en: 'Aardvark' }, techLevel: 2, groupID: 1, raceID: 1, factionID: 1 },
    { id: 2, names: { en: 'Badger' }, techLevel: 1, groupID: 2, raceID: 1, factionID: 2 },
    { id: 3, names: { en: 'Cormorant' }, techLevel: 1, groupID: 1, raceID: 2, factionID: 1 },
  ];
  const index = buildSearchIndex(ships, {});
  assert.deepEqual(
    searchShips(index, 'a', { limit: 10 }).map((ship) => ship.id),
    [1, 2, 3],
  );
  const localized = buildSearchIndex(ships, { 1: 'Zeta', 2: 'Alpha' }, { locale: 'de' });
  assert.deepEqual(
    searchShips(localized, 'a', { limit: 10 }).map((ship) => ship.id),
    [1, 2, 3],
  );

  const aliases = buildSearchIndex(catalog, refs.groups);
  const raven = catalog.find((ship) => ship.names?.zh === '乌鸦级海军型');
  const stabber = catalog.find((ship) => ship.names?.zh === '刺客级舰队型');
  assert.ok(raven && stabber);
  assert.equal(searchShips(aliases, '海乌鸦', { limit: 5 })[0]?.id, raven.id);
  assert.equal(searchShips(aliases, '舰队刺客', { limit: 5 })[0]?.id, stabber.id);
  assert.equal(searchShips(aliases, '舰刺', { limit: 5 })[0]?.id, stabber.id);
});

test('hidden authored JSON files are shipped to dist', () => {
  for (const file of ['boot-flavor.json', 'watchlist.json']) {
    assert.equal(fs.existsSync(path.join(ROOT, 'dist', 'assets', file)), true, file);
  }
});

test('watchlist matches victim character, corporation, or alliance IDs', () => {
  const victim = { character_id: 101, corporation_id: 202, alliance_id: 303 };
  const watchlist = {
    characters: ['101'],
    corporations: [202],
    alliances: [303],
  };
  assert.equal(victimIsWatched(victim, watchlist), true);
  assert.equal(victimIsWatched({ character_id: 999, corporation_id: 202, alliance_id: 999 }, watchlist), true);
  assert.equal(victimIsWatched({ character_id: 999, corporation_id: 999, alliance_id: 999 }, watchlist), false);
  assert.equal(victimIsWatched(victim, null), false);
});

test('kill selection respects ship, date lower bound, and empty setting', () => {
  const make = (id, ship, time, fitted = true) => ({
    killmail_id: id,
    killmail_time: time,
    victim: { ship_type_id: ship, items: [{ flag: fitted ? 19 : 5, item_type_id: 1, quantity_destroyed: 1 }] },
  });
  const data = [
    make(1, 670, '2026-11-17T00:30:00Z'),
    make(2, 670, '2026-11-16T23:59:59Z'),
    make(3, 670, '2012-05-21T23:59:59Z'),
    make(4, 671, '2026-11-16T22:00:00Z'),
    make(5, 670, '2026-11-15T22:00:00Z', false),
  ];
  assert.equal(pickKillBySeed(data, 'kill-seed', 670, {
    allowEmpty: true,
    earliestDate: '2012-05-22',
  }).killmail_id !== 3, true);
  assert.equal(pickKillBySeed(data, 'kill-seed', 670, {
    allowEmpty: false,
    earliestDate: '2012-05-22',
  })?.killmail_id === 5, false);
  assert.equal(pickKillBySeed(data, 'kill-seed', 670, {
    allowEmpty: true,
    earliestDate: '2026-11-17',
  })?.killmail_id, 1);
  assert.equal(pickKillBySeed([make(5, 670, '2026-11-15T22:00:00Z', false)], 'kill-seed', 670, {
    allowEmpty: false,
    earliestDate: '2012-05-22',
  }), null);
  assert.equal(pickKillBySeed(data, 'kill-seed', 670, {
    allowEmpty: true,
    earliestDate: '2012-05-22',
  }), pickKillBySeed([...data].reverse(), 'kill-seed', 670, {
    allowEmpty: true,
    earliestDate: '2012-05-22',
  }));
});

test('empty hulls ignore cargo, spare fighter bays, and zero quantities', () => {
  const kill = (items) => ({ victim: { items } });
  assert.equal(killHasFittedModules(kill([{ flag: 5, item_type_id: 1, quantity_destroyed: 10 }])), false);
  assert.equal(killHasFittedModules(kill([{ flag: 155, item_type_id: 2, quantity_destroyed: 1 }])), false);
  assert.equal(killHasFittedModules(kill([{ flag: 19, item_type_id: 3, quantity_destroyed: 0, quantity_dropped: 0 }])), false);
  assert.equal(killHasFittedModules(kill([{ flag: 19, item_type_id: 3, quantity_destroyed: 1 }])), true);
  assert.equal(killHasFittedModules(kill([{ flag: 92, item_type_id: 4, quantity_destroyed: 1 }])), true);
  assert.equal(killHasFittedModules(kill([{ flag: 87, item_type_id: 5, quantity_dropped: 1 }])), true);
  assert.equal(killHasFittedModules(kill([{ flag: 125, item_type_id: 6, quantity_destroyed: 1 }])), true);
  assert.equal(killHasFittedModules(kill([{ flag: 158, item_type_id: 7, quantity_destroyed: 1 }])), true);
});

test('service record streaks survive consecutive days only', () => {
  const storage = {
    value: null,
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
  };
  let stats = recordResult(storage, loadStats(storage), { date: '2026-11-14', status: 'won', attempts: 3, isToday: true });
  assert.equal(stats.streak, 1);
  stats = recordResult(storage, stats, { date: '2026-11-15', status: 'won', attempts: 4, isToday: true });
  assert.equal(stats.streak, 2);
  stats = recordResult(storage, stats, { date: '2026-11-17', status: 'won', attempts: 2, isToday: true });
  assert.equal(stats.streak, 1);
});

test('daily stats count plays and wins per gameplay and streak by day', () => {
  const storage = { value: null, getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
  let stats = emptyStats();
  stats = recordPlay(storage, stats, { date: '2026-11-17', mode: 'standard', isToday: true });
  stats = recordPlay(storage, stats, { date: '2026-11-17', mode: 'standard', isToday: true });
  assert.equal(stats.played.standard, 1);
  stats = recordResult(storage, stats, {
    date: '2026-11-17', mode: 'standard', status: 'won', attempts: 3, isToday: true,
  });
  assert.equal(stats.wins.standard, 1);
  assert.equal(stats.streak, 1);
  stats = recordPlay(storage, stats, { date: '2026-11-17', mode: 'abyss', isToday: true });
  stats = recordResult(storage, stats, {
    date: '2026-11-17', mode: 'abyss', status: 'won', attempts: 2, isToday: true,
  });
  assert.equal(stats.wins.abyss, 1);
  assert.equal(stats.streak, 1, 'multiple wins on one day count once');
  stats = recordResult(storage, stats, {
    date: '2026-11-18', mode: 'timed', status: 'won', attempts: 1, isToday: true,
  });
  assert.equal(stats.streak, 2);
  assert.equal(stats.played.timed, 1);
  stats = settleStats(stats, '2026-11-20');
  assert.equal(stats.streak, 0);
  let losing = recordResult(storage, emptyStats(), {
    date: '2026-11-21', mode: 'standard', status: 'won', attempts: 1, isToday: true,
  });
  for (const mode of ['standard', 'abyss', 'timed']) {
    losing = recordResult(storage, losing, {
      date: '2026-11-22', mode, status: 'lost', attempts: 6, isToday: true,
    });
  }
  assert.equal(losing.streak, 0, 'all three modes losing clears the day streak');
});

test('legacy aggregate stats are ignored', () => {
  const storage = {
    value: JSON.stringify({ played: 12, wins: 4, streak: 2, maxStreak: 3, distribution: [0, 1, 0, 0, 0, 0], lastDate: '2026-11-16' }),
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
  };
  const stats = loadStats(storage);
  assert.equal(stats.played.standard, 0);
  assert.equal(stats.wins.standard, 0);
  assert.equal(stats.streak, 0);
  assert.equal('legacyPlayed' in stats, false);
  saveStats(storage, stats);
  assert.equal('legacyPlayed' in JSON.parse(storage.value), false);
});

test('share URLs and result grids are spoiler-safe', () => {
  const killId = 424242;
  const token = freeKillToken(killId);
  const url = shareUrl({ href: 'https://example.test/fitdle/index.html?d=2026-11-01&lang=de#x' }, killId, 'normal', 'won', 3);
  assert.equal(url, 'https://example.test/fitdle/share/3/en.html');
  assert.equal(new URL(url).origin, 'https://example.test');
  const abyssUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'abyss', 'won', 4, 'zh-Hant');
  assert.equal(abyssUrl, 'https://example.test/fitdle/share/4/zh.html?rule=abyss');
  const lostUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'abyss', 'lost', 6, 'de');
  assert.equal(lostUrl, 'https://example.test/fitdle/share/lost/de.html?rule=abyss');
  const freeUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'abyss', 'playing', 0, 'zh-Hant', false, true);
  assert.equal(freeUrl, `https://example.test/fitdle/share/free/zh.html?kb=${token}&rule=abyss`);
  const timedUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'abyss', 'won', 4, 'de', true, true, 125);
  assert.equal(timedUrl, `https://example.test/fitdle/share/timed/de.html?t=125&kb=${token}&rule=timed`);
  const timedDaily = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'abyss', 'won', 4, 'de', true, false, 125);
  assert.equal(timedDaily, 'https://example.test/fitdle/share/timed/de.html?t=125&rule=timed');
  assert.equal(url.includes('lang='), false);
  assert.equal(url.includes('d='), false);
  assert.equal(timedUrl.includes('timer='), false);
  assert.equal(freeUrl.includes('mode='), false);
  const storage = { data: new Map(), getItem(k) { return this.data.get(k) ?? null; }, setItem(k, v) { this.data.set(k, v); } };
  saveState(storage, '2026-11-14', { dataVersion: 'v', guesses: [1], status: 'playing' }, 'normal');
  saveState(storage, '2026-11-14', { dataVersion: 'v', guesses: [2], status: 'playing' }, 'abyss');
  assert.deepEqual(loadState(storage, '2026-11-14', 'v', 'normal').guesses, [1]);
  assert.deepEqual(loadState(storage, '2026-11-14', 'v', 'abyss').guesses, [2]);
  const grid = resultGrid('won', 3);
  assert.equal([...grid].length, ATTEMPT_LIMIT);
  assert.ok(grid.includes('🟩'));
  const loss = resultGrid('lost', 6);
  assert.equal([...loss].length, ATTEMPT_LIMIT);
});

test('localized static share pages carry the score for link previews', () => {
  const sharePage = path.join(ROOT, 'dist', 'share', '3', 'en.html');
  const zhPage = path.join(ROOT, 'dist', 'share', '3', 'zh.html');
  if (fs.existsSync(sharePage)) {
    const html = fs.readFileSync(sharePage, 'utf8');
    assert.match(html, /FITDLE — 3\/6 — Target destroyed 🎯/);
    assert.match(html, /I cracked the hull in 3 attempts/);
    assert.match(html, /og:image" content="[^"]+\/assets\/share\/og-3-en\.png\?v=2"/);
    assert.match(html, /twitter:card" content="summary_large_image"/);
    assert.match(html, /location\.replace/);
    assert.ok(fs.existsSync(zhPage));
    const zh = fs.readFileSync(zhPage, 'utf8');
    assert.match(zh, /3\/6 — 目标已击毁 🎯/);
    assert.match(zh, /og:image" content="[^"]+\/assets\/share\/og-3-zh\.png\?v=2"/);
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'share', 'og-3-zh.png')));
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'share', 'og-lost-de.png')));
    const timed = fs.readFileSync(path.join(ROOT, 'dist', 'share', 'timed', 'en.html'), 'utf8');
    assert.match(timed, /'rule', 't'/);
    assert.match(timed, /location\.replace/);
    assert.equal(timed.includes("searchParams.set('lang'"), false);
    const freeShare = fs.readFileSync(path.join(ROOT, 'dist', 'share', 'free', 'en.html'), 'utf8');
    assert.match(freeShare, /'kb'/);
    assert.equal(freeShare.includes("searchParams.set('lang'"), false);
    assert.match(timed, /share\.timedTitle|Timed signal run/);
  }
});

test('container build scripts create the catalog before the kill pool', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const oneshot = fs.readFileSync(path.join(ROOT, 'docker', 'oneshot-entrypoint.sh'), 'utf8');
  for (const script of [dockerfile, oneshot]) {
    const catalogBuild = script.indexOf('npm run build:catalog');
    const killPool = script.indexOf('npm run build:killpool');
    assert.ok(catalogBuild >= 0, 'missing catalog build');
    assert.ok(killPool > catalogBuild, 'kill pool must run after catalog build');
  }
});

test('one-shot builder detects SDE updates and supports forced refresh', () => {
  const entrypoint = fs.readFileSync(path.join(ROOT, 'docker', 'oneshot-entrypoint.sh'), 'utf8');
  const checker = fs.readFileSync(path.join(ROOT, 'scripts', 'check-sde-cache.mjs'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(entrypoint, /FORCE_SDE/);
  assert.match(entrypoint, /check-sde-cache\.mjs/);
  assert.match(entrypoint, /prepare:sde -- --refresh/);
  assert.match(checker, /latest\.jsonl/);
  assert.match(checker, /buildNumber/);
  assert.equal(pkg.scripts['check:sde-cache'], 'node scripts/check-sde-cache.mjs');
});

test('daily target uses the beacon path and does not fall back to static data', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.match(main, /fetchDayBeacon/);
  assert.match(main, /DailyUnavailableError/);
  assert.match(main, /page\/\$\{page\}\//);
  assert.match(main, /kbSelectionStartDate/);
  assert.match(main, /data-action="free-mode"/);
  assert.equal(main.includes('filterDailyKillPool'), false);
  assert.equal(main.includes('selectDailyKillPair'), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'vendor', 'drand-client', 'index.js')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'dist', 'vendor', 'drand-client', 'index.js')), true);
  assert.match(MESSAGES.en['error.dailyUnavailableBody'], /authoritative time/);
  assert.match(MESSAGES.zh['error.dailyUnavailableBody'], /权威时间/);
  assert.match(css, /fatal-screen/);
});

test('reset countdown copy and source-specific error screens are localized', () => {
  assert.equal(MESSAGES.en['header.reset'], 'NEXT RESET IN');
  assert.equal(MESSAGES.zh['header.reset'], '距离下次重置');
  assert.equal(MESSAGES.en['end.next'], 'NEXT RESET');
  assert.equal(MESSAGES.zh['end.next'], '下次重置');
  for (const lang of Object.keys(MESSAGES)) {
    for (const key of [
      'error.timeCode', 'error.timeTitle', 'error.timeBody',
      'error.drandCode', 'error.drandTitle', 'error.drandBody',
      'error.zkillCode', 'error.zkillTitle', 'error.zkillBody',
      'error.esiCode', 'error.esiTitle', 'error.esiBody',
      'error.noTargetCode', 'error.noTargetTitle', 'error.noTargetBody',
      'error.dailyLore', 'error.timeLore', 'error.drandLore', 'error.zkillLore',
      'error.esiLore', 'error.noTargetLore', 'error.unknownHullLore',
      'error.genericLore', 'error.genericCode',
    ]) {
      assert.ok(MESSAGES[lang][key], `${lang} missing ${key}`);
    }
  }
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /dailyErrorCopy/);
  assert.match(main, /error\.drandLore/);
  assert.match(main, /error\.zkillLore/);
  assert.match(main, /error\.esiTitle/);
  assert.match(main, /<h1>\$\{esc\(t\(copy\.lore\)\)\}<\/h1>/);
  assert.match(main, /fatal-code">\$\{esc\(t\(copy\.code\)\)\}/);
  assert.match(main, /function debugLog/);
  assert.match(main, /DEBUG_DETAIL_KEYS/);
  assert.match(main, /safeDebugText/);
  assert.match(main, /request: safeRequest/);
  assert.match(main, /lastError\.request = path/);
  assert.match(main, /debugLog\('fatal'/);
  assert.match(main, /isZkillUnavailable/);
  assert.match(main, /zKillboard request failed \(\$\{response\.status\}\)/);
  assert.equal(main.includes('zKillboard request failed (${path})'), false);
});

test('boot flavor file covers all locales and tags every egg', () => {
  const boot = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'boot-flavor.json'), 'utf8'));
  assert.deepEqual(Object.keys(boot.flavor).sort(), ['de', 'en', 'es', 'fr', 'ja', 'ko', 'ru', 'zh']);
  for (const lines of Object.values(boot.flavor)) {
    assert.ok(Array.isArray(lines) && lines.length >= 2);
    assert.ok(lines.every((line) => typeof line === 'string' && line.trim()));
  }
  assert.ok(Array.isArray(boot.eggs) && boot.eggs.length >= 18);
  assert.ok(boot.eggs.every((egg) => ['en', 'ja', 'zh'].includes(egg.lang) && egg.text?.trim()));
});

test('every locale provides the same message keys', () => {
  const keys = Object.keys(MESSAGES.en).sort();
  for (const locale of manifest.locales) {
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), keys, `${locale} key set differs`);
    assert.ok(MESSAGES[locale]['footer.copyright'].includes('{site}'));
    assert.equal(MESSAGES[locale]['footer.copyright'].includes('gitlab.com/cmy/fitdle'), false);
    assert.ok(MESSAGES[locale]['help.sharedRules'].length > 20);
    assert.ok(!MESSAGES[locale]['help.step4'].includes('UTC'));
  }
  assert.ok(MESSAGES.en['clue.losses30'].includes('90'));
  assert.ok(MESSAGES.zh['clue.losses30'].includes('90'));
});

test('all Chinese locale variants resolve to Simplified Chinese', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh-HK', 'zh-SG']) {
    assert.equal(resolveLocale(tag), 'zh');
  }
});

test('module fallback dogma attributes are built once and shipped', () => {
  const fallback = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'module-fallback.json'), 'utf8'));
  assert.equal(fallback[35659][20], 505);
  assert.equal(fallback[35659][554], 500);
  assert.equal(fallback[35659][796], 5000000);
  assert.equal(fs.existsSync(path.join(ROOT, 'dist', 'data', 'module-fallback.json')), true);
});

test('ZKILLBOARD statistics are fetched, cached, and passed to the clue builder', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /statsCacheEntry\(shipId\)/);
  assert.match(main, /\/api\/stats\/shipTypeID\/\$\{shipId\}\/kills\//);
  assert.match(main, /state\.liveStats = stats\.status === 'fulfilled'/);
  assert.match(main, /stats: state\.liveStats/);
  assert.equal(main.includes('state.liveStats = null;'), false);
});

test('API caching and builder cache policies are wired', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /statsCacheEntry/);
  assert.match(main, /kill:\$\{killId\}/);
  assert.match(main, /free-page:\$\{shipId\}:\$\{page\}/);
  assert.match(main, /FREE_PAGE_CACHE_MS/);
  assert.match(main, /user_agent/);
  assert.match(main, /data\/module-fallback\.json/);
  const ci = fs.readFileSync(path.join(ROOT, '.gitlab-ci.yml'), 'utf8');
  assert.match(ci, /normalizedVersion/);
  const entrypoint = fs.readFileSync(path.join(ROOT, 'docker', 'oneshot-entrypoint.sh'), 'utf8');
  assert.match(entrypoint, /CACHE_DIR/);
  assert.match(entrypoint, /npm run build:weights\n/);
});

test('unknown hull killmail shows a localized back-navigation error', () => {
  for (const locale of manifest.locales) {
    for (const key of ['error.unknownHullCode', 'error.unknownHullTitle', 'error.unknownHullBody', 'error.back']) {
      assert.ok(MESSAGES[locale][key], `${locale} missing ${key}`);
    }
  }
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /class UnknownHullError/);
  assert.match(main, /data-action="go-back"/);
});

test('timed debrief keeps all four stats in one row', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.match(main, /debrief-stats\$\{timed \? ' is-timed'/);
  assert.match(css, /\.debrief-stats\.is-timed\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
  assert.match(css, /\.debrief-stats\.is-timed \.debrief-stat\s*\{[^}]*width:\s*100%/);
  assert.equal(main.includes("t('dossier.subtitle')"), false);
});

test('field manual stays abstract and does not expose reveal mechanics', () => {
  assert.match(MESSAGES.en['mode.helpNormal'], /gradually reveal/);
  assert.match(MESSAGES.zh['mode.helpNormal'], /逐步揭示/);
  assert.doesNotMatch(MESSAGES.en['mode.helpNormal'], /budget|queue|fittings|weight/i);
  assert.doesNotMatch(MESSAGES.zh['mode.helpNormal'], /预算|队列|装备|权重/);
  assert.match(MESSAGES.en['mode.helpAbyss'], /simulated/);
  assert.doesNotMatch(MESSAGES.en['mode.helpAbyss'], /\+1|equipment clues|half/i);
  assert.match(MESSAGES.en['mode.helpFree'], /random target/);
  assert.match(MESSAGES.zh['mode.helpFree'], /随机/);
  assert.match(MESSAGES.en['mode.helpTimed'], /on a schedule/);
  assert.doesNotMatch(MESSAGES.en['mode.helpTimed'], /30 seconds|batch/i);
  assert.match(MESSAGES.en['help.sharedRules'], /Six attempts/);
  assert.doesNotMatch(MESSAGES.en['help.sharedRules'], /candidate hulls|weight|queue/i);
});

test('catalog is SDE-only, complete, and references official data lazily', () => {
  assert.equal(catalog.length, 430);
  assert.equal(manifest.counts.catalog, catalog.length);
  assert.equal(manifest.downtimeUtcHour, 11);
  assert.ok(manifest.abyssAnswerPool.length > manifest.answerPool.length);
  assert.equal(new Set(manifest.abyssAnswerPool).size, manifest.answerPool.length);
  for (const id of manifest.answerPool) assert.ok(manifest.abyssAnswerPool.includes(id));
  assert.ok(manifest.killPool.length > 0);
  assert.equal(new Set(manifest.killPool.map((entry) => entry.killmail_id)).size, manifest.killPool.length);
  assert.ok(manifest.abyssKillPool.length >= manifest.killPool.length);
  for (const entry of manifest.killPool) assert.ok(catalog.some((ship) => ship.id === entry.ship_id));
  assert.ok(new Set(manifest.killPool.map((entry) => entry.ship_id)).size < manifest.killPool.length);
  assert.equal(manifest.killShipPool.length, new Set(manifest.killShipPool).size);
  assert.ok(manifest.killShipPool.length >= new Set(manifest.killPool.map((entry) => entry.ship_id)).size);
  assert.ok(manifest.normalShipPool.length >= manifest.killShipPool.length);
  assert.ok(manifest.abyssKillShipPool.length >= manifest.killShipPool.length);
  for (const shipId of manifest.killShipPool) assert.ok(catalog.some((ship) => ship.id === shipId));
  assert.equal(manifest.counts.modules, Object.keys(refs.modules).length);
  assert.ok(refs.modules[3186]?.chargeGroups?.includes(377));
  assert.deepEqual(refs.modules[2048]?.resistLayers, { shield: true, armor: true, structure: true });
  assert.deepEqual(refs.modules[2281]?.resistLayers, { shield: true, armor: false, structure: false });
  assert.deepEqual(refs.modules[11642]?.resistLayers, { shield: false, armor: true, structure: false });
  assert.equal(refs.modules[202]?.resistLayers, null);
  assert.equal(refs.modules[47257]?.assaultDamageControl, true);
  const abyssFallback = Object.values(manifest.moduleFallbacks || {}).find((entry) => entry && typeof entry === 'object');
  assert.ok(abyssFallback);
  assert.ok(Object.values(abyssFallback).some((candidates) => Array.isArray(candidates) && candidates.length));
  for (const [abyssId, entry] of Object.entries(manifest.moduleFallbacks || {})) {
    const source = refs.modules[abyssId];
    if (!source) continue;
    for (const candidates of Object.values(entry)) {
      for (const representative of Array.isArray(candidates) ? candidates : [candidates]) {
        assert.equal(refs.modules[representative]?.groupID, source.groupID, `${abyssId} borrowed ${representative}`);
      }
    }
  }
  assert.ok(manifest.images.baseUrl);
  assert.ok(manifest.zkillboard.baseUrl);
  assert.ok(manifest.links.repo);
  assert.ok(manifest.sde.buildNumber);
  assert.match(manifest.zkillboard.snapshot, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(manifest.timeSource);
  assert.equal(manifest.links.eveDocs, 'https://developers.eveonline.com/static-data');
  assert.ok(manifest.links.glossary);
  assert.ok(manifest.moduleFallbacks['47804'], 'abyssal modules need a T2/faction fallback');
  for (const ship of catalog) {
    assert.ok(ship.id && ship.names?.en);
    assert.ok(ship.attrs && Number.isFinite(ship.attrs.speed));
    assert.ok(Number.isFinite(ship.attrs.shieldRecharge) && ship.attrs.shieldRecharge > 0);
    assert.ok(['radar', 'ladar', 'magnetometric', 'gravimetric']
      .every((key) => Number.isFinite(ship.attrs.sensorStrength?.[key])));
    assert.equal('icon' in ship, false, `${ship.id} still contains a local icon path`);
    assert.equal('render' in ship, false, `${ship.id} still contains a local render path`);
  }
});

test('runtime clue builder uses SDE plus live-shaped zKill fixtures', () => {
  const ship = catalog.find((entry) => entry.bonuses?.en?.length > 1);
  assert.ok(ship, 'expected a multi-bonus hull');
  const built = buildClues({
    ship,
    catalog,
    refs,
    stats: {
      rankings: { recent: { all: { metrics: { shipsLost: 123 }, ranks: { shipsLost: 20 } } } },
      dangerRatio: 55,
    },
    losses: makeLosses(),
    dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });

  assert.equal(built.clues.some((clue) => clue.k === 'meta' || clue.k === 'iskLost30'), false);
  assert.equal(built.clues.filter((clue) => clue.k === 'bonus').length, ship.bonuses.en.length);
  assert.equal(built.clues.filter((clue) => clue.k === 'equipment').length, 4);
  assert.equal(built.fittedKills, 1);
  assert.equal(built.sampleKill, 424242);
  const usage = built.clues.find((clue) => clue.k === 'usageRank');
  assert.ok(usage && usage.v >= 1 && usage.v <= 100);
  for (const clue of built.clues) {
    const floor = clue.k === 'structureResists' ? 0 : 1;
    assert.ok(clue.w >= floor && clue.w <= 10);
  }
  const identity = built.clues.slice(0, 3).filter((clue) => ['tech', 'race', 'faction', 'group'].includes(clue.k));
  assert.ok(identity.length <= 1, 'opening identity leak');
  const equipment = built.clues.slice(0, 3).filter((clue) => clue.k === 'equipment');
  assert.ok(equipment.length <= 1, 'opening equipment leak');
  for (const clue of built.clues.filter((entry) => entry.k === 'equipment')) {
    assert.ok(clue.v.slot in EQUIPMENT_SLOT_ORDER);
  }

  const repeat = buildClues({
    ship, catalog, refs, stats: null, losses: [], dateKey: '2026-11-14', dataVersion: manifest.dataVersion,
  });
  const repeatAgain = buildClues({
    ship, catalog, refs, stats: null, losses: [], dateKey: '2026-11-14', dataVersion: manifest.dataVersion,
  });
  assert.deepEqual(repeat.clues.map((clue) => `${clue.k}:${clue.v}`), repeatAgain.clues.map((clue) => `${clue.k}:${clue.v}`));
});

test('abyssal clues simulate fittings and delay identity reveals', () => {
  const ship = catalog.find((entry) => {
    if (entry.groupID !== 27) return false;
    const race = String(refs.races?.[entry.raceID] || '').toLowerCase();
    const group = String(refs.groups?.[entry.groupID] || '').toLowerCase();
    return entry.bonuses?.en?.some((line) => {
      const text = line.toLowerCase();
      return (race && text.includes(race)) || (group && text.includes(group));
    });
  });
  assert.ok(ship, 'expected a battleship with a racial bonus line');
  const hullModuleID = 580; // Burst Jammer I fits the battleship group.
  assert.ok(refs.modules[hullModuleID]?.fitRestrictions?.shipGroups?.includes(27));
  const losses = [{
    killmail_id: 777,
    zkb: { totalValue: 5000000 },
    victim: {
      items: [
        { flag: 19, item_type_id: 5973, quantity_destroyed: 1 },
        { flag: 19, item_type_id: 3831, quantity_destroyed: 1 },
        { flag: 19, item_type_id: Number(hullModuleID), quantity_destroyed: 1 },
      ],
    },
  }];
  const moduleDetails = {
    5973: { dogma_attributes: [{ attribute_id: 20, value: 500 }, { attribute_id: 554, value: 500 }, { attribute_id: 796, value: 500000 }] },
    3831: { dogma_attributes: [{ attribute_id: 72, value: 1100 }, { attribute_id: 983, value: 7 }] },
  };
  const built = buildClues({
    ship,
    catalog,
    refs,
    stats: null,
    losses,
    dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
    mode: 'abyss',
    moduleDetails,
  });
  const byKind = (kind) => built.clues.find((clue) => clue.k === kind);
  assert.ok(byKind('speed').v > ship.attrs.speed, 'MWD should raise simulated speed');
  assert.ok(byKind('sig').v > ship.attrs.sig, 'MWD should bloom simulated signature');
  assert.ok(byKind('shield').v > ship.attrs.shield, 'shield extender should raise simulated shield HP');
  assert.equal(byKind('race').w, 10);
  assert.equal(byKind('group').w, 10);
  const restricted = built.clues.find((clue) => clue.k === 'equipment' && clue.tag);
  assert.ok(restricted);
  assert.ok(restricted.w >= 8.8);
  assert.ok(built.clues.filter((clue) => clue.k === 'bonus').some((clue) => clue.tags?.includes('limited')));
  const opening = built.clues.slice(0, 3);
  assert.equal(opening.some((clue) => clue.k === 'race' || clue.k === 'group'), false);
  assert.equal(opening.some((clue) => clue.k === 'equipment' && clue.tag), false);
});

test('different killmails of the same ship produce different fitting puzzles', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const a = [{
    killmail_id: 10,
    zkb: { totalValue: 1000 },
    victim: { items: [{ flag: 27, item_type_id: 2048, quantity_destroyed: 1, quantity_dropped: 0 }] },
  }];
  const b = [{
    killmail_id: 11,
    zkb: { totalValue: 1000 },
    victim: { items: [{ flag: 19, item_type_id: 5973, quantity_destroyed: 1, quantity_dropped: 0 }] },
  }];
  const build = (losses) => buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const modulesA = build(a).clues.filter((clue) => clue.k === 'equipment').map((clue) => clue.v.module);
  const modulesB = build(b).clues.filter((clue) => clue.k === 'equipment').map((clue) => clue.v.module);
  assert.deepEqual(modulesA, [2048]);
  assert.deepEqual(modulesB, [5973]);
  assert.notDeepEqual(modulesA, modulesB);
});

test('equipment is read from the linked killmail victim, not other losses', () => {
  const losses = [
    {
      killmail_id: 1,
      zkb: { totalValue: 1000 },
      victim: { items: [{ flag: 27, item_type_id: 2048, quantity_destroyed: 1, quantity_dropped: 0 }] },
    },
    {
      killmail_id: 2,
      zkb: { totalValue: 1000 },
      victim: { items: [{ flag: 19, item_type_id: 5973, quantity_destroyed: 1, quantity_dropped: 0 }] },
    },
  ];
  const equipment = getEquipment(losses);
  assert.deepEqual(equipment.equipment.map((item) => item.module), [2048]);
  assert.equal(equipment.fittedKills, 2);
});

test('fit-adjusted values still match within tolerance', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const delta = { add: { mass: 1000000 }, ratio: {} };
  assert.ok(clueMatchesShip({ k: 'mass', v: ship.attrs.mass + 1000000 }, ship, delta));
  const close = { k: 'mass', v: (ship.attrs.mass + 1000000) * 1.02 };
  assert.ok(clueMatchesShip(close, ship, delta));
});

test('targeting, fitting and resistance clues use their new groups', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: [], dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const byKind = (kind) => built.clues.find((clue) => clue.k === kind);
  assert.equal(byKind('cargoCapacity').c, 'cargo');
  assert.equal(byKind('capacitor').c, 'fitting');
  assert.equal(byKind('sig').c, 'targeting');
  assert.equal(byKind('scanRes').c, 'targeting');
  assert.equal(byKind('targetRange').c, 'targeting');
  assert.equal(byKind('maxLockedTargets').c, 'targeting');
  for (const kind of ['shieldResists', 'armorResists', 'structureResists']) {
    assert.equal(byKind(kind).c, 'defense');
  }
});

test('close SDE values count as the same clue', () => {
  const ship = catalog.find((entry) => entry.attrs?.speed > 100);
  assert.ok(clueMatchesShip({ k: 'speed', v: ship.attrs.speed * 1.02 }, ship));
  assert.ok(!clueMatchesShip({ k: 'speed', v: ship.attrs.speed * 1.2 }, ship));
});

test('cargo hold items are part of the exposed equipment', () => {
  const losses = [{
    killmail_id: 424245,
    zkb: { totalValue: 1000 },
    victim: { items: [{ flag: 5, item_type_id: 178, quantity_destroyed: 10, quantity_dropped: 0 }] },
  }];
  const equipment = getEquipment(losses);
  assert.equal(equipment.equipment.length, 1);
  assert.equal(equipment.equipment[0].slot, 'cargo');
});

test('fighter bays separate real fighters from carried modules', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const losses = [{
    killmail_id: 139037509,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 155, item_type_id: 40570, quantity_destroyed: 6, quantity_dropped: 0 },
        { flag: 155, item_type_id: 1952, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 155, item_type_id: 41490, quantity_destroyed: 62, quantity_dropped: 0 },
        { flag: 158, item_type_id: 23061, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 133, item_type_id: 17887, quantity_destroyed: 53946, quantity_dropped: 0 },
        { flag: 87, item_type_id: 41030, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
  const equipment = getEquipment(losses, refs).equipment;
  assert.equal(equipment.find((item) => item.module === 40570)?.slot, 'fighterBay');
  assert.equal(equipment.find((item) => item.module === 23061)?.slot, 'fighter');
  assert.equal(equipment.find((item) => item.module === 1952)?.slot, 'cargo');
  assert.equal(equipment.find((item) => item.module === 41490)?.slot, 'cargo');
  assert.equal(equipment.find((item) => item.module === 17887)?.slot, 'fuelBay');
  assert.equal(equipment.find((item) => item.module === 41030)?.slot, 'drone');

  const built = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const fighter = built.clues.find((clue) => clue.v?.module === 40570);
  const excavator = built.clues.find((clue) => clue.v?.module === 41030);
  assert.equal(fighter.tag, 'limited');
  assert.equal(excavator.tag, 'unique');
  assert.ok(fighter.w >= 10);
  assert.ok(excavator.w >= 10);
  const fitted = buildClues({
    ship, catalog, refs, stats: null,
    losses: [{
      killmail_id: 139037509,
      zkb: { totalValue: 1000 },
      victim: { items: [
        { flag: 22, item_type_id: 90475, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 22, item_type_id: 43552, quantity_destroyed: 1, quantity_dropped: 0 },
      ] },
    }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion,
  });
  const sensor = fitted.clues.find((clue) => clue.v?.module === 90475);
  const command = fitted.clues.find((clue) => clue.v?.module === 43552);
  assert.ok(sensor.w > command.w, `${sensor.w} should exceed ${command.w}`);
  for (const clue of fitted.clues.filter((entry) => entry.k === 'equipment')) {
    assert.ok(clue.w <= 10);
  }
});

test('built-in equipment on corvettes and Zephyr is limited', () => {
  const build = (shipId, moduleId, flag) => buildClues({
    ship: catalog.find((entry) => entry.id === shipId),
    catalog, refs, stats: null,
    losses: [{ killmail_id: 615, zkb: { totalValue: 1000 }, victim: { items: [
      { flag, item_type_id: moduleId, quantity_destroyed: 1, quantity_dropped: 0 },
    ] } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion,
  }).clues.find((clue) => clue.k === 'equipment' && clue.v?.module === moduleId);
  const corvette = build(601, 21857, 19);
  assert.ok(corvette.tags.includes('limited'));
  assert.ok(corvette.w >= 8.2);
  const zephyr = build(2078, 2083, 27);
  assert.ok(zephyr.tags.includes('limited'));
  assert.ok(!zephyr.tags.includes('unique'));
  assert.ok(zephyr.w >= 8.2);
});

test('assault damage control raises abyss structure resist weight', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const build = (moduleId) => buildClues({
    ship, catalog, refs, stats: null,
    losses: [{ killmail_id: 7, zkb: { totalValue: 1000 }, victim: { items: [
      { flag: 12, item_type_id: moduleId, quantity_destroyed: 1, quantity_dropped: 0 },
    ] } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'abyss',
  }).clues.find((clue) => clue.k === 'structureResists');
  const adc = build(47257);
  const dc = build(2048);
  assert.ok(adc.w >= 9.5);
  assert.ok(adc.w > dc.w);
  const standard = buildClues({
    ship, catalog, refs, stats: null,
    losses: [{ killmail_id: 8, zkb: { totalValue: 1000 }, victim: { items: [] } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion,
  }).clues.find((clue) => clue.k === 'structureResists');
  assert.ok(standard.w <= 0.4);
});

test('standard defense clues use a wider matching range than abyss', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const build = (mode) => buildClues({
    ship, catalog, refs, stats: null, losses: [], dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode,
  }).clues.find((clue) => clue.k === 'shield');
  const standard = build(undefined);
  const abyss = build('abyss');
  assert.equal(standard.range, STANDARD_DEFENSE_RANGE);
  assert.equal(abyss.range, undefined);
  assert.ok(clueMatchesShip({ ...standard, v: standard.v * 1.08 }, ship));
  assert.equal(clueMatchesShip({ ...standard, v: standard.v * 1.3 }, ship), false);
});

test('mass defaults to tonnes with spaced thousands and can switch to kg', () => {
  assert.deepEqual(formatMass(15000000, 't', 't'), { value: '15 000', unit: 't' });
  assert.deepEqual(formatMass(1234567, 't', 't'), { value: '1 234.567', unit: 't' });
  assert.deepEqual(formatMass(15000000, 'kg', 't'), { value: '15 000 000', unit: 'kg' });
});

test('human value buckets merge small variations but separate broad ranges', () => {
  assert.equal(humanBucketKey('mass', 15000000), humanBucketKey('mass', 15100000));
  assert.notEqual(humanBucketKey('mass', 15000000), humanBucketKey('mass', 100000000));
  assert.equal(humanBucketKey('shield', 3000), humanBucketKey('shield', 3200));
  assert.notEqual(humanBucketKey('shield', 3000), humanBucketKey('shield', 6000));
});

test('sensor strength and shield recharge are exposed as static clues', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: [], dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const byKind = (kind) => built.clues.find((clue) => clue.k === kind);
  const sensor = byKind('sensorStrength');
  const recharge = byKind('shieldRecharge');
  assert.ok(sensor, 'sensor strength clue missing');
  assert.ok(recharge, 'shield recharge clue missing');
  assert.equal(sensor.c, 'targeting');
  assert.equal(recharge.c, 'defense');
  assert.deepEqual(sensor.v, ship.attrs.sensorStrength);
  assert.equal(recharge.v, ship.attrs.shieldRecharge);
  assert.ok(sensor.w >= 1 && sensor.w <= 10);
  assert.ok(recharge.w >= 1 && recharge.w <= 10);
  assert.ok(clueMatchesShip(sensor, ship));
  assert.ok(clueMatchesShip(recharge, ship));
  assert.ok(clueMatchesShip({ k: 'shieldRecharge', v: ship.attrs.shieldRecharge * 1.01 }, ship));

  const delta = {
    ratio: { shieldRecharge: 0.5 },
    sensorStrength: { ladar: 2 },
  };
  assert.ok(clueMatchesShip({ k: 'shieldRecharge', v: ship.attrs.shieldRecharge * 0.5 }, ship, delta));
  assert.ok(clueMatchesShip({
    k: 'sensorStrength',
    v: { ...ship.attrs.sensorStrength, ladar: ship.attrs.sensorStrength.ladar * 2 },
  }, ship, delta));
});

test('resistance weights follow fitted resist gear instead of base values alone', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const build = (items) => buildClues({
    ship, catalog, refs, stats: null,
    losses: [{ killmail_id: 12, zkb: { totalValue: 1000 }, victim: { items } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'abyss',
  });
  const clue = (built, kind) => built.clues.find((entry) => entry.k === kind);
  const equipment = (built, id) => built.clues.find((entry) => entry.k === 'equipment' && entry.v.module === id);
  const item = (id, flag = 12) => ({ flag, item_type_id: id, quantity_destroyed: 1 });

  const none = build([]);
  for (const kind of ['shieldResists', 'armorResists', 'structureResists']) {
    assert.ok(clue(none, kind).w <= 3.2, `${kind} base weight should stay low`);
  }

  const t2dc = build([item(2048)]);
  for (const kind of ['shieldResists', 'armorResists', 'structureResists']) {
    assert.ok(clue(t2dc, kind).w <= 3.2, `${kind} T2 DC weight should stay low`);
  }

  const factionDc = build([item(41200)]);
  const factionDcWeight = equipment(factionDc, 41200).w;
  assert.ok(factionDcWeight >= 8.2);
  for (const kind of ['shieldResists', 'armorResists', 'structureResists']) {
    assert.ok(clue(factionDc, kind).w >= factionDcWeight, `${kind} should inherit the faction DC weight`);
  }

  const adc = build([item(47257)]);
  const adcWeight = equipment(adc, 47257).w;
  assert.ok(clue(adc, 'structureResists').w >= 9.5);
  assert.ok(clue(adc, 'shieldResists').w >= Math.max(8.8, adcWeight));
  assert.ok(clue(adc, 'armorResists').w >= Math.max(8.8, adcWeight));

  const shieldHardener = build([item(2281, 19)]);
  const shieldHardenerWeight = equipment(shieldHardener, 2281).w;
  assert.ok(clue(shieldHardener, 'shieldResists').w >= Math.max(5.8, shieldHardenerWeight));
  assert.ok(clue(shieldHardener, 'armorResists').w <= 3.2);
  assert.ok(clue(shieldHardener, 'structureResists').w <= 3.2);

  // Charges can carry resonance attributes, but they are not fitted resist gear.
  const missile = build([item(202, 27)]);
  for (const kind of ['shieldResists', 'armorResists', 'structureResists']) {
    assert.ok(clue(missile, kind).w <= 3.2, `${kind} should ignore charge resonance data`);
  }

  // Group-60 capital energizers are structure-only, not plain damage controls.
  const energizer = build([item(40714)]);
  const energizerWeight = equipment(energizer, 40714).w;
  assert.ok(clue(energizer, 'structureResists').w >= energizerWeight);
  assert.ok(clue(energizer, 'shieldResists').w <= 3.2);
  assert.ok(clue(energizer, 'armorResists').w <= 3.2);
});

test('abyss weather boosts non-uniform structure resists', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const build = (structureResists) => buildClues({
    ship, catalog, refs, stats: null,
    losses: [{ killmail_id: 77, zkb: { totalValue: 1000 }, victim: { items: [] } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'abyss',
    fittedAttrs: { ...ship.attrs, structureResists },
  }).clues.find((clue) => clue.k === 'structureResists');
  const uniform = build({ em: 33, thermal: 33, kinetic: 33, explosive: 33 });
  const weather = build({ em: 33, thermal: 50, kinetic: 33, explosive: 33 });
  assert.ok(weather.w >= 9.5);
  assert.ok(weather.w > uniform.w);
});

test('low-slot weapon upgrades are weighted by matching weapon family', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const build = (items) => buildClues({
    ship, catalog, refs, stats: null,
    losses: [{ killmail_id: 9, zkb: { totalValue: 1000 }, victim: { items } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion,
  });
  const bcs = { flag: 12, item_type_id: 22291, quantity_destroyed: 1, quantity_dropped: 0 };
  const launcher = { flag: 27, item_type_id: 2404, quantity_destroyed: 1, quantity_dropped: 0 };
  const alone = build([bcs]).clues.find((clue) => clue.v?.module === 22291);
  const matched = build([bcs, launcher]).clues.find((clue) => clue.v?.module === 22291);
  assert.ok(matched.w > alone.w);
  assert.ok(matched.w >= 7.4);
});

test('same type fitted and in cargo is exposed as separate lines', () => {
  const losses = [{
    killmail_id: 139532182,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 5, item_type_id: 48439, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 21, item_type_id: 48439, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
  const equipment = getEquipment(losses).equipment;
  const mid = equipment.find((item) => item.module === 48439 && item.slot === 'mid');
  const cargo = equipment.find((item) => item.module === 48439 && item.slot === 'cargo');
  assert.ok(mid);
  assert.ok(cargo);
  assert.equal(mid.count, 1);
  assert.equal(cargo.count, 1);
});

test('slot layout is split into separate clues and kill value is exposed', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const losses = [{
    killmail_id: 424246,
    zkb: { totalValue: 123456789 },
    victim: { items: [{ flag: 27, item_type_id: 2048, quantity_destroyed: 1, quantity_dropped: 0 }] },
  }];
  const built = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  for (const kind of ['hiSlots', 'medSlots', 'lowSlots', 'rigSlots']) {
    assert.ok(built.clues.some((clue) => clue.k === kind), `missing ${kind}`);
  }
  assert.ok(built.clues.some((clue) => clue.k === 'turretHardpoints'));
  assert.ok(built.clues.some((clue) => clue.k === 'launcherHardpoints'));
  assert.ok(!built.clues.some((clue) => clue.k === 'hardpoints'));
  assert.equal(built.clues.find((clue) => clue.k === 'kbValue').v, 123456789);
  assert.equal(built.clues.filter((clue) => clue.c === 'economy').length, 1);
  assert.equal(built.clues.some((clue) => clue.missing), false);
});

test('larger module sizes carry more weight', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const losses = [{
    killmail_id: 424248,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 19, item_type_id: 377, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 19, item_type_id: 40354, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 92, item_type_id: 30993, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
  const built = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const small = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 377);
  const capital = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 40354);
  assert.ok(small && capital);
  assert.ok(capital.w > small.w);
  const rig = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 30993);
  assert.ok(rig.w >= 10);
});

test('high-slot ammunition uses the same weight as the weapon', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const losses = [{
    killmail_id: 424247,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 27, item_type_id: 486, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 27, item_type_id: 178, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
  const built = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const weapon = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 486);
  const ammo = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 178);
  assert.ok(weapon && ammo);
  assert.equal(ammo.w, weapon.w);
});

test('unique weapon ammunition inherits unique weight', () => {
  const ship = catalog.find((entry) => entry.groupID === 541);
  const losses = [{
    killmail_id: 424249,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 27, item_type_id: 22782, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 27, item_type_id: 22778, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
  const built = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const launcher = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 22782);
  const probe = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 22778);
  assert.ok(launcher && probe);
  assert.equal(launcher.tag, 'unique');
  assert.equal(probe.tag, null);
  assert.deepEqual(probe.tags, []);
  assert.equal(probe.w, 10);
});

test('utility high-slot modules do not make ammunition unique', () => {
  const marauder = catalog.find((entry) => entry.groupID === 900);
  const losses = [{
    killmail_id: 139932720,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 27, item_type_id: 3186, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 31, item_type_id: 94009, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 28, item_type_id: 12791, quantity_destroyed: 46, quantity_dropped: 0 },
      ],
    },
  }];
  const built = buildClues({
    ship: marauder, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const weapon = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 3186);
  const bastion = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 94009);
  const ammo = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 12791);
  assert.ok(weapon && bastion && ammo);
  assert.equal(bastion.tags.includes('unique'), true);
  assert.deepEqual(ammo.tags, []);
  assert.equal(ammo.tag, null);
  assert.equal(ammo.w, weapon.w);
});

test('cargo charges inherit fitted equipment weight without markers', () => {
  const marauder = catalog.find((entry) => entry.groupID === 900);
  const losses = [{
    killmail_id: 424252,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 27, item_type_id: 3186, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 19, item_type_id: 1978, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 5, item_type_id: 12791, quantity_destroyed: 46, quantity_dropped: 0 },
        { flag: 5, item_type_id: 28999, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
  const built = buildClues({
    ship: marauder, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const weapon = built.clues.find((clue) => clue.v?.module === 3186);
  const computer = built.clues.find((clue) => clue.v?.module === 1978);
  const cargoAmmo = built.clues.find((clue) => clue.v?.module === 12791);
  const cargoScript = built.clues.find((clue) => clue.v?.module === 28999);
  assert.ok(weapon && computer && cargoAmmo && cargoScript);
  assert.equal(cargoAmmo.w, weapon.w);
  assert.equal(cargoScript.w, computer.w);
  assert.deepEqual(cargoAmmo.tags, []);
  assert.deepEqual(cargoScript.tags, []);
});

test('officer, abyssal and PLEX items expose their own markers', () => {
  const battleship = catalog.find((entry) => entry.groupID === 27);
  const officer = Object.entries(refs.modules).find(([, module]) => Number(module.metaGroupID) === 5);
  const abyssal = Object.entries(refs.modules).find(([, module]) => Number(module.metaGroupID) === 15);
  assert.ok(officer && abyssal);
  const losses = [{
    killmail_id: 424251,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 27, item_type_id: Number(officer[0]), quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 28, item_type_id: Number(abyssal[0]), quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 5, item_type_id: 44992, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
  const built = buildClues({
    ship: battleship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const officerClue = built.clues.find((clue) => clue.v?.module === Number(officer[0]));
  const abyssalClue = built.clues.find((clue) => clue.v?.module === Number(abyssal[0]));
  const plexClue = built.clues.find((clue) => clue.v?.module === 44992);
  assert.ok(officerClue.tags.includes('officer'));
  assert.ok(abyssalClue.tags.includes('abyss'));
  assert.ok(plexClue.tags.includes('plex'));
});

test('abyss fallback picks the nearest meta of the same module variant', () => {
  const officerRepair = Object.entries(refs.modules).find(([, module]) => (
    module.groupID === 62 && Number(module.metaGroupID) === 5
  ));
  assert.ok(officerRepair);
  const equipment = [
    { module: 49738, slot: 'low' },
    { module: Number(officerRepair[0]), slot: 'low' },
  ];
  const fallbacks = selectAbyssFallbacks(equipment, refs, manifest.moduleFallbacks);
  const ballistic = fallbacks.get(49738);
  assert.ok(ballistic);
  assert.equal(refs.modules[ballistic].groupID, 367);
  assert.equal(Number(refs.modules[ballistic].metaGroupID), 5);

  const repairFallbacks = selectAbyssFallbacks([
    { module: 47777, slot: 'low' },
    { module: 18973, slot: 'low' },
  ], refs, manifest.moduleFallbacks);
  const repair = repairFallbacks.get(47777);
  assert.ok(repair);
  assert.equal(refs.modules[repair].groupID, 62);
  assert.equal(Number(refs.modules[repair].metaLevel), 16);
  assert.notEqual(repair, 19035);

  const entropicFallbacks = selectAbyssFallbacks([
    { module: 49734, slot: 'low' },
    { module: 18973, slot: 'low' },
  ], refs, manifest.moduleFallbacks);
  assert.equal(entropicFallbacks.get(49734), 52244);
});

test('fitted module PG/CPU implies a size floor but cargo spares do not', () => {
  const ship = catalog.find((entry) => entry.attrs.rigSize === 2);
  const module = refs.modules[35659];
  assert.equal(moduleFitSize(module, catalog), 2);
  assert.equal(moduleFitSize(refs.modules[5973], catalog), 1);
  assert.equal(moduleFitSize(refs.modules[35661], catalog), 3);
  const build = (flag) => buildClues({
    ship, catalog, refs, stats: null, dateKey: '2026-11-18', dataVersion: manifest.dataVersion,
    losses: [{
      killmail_id: 424251,
      zkb: { totalValue: 1000 },
      victim: { items: [{ flag, item_type_id: 35659, quantity_destroyed: 1 }] },
    }],
  }).clues.find((clue) => clue.v.module === 35659);
  const fitted = build(19);
  const cargo = build(5);
  assert.ok(fitted.w >= 6.2);
  assert.ok(cargo.w < 6.2);
});

test('abyss weights start from base stats and drop when fitted values change', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const losses = [{ killmail_id: 424250, zkb: { totalValue: 1000 }, victim: { items: [] } }];
  const normal = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const abyss = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode: 'abyss',
    fittedAttrs: { ...ship.attrs, mass: ship.attrs.mass + 5000000 },
  });
  const normalMass = normal.clues.find((clue) => clue.k === 'mass');
  const abyssMass = abyss.clues.find((clue) => clue.k === 'mass');
  assert.notEqual(abyssMass.v, normalMass.v);
  assert.ok(abyssMass.w < normalMass.w);
  const normalTech = normal.clues.find((clue) => clue.k === 'tech');
  const abyssTech = abyss.clues.find((clue) => clue.k === 'tech');
  assert.equal(abyssTech.w, normalTech.w);

  const skillOnly = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode: 'abyss',
    baselineAttrs: { ...ship.attrs, mass: ship.attrs.mass + 5000000 },
    fittedAttrs: { ...ship.attrs, mass: ship.attrs.mass + 5000000 },
  });
  const skillMass = skillOnly.clues.find((clue) => clue.k === 'mass');
  assert.equal(skillMass.w, normalMass.w);
});

test('micro jump drives are shared fittings, not hull-specific equipment', () => {
  const battleship = catalog.find((entry) => entry.groupID === 27);
  const losses = [{
    killmail_id: 424243,
    zkb: { totalValue: 1000 },
    victim: { items: [{ flag: 27, item_type_id: 4383, quantity_destroyed: 1, quantity_dropped: 0 }] },
  }];
  const built = buildClues({
    ship: battleship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const mjd = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 4383);
  assert.ok(mjd, 'MJD should still be a parsed fitting');
  assert.ok(!mjd.sig);
  assert.equal(mjd.tag, 'limited');
});

test('single-class bastion modules are unique and weighted heavily', () => {
  const marauder = catalog.find((entry) => entry.groupID === 900);
  const losses = [{
    killmail_id: 424244,
    zkb: { totalValue: 1000 },
    victim: { items: [{ flag: 27, item_type_id: 33400, quantity_destroyed: 1, quantity_dropped: 0 }] },
  }];
  const built = buildClues({
    ship: marauder, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const bastion = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 33400);
  assert.ok(bastion);
  assert.equal(bastion.tag, 'unique');
  assert.equal(bastion.w, 10);
});

test('abyss multi-clue reveals mix equipment and attributes', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: makeLosses(), dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode: 'abyss',
  });
  const getShip = (id) => catalog.find((entry) => entry.id === id);
  const initial = computeRevealed({
    clues: built.clues, catalog, guesses: [], status: 'playing', answerId: ship.id,
    mode: 'abyss', locale: 'en', getShip, answerBonuses: ship.bonuses.en, answer: ship,
  });
  const revealed = computeRevealed({
    clues: built.clues, catalog, guesses: [999999, 999998], status: 'playing', answerId: ship.id,
    mode: 'abyss', locale: 'en', getShip, answerBonuses: ship.bonuses.en, answer: ship,
  });
  const added = [...revealed].filter((index) => !initial.has(index));
  assert.ok(added.length >= 2);
  const equipment = added.filter((index) => built.clues[index].k === 'equipment').length;
  assert.ok(equipment > 0 && equipment < added.length, 'multi-reveal should mix equipment and attributes');
});

test('abyss falls back to other clues when there is no equipment', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: [], dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode: 'abyss',
  });
  const getShip = (id) => catalog.find((entry) => entry.id === id);
  const initial = computeRevealed({
    clues: built.clues, catalog, guesses: [], status: 'playing', answerId: ship.id,
    mode: 'abyss', locale: 'en', getShip, answerBonuses: ship.bonuses.en, answer: ship,
  });
  const revealed = computeRevealed({
    clues: built.clues, catalog, guesses: [999999, 999998], status: 'playing', answerId: ship.id,
    mode: 'abyss', locale: 'en', getShip, answerBonuses: ship.bonuses.en, answer: ship,
  });
  const added = [...revealed].filter((index) => !initial.has(index));
  assert.ok(added.length > 0);
  assert.ok(added.every((index) => built.clues[index].k !== 'equipment'));
});

test('normal mode releases equipment on misses and shared clues on matching guesses', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: makeLosses(), dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const answerData = { ...ship, bonuses: ship.bonuses.en, clues: built.clues };
  const getShip = (id) => catalog.find((entry) => entry.id === id);
  const compute = (guesses, mode = 'normal', status = 'playing') => computeRevealed({
    clues: built.clues,
    catalog,
    guesses,
    status,
    answerId: ship.id,
    mode,
    locale: 'en',
    getShip,
    answerBonuses: ship.bonuses.en,
    answer: answerData,
  });
  const initial = compute([]);
  assert.ok(initial.size >= 2 && initial.size <= 8, 'initial reveal is threshold-driven');
  assert.ok([...initial].some((index) => built.clues[index].k === 'structureResists'));
  const initialStatic = [...initial]
    .map((index) => built.clues[index])
    .filter((clue) => ['identity', 'hull', 'slots', 'nav', 'defense', 'targeting', 'fitting'].includes(clue.c));
  const candidates = catalog.filter((entry) => initialStatic.every((clue) => clueMatchesShip(clue, entry)));
  assert.ok(candidates.length >= 6, 'opening must keep a usable candidate set');

  const sameGroup = catalog.find((entry) => entry.groupID === ship.groupID && entry.id !== ship.id);
  assert.ok(sameGroup, 'expected another hull in the same class');
  const shared = compute([sameGroup.id]);
  const newlyMatched = [...shared]
    .filter((index) => !initial.has(index))
    .map((index) => built.clues[index])
    .filter((clue) => ['identity', 'hull', 'slots', 'nav', 'defense', 'targeting', 'fitting'].includes(clue.c));
  assert.ok(newlyMatched.length > 0, 'matching guesses should reveal shared static clues');

  const afterUnknown = compute([999999]);
  const added = [...afterUnknown].filter((index) => !initial.has(index));
  assert.ok(added.every((index) => ['equipment', 'cargo'].includes(built.clues[index].k)));
  assert.ok(added.some((index) => built.clues[index].k === 'equipment'), 'normal misses should release equipment');
  assert.equal(added.some((index) => built.clues[index].k === 'bonus'), false, 'bonus clues are not proactively revealed in Standard');

  let previous = initial;
  const missGuesses = [999999, 999998, 999997, 999996];
  for (let count = 1; count <= missGuesses.length; count++) {
    const next = compute(missGuesses.slice(0, count));
    for (const index of previous) {
      assert.ok(next.has(index), `miss ${count} must keep clue ${built.clues[index].k}`);
    }
    previous = next;
  }

  const abyssInitial = compute([], 'abyss');
  const abyssOne = compute([999999], 'abyss');
  const abyssTwo = compute([999999, 999998], 'abyss');
  assert.ok(abyssInitial.size >= 2 && abyssInitial.size <= 7);
  assert.ok(abyssOne.size >= abyssInitial.size && abyssOne.size <= abyssInitial.size + 5);
  assert.ok(abyssTwo.size >= abyssOne.size && abyssTwo.size <= abyssInitial.size + 9);
});

test('Standard cargo queue consumes its own weight budget', () => {
  const clues = [
    { k: 'cargoCapacity', c: 'cargo', v: 100, w: 1 },
    ...Array.from({ length: 7 }, (_, index) => ({
      k: 'cargo', c: 'cargo', v: { module: index + 1, slot: 'cargo' }, w: 1,
    })),
  ];
  const plan = buildRevealPlan({ clues, seed: 'cargo-budget', mode: 'normal' });
  assert.equal(plan.config.standardCargoBudget, DEFAULT_REVEAL_CONFIG.standardCargoBudget);
  const revealed = computeRevealed({
    clues,
    catalog: [],
    guesses: [999999],
    status: 'playing',
    answerId: 1,
    mode: 'normal',
    locale: 'en',
    getShip: () => null,
    seed: 'cargo-budget',
    plan,
  });
  assert.equal(revealed.size, DEFAULT_REVEAL_CONFIG.standardCargoBudget);
});

test('frontend source has no hard-coded deployment domains or local image caches', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|css|html)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(ROOT, 'js'));
  files.push(path.join(ROOT, 'index.html'));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(/https?:\/\//.test(text), false, `${path.relative(ROOT, file)} contains a hard-coded URL`);
    assert.equal(/assets\/(ships|modules)/.test(text), false, `${path.relative(ROOT, file)} references a local image cache`);
  }
});
