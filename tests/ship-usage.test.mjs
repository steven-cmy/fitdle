import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mergeUsage, monthKeyOf, parseStats, planUsage } from '../scripts/ship-usage.mjs';

test('stats months become [destroyed, lost] per YYYYMM', () => {
  const parsed = parseStats({
    months: {
      202610: { year: 2026, month: 10, shipsDestroyed: 120, shipsLost: 30 },
      202609: { year: 2026, month: 9, shipsDestroyed: 0, shipsLost: 0 },
      202608: { shipsDestroyed: '7', shipsLost: 2.9 },
      junk: { shipsDestroyed: 5 },
    },
  });
  assert.equal(parsed.found, true);
  assert.deepEqual(parsed.months, { 202610: [120, 30], 202608: [7, 2] });
  assert.deepEqual(parseStats({ months: [{ year: 2025, month: 1, shipsLost: 4 }] }).months, { 202501: [0, 4] });
  assert.deepEqual(parseStats({ shipsLost: 1 }), { found: false, months: {} });
  assert.deepEqual(parseStats(null), { found: false, months: {} });
});

test('only missing hulls are requested when asked, and removed hulls are dropped', () => {
  const previous = { version: 1, ships: { 1: { at: 1, m: {} }, 9: { at: 1, m: {} } } };
  assert.deepEqual(planUsage({ ships: [1, 2, 3], previous }), [1, 2, 3]);
  assert.deepEqual(planUsage({ ships: [1, 2, 3], previous, missingOnly: true }), [2, 3]);
  const merged = mergeUsage({
    ships: [1, 2, 3],
    previous,
    rows: [{ id: 2, months: { 202610: [1, 1] } }, { id: 3, error: true }, { id: 1, months: {} }],
    now: 5,
  });
  assert.equal(merged.failed, 1);
  assert.deepEqual(Object.keys(merged.ships), ['1', '2']);
  assert.deepEqual(merged.ships[1], { at: 5, m: {} });
  assert.equal(merged.ships[9], undefined, 'hulls no longer in the SDE are dropped');
});

test('the running month is left out and a missing months field is not an error', () => {
  const stats = { months: { 202609: { shipsDestroyed: 4 }, 202610: { shipsDestroyed: 9 }, 202611: { shipsDestroyed: 2 } } };
  assert.deepEqual(parseStats(stats, { beforeKey: '202611' }).months, { 202609: [4, 0], 202610: [9, 0] });
  assert.equal(monthKeyOf(Date.parse('2026-11-02T03:00:00Z')), '202611');
  // `months` is not a documented field: without it nothing breaks, the caller sees found: false.
  assert.deepEqual(parseStats({ shipsDestroyed: 5, shipsLost: 3 }, { beforeKey: '202611' }), { found: false, months: {} });
  assert.deepEqual(parseStats({ months: 'soon' }), { found: false, months: {} });
});

test('the usage script uses the documented path and stops at the first access block', async () => {
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push(request.url);
    response.writeHead(403);
    response.end('blocked');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitdle-usage-'));
  const out = path.join(dir, 'ship-usage.json');
  try {
    const root = path.resolve(import.meta.dirname, '..');
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'build-ship-usage.mjs'), '--out', out], {
      cwd: root,
      env: { ...process.env, USAGE_STATS_BASE: `http://127.0.0.1:${server.address().port}/api/stats/shipTypeID`, USAGE_REQUEST_PAUSE_MS: '0' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk; });
    const code = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(code, 1);
    assert.equal(seen.length, 1, 'no further hull is asked after a 403');
    assert.match(seen[0], /^\/api\/stats\/shipTypeID\/\d+\/kills\/$/);
    assert.match(errors, /refused access \(HTTP 403\)/);
    assert.equal(fs.existsSync(out), false, 'nothing is written');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
