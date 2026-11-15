import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ATTEMPT_LIMIT,
  INITIAL_REVEAL,
  DOWNTIME_HOUR_UTC,
  buildSearchIndex,
  buildGuessResult,
  dateKeyFromLocation,
  dailyAnswerIndex,
  gameDateKey,
  isValidDateKey,
  loadState,
  loadStats,
  modeFromLocation,
  msUntilNextDowntime,
  msUntilNextUtcMidnight,
  newlyRevealedFor,
  pickDailyAnswer,
  profileSimilarity,
  recordResult,
  resultGrid,
  revealCountFor,
  saveState,
  searchShips,
  shareUrl,
  utcDateKey,
} from '../js/game.js';
import { buildClues, clueMatchesShip, EQUIPMENT_SLOT_ORDER, getEquipment, selectAbyssFallbacks } from '../js/clues.js';
import { computeRevealed } from '../js/reveal.js';
import { MESSAGES, resolveLocale } from '../js/i18n.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'manifest.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8')).ships;
const refs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'refs', 'en.json'), 'utf8'));

function makeLosses() {
  return [{
    killmail_id: 424242,
    zkb: { totalValue: 12345678 },
    victim: {
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
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(isValidDateKey('2024-02-29'), true);
  assert.equal(msUntilNextUtcMidnight(new Date('2026-11-14T23:59:30Z')), 30000);
  assert.equal(msUntilNextDowntime(new Date('2026-11-14T10:30:00Z')), 30 * 60 * 1000);
  assert.equal(msUntilNextDowntime(new Date('2026-11-14T11:00:00Z')), 24 * 60 * 60 * 1000);
  assert.equal(modeFromLocation('?mode=abyss'), 'abyss');
  assert.equal(modeFromLocation('?mode=normal'), 'normal');
  assert.equal(dateKeyFromLocation('?d=bad', new Date('2026-11-14T12:00:00Z')).invalid, true);
  const beforeDowntime = dateKeyFromLocation('?d=2026-11-14', new Date('2026-11-14T10:59:00Z'));
  assert.equal(beforeDowntime.invalid, true);
  assert.equal(beforeDowntime.date, '2026-11-13');
  const future = dateKeyFromLocation('?d=2026-11-15', new Date('2026-11-14T12:00:00Z'));
  assert.equal(future.invalid, true);
  assert.equal(future.date, '2026-11-14');
});

test('daily answer is deterministic, language-independent and includes special hulls', () => {
  const pool = manifest.answerPool;
  assert.equal(pool.length, catalog.length);
  assert.deepEqual(pool, [...pool].sort((a, b) => a - b));
  const first = pickDailyAnswer(pool, '2026-11-14', manifest.dataVersion);
  assert.equal(first, pickDailyAnswer(pool, '2026-11-14', manifest.dataVersion));
  const other = pickDailyAnswer(pool, '2026-11-15', manifest.dataVersion);
  assert.ok(first && other);
  const special = catalog.filter((ship) => [29, 31, 237].includes(ship.groupID));
  assert.ok(special.some((ship) => ship.groupID === 29), 'capsules must be selectable');
  assert.ok(special.some((ship) => ship.groupID === 31), 'shuttles must be selectable');
  assert.ok(special.some((ship) => ship.groupID === 237), 'corvettes must be selectable');
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
    .filter((index) => (built.clues[index].k === 'equipment') === equipment).length;
  const zero = run([]);
  const one = run([wrong]);
  const two = run([wrong, wrong]);
  assert.equal(count(one, true) - count(zero, true), 1);
  assert.equal(count(one, false) - count(zero, false), 1);
  assert.equal(count(two, true) - count(one, true), 2);
  assert.equal(count(two, false) - count(one, false), 1);

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
  assert.equal(otherDelta, 2);
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

test('ship search results follow tech, class, race and faction order', () => {
  const ships = [
    { id: 1, names: { en: 'Aardvark' }, techLevel: 2, groupID: 1, raceID: 1, factionID: 1 },
    { id: 2, names: { en: 'Badger' }, techLevel: 1, groupID: 2, raceID: 1, factionID: 2 },
    { id: 3, names: { en: 'Cormorant' }, techLevel: 1, groupID: 1, raceID: 2, factionID: 1 },
  ];
  const index = buildSearchIndex(ships, {});
  assert.deepEqual(
    searchShips(index, 'a', { limit: 10 }).map((ship) => ship.id),
    [3, 2, 1],
  );
  const localized = buildSearchIndex(ships, { 1: 'Zeta', 2: 'Alpha' }, { locale: 'de' });
  assert.deepEqual(
    searchShips(localized, 'a', { limit: 10 }).map((ship) => ship.id),
    [2, 3, 1],
  );
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

test('share URLs and result grids are spoiler-safe', () => {
  const url = shareUrl({ href: 'https://example.test/fitdle/index.html?d=2026-11-01&lang=de#x' }, '2026-11-14', 'normal', 'won', 3);
  assert.equal(url, 'https://example.test/fitdle/share/3/en.html?d=2026-11-14&mode=normal&lang=en');
  assert.equal(new URL(url).origin, 'https://example.test');
  const abyssUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, '2026-11-14', 'abyss', 'won', 4, 'zh-Hant');
  assert.equal(abyssUrl, 'https://example.test/fitdle/share/4/zh.html?d=2026-11-14&mode=abyss&lang=zh');
  const lostUrl = shareUrl({ href: 'https://example.test/fitdle/index.html' }, '2026-11-14', 'abyss', 'lost', 6, 'de');
  assert.equal(lostUrl, 'https://example.test/fitdle/share/lost/de.html?d=2026-11-14&mode=abyss&lang=de');
  assert.ok(url.includes('lang=en'));
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
  }
});

test('every locale provides the same message keys', () => {
  const keys = Object.keys(MESSAGES.en).sort();
  for (const locale of manifest.locales) {
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), keys, `${locale} key set differs`);
    assert.ok(MESSAGES[locale]['footer.copyright'].includes('gitlab.com/cmy/fitdle'));
    assert.ok(MESSAGES[locale]['help.sharedRules'].length > 20);
    assert.ok(!MESSAGES[locale]['help.step4'].includes('UTC'));
  }
});

test('all Chinese locale variants resolve to Simplified Chinese', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh-HK', 'zh-SG']) {
    assert.equal(resolveLocale(tag), 'zh');
  }
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
  assert.ok(manifest.links.eveDocs);
  assert.ok(manifest.links.glossary);
  assert.ok(manifest.moduleFallbacks['47804'], 'abyssal modules need a T2/faction fallback');
  for (const ship of catalog) {
    assert.ok(ship.id && ship.names?.en);
    assert.ok(ship.attrs && Number.isFinite(ship.attrs.speed));
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
  for (const clue of built.clues) assert.ok(clue.w >= 1 && clue.w <= 10);
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
  assert.equal(built.clues.filter((clue) => clue.k === 'bonus').some((clue) => clue.w === 10), true);
  const opening = built.clues.slice(0, 3);
  assert.equal(opening.some((clue) => clue.k === 'race' || clue.k === 'group' || clue.k === 'bonus'), false);
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
  assert.equal(byKind('cargo').c, 'fitting');
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
  assert.ok(initial.size >= 2 && initial.size <= 7, 'initial reveal is threshold-driven');
  const initialStatic = [...initial]
    .map((index) => built.clues[index])
    .filter((clue) => ['identity', 'hull', 'slots', 'nav', 'defense', 'fitting'].includes(clue.c));
  const candidates = catalog.filter((entry) => initialStatic.every((clue) => clueMatchesShip(clue, entry)));
  assert.ok(candidates.length >= 6, 'opening must keep a usable candidate set');

  const sameGroup = catalog.find((entry) => entry.groupID === ship.groupID && entry.id !== ship.id);
  assert.ok(sameGroup, 'expected another hull in the same class');
  const shared = compute([sameGroup.id]);
  const newlyMatched = [...shared]
    .filter((index) => !initial.has(index))
    .map((index) => built.clues[index])
    .filter((clue) => ['identity', 'hull', 'slots', 'nav', 'defense', 'fitting'].includes(clue.c));
  assert.ok(newlyMatched.length > 0, 'matching guesses should reveal shared static clues');

  const afterUnknown = compute([999999]);
  const added = [...afterUnknown].filter((index) => !initial.has(index));
  assert.ok(added.every((index) => built.clues[index].k === 'equipment'));
  assert.ok(added.length >= 1, 'normal misses should release equipment');

  const abyssInitial = compute([], 'abyss');
  const abyssOne = compute([999999], 'abyss');
  const abyssTwo = compute([999999, 999998], 'abyss');
  assert.ok(abyssInitial.size >= 2 && abyssInitial.size <= 7);
  assert.ok(abyssOne.size >= abyssInitial.size && abyssOne.size <= abyssInitial.size + 2);
  assert.ok(abyssTwo.size >= abyssOne.size && abyssTwo.size <= abyssInitial.size + 5);
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
