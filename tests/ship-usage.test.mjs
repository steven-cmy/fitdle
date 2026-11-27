import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeUsage, parseStats, planUsage } from '../scripts/ship-usage.mjs';

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
