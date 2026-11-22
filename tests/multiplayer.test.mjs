import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  RANK_POINTS, rankPoints, raceRoundScores, raceTargetReached, rankPlayers,
  arbitrationRoundScores, unpublishedWeight, score,
  ROOM_SCORE_PER_KB, endlessRoundScore, allocatePlayerRoundScores,
} from '../js/mp/rules.js';
import {
  clueForWire, decodeMessage, encodeMessage, normalizeName, RateLimiter,
  sanitizeChatText, sanitizeName, sanitizeText, validClueForWire, validName,
} from '../js/mp/protocol.js';
import { pickDealerRound, pickRaceTarget, KbUnavailableError } from '../js/mp/target.js';
import { renderClueList } from '../js/mp/clue-view.js';
import { avatarInitials, avatarHtml, portraitUrl } from '../js/avatar.js';
import { shortPilotId, sortLocalPlayers } from '../js/rooms.js';
import { MESSAGES } from '../js/i18n.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8')).ships;
const refsEn = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'refs', 'en.json'), 'utf8'));

const manifest = {
  zkillboard: { baseUrl: 'https://example.test' },
  normalShipPool: [670, 670, 670],
  auditKillShipPool: [670],
  clueVersion: 5,
  images: { baseUrl: 'https://images.example.test' },
};

function fittedKill(killId = 4242, shipId = 670) {
  return {
    killmail_id: killId,
    killmail_time: '2026-11-01T00:00:00Z',
    zkb: { totalValue: 1234567 },
    victim: {
      ship_type_id: shipId,
      items: [
        { flag: 27, item_type_id: 2048, quantity_destroyed: 1, quantity_dropped: 0 },
        { flag: 19, item_type_id: 5973, quantity_destroyed: 1, quantity_dropped: 0 },
      ],
    },
  };
}

