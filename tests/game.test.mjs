import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  ATTEMPT_LIMIT,
  INITIAL_REVEAL,
  DOWNTIME_HOUR_UTC,
  buildSearchIndex,
  buildGuessResult,
  claimCaseNumber,
  ycDateLabel,
  freeKillIdFromToken,
  emptyStats,
  formatMass,
  freeKillToken,
  gameDateKey,
  killHasFittedModules,
  kbCaseHash,
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
import { buildClues, auditSimulationItems, propulsionPriority, clueMatchesShip, EQUIPMENT_SLOT_ORDER, getEquipment, humanBucketKey, moduleFitSize, selectAuditFallbacks, STANDARD_DEFENSE_RANGE } from '../js/clues.js';
import { buildRevealPlan, computeRevealed, computeTimedRevealed, DEFAULT_REVEAL_CONFIG, timedRevealTotal } from '../js/reveal.js';
import { MESSAGES, resolveLocale } from '../js/i18n.js';
import { formatGameDayStart, parseGameDayStartMinutes, resolveGameDayStart } from '../js/game.js';
import { brandLogoHtml, fitdleMark, FITDLE_SYSTEM_LONG, PEND_INSURANCE_ID, SCC_ID } from '../js/brand.js';
import { avatarHtml, DEFAULT_PORTRAIT_ID, portraitUrl } from '../js/avatar.js';
import { TRIGLAVIAN_CONVOCATION_ID, TRIGLAVIAN_FACTION_ID, triglavianBrand, triglavianDepartments } from '../js/triglavian-copy.js';
import { LEGAL_NOTICES } from '../js/legal-copy.js';
import { claimGroups, claimSeed, pickClaimDebrief, pickClaimGroup, pickClaimMemo } from '../js/claim.js';
import { DEFAULT_REVEAL, DEFAULT_KB_RECENCY_HALF_LIFE_DAYS, DEFAULT_KB_MAX_SCAN_PAGES, loadBuildConfig, parseDateOnly, parseGameDayStart } from '../scripts/build-env.mjs';
import { normalizePublicOrigin, renderRuntimeGameDay, renderRuntimeOrigin } from '../scripts/render-runtime-origin.mjs';
import { versionHtml, versionImports } from '../scripts/version-assets.mjs';
import { buildUserAgent, parseContact, publicSite } from '../js/user-agent.js';

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
  assert.equal(modeFromLocation('?rule=audit'), 'audit');
  assert.equal(modeFromLocation('?rule=standard'), 'normal');
  assert.equal(modeFromLocation('?rule=timed'), 'normal');
  assert.equal(modeFromLocation('?claim=audit'), 'audit');
  assert.equal(modeFromLocation('?claim=standard'), 'normal');
  assert.equal(modeFromLocation('?claim=timed'), 'normal');
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
  assert.equal(freeKillIdFromToken('139037509'), null);
  assert.equal(freeKillIdFromToken('kbad00'), null);
  assert.equal(killHasFittedModules({ victim: { items: [{ flag: 5, item_type_id: 1 }] } }), false);
  assert.equal(killHasFittedModules({ victim: { items: [{ flag: 19, item_type_id: 1 }] } }), true);
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

test('the static build carries no Daily selection code', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.equal(main.includes('fetchDailyKill'), false);
  assert.doesNotMatch(main, /estimateMonthlyPageCount|probeMonthPageCount|monthPageTotal|monthRecordSlot/);
});

test('game day start accepts HH:MM or minutes and warns about anything else', () => {
  assert.equal(parseGameDayStartMinutes('11:00'), 660);
  assert.equal(parseGameDayStartMinutes(' 0:30 '), 30);
  assert.equal(parseGameDayStartMinutes('660'), 660);
  assert.equal(parseGameDayStartMinutes('0'), 0);
  for (const bad of ['24:00', '11:60', '1440', '-5', '11.5', 'noon', '']) assert.equal(parseGameDayStartMinutes(bad), null, bad);
  assert.equal(formatGameDayStart(545), '09:05');
  assert.deepEqual(resolveGameDayStart(undefined, 660), { minutes: 660, warning: null });
  assert.deepEqual(resolveGameDayStart('12:30', 660), { minutes: 750, warning: null });
  const bad = resolveGameDayStart('25:00', 660);
  assert.equal(bad.minutes, 660);
  assert.match(bad.warning, /FITDLE_GAME_DAY_START_UTC="25:00".*using 11:00 UTC/);
});

test('build configuration validates the game day and KB lower bound', () => {
  assert.deepEqual(parseGameDayStart('10:30'), { text: '10:30', minutes: 630 });
  assert.throws(() => parseGameDayStart('24:00'), /HH:MM/);
  assert.deepEqual(parseGameDayStart('660'), { text: '11:00', minutes: 660 });
  assert.deepEqual(parseGameDayStart('9:05'), { text: '09:05', minutes: 545 });
  assert.throws(() => parseGameDayStart('1440'), /minutes 0-1439/);
  assert.equal(parseDateOnly('2012-05-22'), '2012-05-22');
  assert.throws(() => parseDateOnly('2026-02-29'), /valid date/);
  assert.equal(manifest.gameDayStartUtc, '11:00');
  assert.equal(manifest.gameDayStartMinutes, 660);
  assert.equal(manifest.kbSelectionStartDate, '2012-05-22');
  assert.equal(manifest.kbRecencyHalfLifeDays, DEFAULT_KB_RECENCY_HALF_LIFE_DAYS);
  assert.equal(manifest.kbMaxScanPages, DEFAULT_KB_MAX_SCAN_PAGES);
  assert.equal(manifest.kbMaxScanPages, 20);
  assert.equal(manifest.beacon, undefined);
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

test('audit reveal cadence matches the six-attempt design', () => {
  assert.equal(revealCountFor(0, 40, 'audit'), INITIAL_REVEAL);
  assert.equal(revealCountFor(1, 40, 'audit'), 5);
  assert.equal(revealCountFor(2, 40, 'audit'), 8);
  assert.equal(revealCountFor(3, 40, 'audit'), 12);
  assert.equal(revealCountFor(5, 40, 'audit'), 23);
  assert.equal(newlyRevealedFor(1, 40, 'audit'), 2);
  assert.equal(newlyRevealedFor(2, 40, 'audit'), 3);
  assert.equal(newlyRevealedFor(3, 40, 'audit'), 4);
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
  const audit = buildRevealPlan({ clues, seed: 'same-seed', mode: 'audit' });
  assert.ok(audit.queues.other.length >= 1);
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
  const audit = computeRevealed({ ...base, mode: 'audit', plan: { ...plan, mode: 'audit' } });
  assert.equal(audit.has(0), false);
  const timed = computeRevealed({
    ...base,
    mode: 'normal',
    timed: true,
    plan: { ...plan, mode: 'normal', timed: true },
  });
  assert.equal(timed.has(0), false);
});

test('audit misses reveal nested equipment plus one other clue', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: makeLosses(),
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'audit',
  });
  const wrong = catalog.find((entry) => entry.id !== 587).id;
  const run = (guesses) => computeRevealed({
    clues: built.clues, catalog, guesses, status: 'playing', answerId: 587,
    mode: 'audit', locale: 'en', getShip: (id) => catalog.find((entry) => entry.id === id),
    seed: 'audit-cadence',
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
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'audit',
  });
  const emptyRun = (guesses) => computeRevealed({
    clues: empty.clues, catalog, guesses, status: 'playing', answerId: 587,
    mode: 'audit', locale: 'en', getShip: (id) => catalog.find((entry) => entry.id === id),
    seed: 'audit-cadence',
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

test('watchlist and claim assets are shipped to dist', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'dist', 'assets', 'watchlist.json')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'dist', 'assets', 'boot-flavor.json')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'dist', 'assets', 'claim-departments.json')), true);
  for (const locale of manifest.locales) {
    const { departments } = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'assets', 'claim-departments', `${locale}.json`), 'utf8'));
    assert.deepEqual(Object.keys(departments), [locale]);
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
  stats = recordPlay(storage, stats, { date: '2026-11-17', mode: 'audit', isToday: true });
  stats = recordResult(storage, stats, {
    date: '2026-11-17', mode: 'audit', status: 'won', attempts: 2, isToday: true,
  });
  assert.equal(stats.wins.audit, 1);
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
  for (const mode of ['standard', 'audit', 'timed']) {
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
  const auditUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'audit', 'won', 4, 'zh-Hant');
  assert.equal(auditUrl, 'https://example.test/fitdle/share/4/zh.html?rule=audit');
  const lostUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'audit', 'lost', 6, 'de');
  assert.equal(lostUrl, 'https://example.test/fitdle/share/lost/de.html?rule=audit');
  const freeUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'audit', 'playing', 0, 'zh-Hant', false, true);
  assert.equal(freeUrl, `https://example.test/fitdle/share/free/zh.html?kb=${token}&rule=audit`);
  const timedUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'audit', 'won', 4, 'de', true, true, 125);
  assert.equal(timedUrl, `https://example.test/fitdle/share/timed/de.html?t=125&kb=${token}&rule=timed`);
  const timedDaily = shareUrl({ href: 'https://example.test/fitdle/index.html' }, killId, 'audit', 'won', 4, 'de', true, false, 125);
  assert.equal(timedDaily, 'https://example.test/fitdle/share/timed/de.html?t=125&rule=timed');
  assert.equal(url.includes('lang='), false);
  assert.equal(url.includes('d='), false);
  assert.equal(timedUrl.includes('timer='), false);
  assert.equal(freeUrl.includes('mode='), false);
  const storage = { data: new Map(), getItem(k) { return this.data.get(k) ?? null; }, setItem(k, v) { this.data.set(k, v); } };
  saveState(storage, '2026-11-14', { dataVersion: 'v', guesses: [1], status: 'playing' }, 'normal');
  saveState(storage, '2026-11-14', { dataVersion: 'v', guesses: [2], status: 'playing' }, 'audit');
  assert.deepEqual(loadState(storage, '2026-11-14', 'v', 'normal').guesses, [1]);
  assert.deepEqual(loadState(storage, '2026-11-14', 'v', 'audit').guesses, [2]);
  const grid = resultGrid('won', 3);
  assert.equal([...grid].length, ATTEMPT_LIMIT);
  assert.ok(grid.includes('🟩'));
  const loss = resultGrid('lost', 6);
  assert.equal([...loss].length, ATTEMPT_LIMIT);
});

