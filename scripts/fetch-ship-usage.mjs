#!/usr/bin/env node
/**
 * Download the monthly ship usage file that the "Ship usage" workflow keeps on
 * the `data` branch into .cache/ship-usage.json. A build never fails because of
 * it: without the file every hull simply keeps the start weight.
 *
 * FITDLE_USAGE_URL overrides the address.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.cache', 'ship-usage.json');
const URL_ = process.env.FITDLE_USAGE_URL
  || 'https://raw.githubusercontent.com/steven-cmy/fitdle/data/ship-usage.json';

try {
  const response = await fetch(URL_, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const data = JSON.parse(text);
  if (data?.version !== 1 || typeof data.ships !== 'object') throw new Error('unexpected file format');
  await fsp.mkdir(path.dirname(OUT), { recursive: true });
  await fsp.writeFile(OUT, text);
  console.log(`Ship usage: ${Object.keys(data.ships).length} hulls, generated ${data.generatedAt || 'unknown'}`);
} catch (error) {
  console.warn(`Ship usage not downloaded (${error.message}); ${fs.existsSync(OUT) ? 'keeping the cached file' : 'every hull keeps the start weight'}`);
}