function mockFetch({ failPage = false, failKill = false } = {}) {
  return async (url) => {
    const failure = { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
    if (String(url).includes('/api/losses/shipTypeID/')) {
      if (failPage) return failure;
      return { ok: true, json: async () => [fittedKill()] };
    }
    if (String(url).includes('/api/killID/')) {
      if (failKill) return failure;
      return { ok: true, json: async () => [fittedKill()] };
    }
    throw new Error(`unexpected URL ${url}`);
  };
}

test('endless scores use 3000 points and integer arbitration buckets', () => {
  assert.equal(ROOM_SCORE_PER_KB, 3000);
  assert.equal(endlessRoundScore({ status: 'won', attempts: 1 }), 3000);
  assert.equal(endlessRoundScore({ status: 'won', attempts: 2 }), 2500);
  assert.equal(endlessRoundScore({ status: 'won', attempts: 6 }), 500);
  assert.equal(endlessRoundScore({ status: 'won', attempts: 7 }), 0);
  assert.equal(endlessRoundScore({ status: 'lost', attempts: 6 }), 0);

  const clues = [
    { w: 10 }, { w: 20 }, { w: 70 },
  ];
  const players = ['a', 'b'];
  const allocated = allocatePlayerRoundScores({ clues, players, rounds: 6, x: 3000 });
  const allScores = Object.values(allocated.scores).flat(2);
  assert.equal(allScores.reduce((sum, value) => sum + value, 0), 3000);
  assert.ok(allScores.every((value) => Number.isInteger(value) && value >= 0));
  assert.deepEqual(allocated.budgets.a, [250, 250, 250, 250, 250, 250]);

  const one = allocatePlayerRoundScores({ clues, players: ['a'], rounds: 6, x: 3000 });
  assert.equal(one.scores.a[0].reduce((sum, value) => sum + value, 0), 500);
  assert.equal(one.scores.a[0][0], 50);
});

test('multiplayer rank points and race scoring follow finish order', () => {
  assert.deepEqual(RANK_POINTS, [10, 8, 6, 4, 2, 1, 1, 1]);
  assert.equal(rankPoints(1), 10);
  assert.equal(rankPoints(4), 4);
  assert.equal(rankPoints(9), 1);
  assert.equal(rankPoints(0), 0);

  const active = ['a', 'b', 'c'];
  const results = [
    { playerId: 'c', status: 'solved', at: 20 },
    { playerId: 'a', status: 'solved', at: 10 },
    { playerId: 'b', status: 'lost', at: 15 },
  ];
  const { scores, ranks } = raceRoundScores(active, results);
  assert.deepEqual(ranks, { a: 1, c: 2 });
  assert.deepEqual(scores, { a: 10, b: 0, c: 8 });
  assert.equal(raceTargetReached(scores, 10), true);
  assert.equal(raceTargetReached(scores, 11), false);
});

test('race ranking ignores spectators and breaks ties deterministically', () => {
  const { ranks, scores } = raceRoundScores(['a', 'b', 'c'], [
    { playerId: 'c', status: 'solved', at: 5 },
    { playerId: 'b', status: 'solved', at: 5 },
    { playerId: 'a', status: 'solved', at: 5 },
  ]);
  assert.deepEqual(ranks, { a: 1, b: 2, c: 3 });
  assert.deepEqual(scores, { a: 10, b: 8, c: 6 });

  const ranked = rankPlayers(
    [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    { a: 8, b: 8 },
    { a: 2, b: 1 },
  );
  assert.equal(ranked[0].id, 'a');
});

test('dealer scoring uses published weight and locked unpublished snapshots', () => {
  const clues = [
    { w: 10 }, { w: 8 }, { w: 6 }, { w: 4 }, { w: 2 },
  ];
  const published = [0, 1];
  const result = arbitrationRoundScores({
    clues,
    publishedIndices: published,
    solves: [
      { playerId: 'a', snapshot: 20 },
      { playerId: 'b', snapshot: 10 },
    ],
  });
  assert.equal(result.totalWeight, 30);
  assert.equal(result.publishedWeight, 18);
  assert.equal(result.unpublishedWeight, 12);
  assert.equal(result.dealerScore, 18);
  assert.deepEqual(result.playerScores, { a: 10, b: 5 });
  assert.equal(result.correctCount, 2);

  const noCorrect = arbitrationRoundScores({ clues, publishedIndices: published, solves: [] });
  assert.equal(noCorrect.dealerScore, 18);
  assert.deepEqual(noCorrect.playerScores, {});

  assert.equal(unpublishedWeight(clues, [0, 1, 2, 3, 4]), 0);
  assert.equal(score(2.6), 3);
});

test('protocol validates messages, names, text and rate limits', () => {
  const raw = encodeMessage({ v: 1, t: 'hello', name: 'Pilot' });
  assert.deepEqual(decodeMessage(raw), { v: 1, t: 'hello', name: 'Pilot' });
  assert.equal(decodeMessage('{not json'), null);
  assert.equal(decodeMessage('{"v":2,"t":"hello"}'), null);
  assert.equal(decodeMessage('{"v":1,"t":"unknown"}'), null);
  assert.equal(decodeMessage('null'), null);

  assert.equal(sanitizeName('  A\u0000B  '), 'A B');
  assert.equal(normalizeName('  Naga  '), 'naga');
  assert.equal(validName('A'), false);
  assert.equal(validName('Pilot One'), true);
  assert.equal(sanitizeText('x'.repeat(200)).length, 120);
  assert.equal(sanitizeChatText(' First line\r\nsecond\tline '), 'First line\nsecond line');
  assert.equal(sanitizeChatText('a\n\nb'), 'a\n\nb');
  assert.equal(sanitizeChatText('\u0001bad\u0002'), 'bad');

  const limiter = new RateLimiter({ messages: 2, guesses: 1, windowMs: 1000 });
  assert.equal(limiter.allow('p', 'message', 0), true);
  assert.equal(limiter.allow('p', 'message', 1), true);
  assert.equal(limiter.allow('p', 'message', 2), false);
  assert.equal(limiter.allow('p', 'guess', 3), true);
  assert.equal(limiter.allow('p', 'guess', 4), false);
});

test('dealer wire clues never carry the answer or the full clue set', () => {
  const clue = {
    i: 3,
    k: 'bonus',
    c: 'traits',
    v: 1,
    w: 7.5,
    tags: ['limited'],
    bonusKey: 'secret',
    termKey: 'secret',
    text: { en: 'bonus', zh: '加成' },
    shipId: 670,
    killmail_id: 4242,
    names: { en: 'Naga' },
  };
  const wire = clueForWire(clue);
  assert.deepEqual(Object.keys(wire).sort(), ['c', 'i', 'k', 'tags', 'text', 'v', 'w']);
  assert.equal(validClueForWire(wire), true);
  assert.equal(JSON.stringify(wire).includes('Naga'), false);
  assert.equal(JSON.stringify(wire).includes('4242'), false);
  assert.equal(validClueForWire({ i: 1, k: 'bonus', c: 'traits', w: 2 }), false);
});

test('race target acquisition fetches a real fitted killmail and never falls back', async () => {
  const target = await pickRaceTarget({
    manifest,
    mode: 'standard',
    fetchImpl: mockFetch(),
  });
  assert.equal(target.killId, 4242);
  assert.equal(target.shipId, 670);
  assert.equal(target.killmail.victim.ship_type_id, 670);

  await assert.rejects(
    () => pickRaceTarget({ manifest, mode: 'standard', fetchImpl: mockFetch({ failPage: true }) }),
    (error) => error instanceof KbUnavailableError,
  );
  await assert.rejects(
    () => pickRaceTarget({ manifest, mode: 'standard', fetchImpl: mockFetch({ failKill: true }) }),
    (error) => error instanceof KbUnavailableError,
  );
});

test('dealer round builds clues locally and exposes only wire clues', async () => {
  const round = await pickDealerRound({
    manifest,
    catalog,
    refsEn,
    fetchImpl: mockFetch(),
  });
  assert.equal(round.killId, 4242);
  assert.ok(round.clues.length > 10);
  assert.ok(round.clues.every((clue) => Number.isInteger(clue.i)));
  const wire = clueForWire(round.clues[0]);
  assert.ok(wire);
  assert.equal('shipId' in wire, false);
});

test('dealer clue renderer uses the shared attr-row markup and weights', () => {
  const ctx = {
    t: (key) => MESSAGES.en[key] || key,
    refs: refsEn,
    locale: 'en',
    int: (n) => String(Math.round(Number(n) || 0)),
    dec: (n, digits) => Number(n || 0).toFixed(digits || 1),
    compact: (n) => String(n || 0),
    isk: (n) => `${n || 0} ISK`,
    percent: (n) => String(n || 0),
  };
  const clues = [
    { i: 0, k: 'group', c: 'hull', v: 25, w: 6 },
    { i: 1, k: 'lowSlots', c: 'slots', v: 4, w: 4 },
  ];
  const html = renderClueList(clues, ctx, { published: new Set([0, 1]), dealer: false });
  assert.match(html, /attr-row cat-hull/);
  assert.match(html, /Frigate/);
  assert.match(html, /class="weight"/);
  assert.equal(html.includes('data-publish'), false);
});

test('multiplayer messages cover all eight locales', () => {
  const keys = Object.keys(MESSAGES.en).sort();
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh']) {
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), keys, locale);
    assert.ok(MESSAGES[locale]['room.chatUnavailable']);
    assert.ok(MESSAGES[locale]['mp.dealer.publish']);
    for (const key of ['room.title', 'room.chatPlaceholder', 'mode.multiplayer', 'status.unscoredHelp', 'mode.dailyReason']) {
      assert.ok(MESSAGES[locale][key], `${locale} missing ${key}`);
    }
  }
  assert.notEqual(MESSAGES.zh['room.title'], MESSAGES.en['room.title']);
  assert.notEqual(MESSAGES.de['room.title'], MESSAGES.en['room.title']);
});