test('claim numbers use an opaque hash, with the date only for Daily', () => {
  const day = '2026-11-21';
  const killId = 139037509;
  const hash = kbCaseHash(killId);
  assert.equal(ycDateLabel(day), 'YC128.11.21');
  assert.equal(ycDateLabel('invalid'), '');
  assert.equal(claimCaseNumber({ gameplay: 'daily', day, killId }), `PI-YC128.11.21-${hash}`);
  assert.equal(claimCaseNumber({ gameplay: 'standard', day, killId: null }), 'PI-OPEN');
  const first = claimCaseNumber({ gameplay: 'standard', day, killId });
  const second = claimCaseNumber({ gameplay: 'standard', day, killId });
  const other = claimCaseNumber({ gameplay: 'standard', day, killId: killId + 1 });
  assert.match(first, /^PI-[0-9A-Z]{8}$/);
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.equal(first.includes(String(killId)), false);
  assert.equal(first.includes('YC128'), false);
  assert.equal(claimCaseNumber({ gameplay: 'daily', day, killId }).includes('DAY'), false);
  assert.equal(claimCaseNumber({ gameplay: 'daily', day, killId }).includes(String(killId)), false);
  assert.equal(claimCaseNumber({ gameplay: 'standard', killHash: 'abcd-1234' }), 'PI-ABCD1234');
  assert.match(kbCaseHash(killId), /^[0-9A-Z]{8}$/);
  assert.equal(kbCaseHash(null), '');
});

test('localized static share pages carry the score for link previews', () => {
  const sharePage = path.join(ROOT, 'dist', 'share', '3', 'en.html');
  const zhPage = path.join(ROOT, 'dist', 'share', '3', 'zh.html');
  if (fs.existsSync(sharePage)) {
    const html = fs.readFileSync(sharePage, 'utf8');
    assert.match(html, /FITDLE — 3\/6 — Claim approved/);
    assert.match(html, /Hull identity verified in 3 review passes/);
    assert.match(html, /og:image" content="[^"]+\/assets\/share\/og-3-en\.png\?v=5"/);
    assert.match(html, /twitter:card" content="summary_large_image"/);
    assert.match(html, /location\.replace/);
    assert.ok(fs.existsSync(zhPage));
    const zh = fs.readFileSync(zhPage, 'utf8');
    assert.match(zh, /3\/6 — 理赔通过/);
    assert.match(zh, /经过 3 次复核，船体身份已确认/);
    assert.match(zh, /og:image" content="[^"]+\/assets\/share\/og-3-zh\.png\?v=5"/);
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

test('every share card exists as a 1200x630 PNG', () => {
  const names = ['og.png'];
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh']) {
    for (const key of ['1', '2', '3', '4', '5', '6', 'lost']) names.push(`og-${key}-${locale}.png`);
  }
  for (const name of names) {
    const png = fs.readFileSync(path.join(ROOT, 'assets', 'share', name));
    assert.equal(png.toString('latin1', 1, 4), 'PNG', name);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], name);
  }
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'assets', 'share')).sort(), names.sort());
});

test('container image builds the catalog before the kill pool and serves online', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const entrypoint = fs.readFileSync(path.join(ROOT, 'docker', 'entrypoint.sh'), 'utf8');
  const catalogBuild = dockerfile.indexOf('npm run build:catalog');
  const killPool = dockerfile.indexOf('npm run build:killpool');
  assert.ok(catalogBuild >= 0, 'missing catalog build');
  assert.ok(killPool > catalogBuild, 'kill pool must run after catalog build');
  assert.match(dockerfile, /FROM node:24/);
  assert.match(dockerfile, /ENTRYPOINT/);
  assert.match(entrypoint, /server\/src\/index\.mjs/);
  assert.match(entrypoint, /chown -R "\$PUID:\$PGID"/);
  assert.match(entrypoint, /setpriv --reuid="\$PUID"/);
  assert.match(entrypoint, /PGID/);
  assert.match(dockerfile, /PUID=1000/);
  assert.match(dockerfile, /PGID=1000/);
  assert.doesNotMatch(dockerfile, /^USER node$/m);
});

