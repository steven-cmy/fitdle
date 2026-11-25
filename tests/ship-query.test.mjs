import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSearchIndex } from '../js/game.js';
import { resolveShipQuery } from '../js/ship-query.js';

const { ships } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'catalog.json'), 'utf8'));
const index = buildSearchIndex(ships, {}, { locale: 'en' });
const id = (name) => ships.find((ship) => ship.names.en === name).id;
const resolve = (query, options) => {
  const { ship, ambiguous } = resolveShipQuery(index, query, options);
  return [ship?.id ?? null, ambiguous];
};

test('full names in any language are exact', () => {
  assert.deepEqual(resolve('Raven'), [id('Raven'), false]);
  assert.deepEqual(resolve('  caracal NAVY issue '), [id('Caracal Navy Issue'), false]);
  assert.deepEqual(resolve('狞獾级海军型'), [id('Caracal Navy Issue'), false]);
});

test('an abbreviation is used only when it names one hull', () => {
  assert.deepEqual(resolve('cni'), [null, true], 'several hulls');
  const entry = index.find((item) => item.acronyms.some((short) => (
    index.filter((other) => other.acronyms.includes(short) || other.nameAliases.includes(short)).length === 1
    && !index.some((other) => other.names.includes(short)))));
  const short = entry.acronyms.find((value) => index.filter((other) => other.acronyms.includes(value) || other.nameAliases.includes(value)).length === 1);
  assert.deepEqual(resolve(short), [entry.ship.id, false]);
  // Guessed hulls no longer compete, and a guessed one stays recognizable.
  const cni = index.filter((item) => item.acronyms.includes('cni') || item.nameAliases.includes('cni')).map((item) => item.ship.id);
  assert.deepEqual(resolve('cni', { exclude: new Set(cni.slice(1)) }), [cni[0], false]);
  assert.deepEqual(resolve(short, { exclude: new Set([entry.ship.id]) }), [entry.ship.id, false]);
});

test('partial names ask when several hulls fit; nonsense finds nothing', () => {
  assert.deepEqual(resolve('rav'), [null, true]);
  assert.deepEqual(resolve('zzzzzz'), [null, false]);
  assert.deepEqual(resolve('   '), [null, false]);
});

test('a chosen hull keeps a name it shares with another', () => {
  const shared = index.flatMap((entry) => entry.names.map((name) => [name, entry.ship.id]))
    .find(([name, shipId]) => index.some((other) => other.ship.id !== shipId && other.names.includes(name)));
  const owners = index.filter((entry) => entry.names.includes(shared[0])).map((entry) => entry.ship.id);
  for (const selectedId of owners) assert.deepEqual(resolve(shared[0], { selectedId }), [selectedId, false]);
});