test('room layout and multiplayer two-tone theme are wired', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const rooms = fs.readFileSync(path.join(ROOT, 'js', 'rooms.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  const rail = main.indexOf('id="room-rail"');
  const dock = main.indexOf('class="target-dock"');
  const hero = main.indexOf('class="hero"');
  assert.ok(dock > 0 && hero > dock && rail > hero);
  assert.match(main, /class="console-side"[\s\S]*id="room-rail"[\s\S]*id="dossier-panel"/);
  assert.match(main, /dataset\.multiplayer = inRoom/);
  assert.match(main, /dataset\.roomGameplay =/);
  assert.match(main, /class="hero-subject"/);
  assert.doesNotMatch(main, /hero-targetline/);
  assert.match(main, /ended \? answer : t\('hero\.title'\)/);
  assert.match(main, /titleAnswer \? targetName : t\('gameplay\.arbitration'\)/);
  assert.match(main, /id="room-loading"/);
  assert.match(css, /data-room-gameplay="arbitration"/);
  assert.match(css, /linear-gradient\(to bottom left, var\(--room-bg-primary\), var\(--room-bg-secondary\)\)/);
  assert.match(css, /linear-gradient\(to bottom left, var\(--solo-bg, #071a2c\), #000\)/);
  assert.match(css, /\.radar \{\s*aspect-ratio: 1 \/ 1;/);
  assert.doesNotMatch(css, /aspect-ratio: 4 \/ 3|aspect-ratio: 16 \/ 10/);
  assert.match(rooms, /searchParams\.delete\('room'\)/);
  assert.match(main, /is-dealer-published/);
  assert.match(css, /\.room-player\.is-ready[\s\S]*#ff9f43/);
});

test('room local IDs are stable and collision-safe', () => {
  const one = 'c4497b11-ba36-4ec2-a531-336a61a7c631';
  const two = 'c4497b11-0000-4000-8000-000000000000';
  assert.equal(shortPilotId(one), 'C4497B11');
  assert.equal(shortPilotId(one, [one]), 'C4497B11');
  assert.equal(shortPilotId(one, [one, two]).length > 8, true);
  const sorted = sortLocalPlayers([
    { id: 'b', name: 'Beta', score: 5, connected: true, spectator: false },
    { id: 'a', name: 'Alpha', score: 5, connected: false, spectator: false },
    { id: 'c', name: 'Owner', score: 10, connected: false, spectator: false },
    { id: 'd', name: 'Watcher', score: 0, connected: true, spectator: true },
  ], 'c');
  assert.deepEqual(sorted.map((player) => player.id), ['c', 'a', 'b', 'd']);
});

test('character portraits and initials fall back safely', () => {
  const imagesBase = 'https://images.example.test';
  assert.equal(portraitUrl(90000001, 64, imagesBase), `${imagesBase}/characters/90000001/portrait?size=64`);
  assert.equal(portraitUrl('bad', 64, imagesBase), '');
  assert.equal(avatarInitials('Avatar Pilot'), 'AP');
  assert.equal(avatarInitials('Single'), 'SI');
  assert.match(avatarHtml('Avatar Pilot', 90000001, 64, '', imagesBase), /portrait\?size=64/);
  assert.match(avatarHtml('Avatar Pilot', null, 64, '', imagesBase), /avatar-fallback/);
});

test('room lobby and match settings are compact and apply-free', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js', 'rooms.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server', 'src', 'rooms.mjs'), 'utf8');
  assert.match(source, /room-lobby-grid/);
  assert.match(source, /room-matchbar/);
  assert.doesNotMatch(source, /room\.apply/);
  assert.match(source, /this\.send\(\{ t: 'start', gameplay: draft\.gameplay, settings: draft\.settings \}\)/);
  assert.match(source, /button primary room-share/);
  assert.match(source, /data-room-reset/);
  assert.match(css, /\.room-field input,[\s\S]*?height:\s*2\.15rem/);
  assert.match(server, /message\.gameplay == null \? room\.gameplay/);
});

test('room chat is a subspace communication beacon with an offline notice', () => {
  const rooms = fs.readFileSync(path.join(ROOT, 'js', 'rooms.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'photon.css'), 'utf8');
  assert.equal(MESSAGES.en['room.chatTitle'], 'SUBSPACE COMMUNICATION BEACON');
  assert.equal(MESSAGES.zh['room.chatTitle'], '亚空间通讯信标');
  assert.match(MESSAGES.zh['room.chatUnavailable'], /亚空间通讯信标无法连接/);
  assert.match(MESSAGES.en['room.chatUnavailable'], /Subspace communication beacon unreachable/);
  for (const lang of Object.keys(MESSAGES)) {
    assert.ok(MESSAGES[lang]['room.chatTitle']);
    assert.ok(MESSAGES[lang]['room.chatPlaceholder']);
    assert.ok(MESSAGES[lang]['room.chatUnavailable']);
  }
  assert.match(rooms, /room-chat-unavailable/);
  assert.match(rooms, /!this\.connected/);
  assert.match(css, /\.room-chat-unavailable/);
});

test('every locale provides a full ISK payout label', () => {
  for (const lang of Object.keys(MESSAGES)) {
    assert.ok(MESSAGES[lang]['end.insurancePayout']);
    assert.ok(MESSAGES[lang]['clue.kbValueToggle']);
  }
});

test('online shell and service inputs use the current direct room stack', () => {
  const files = [
    'js/api.js',
    'js/rooms.js',
    'js/mp/protocol.js',
    'js/mp/target.js',
    'js/mp/rules.js',
    'js/mp/clue-view.js',
    'server/src/index.mjs',
    'server/src/auth.mjs',
    'server/src/rooms.mjs',
    'server/src/targets.mjs',
    'styles/photon.css',
  ];
  for (const file of files) assert.equal(fs.existsSync(path.join(ROOT, file)), true, file);
  const built = path.join(ROOT, 'dist');
  if (fs.existsSync(built)) {
    assert.equal(fs.existsSync(path.join(built, 'assets', 'fonts', 'eve_sans_neueregular_400_normal.woff2')), true);
    assert.equal(fs.existsSync(path.join(built, 'styles', 'photon.css')), true);
    const mjs = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.mjs')) mjs.push(path.relative(ROOT, full));
      }
    };
    for (const dir of ['js', 'vendor']) {
      const target = path.join(built, dir);
      if (fs.existsSync(target)) walk(target);
    }
    assert.deepEqual(mjs, [], 'static hosts may serve .mjs as application/octet-stream');
  }
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'app.css'), 'utf8');
  assert.match(css, /@font-face/);
  assert.equal(/url\(["']?https?:/i.test(css), false);
  assert.equal(/fonts\.googleapis|fonts\.gstatic/i.test(css), false);
});

test('room UI is embedded and arbitration reuses the single-player dossier', () => {
  const rooms = fs.readFileSync(path.join(ROOT, 'js', 'rooms.js'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(rooms, /mount\(host/);
  assert.doesNotMatch(rooms, /document\.body\.append/);
  assert.match(rooms, /#room-view/);
  assert.match(rooms, /#room-rail/);
  assert.match(rooms, /onArbitrationState/);
  assert.match(rooms, /room-spinner/);
  assert.match(rooms, /data-room-kick/);
  assert.match(main, /id="room-view"/);
  assert.match(main, /id="room-rail"/);
  assert.match(main, /renderArbitrationDossier/);
  assert.match(main, /state\.roomArbitration/);
  assert.match(MESSAGES.en['room.kickConfirm'], /\{name\}/);
  assert.match(MESSAGES.zh['room.kicked'], /房主/);
  assert.match(MESSAGES.en['room.arbitration.dealerPublish'], /clue/i);
});