test('runtime origin rendering validates and replaces static placeholders', async () => {
  assert.equal(normalizePublicOrigin('https://fitdle.example.com/'), 'https://fitdle.example.com');
  assert.throws(() => normalizePublicOrigin('ftp://fitdle.example.com'), /http/);
  assert.throws(() => normalizePublicOrigin('https://fitdle.example.com/?x=1'), /credentials/);
  assert.throws(() => normalizePublicOrigin('https://fitdle.example.com/path'), /without a path/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fitdle-origin-'));
  try {
    fs.mkdirSync(path.join(root, 'share', '3'), { recursive: true });
    fs.writeFileSync(path.join(root, 'index.html'), '<link href="__FITDLE_PUBLIC_ORIGIN__/">');
    fs.writeFileSync(path.join(root, 'share', '3', 'en.html'), '<meta content="__FITDLE_PUBLIC_ORIGIN__/">');
    const result = await renderRuntimeOrigin({ root, origin: 'https://fitdle.example.com/' });
    assert.equal(result.origin, 'https://fitdle.example.com');
    assert.equal(result.changed, 2);
    assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /https:\/\/fitdle\.example\.com\//);
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('__FITDLE_PUBLIC_ORIGIN__'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime game day start is written into the shipped manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fitdle-gameday-'));
  try {
    const file = path.join(root, 'data', 'manifest.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const built = { dataVersion: 'x', gameDayStartMinutes: 660, gameDayStartUtc: '11:00', downtimeUtcHour: 11, pad: 'p'.repeat(2048) };
    fs.writeFileSync(file, JSON.stringify(built));
    fs.writeFileSync(`${file}.br`, 'stale');
    fs.writeFileSync(`${file}.gz`, 'stale');
    assert.deepEqual(renderRuntimeGameDay({ root, value: undefined }), { minutes: 660, changed: false, warning: null });
    assert.equal(fs.readFileSync(`${file}.br`, 'utf8'), 'stale');
    const result = renderRuntimeGameDay({ root, value: '12:30' });
    assert.deepEqual(result, { minutes: 750, changed: true, warning: null });
    const written = fs.readFileSync(file);
    const manifest = JSON.parse(written);
    assert.equal(manifest.gameDayStartMinutes, 750);
    assert.equal(manifest.gameDayStartUtc, '12:30');
    assert.equal(manifest.downtimeUtcHour, 12);
    assert.equal(manifest.dataVersion, 'x');
    assert.ok(zlib.brotliDecompressSync(fs.readFileSync(`${file}.br`)).equals(written));
    assert.ok(zlib.gunzipSync(fs.readFileSync(`${file}.gz`)).equals(written));
    const bad = renderRuntimeGameDay({ root, value: 'noon', fallback: 660 });
    assert.equal(bad.minutes, 660);
    assert.equal(bad.changed, true);
    assert.match(bad.warning, /"noon".*using 11:00 UTC/);
    assert.equal(JSON.parse(fs.readFileSync(file)).gameDayStartUtc, '11:00');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Docker image, Compose and GHCR image publishing are wired', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const compose = fs.readFileSync(path.join(ROOT, 'compose.example.yml'), 'utf8');
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.match(dockerfile, /ARG PUBLIC_ORIGIN=__FITDLE_PUBLIC_ORIGIN__/);
  assert.match(dockerfile, /ENTRYPOINT \["\/app\/docker\/entrypoint\.sh"\]/);
  assert.match(dockerfile, /render-runtime-origin\.mjs/);
  assert.match(dockerfile, /VOLUME \["\/data"\]/);
  assert.match(compose, /env_file:\s*\n\s*- \.env/);
  assert.match(compose, /PUID: \$\{PUID:-1000\}/);
  assert.match(compose, /PGID: \$\{PGID:-1000\}/);
  assert.match(envExample, /^PUID=1000$/m);
  assert.match(envExample, /^PGID=1000$/m);
  assert.match(compose, /127\.0\.0\.1:8787:8787/);
  assert.match(compose, /fitdle-data:\/data/);
  assert.match(ci, /^  image:$/m);
  assert.match(ci, /IMAGE="ghcr\.io\//);
  assert.match(ci, /--build-arg "PUBLIC_ORIGIN=__FITDLE_PUBLIC_ORIGIN__"/);
  // Image builds test by default; only the CI jobs that follow `build` skip it.
  assert.match(dockerfile, /^ARG RUN_TESTS=1$/m);
  assert.match(dockerfile, /npm test && npm test --prefix server/);
  assert.ok(ci.includes('--build-arg "RUN_TESTS=0"'));
  assert.match(ci, /^  image-check:$/m);
  assert.match(ci, /push: false/);
  assert.match(ci, /api\/v1\/health/);
  assert.match(compose, /ghcr\.io\/steven-cmy\/fitdle/);
  assert.match(readme, /ghcr\.io\/steven-cmy\/fitdle/);
});

test('SDE API release and deployment checks are wired', () => {
  const checker = fs.readFileSync(path.join(ROOT, 'scripts', 'check-sde-cache.mjs'), 'utf8');
  const ciChecker = fs.readFileSync(path.join(ROOT, 'scripts', 'check-sde.mjs'), 'utf8');
  const sdeApi = fs.readFileSync(path.join(ROOT, 'scripts', 'sde-api.mjs'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(sdeApi, /sde\.evetech\.net/);
  assert.match(checker, /fetchLatestRelease/);
  assert.match(checker, /release/);
  assert.match(ciChecker, /SDE_RELEASE/);
  assert.match(ciChecker, /release/);
  assert.equal(pkg.scripts['check:sde-cache'], 'node scripts/check-sde-cache.mjs');
});

test('client reads cargo type names from the SDE record API', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.equal(main.includes('/universe/types'), false);
  assert.match(main, /manifest\?\.sde\?\.apiBase/);
  assert.match(main, /manifest\?\.sde\?\.release/);
  assert.match(main, /\/types\/\$\{encodeURIComponent\(id\)\}\.json/);
});

test('SDE preparation uses the HTTP API without zip or legacy fields', () => {
  const prepare = fs.readFileSync(path.join(ROOT, 'scripts', 'prepare-sde.mjs'), 'utf8');
  const sdeApi = fs.readFileSync(path.join(ROOT, 'scripts', 'sde-api.mjs'), 'utf8');
  assert.match(prepare, /fetchLatestRelease/);
  assert.match(prepare, /downloadRelease/);
  assert.match(prepare, /recordId\(o, 'typeID'\)/);
  assert.equal(prepare.includes('sde-jsonl.zip'), false);
  assert.equal(prepare.includes('extractArchive'), false);
  assert.equal(prepare.includes('spawnSync'), false);
  assert.equal(prepare.includes('_key'), false);
  assert.equal(prepare.includes('_value'), false);
  assert.match(sdeApi, /tables\?\.\[table\]\?\.jsonl\?\.url/);
  assert.match(sdeApi, /source: 'sde-api'/);
});

test('online daily uses the server target and direct room transport', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'js', 'api.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.match(main, /prepareAppTarget/);
  assert.match(main, /resolveOnlineTarget/);
  assert.match(api, /\/api\/v1\/online\/daily/);
  assert.match(MESSAGES.en['error.dailyUnavailableBody'], /authoritative time/);
  assert.match(MESSAGES.zh['error.dailyUnavailableBody'], /权威时间/);
  assert.match(css, /fatal-screen/);
});

test('reset countdown copy and source-specific error screens are localized', () => {
  assert.equal(MESSAGES.en['header.reset'], 'NEXT INTAKE');
  assert.equal(MESSAGES.zh['header.reset'], '下一批案卷');
  assert.equal(MESSAGES.en['end.next'], 'NEXT CLAIM');
  assert.equal(MESSAGES.zh['end.next'], '下一份案卷');
  for (const lang of Object.keys(MESSAGES)) {
    for (const key of [
      'error.timeTitle', 'error.timeBody',
      'error.zkillTitle', 'error.zkillBody',
      'error.esiTitle', 'error.esiBody',
      'error.noTargetCode', 'error.noTargetBody',
      'error.dailyLore', 'error.timeLore', 'error.zkillLore',
      'error.esiLore', 'error.noTargetLore', 'error.unknownHullLore',
      'error.genericLore', 'error.genericCode',
    ]) {
      assert.ok(MESSAGES[lang][key], `${lang} missing ${key}`);
    }
  }
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /dailyErrorCopy/);
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
  assert.ok(boot.eggs.every((egg) => ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh'].includes(egg.lang) && egg.text?.trim()));
});

test('claim groups carry department, memos and outcome debriefs', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'claim-departments.json'), 'utf8'));
  assert.deepEqual(Object.keys(data.departments).sort(), ['de', 'en', 'es', 'fr', 'ja', 'ko', 'ru', 'zh']);
  const expectedIds = [
    'salvage', 'hull', 'intake', 'fitting', 'wreck',
    'cargo', 'arbitration', 'compliance', 'alliance-srp',
    'clone', 'concord', 'courier',
  ];
  // Invented or non-EVE wording that must not come back.
  const banned = /SCC-9|航道|航路|항로|吊车|crane|Kranführer|grúa|grutier|クレーン|크레인|крановщик|印泥|模块|舰体|\bpecio|クレーム|클레임|фитинг/i;
  for (const [locale, departments] of Object.entries(data.departments)) {
    assert.deepEqual(departments.map((department) => department.id), expectedIds, `${locale} department ids`);
    for (const department of departments) {
      assert.ok(department.name?.trim(), `${locale}/${department.id} missing name`);
      assert.ok(Array.isArray(department.memos) && department.memos.length === 12, `${locale}/${department.id} needs memos`);
      assert.ok(Array.isArray(department.debriefs?.won) && department.debriefs.won.length === 6, `${locale}/${department.id} needs won debriefs`);
      assert.ok(Array.isArray(department.debriefs?.lost) && department.debriefs.lost.length === 6, `${locale}/${department.id} needs lost debriefs`);
      const copy = [...department.memos, ...department.debriefs.won, ...department.debriefs.lost];
      assert.ok(copy.every((text) => typeof text === 'string' && text.trim()), `${locale}/${department.id} empty copy`);
      assert.ok(copy.every((text) => !text.includes('{name}')), `${locale}/${department.id} leaked placeholder`);
      assert.equal(new Set(copy).size, copy.length, `${locale}/${department.id} repeats itself`);
      assert.doesNotMatch([department.name, ...copy].join('\n'), banned, `${locale}/${department.id} invented wording`);
      assert.doesNotMatch(copy.join('\n'), /stock market|loss mail|损失邮件|FC 仍在问/i, `${locale}/${department.id} legacy copy`);
    }
    const srp = departments.find((department) => department.id === 'alliance-srp');
    assert.ok(srp.memos.includes('Can I bring my Drake?'), `${locale} SRP Drake memo`);
    assert.ok(srp.memos.includes('FC wat do?'), `${locale} SRP FC memo`);
    if (locale === 'en') {
      assert.ok(srp.debriefs.lost.includes('No approval. Still asking the FC what to do.'));
    }
    if (locale === 'zh') {
      assert.ok(srp.debriefs.lost.includes('未通过。仍在问FC该怎么办。'));
      assert.ok(srp.memos.some((text) => text.includes('制式配置认为幼龙没问题')));
      assert.doesNotMatch(JSON.stringify(srp.debriefs), /幼龙级|Drake级/);
      assert.equal((JSON.stringify(srp).match(/Drake/g) || []).length, 1, 'Chinese Drake only in the fixed meme');
    }
    if (locale === 'ja' || locale === 'ko') {
      assert.equal((JSON.stringify(srp).match(/Drake/g) || []).length, 1, `${locale} Drake only in the fixed meme`);
    }
  }
});

test('claim selection keeps hero memo and debrief in the same KB group', () => {
  const departments = {
    en: [
      { id: 'salvage', name: 'Salvage', memos: ['a', 'b'], debriefs: { won: ['w1', 'w2'], lost: ['l1', 'l2'] } },
      { id: 'hull', name: 'Hull', memos: ['c', 'd'], debriefs: { won: ['w3'], lost: ['l3'] } },
    ],
  };
  const groups = claimGroups(departments, 'en');
  const seed = claimSeed({ killId: 424242, day: '2026-11-21' });
  const group = pickClaimGroup(groups, seed);
  assert.equal(pickClaimGroup(groups, seed), group);
  assert.ok(group.memos.includes(pickClaimMemo(group, seed)));
  assert.ok(group.debriefs.won.includes(pickClaimDebrief(group, 'won', seed)));
  assert.ok(group.debriefs.lost.includes(pickClaimDebrief(group, 'lost', seed)));
  assert.notEqual(pickClaimDebrief(group, 'won', seed), pickClaimDebrief(group, 'lost', seed));
  assert.equal(pickClaimGroup(groups, seed, 'hull').id, 'hull');
  assert.equal(pickClaimDebrief(group, 'playing', seed), '');
  assert.equal(pickClaimGroup([], seed), null);
});

test('boot screen shows the full system name and restores eggs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.match(html, />F\.I\.T\.D\.L\.E\.</);
  assert.match(html, /Fitting Identification, Testimony &amp; Damage Ledger Evaluation/);
  assert.match(html, /data-boot-logos/);
  assert.match(main, /void applyBootFlavor\(\)/);
  assert.match(main, /renderBootLogos\(\)/);
  assert.match(main, /Math\.random\(\) < 0\.05/);
  assert.match(main, /pickClaimDepartment\(\)/);
  assert.match(main, /loadClaimDepartments\(\)/);
  assert.match(css, /\.boot-fullname/);
  assert.match(css, /\.boot-logos/);
  const distHtml = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  assert.match(distHtml, /images\.evetech\.net\/corporations\/1000113\/logo/);
  assert.equal(distHtml.includes('__IMAGE_BASE__'), false);
});

test('topbar is full bleed and the dossier uses a default cursor', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  const photon = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  assert.match(css, /\.topbar\s*\{[^}]*width:\s*100%/);
  assert.match(css, /padding-inline:\s*max\(24px/);
  assert.match(photon, /\.dossier-panel,[\s\S]*?cursor:\s*default/);
  assert.match(photon, /\.dossier-panel \.attr-row\[data-mass-toggle\][\s\S]*?cursor:\s*pointer/);
});

test('login uses the official EVE SSO images and handbook uses the shared button', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const photon = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  assert.equal(
    manifest.images.eveSsoLoginSmall,
    'https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-small.png',
  );
  assert.equal(
    manifest.images.eveSsoLoginLarge,
    'https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-large.png',
  );
  assert.match(main, /eveSsoLoginSmall/);
  assert.match(main, /eveSsoLoginLarge/);
  assert.match(main, /eveSsoButton\('small'\)/);
  assert.match(main, /eveSsoButton\('large'\)/);
  assert.match(main, /class="button ghost topbar-help"/);
  assert.match(photon, /\.eve-sso-button img/);
  assert.match(photon, /\.topbar-actions \.button/);
});

test('typography uses the base font and rem sizing outside fixed exceptions', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  const photon = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  const mp = fs.readFileSync(path.join(ROOT, 'styles', 'mp.css'), 'utf8');
  assert.match(css, /--font-base:\s*var\(--font-ui\)/);
  assert.match(css, /body\s*\{[\s\S]*?font-size:\s*1rem/);
  assert.doesNotMatch(mp, /font-eve-new-display/);
  assert.match(photon, /\.site-footer,[\s\S]*?font-size:\s*8px/);
  assert.match(photon, /\.boot-fullname\s*\{[\s\S]*?font-size:\s*11px/);
  assert.match(photon, /\.microtype\s*\{[\s\S]*?font-size:\s*8px/);
  for (const [file, text] of [['app.css', css], ['photon.css', photon], ['mp.css', mp]]) {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!/^\s*font(?:-size)?\s*:/.test(line) || !line.includes('px')) continue;
      if (/^\s*html\[data-font-size/.test(line)) continue;
      assert.match(
        line,
        /font-size:\s*(8|9|11)px/,
        `${file}:${index + 1} has an unscaled functional font: ${line.trim()}`,
      );
    }
  }
});

test('hero wreck scan is a dossier plate with pixelated pre-reveal frames', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.match(main, /class="wreck-plate"/);
  assert.match(main, /wreck-plate-tab/);
  assert.match(main, /scan-corner/);
  assert.match(main, /size=32/);
  assert.match(main, /setInterval\(\(\) => \{[\s\S]*?4000\)/);
  assert.match(main, /ticks % 2 === 0/);
  assert.match(main, /1\.6 \+ Math\.random\(\) \* 0\.4/);
  assert.match(main, /Number\(ship\.id\) !== Number\(state\.answerId\)/);
  assert.match(main, /ended \? esc\(renderPath\(state\.answerId\)\) : ''/);
  assert.match(css, /\.radar\s*\{[\s\S]*?aspect-ratio:\s*1 \/ 1/);
  assert.doesNotMatch(css, /\.radar\s*\{[^}]*border-radius:\s*50%/);
  assert.match(css, /\.radar-visual img\s*\{[\s\S]*?object-fit:\s*cover/);
  assert.match(css, /\.radar-visual\.is-resolved img\s*\{[\s\S]*?object-fit:\s*cover/);
  assert.match(css, /@keyframes wreck-vertical-scan/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*?\.hero-radar\s*\{[\s\S]*?display:\s*flex/);
});

test('topbar controls, boot logo and claim logos share the new geometry', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  const photon = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  assert.match(css, /--topbar-control-height:\s*2\.25rem/);
  assert.match(css, /\.topbar-center\s*\{[\s\S]*?height:\s*auto/);
  assert.match(css, /\.topbar-center\s*\{[\s\S]*?min-height:\s*var\(--topbar-control-height\)/);
  assert.match(css, /\.icon-button\s*\{[\s\S]*?height:\s*var\(--topbar-control-height\)/);
  assert.match(css, /\.lang-select\s*\{[\s\S]*?height:\s*var\(--topbar-control-height\)/);
  assert.match(photon, /\.eve-sso-button img\s*\{[\s\S]*?height:\s*var\(--topbar-control-height\)/);
  assert.match(photon, /\.claim-mail-logo\s*\{[\s\S]*?width:\s*3\.35rem/);
  assert.match(photon, /\.claim-mail-logo\s*\{[\s\S]*?height:\s*3\.35rem/);
  assert.match(css, /\.boot-logos \.brand-emblem\s*\{[\s\S]*?width:\s*64px/);
  assert.match(css, /\.boot-logos \.brand-emblem\s*\{[\s\S]*?height:\s*64px/);
});

test('loading boot animation is visible in the Photon theme', () => {
  const photon = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  assert.match(photon, /\.boot-ring-a\s*\{[\s\S]*?animation:\s*spin/);
  assert.match(photon, /\.boot-core\s*\{[\s\S]*?animation:\s*boot-core-pulse/);
  assert.match(photon, /@keyframes boot-core-pulse/);
  assert.match(photon, /\.boot-ring-b,[\s\S]*?\.boot-cross\s*\{[\s\S]*?display:\s*none/);
});

test('legal notices include Pend, SCC and fan-work declarations', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /legalNotice\(state\.locale\)/);
  const files = [
    fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'NOTICE.md'), 'utf8'),
  ];
  for (const [index, text] of files.entries()) {
    for (const term of ['Pend Insurance', 'Secure Commerce Commission', 'Fenris Creations']) {
      assert.ok(text.includes(term), `legal file ${index} missing ${term}`);
    }
  }
  for (const locale of manifest.locales) {
    assert.ok(LEGAL_NOTICES[locale], `${locale} missing legal notice`);
    assert.ok(LEGAL_NOTICES[locale].includes('{site}'), `${locale} missing site placeholder`);
    assert.ok(LEGAL_NOTICES[locale].includes('Pend Insurance'), `${locale} missing Pend Insurance`);
    assert.ok(LEGAL_NOTICES[locale].includes('Secure Commerce Commission'), `${locale} missing SCC`);
    assert.ok(LEGAL_NOTICES[locale].includes('Fenris Creations'), `${locale} missing Fenris Creations`);
  }
});

test('avatars are square and fall back to the official ID 1 portrait', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  const appCss = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.equal(DEFAULT_PORTRAIT_ID, 1);
  assert.match(portraitUrl(1, 64, '/images'), /\/characters\/1\/portrait\?size=64/);
  const html = avatarHtml('Test Pilot', null, 64, 'pilot-avatar', '/images');
  assert.match(html, /characters\/1\/portrait/);
  assert.match(html, /data-fallback=/);
  assert.match(css, /\.avatar\s*\{[\s\S]*?border-radius:\s*0/);
  assert.match(appCss, /\.victim-portrait\s*\{[\s\S]*?border-radius:\s*0/);
});

test('Triglavian mode uses official names, logos and departments', () => {
  assert.equal(TRIGLAVIAN_FACTION_ID, 500026);
  assert.equal(TRIGLAVIAN_CONVOCATION_ID, 1000298);
  assert.equal(triglavianBrand('en').faction, 'Triglavian Collective');
  assert.equal(triglavianBrand('en').convocation, 'The Convocation of Triglav');
  assert.equal(triglavianBrand('zh').faction, '三神裔');
  assert.equal(triglavianBrand('zh').convocation, '三神避世会');
  const departments = triglavianDepartments('zh');
  assert.deepEqual(departments.map((department) => department.id), [
    'convocation', 'perun', 'svarog', 'veles', 'navka',
  ]);
  assert.equal(departments[1].name, '雷电裔演化枝');
  assert.equal(departments[2].name, '熔火裔演化枝');
  assert.equal(departments[3].name, '暗泽裔演化枝');
  assert.equal(departments[4].name, '纳夫卡主宰');
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /TRIGLAVIAN_FACTION_ID/);
  assert.match(main, /TRIGLAVIAN_CONVOCATION_ID/);
  assert.match(main, /triglavianDepartments/);
});

test('unplayed target cache, online audit and scan refinements are wired', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.match(main, /fitdle:v1:target-cache/);
  assert.match(main, /restoreCachedTarget/);
  assert.match(main, /freeKillId = free \?/);
  assert.match(main, /state\.appMode = online \? 'online' : 'practice'/);
  assert.doesNotMatch(main, /state\.appMode = 'practice';\s*\n\s*\}\s*\n\s*await resolvePracticeTarget/);
  assert.match(main, /spawnSalvageNoise/);
  assert.match(main, /Math\.random\(\) < 0\.14 \? 0 : 1 \+ Math\.floor\(Math\.random\(\) \* 10\)/);
  assert.match(css, /@keyframes salvage-flicker/);
  assert.match(css, /\.hero-radar\.resolved \.salvage-noise/);
  assert.match(css, /\.salvage-scanline::before\s*\{[\s\S]*?left:\s*0;[\s\S]*?width:\s*100%/);
  assert.match(css, /wreck-vertical-scan 20s/);
  assert.match(css, /salvage-scan 22s/);
  assert.match(css, /transition: opacity 2\.8s ease, transform 3\.2s ease/);
});

test('kill value starts unabridged and toggles compact', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  assert.match(main, /state\.kbValueCompact \? isk\(value\) : iskFull\(value\)/);
  assert.match(main, /data-kb-value-toggle="true"/);
  assert.match(main, /function toggleKillValueFormat\(\)/);
  assert.match(css, /\.attr-row\[data-kb-value-toggle\]\s*\{[\s\S]*?cursor:\s*pointer/);
  assert.match(MESSAGES.en['clue.kbValueToggle'], /killmail/i);
  assert.ok(MESSAGES.zh['clue.kbValueToggle'].length > 0);
});

test('manual is pure instructions and copyright with all modes', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const rooms = fs.readFileSync(path.join(ROOT, 'js', 'rooms.js'), 'utf8');
  assert.match(main, /help\.multiplayerBody/);
  assert.match(main, /help\.multiplayerFlowTitle/);
  assert.match(main, /help\.multiplayerRaceTitle/);
  assert.match(main, /help\.multiplayerArbitrationTitle/);
  assert.match(rooms, /help\.multiplayerRaceTitle/);
  assert.match(rooms, /help\.multiplayerArbitrationTitle/);
  // Multiplayer only lists what differs from solo play; the solo modes are not restated.
  assert.doesNotMatch(main + rooms, /help\.multiplayer(Standard|Audit|Timed|Ready)/);
  assert.match(main, /manual-section[\s\S]*manual-mode-block/);
  assert.match(rooms, /room-manual manual-section/);
  assert.match(rooms, /manual-mode-block/);
  assert.match(main, /mode\.helpNormal/);
  assert.match(main, /mode\.helpAudit/);
  assert.match(main, /mode\.helpTimed/);
  assert.match(main, /manual-legal/);
  assert.doesNotMatch(main, /data-action="reset-hold"/);
  assert.doesNotMatch(main, /function resetAllProgress/);
  for (const lang of Object.keys(MESSAGES)) {
    for (const key of [
      'help.multiplayerBody',
      'help.multiplayerFlowTitle',
      'help.multiplayerFlow',
      'help.multiplayerRaceTitle',
      'help.multiplayerRace',
      'help.multiplayerArbitrationTitle',
      'help.multiplayerArbitration',
    ]) assert.ok(MESSAGES[lang][key], `${lang} missing ${key}`);
    assert.ok(MESSAGES[lang]['help.multiplayerArbitration'].split('\n').length >= 6, `${lang} arbitration manual too short`);
    // The manual explains scoring in words: no coefficients or formulas.
    assert.doesNotMatch(MESSAGES[lang]['help.multiplayerArbitration'], /[0-9×÷=%]/, `${lang} arbitration manual shows numbers`);
    for (const key of [
      'room.roundScore',
      'room.arbitration.solveNow',
      'room.arbitration.endBonus',
      'room.arbitration.endBonusResult',
      'room.feed.arbSolved',
      'room.error.clue-weight-required',
    ]) assert.ok(MESSAGES[lang][key], `${lang} missing ${key}`);
  }
});

test('pilot menu and display menu replace manual utilities', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  assert.match(main, /id="pilot-menu"/);
  assert.match(main, /data-action="pilot-menu"/);
  assert.match(main, /pilot-menu-logout/);
  assert.match(main, /id="appearance-menu"/);
  assert.match(main, /data-action="toggle-font-face"/);
  assert.match(css, /\.pilot-menu(?:,|\s*\{)/);
  assert.match(css, /\.modal-close\s*\{[\s\S]*?color:\s*var\(--photon-danger\)/);
});

test('debrief payout is zero on failure and counts up on success', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  assert.match(main, /data-debrief-payout/);
  assert.match(main, /function animateDebriefPayout/);
  assert.match(main, /function debriefPayoutAmount/);
  assert.match(main, /state\.status !== 'won'\) return 0/);
  assert.match(main, /end\.insurancePayout/);
  assert.match(main, /iskFull/);
  assert.match(main, /platinumPayout/);
  assert.match(css, /\.debrief-payout/);
  assert.doesNotMatch(css, /\.debrief-payout\.is-void strong\s*\{[\s\S]*?line-through/);
  for (const lang of Object.keys(MESSAGES)) {
    assert.ok(MESSAGES[lang]['end.insurancePayout']);
  }
});

test('gear, daily reset and clue-reveal scan are wired', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const appCss = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  const photon = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  const icons = fs.readFileSync(path.join(ROOT, 'js', 'icons.js'), 'utf8');
  assert.match(icons, /settings:/);
  assert.match(main, /icon\('settings'\)/);
  assert.match(photon, /\.daily-reset-cta\.is-ready/);
  assert.match(main, /function dailyResetReady/);
  assert.match(main, /dailyButton\.classList\.toggle\('is-ready'/);
  assert.match(main, /aria-disabled="\$\{dailyResetReady\(\)/);
  assert.match(main, /targetGameDay/);
  assert.match(main, /clue-reveal-scan/);
  assert.match(appCss, /\.hero-radar\.is-clue-scanning \.salvage-scanline/);
  assert.match(appCss, /@keyframes clue-scan/);
  assert.match(main, /function playClueScan/);
});

test('department memos and debriefs are seeded from one KB group', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /function claimDebriefForStatus/);
  assert.match(main, /pickClaimGroup\(pool, selectionSeed/);
  assert.match(main, /pickClaimMemo\(chosen, selectionSeed\)/);
  assert.match(main, /claimDebrief \|\| body/);
  assert.doesNotMatch(main, /claimDebriefMemo/);
});

test('Platinum payout uses ESI insurance prices', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /insurance\/prices/);
  assert.match(main, /function platinumPayout/);
  assert.match(main, /insuranceLoaded/);
  assert.match(main, /platinumPayout\(state\.answerShip\?\.id\)/);
  assert.doesNotMatch(main, /const payout = targetKillValue/);
});

test('release removes legacy runtime and keeps package versions aligned', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const game = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  const buildEnv = fs.readFileSync(path.join(ROOT, 'scripts', 'build-env.mjs'), 'utf8');
  const rooms = fs.readFileSync(path.join(ROOT, 'js', 'rooms.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'package.json'), 'utf8'));
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.equal(pkg.version, serverPkg.version);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.match(pkg.engines.node, />=24/);
  assert.equal(main.includes('MP_BRIDGE'), false);
  assert.equal(main.includes('isMpBridge'), false);
  assert.equal(main.includes('mp-watch-hint'), false);
  assert.equal(main.includes('captureUrlLocale'), false);
  assert.equal(game.includes('beaconRoundForStart'), false);
  assert.equal(buildEnv.includes('DEFAULT_DRAND'), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'js', 'mp', 'messages.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'docs', 'screenshot-abyss.png')), false);
  assert.equal(rooms.includes("searchParams.set('share', 'room')"), false);
  assert.match(changelog, /^## v1\.0\.0$/m);
});

test('every locale provides the same message keys', () => {
  const keys = Object.keys(MESSAGES.en).sort();
  for (const locale of manifest.locales) {
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), keys, `${locale} key set differs`);
    assert.ok(LEGAL_NOTICES[locale]?.includes('{site}'), `${locale} legal site placeholder`);
    for (const term of ['Pend Insurance', 'Secure Commerce Commission', 'Fenris Creations']) {
      assert.ok(LEGAL_NOTICES[locale].includes(term), `${locale} legal missing ${term}`);
    }
    assert.ok(MESSAGES[locale]['help.sharedRules'].length > 20);
  }
  assert.ok(MESSAGES.en['clue.losses90'].includes('Losses'));
  assert.ok(MESSAGES.zh['clue.losses90'].includes('损失'));
  assert.ok(MESSAGES.en['cat.economy'].includes('90'));
  assert.ok(MESSAGES.zh['cat.economy'].includes('90'));
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
  // Only a masked online run drops them: its statistics are the service's snapshot.
  const masked = main.slice(main.indexOf('function installMaskedTarget'), main.indexOf('/** A local board behind the room lobby'));
  assert.equal(main.replace(masked, '').includes('state.liveStats = null;'), false);
  const puzzle = fs.readFileSync(path.join(ROOT, 'server', 'src', 'puzzle.mjs'), 'utf8');
  assert.match(puzzle, /zkill\.get\(`\/api\/stats\/shipTypeID\/\$\{Number\(shipId\)\}\/`\)/);
  assert.match(puzzle, /const stats = givenStats === undefined \? await liveStats\(ship\.id\) : givenStats;/);
});

test('the empty-hull setting is read, sent to the service and not overridden', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'js', 'api.js'), 'utf8');
  const runs = fs.readFileSync(path.join(ROOT, 'server', 'src', 'runs.mjs'), 'utf8');
  assert.ok(main.includes('state.allowEmptyKb = readAllowEmptyKb();'));
  assert.equal(main.includes('state.allowEmptyKb = true;'), false, 'boot must not override the saved setting');
  assert.ok(main.includes('api.start(route.gameplay, state.allowEmptyKb)'));
  assert.ok(api.includes('body: { gameplay, allowEmpty }'));
  assert.ok(runs.includes('request.body?.allowEmpty !== false'));
  assert.ok(main.includes('cached target is an empty hull'));
});

test('the daily claim and rooms ignore the personal empty-hull setting', () => {
  const targets = fs.readFileSync(path.join(ROOT, 'server', 'src', 'targets.mjs'), 'utf8');
  const serviceDaily = targets.slice(targets.indexOf('async function createDailyPin'), targets.indexOf('const dailyLocks'));
  assert.equal(serviceDaily.match(/allowEmpty: config\.dailyAllowEmpty,/g)?.length, 1, 'the deployment setting decides the service daily');
  assert.equal(serviceDaily.includes('allowEmpty: true'), false);
  const rooms = fs.readFileSync(path.join(ROOT, 'server', 'src', 'rooms.mjs'), 'utf8');
  assert.ok(rooms.includes('roomTarget(room, match.gameplay)'));
  assert.ok(rooms.includes("roomTarget(room, 'audit')"));
  assert.ok(rooms.includes('allowEmpty: room.settings?.allowEmpty !== false,'));
});

test('API caching and builder cache policies are wired', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /statsCacheEntry/);
  assert.match(main, /kill:\$\{killId\}/);
  assert.match(main, /free-page:\$\{shipId\}:\$\{page\}/);
  assert.match(main, /FREE_PAGE_CACHE_MS/);
  assert.match(main, /user_agent/);
  assert.match(main, /data\/module-fallback\.json/);
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /normalizedVersion/);
  assert.match(ci, /!= "3"/);
  assert.match(ci, /fitdle-build-v6/);
});

test('unknown hull killmail shows a localized back-navigation error', () => {
  for (const locale of manifest.locales) {
    for (const key of ['error.unknownHullTitle', 'error.unknownHullBody', 'error.back']) {
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
  assert.match(MESSAGES.en['mode.helpAudit'], /simulated/);
  assert.doesNotMatch(MESSAGES.en['mode.helpAudit'], /\+1|equipment clues|half/i);
  assert.match(MESSAGES.en['mode.helpFree'], /random target/);
  assert.match(MESSAGES.zh['mode.helpFree'], /随机/);
  assert.match(MESSAGES.en['mode.helpTimed'], /on a schedule/);
  assert.doesNotMatch(MESSAGES.en['mode.helpTimed'], /30 seconds|batch/i);
  assert.match(MESSAGES.en['help.sharedRules'], /Six attempts/);
  assert.doesNotMatch(MESSAGES.en['help.sharedRules'], /candidate hulls|weight|queue/i);
  assert.match(MESSAGES.en['help.sharedRules'], /unlimited attempts in Timed/);
  assert.match(MESSAGES.en['help.sharedRules'], /Only Standard shows/);
  for (const lang of Object.keys(MESSAGES)) {
    assert.ok(MESSAGES[lang]['help.onlineBody']?.length > 20, `${lang} manual misses online runs`);
  }
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /t\('help\.onlineBody'\)/);
});

test('catalog is SDE-only, complete, and references official data lazily', () => {
  assert.equal(catalog.length, 430);
  assert.equal(manifest.counts.catalog, catalog.length);
  assert.equal(manifest.downtimeUtcHour, 11);
  assert.ok(manifest.auditAnswerPool.length > manifest.answerPool.length);
  assert.equal(new Set(manifest.auditAnswerPool).size, manifest.answerPool.length);
  for (const id of manifest.answerPool) assert.ok(manifest.auditAnswerPool.includes(id));
  assert.ok(manifest.killPool.length > 0);
  assert.equal(new Set(manifest.killPool.map((entry) => entry.killmail_id)).size, manifest.killPool.length);
  assert.ok(manifest.auditKillPool.length >= manifest.killPool.length);
  for (const entry of manifest.killPool) assert.ok(catalog.some((ship) => ship.id === entry.ship_id));
  assert.ok(new Set(manifest.killPool.map((entry) => entry.ship_id)).size < manifest.killPool.length);
  assert.equal(manifest.killShipPool.length, new Set(manifest.killShipPool).size);
  assert.ok(manifest.killShipPool.length >= new Set(manifest.killPool.map((entry) => entry.ship_id)).size);
  assert.ok(manifest.normalShipPool.length >= manifest.killShipPool.length);
  assert.ok(manifest.auditKillShipPool.length >= manifest.killShipPool.length);
  for (const shipId of manifest.killShipPool) assert.ok(catalog.some((ship) => ship.id === shipId));
  assert.equal(manifest.counts.modules, Object.keys(refs.modules).length);
  assert.ok(refs.modules[3186]?.chargeGroups?.includes(377));
  assert.deepEqual(refs.modules[2048]?.resistLayers, { shield: true, armor: true, structure: true });
  assert.deepEqual(refs.modules[2281]?.resistLayers, { shield: true, armor: false, structure: false });
  assert.deepEqual(refs.modules[11642]?.resistLayers, { shield: false, armor: true, structure: false });
  assert.equal(refs.modules[202]?.resistLayers, null);
  assert.equal(refs.modules[47257]?.assaultDamageControl, true);
  const auditFallback = Object.values(manifest.moduleFallbacks || {}).find((entry) => entry && typeof entry === 'object');
  assert.ok(auditFallback);
  assert.ok(Object.values(auditFallback).some((candidates) => Array.isArray(candidates) && candidates.length));
  for (const [auditId, entry] of Object.entries(manifest.moduleFallbacks || {})) {
    const source = refs.modules[auditId];
    if (!source) continue;
    for (const candidates of Object.values(entry)) {
      for (const representative of Array.isArray(candidates) ? candidates : [candidates]) {
        assert.equal(refs.modules[representative]?.groupID, source.groupID, `${auditId} borrowed ${representative}`);
      }
    }
  }
  assert.ok(manifest.images.baseUrl);
  assert.ok(manifest.zkillboard.baseUrl);
  assert.ok(manifest.links.repo);
  assert.ok(manifest.sde.buildNumber);
  assert.ok(manifest.sde.release);
  assert.equal(manifest.sde.apiBase, 'https://sde.evetech.net/tranquility');
  assert.match(manifest.zkillboard.snapshot, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(manifest.timeSource);
  assert.equal(manifest.links.eveDocs, 'https://developers.eveonline.com/static-data/');
  assert.ok(manifest.links.glossary);
  assert.ok(manifest.moduleFallbacks['47804'], 'audit modules need a T2/faction fallback');
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
      rankings: { recent: { all: {
        metrics: { shipsLost: 123, shipsDestroyed: 45 },
        ranks: { shipsDestroyed: 20 },
      } } },
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
  assert.equal(usage?.v, 5);
  assert.equal(usage?.missing, undefined);
  assert.equal(built.clues.find((clue) => clue.k === 'losses90')?.v, 123);
  assert.equal(built.clues.find((clue) => clue.k === 'danger')?.v, 26.8);
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

test('zkillboard usage rank falls back to last place and kill value uses the target kill', () => {
  const ship = catalog.find((entry) => entry.bonuses?.en?.length > 1);
  const losses = [
    { ...makeLosses()[0], killmail_id: 1001, zkb: { totalValue: 111 } },
    { ...makeLosses()[0], killmail_id: 1002, zkb: { totalValue: 222 } },
  ];
  const built = buildClues({
    ship,
    catalog,
    refs,
    stats: {
      rankings: { recent: { all: {
        metrics: { shipsLost: 4, shipsDestroyed: 2 },
        ranks: {},
      } } },
    },
    losses,
    targetKillId: 1002,
    dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  assert.equal(built.clues.find((clue) => clue.k === 'usageRank')?.v, 100);
  assert.equal(built.clues.find((clue) => clue.k === 'usageRank')?.missing, undefined);
  assert.equal(built.clues.find((clue) => clue.k === 'losses90')?.v, 4);
  assert.equal(built.clues.find((clue) => clue.k === 'danger')?.v, 33.3);
  assert.equal(built.clues.find((clue) => clue.k === 'kbValue')?.v, 222);
});

test('audit simulation keeps one propulsion module and marks cloaks', () => {
  const items = [
    { flag: 19, item_type_id: 12052, quantity_destroyed: 1 }, // 50MN MWD
    { flag: 20, item_type_id: 12066, quantity_destroyed: 1 }, // 100MN AB
    { flag: 27, item_type_id: 11577, quantity_destroyed: 1 }, // cloak
    { flag: 11, item_type_id: 1405, quantity_destroyed: 1 },
  ];
  const kept = auditSimulationItems(items, refs);
  assert.deepEqual(kept.map((item) => item.item_type_id), [12066, 1405]);
  const sameSize = auditSimulationItems([
    { flag: 19, item_type_id: 12052, quantity_destroyed: 1 },
    { flag: 20, item_type_id: 12058, quantity_destroyed: 1 },
  ], refs);
  assert.deepEqual(sameSize.map((item) => item.item_type_id), [12052]);
  assert.ok(propulsionPriority(refs.modules[12066])[0] > propulsionPriority(refs.modules[12052])[0]);

  const ship = catalog.find((entry) => entry.id === 54732);
  const built = buildClues({
    ship,
    catalog,
    refs,
    stats: null,
    losses: [{
      killmail_id: 1003,
      victim: {
        ship_type_id: 54732,
        items: [
          { flag: 27, item_type_id: 54748, quantity_destroyed: 1 },
          { flag: 11, item_type_id: 54975, quantity_destroyed: 1 },
          { flag: 28, item_type_id: 11577, quantity_destroyed: 1 },
        ],
      },
    }],
    dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
    mode: 'audit',
  });
  const tuning = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 54975);
  assert.ok(tuning && tuning.w >= 7.4, `expected Vorton tuning weight >= 7.4, got ${tuning?.w}`);
  const cloak = built.clues.find((clue) => clue.k === 'equipment' && clue.v.module === 11577);
  assert.ok(cloak?.tags?.includes('cloak'));
});

test('audit clues simulate fittings and delay identity reveals', () => {
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
    mode: 'audit',
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

test('assault damage control raises audit structure resist weight', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const build = (moduleId) => buildClues({
    ship, catalog, refs, stats: null,
    losses: [{ killmail_id: 7, zkb: { totalValue: 1000 }, victim: { items: [
      { flag: 12, item_type_id: moduleId, quantity_destroyed: 1, quantity_dropped: 0 },
    ] } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'audit',
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

test('standard defense clues use a wider matching range than audit', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const build = (mode) => buildClues({
    ship, catalog, refs, stats: null, losses: [], dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode,
  }).clues.find((clue) => clue.k === 'shield');
  const standard = build(undefined);
  const audit = build('audit');
  assert.equal(standard.range, STANDARD_DEFENSE_RANGE);
  assert.equal(audit.range, undefined);
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
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'audit',
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

test('audit weather boosts non-uniform structure resists', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const build = (structureResists) => buildClues({
    ship, catalog, refs, stats: null,
    losses: [{ killmail_id: 77, zkb: { totalValue: 1000 }, victim: { items: [] } }],
    dateKey: '2026-11-14', dataVersion: manifest.dataVersion, mode: 'audit',
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

test('officer, audit and PLEX items expose their own markers', () => {
  const battleship = catalog.find((entry) => entry.groupID === 27);
  const officer = Object.entries(refs.modules).find(([, module]) => Number(module.metaGroupID) === 5);
  const audit = Object.entries(refs.modules).find(([, module]) => Number(module.metaGroupID) === 15);
  assert.ok(officer && audit);
  const losses = [{
    killmail_id: 424251,
    zkb: { totalValue: 1000 },
    victim: {
      items: [
        { flag: 27, item_type_id: Number(officer[0]), quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 28, item_type_id: Number(audit[0]), quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 5, item_type_id: 44992, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  }];
  const built = buildClues({
    ship: battleship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const officerClue = built.clues.find((clue) => clue.v?.module === Number(officer[0]));
  const auditClue = built.clues.find((clue) => clue.v?.module === Number(audit[0]));
  const plexClue = built.clues.find((clue) => clue.v?.module === 44992);
  assert.ok(officerClue.tags.includes('officer'));
  assert.ok(auditClue.tags.includes('audit'));
  assert.ok(plexClue.tags.includes('plex'));
});

test('audit fallback picks the nearest meta of the same module variant', () => {
  const officerRepair = Object.entries(refs.modules).find(([, module]) => (
    module.groupID === 62 && Number(module.metaGroupID) === 5
  ));
  assert.ok(officerRepair);
  const equipment = [
    { module: 49738, slot: 'low' },
    { module: Number(officerRepair[0]), slot: 'low' },
  ];
  const fallbacks = selectAuditFallbacks(equipment, refs, manifest.moduleFallbacks);
  const ballistic = fallbacks.get(49738);
  assert.ok(ballistic);
  assert.equal(refs.modules[ballistic].groupID, 367);
  assert.equal(Number(refs.modules[ballistic].metaGroupID), 5);

  const repairFallbacks = selectAuditFallbacks([
    { module: 47777, slot: 'low' },
    { module: 18973, slot: 'low' },
  ], refs, manifest.moduleFallbacks);
  const repair = repairFallbacks.get(47777);
  assert.ok(repair);
  assert.equal(refs.modules[repair].groupID, 62);
  assert.equal(Number(refs.modules[repair].metaLevel), 16);
  assert.notEqual(repair, 19035);

  const entropicFallbacks = selectAuditFallbacks([
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

test('audit weights start from base stats and drop when fitted values change', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const losses = [{ killmail_id: 424250, zkb: { totalValue: 1000 }, victim: { items: [] } }];
  const normal = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion,
  });
  const audit = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode: 'audit',
    fittedAttrs: { ...ship.attrs, mass: ship.attrs.mass + 5000000 },
  });
  const normalMass = normal.clues.find((clue) => clue.k === 'mass');
  const auditMass = audit.clues.find((clue) => clue.k === 'mass');
  assert.notEqual(auditMass.v, normalMass.v);
  assert.ok(auditMass.w < normalMass.w);
  const normalTech = normal.clues.find((clue) => clue.k === 'tech');
  const auditTech = audit.clues.find((clue) => clue.k === 'tech');
  assert.equal(auditTech.w, normalTech.w);

  const skillOnly = buildClues({
    ship, catalog, refs, stats: null, losses, dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode: 'audit',
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

test('audit multi-clue reveals mix equipment and attributes', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: makeLosses(), dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode: 'audit',
  });
  const getShip = (id) => catalog.find((entry) => entry.id === id);
  const initial = computeRevealed({
    clues: built.clues, catalog, guesses: [], status: 'playing', answerId: ship.id,
    mode: 'audit', locale: 'en', getShip, answerBonuses: ship.bonuses.en, answer: ship,
  });
  const revealed = computeRevealed({
    clues: built.clues, catalog, guesses: [999999, 999998], status: 'playing', answerId: ship.id,
    mode: 'audit', locale: 'en', getShip, answerBonuses: ship.bonuses.en, answer: ship,
  });
  const added = [...revealed].filter((index) => !initial.has(index));
  assert.ok(added.length >= 2);
  const equipment = added.filter((index) => built.clues[index].k === 'equipment').length;
  assert.ok(equipment > 0 && equipment < added.length, 'multi-reveal should mix equipment and attributes');
});

test('audit falls back to other clues when there is no equipment', () => {
  const ship = catalog.find((entry) => entry.id === 587);
  const built = buildClues({
    ship, catalog, refs, stats: null, losses: [], dateKey: '2026-11-14',
    dataVersion: manifest.dataVersion, mode: 'audit',
  });
  const getShip = (id) => catalog.find((entry) => entry.id === id);
  const initial = computeRevealed({
    clues: built.clues, catalog, guesses: [], status: 'playing', answerId: ship.id,
    mode: 'audit', locale: 'en', getShip, answerBonuses: ship.bonuses.en, answer: ship,
  });
  const revealed = computeRevealed({
    clues: built.clues, catalog, guesses: [999999, 999998], status: 'playing', answerId: ship.id,
    mode: 'audit', locale: 'en', getShip, answerBonuses: ship.bonuses.en, answer: ship,
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

  const auditInitial = compute([], 'audit');
  const auditOne = compute([999999], 'audit');
  const auditTwo = compute([999999, 999998], 'audit');
  assert.ok(auditInitial.size >= 2 && auditInitial.size <= 7);
  assert.ok(auditOne.size >= auditInitial.size && auditOne.size <= auditInitial.size + 5);
  assert.ok(auditTwo.size >= auditOne.size && auditTwo.size <= auditInitial.size + 9);
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

test('Pend branding, claim copy and official corporation logos are wired', () => {
  assert.equal(MESSAGES.en['brand.parent'], 'PEND INSURANCE');
  assert.equal(MESSAGES.zh['brand.parent'], '彭德保险');
  assert.equal(MESSAGES.zh['brand.claimDivision'], '理赔评估处');
  assert.equal(MESSAGES.zh['brand.scc'], '商业安全委员会');
  assert.equal(`${MESSAGES.zh['brand.parent']} // ${MESSAGES.zh['brand.scc']}`, '彭德保险 // 商业安全委员会');
  assert.equal(MESSAGES.en['brand.scc'], 'SECURE COMMERCE COMMISSION');
  // Official corporation names (SDE npcCorporations 1000113 and 1000132).
  assert.deepEqual(['ja', 'ko', 'de', 'ru'].map((l) => MESSAGES[l]['brand.parent']), ['ペンド保険会社', '펜드 보험사', 'PEND INSURANCE', 'PEND INSURANCE']);
  assert.deepEqual(['de', 'es', 'fr', 'ja', 'ko', 'ru'].map((l) => MESSAGES[l]['brand.scc']), [
    'SECURE COMMERCE COMMISSION', 'COMISIÓN DE COMERCIO SEGURO', 'SECURE COMMERCE COMMISSION', '通商保護委員会', '안전무역위원회', 'SECURE COMMERCE COMMISSION',
  ]);
  assert.equal(MESSAGES.en['app.subtitle'], 'PEND INSURANCE // CLAIMS ASSESSMENT');
  for (const locale of manifest.locales) {
    assert.ok(MESSAGES[locale]['brand.scc'], `${locale} missing brand.scc`);
  }
  assert.equal(MESSAGES.en['mode.audit'], 'AUDIT');
  assert.equal(MESSAGES.zh['mode.audit'], '审计');
  assert.equal(MESSAGES.en['gameplay.arbitration'], 'ARBITRATION');
  assert.equal(MESSAGES.zh['gameplay.arbitration'], '仲裁复核');
  for (const locale of manifest.locales) {
    for (const key of ['claim.from', 'claim.to', 'claim.subject', 'claim.status', 'claim.file', 'claim.disclaimer']) {
      assert.ok(MESSAGES[locale][key], `${locale} missing ${key}`);
    }
  }
  assert.equal(PEND_INSURANCE_ID, 1000113);
  assert.equal(SCC_ID, 1000132);
  const logo = brandLogoHtml({ baseUrl: '/images', size: 256, className: 'test-logo', alt: 'Pend' });
  assert.match(logo, /\/images\/corporations\/1000113\/logo\?size=256/);
  assert.match(logo, /brand-emblem/);
  const mark = fitdleMark();
  assert.match(mark, /<svg/);
  assert.equal(mark.includes('PI'), false);
  assert.equal(mark.toLowerCase().includes('pend'), false);
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(FITDLE_SYSTEM_LONG, /F\.I\.T\.D\.L\.E\./);
  assert.match(main, /claimDivision/);
  assert.match(main, /brandText\('brand\.parent'\)/);
  assert.match(main, /brandText\('brand\.scc'\)/);
  assert.match(main, /brandSub\.textContent = .*brandText\('brand\.parent'\).*brandText\('brand\.scc'\)/);
  assert.doesNotMatch(main, /F\.I\.T\.D\.L\.E\. \/\/ \$\{brandText\('brand\.claimDivision'\)\}/);
  assert.match(main, /fitdleMark\(\)/);
  assert.match(main, /claim-mail-logos/);
  assert.match(main, /PEND_INSURANCE_ID/);
  assert.match(main, /SCC_ID/);
  assert.equal(main.includes('footer-compliance'), false);
});

test('new URLs use claim instead of gameplay', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.equal(main.includes("searchParams.set('gameplay'"), false);
  assert.equal(main.includes("params.get('gameplay')"), false);
  assert.match(main, /searchParams\.set\('claim'/);
});

test('interface copy keeps to official EVE wording', () => {
  // Wordings that differ from the official term of that language.
  const unofficial = {
    zh: /舰体|货仓|公司|角色加成|模块|(?<!铁骑)舰载机|传感器强度|击杀邮件|发牌员|彭德保险集团/,
    de: /Konzern|Hochslot|Lowslot|Fitting|Hülle|Dealer/i,
    es: /\bpecio|armadura|\brig\b|powergrid|[Kk]illmail/i,
    fr: /fitting|châssis|killmail|escaladé/i,
    ja: /クレーム|企業|同盟|オフィサー|キルメール|ロールボーナス|フィッティング/,
    ko: /클레임|화물칸|오피서|킬메일/,
    ru: /фитинг|\bслот|капаситор|ки[л]+мейл/i,
  };
  for (const [locale, pattern] of Object.entries(unofficial)) {
    for (const [key, text] of Object.entries(MESSAGES[locale])) assert.doesNotMatch(text, pattern, `${locale} ${key}`);
  }
  for (const locale of manifest.locales) {
    for (const [key, text] of Object.entries(MESSAGES.en)) {
      const vars = (value) => (value.match(/\{\w+\}/g) || []).sort();
      assert.deepEqual(vars(MESSAGES[locale][key]), vars(text), `${locale} ${key} placeholders`);
    }
  }
  for (const locale of manifest.locales) {
    assert.equal(triglavianDepartments(locale).every((department) => department.memos.length >= 2), true, locale);
    if (locale !== 'en') assert.notEqual(triglavianBrand(locale).helpIntro, triglavianBrand('en').helpIntro, locale);
  }
});

test('legacy mode names are absent from authored UI copy', () => {
  const files = [
    'index.html',
    'js/main.js',
    'js/i18n.js',
    'js/messages/en.js',
    'js/messages/zh.js',
    'README.md',
  ];
  for (const file of files) {
    // The module badge names the official Abyssal meta group, not a mode.
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^ {2}'dossier\.audit(?:Hint)?': .*$/gm, '');
    assert.doesNotMatch(text, /abyss|Abyss|ABYSS|pvp|PvP|PVP|深渊|试炼场/, `${file} still contains a legacy mode name`);
  }
});

test('web branding assets and boot easter eggs are complete', () => {
  const iconSizes = {
    'favicon-16.png': [16, 16],
    'favicon-32.png': [32, 32],
    'apple-touch-icon.png': [180, 180],
    'icon-192.png': [192, 192],
    'icon-512.png': [512, 512],
    'icon-maskable-512.png': [512, 512],
  };
  for (const [name, [width, height]] of Object.entries(iconSizes)) {
    const file = path.join(ROOT, 'assets', 'brand', name);
    const png = fs.readFileSync(file);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), width, `${name} width`);
    assert.equal(png.readUInt32BE(20), height, `${name} height`);
  }
  const ico = fs.readFileSync(path.join(ROOT, 'assets', 'brand', 'favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'favicon.ico type');
  assert.ok(ico.readUInt16LE(4) >= 2, 'favicon.ico contains multiple sizes');

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'brand', 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.icons.length, 3);
  assert.ok(manifest.icons.some((entry) => entry.purpose === 'maskable'));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const href of [
    'assets/brand/favicon.svg',
    'assets/brand/favicon-32.png',
    'assets/brand/favicon-16.png',
    'assets/brand/apple-touch-icon.png',
    'assets/brand/site.webmanifest',
  ]) assert.ok(html.includes(href), `missing ${href}`);
  assert.equal(fs.existsSync(path.join(ROOT, 'assets', 'brand', 'options')), false);

  const flavor = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'boot-flavor.json'), 'utf8'));
  const expected = {
    en: 'My Raven was equipped with the following:',
    de: 'Meine Raven verfügte über folgende Ausstattung:',
    es: 'Mi Raven estaba equipada con lo siguiente:',
    fr: 'Mon Raven était équipé comme suit :',
    ja: 'マイレイブンに搭載されていた装備は以下のとおり。',
    ko: '레이븐의 장비는 아래와 같습니다:',
    ru: 'На моем корабле Raven было установлено следующее оборудование:',
    zh: '我的乌鸦级装配如下：',
  };
  for (const [lang, text] of Object.entries(expected)) {
    assert.ok(flavor.eggs.some((egg) => egg.lang === lang && egg.text === text), `${lang} boot egg`);
  }
});

test('markers use Photon popups instead of native title tooltips', () => {
  for (const file of ['js/main.js', 'js/rooms.js', 'js/mp/clue-view.js']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, / title="/, `${file} contains a native title tooltip`);
  }
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const rooms = fs.readFileSync(path.join(ROOT, 'js', 'rooms.js'), 'utf8');
  const clueView = fs.readFileSync(path.join(ROOT, 'js', 'mp', 'clue-view.js'), 'utf8');
  assert.match(main, /data-tip="\$\{esc\(t\('dossier\.signal'\)\)\}/);
  assert.match(main, /data-tip="\$\{esc\(badge\.hint\)\}"/);
  assert.match(rooms, /data-tip="\$\{esc\(this\.t\('room\.host'\)\)\}"/);
  assert.match(rooms, /data-tip="\$\{esc\(this\.t\('room\.holdToKick'\)\)\}"/);
  assert.match(clueView, /data-tip="\$\{esc\(t\('dossier\.signal'\)\)\}/);
});

test('online finish refreshes the pilot profile record', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /async function refreshProfileStats\(\)/);
  assert.match(main, /if \(run\.completed\) void refreshProfileStats\(\)/);
  assert.match(main, /state\.profileStats = await api\.stats\(\)/);
  assert.match(main, /pilot-menu-record/);
});

test('locale changes preserve the current KB and speed radar frames', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.match(main, /function loadLocaleData\(locale, \{ keepLive = false, keepAnswer = false \} = \{\}\)/);
  assert.match(main, /await loadLocaleData\(nextLocale, \{ keepLive: true, keepAnswer: true \}\)/);
  assert.match(main, /if \(keepAnswer && state\.answerData\) \{/);
  assert.match(main, /function localizeAnswerData\(\)/);
  assert.match(main, /bonusEntries: ship\.bonusEntries \|\| state\.answerData\.bonusEntries/);
  const localizeStart = main.indexOf('function localizeAnswerData()');
  const localizeEnd = main.indexOf('async function loadLocaleData', localizeStart);
  const localizeBody = main.slice(localizeStart, localizeEnd);
  assert.doesNotMatch(localizeBody, /clues:/);
  assert.doesNotMatch(localizeBody, /revealPlan:/);
  assert.doesNotMatch(localizeBody, /revealSeed:/);
  const restoreStart = main.indexOf('function restoreLocaleTarget(snapshot)');
  const restoreEnd = main.indexOf('function restoreLocaleKb(snapshot)', restoreStart);
  assert.doesNotMatch(main.slice(restoreStart, restoreEnd), /buildAnswerData\(\)/);
  assert.match(main, /function localeTargetSnapshot\(\)/);
  assert.match(main, /function localeTargetChanged\(snapshot\)/);
  assert.match(main, /function restoreLocaleTarget\(snapshot\)/);
  assert.match(main, /function restoreLocaleKbValue\(snapshot\)/);
  assert.match(main, /restoreLocaleKbValue\(targetSnapshot\)/);
  assert.match(main, /restoreLocaleKb\(targetSnapshot\)/);
  assert.match(main, /if \(ticks % 2 === 0\) cycle\(\)/);
  assert.match(main, /\}, 2400\);/);
  assert.match(css, /--manual-heading: #f2a63b/);
  assert.match(css, /--manual-heading: #ff9b5e/);
  assert.match(css, /\.manual-section h3\s*\{[^}]*color:\s*var\(--manual-heading\)/);
  assert.doesNotMatch(css, /\.manual-section h3\s*\{[^}]*color:\s*var\(--amber\)/);
});

test('faction display fonts are local and wired to hero and settlement links', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  for (const file of [
    'cinzel-amarr-latin.woff2',
    'iceberg-caldari-latin.woff2',
    'afacad-flux-gallente-latin.woff2',
    'space-mono-minmatar-latin.woff2',
  ]) {
    const font = path.join(ROOT, 'assets', 'fonts', file);
    assert.ok(fs.existsSync(font), `missing ${file}`);
    assert.ok(fs.statSync(font).size > 1000, `empty ${file}`);
    assert.ok(css.includes(`assets/fonts/${file}`), `${file} not in CSS`);
  }
  assert.match(main, /500003: 'amarr'/);
  assert.match(main, /500001: 'caldari'/);
  assert.match(main, /500004: 'gallente'/);
  assert.match(main, /500002: 'minmatar'/);
  assert.match(main, /function heroTitleFaction\(ship\)/);
  assert.match(main, /function zkillShipLink\(text, id, faction = ''\)/);
  assert.match(main, /data-faction="\$\{esc\(faction\)\}"/);
  assert.match(main, /zkillShipLink\(displayName\(state\.answerShip\), state\.answerId\)/);
  assert.match(main, /zkillShipLink\(displayName\(ship\), ship\.id, heroTitleFaction\(ship\)\)/);
  assert.match(main, /zkillShipLink\(displayName\(ship\), state\.answerId\)/);
  assert.match(css, /--font-amarr: "Cinzel"/);
  assert.match(css, /--font-caldari: "Iceberg"/);
  assert.match(css, /--font-gallente: "Afacad Flux"/);
  assert.match(css, /--font-minmatar: "Space Mono"/);
  assert.match(css, /\.hero h1\[data-faction="amarr"\],[\s\S]*?\.zkb-item-link\[data-faction="amarr"\]/);
  assert.match(css, /font-family: var\(--font-amarr\)/);
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

test('dist ships matching compressed copies for text assets but never for HTML', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  const files = walk(path.join(ROOT, 'dist'));
  assert.equal(files.some((file) => /\.html\.(br|gz)$/.test(file)), false);
  for (const file of ['js/main.js', 'styles/app.css', 'data/catalog.json', 'data/refs/en.json', 'vendor/dogma-engine/sde.dat']) {
    const source = path.join(ROOT, 'dist', file);
    const raw = fs.readFileSync(source);
    assert.ok(zlib.brotliDecompressSync(fs.readFileSync(`${source}.br`)).equals(raw), `${file}.br`);
    assert.ok(zlib.gunzipSync(fs.readFileSync(`${source}.gz`)).equals(raw), `${file}.gz`);
  }
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'data', 'manifest.json'), 'utf8')),
    manifest,
  );
});

test('per-language catalogs match the complete catalog for rules and displayed text', () => {
  const texts = (ship, locale) => [
    ship.names,
    ship.descriptions?.[locale] || ship.descriptions?.en || '',
    ship.bonuses?.[locale] || ship.bonuses?.en || [],
    (ship.bonusEntries || []).map((entry) => [
      entry.text?.[locale] || entry.text?.en || '',
      entry.skill?.[locale] || entry.skill?.en || '',
    ]),
  ];
  const rules = (ship) => {
    const { descriptions, bonuses, bonusEntries, ...rest } = ship;
    return {
      ...rest,
      bonusEntries: (bonusEntries || []).map(({ text, skill, ...entry }) => entry),
    };
  };
  const fullSize = fs.statSync(path.join(ROOT, 'data', 'catalog.json')).size;
  for (const locale of manifest.locales) {
    const file = path.join(ROOT, 'dist', 'data', 'catalog', `${locale}.json`);
    const ships = JSON.parse(fs.readFileSync(file, 'utf8')).ships;
    assert.ok(fs.statSync(file).size < fullSize / 2, `${locale} catalog is not split`);
    assert.deepEqual(ships.map(rules), catalog.map(rules), `${locale} rules data`);
    assert.deepEqual(
      ships.map((ship) => texts(ship, locale)),
      catalog.map((ship) => texts(ship, locale)),
      `${locale} text`,
    );
  }
});

test('runtime image ships what the server needs without recursive chown layers', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
  const entrypoint = fs.readFileSync(path.join(ROOT, 'docker', 'entrypoint.sh'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(runtime.includes('ln -s dist/vendor /app/vendor'), 'server-side dogma engine');
  assert.equal(runtime.includes('chown -R'), false);
  for (const file of ['catalog.json', 'manifest.json', 'search.json', 'module-fallback.json', 'refs/en.json']) {
    assert.ok(runtime.includes(`/app/data/${file}`), file);
  }
  // `npm run build` recreates data/, so the usage file is taken from .cache.
  assert.ok(runtime.includes('--from=build /app/.cache/ship-usage.json ./data/ship-usage.json'));
  assert.doesNotMatch(dockerfile, /\/app\/data\/ship-usage\.json|cp \.cache\/ship-usage\.json/);
  assert.equal(entrypoint.includes('/app/dist'), false, 'dist ownership is not rewritten at start');
  assert.ok(entrypoint.indexOf('render-runtime-origin.mjs') < entrypoint.indexOf('exec setpriv'));
  assert.equal(readme.includes('location /ws {'), false);
  assert.ok(readme.includes('location ~ ^/api/v1/rooms/[^/]+/ws$ {'));
});

test('dist references every script and stylesheet with one shared version', () => {
  assert.equal(
    versionImports("import { a } from './a.js';\nimport './b.js';\nconst c = import('../x/c.js');\nconst t = 'from ./no.js';", '9'),
    "import { a } from './a.js?v=9';\nimport './b.js?v=9';\nconst c = import('../x/c.js?v=9');\nconst t = 'from ./no.js';",
  );
  assert.equal(versionHtml('<link rel="stylesheet" href="styles/a.css">', '9'), '<link rel="stylesheet" href="styles/a.css?v=9">');
  const dist = path.join(ROOT, 'dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const version = /js\/main\.js\?v=([\w.-]+)"/.exec(html)?.[1];
  assert.ok(version, 'versioned entry');
  assert.equal([...html.matchAll(/href="styles\/[^"]+\.css\?v=([\w.-]+)"/g)].length, 3);
  assert.doesNotMatch(html, /href="styles\/[^"?]+\.css"|src="js\/[^"?]+\.js"/);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
  });
  let imports = 0;
  for (const file of walk(path.join(dist, 'js'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(/^(?:import|export)[^;]*?from '(\.{1,2}\/[^']+)';/gms)) {
      const [target, query] = specifier.split('?');
      imports += 1;
      assert.equal(query, `v=${version}`, `${path.basename(file)} -> ${specifier}`);
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), specifier);
    }
  }
  assert.ok(imports > 25, `${imports} imports checked`);
});

test('API contact is optional, validated and never shipped with the repository', () => {
  assert.equal(buildUserAgent({ version: '1.2.3', repo: 'https://x.test/r' }), 'FITDLE/1.2.3 (+https://x.test/r)');
  assert.equal(buildUserAgent({ version: '1.2.3', repo: 'https://x.test/r', contact: 'ops@example.test' }), 'FITDLE/1.2.3 (ops@example.test; +https://x.test/r)');
  assert.equal(buildUserAgent(), 'FITDLE/dev');
  assert.equal(
    buildUserAgent({ version: '1', site: 'https://play.example.com', repo: 'https://x.test/r' }),
    'FITDLE/1 (+https://play.example.com; +https://x.test/r)',
  );
  const site = (url) => publicSite(new URL(url));
  assert.equal(site('https://play.example.com/?claim=daily&kb=secret#x'), 'https://play.example.com');
  assert.equal(site('http://play.example.com:8443/'), 'http://play.example.com:8443');
  for (const url of ['http://127.0.0.1:4173/', 'http://localhost:8787/', 'http://10.0.0.5/', 'http://[::1]:8787/', 'http://tower/', 'http://tower.local/', 'http://nas.lan/', 'file:///x/index.html']) {
    assert.equal(site(url), '', url);
  }
  assert.equal(publicSite(undefined), '');
  assert.ok(fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8').includes('site: publicSite(location)'));
  assert.equal(parseContact('  ops@example.test '), 'ops@example.test');
  assert.equal(parseContact(undefined), '');
  for (const bad of ['a\r\nX-Evil: 1', 'a) b', '邮箱', 'x'.repeat(101), 'a;b']) assert.throws(() => parseContact(bad), /API_CONTACT/);
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.match(example, /^API_CONTACT=$/m);
  assert.match(example, /^API_CONTACT_PUBLIC=0$/m);
});

test('a race round keeps its answer on the service until the part ends', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const rooms = fs.readFileSync(path.join(ROOT, 'js', 'rooms.js'), 'utf8');
  const slice = (from, to) => main.slice(main.indexOf(from), main.indexOf(to, main.indexOf(from) + from.length));
  const prepare = slice('async function prepareEndlessRound(message)', '\n}\n');
  // No target, killmail or clue set reaches the page before the end; the board comes from the room.
  assert.ok(prepare.includes('installMaskedTarget({'));
  for (const local of ['installTarget(', 'buildClues(', 'calculateDogmaFit(', 'message.target', 'message.clues']) {
    assert.equal(prepare.includes(local), false, local);
  }
  assert.ok(slice('function applyMaskedGuess(shipId)', '\n}\n').includes('state.roomSurface?.sendGuess(state.roomEndless.roundId, shipId);'));
  assert.ok(slice('async function pollMaskedRun()', '\n}\n').includes('state.roomSurface?.requestBoard(state.roomEndless.roundId);'));
  // A resumed start carries no guesses; the board keeps the ones it has.
  assert.ok(slice('function raceRun(message)', '\n}\n').includes('guesses: message.guesses || state.guesses,'));
  // The socket names its protocol; a refused page asks for a reload.
  assert.ok(rooms.includes('&v=${PROTOCOL_VERSION}'));
  assert.ok(rooms.includes("if (reason === 'client-outdated') {"));
});

test('an online run keeps its answer on the service until it ends', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'js', 'api.js'), 'utf8');
  const slice = (from, to) => main.slice(main.indexOf(from), main.indexOf(to, main.indexOf(from) + from.length));
  // Every online request names the run protocol; a refused page asks for a reload.
  assert.ok(api.includes("if (path.startsWith('/api/v1/online/')) headers[RUN_PROTOCOL_HEADER] = String(RUN_PROTOCOL_VERSION);"));
  assert.ok(main.includes("<div class=\"fatal-code\">${esc(t('error.outdatedCode'))}</div>"));
  // A masked target has no hull, kill or killmail on the page and nothing goes to zKillboard.
  const install = slice('function installMaskedTarget(run)', '\n}\n');
  for (const field of ['answerKillmail', 'answerId', 'answerKillId', 'answerShip']) assert.ok(install.includes(`state.${field} = null;`), field);
  assert.ok(install.includes('state.liveFetched = true;'), 'no live zKill lookup');
  assert.ok(main.includes('if (!keepLive && !isMasked()) await fetchAnswerLive();'));
  assert.ok(main.includes("if (usesSimulatedFit() && !online) preloadDogma();"));
  // The answer is only taken from an ended run.
  const reveal = slice('function revealOnlineAnswer(run)', '\n}\n');
  assert.ok(reveal.includes('const target = run.target;'));
  assert.ok(slice('function applyMaskedRun(run)', '\n}\n').includes('if (ended) {'));
  // Guesses are judged by the service; nothing of the board is stored locally.
  assert.ok(slice('function applyMaskedGuess(shipId)', '\n}\n').includes('runSync?.guess('));
  assert.ok(slice('function persist()', '\n}\n').includes('if (isMasked()) {'));
  assert.ok(slice('function cacheCurrentTarget()', '\n}\n').includes('if (isMasked()) return;'));
  // The claim file number comes from the service, not from the killmail.
  assert.ok(slice('function claimFileId()', '\n}\n').includes('onlineBoard()?.caseId'));
  // Timed: the service's clock releases clues and ends the run; giving up waits for it.
  assert.ok(slice('function updateTimedClock()', '\n}\n').includes('void pollMaskedRun();'));
  const giveUp = slice('function giveUpTimed()', '\n}\n');
  assert.ok(giveUp.includes('void runSync?.lose(state.onlineRun.runId, elapsed);'));
  assert.ok(giveUp.indexOf('state.pendingEnd = true;') < giveUp.indexOf("state.status = 'lost';"));
});
