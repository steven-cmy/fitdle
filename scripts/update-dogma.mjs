#!/usr/bin/env node
/**
 * Update the vendored EVEShip.fit dogma engine + patched SDE.
 *
 * Usage: npm run update:dogma
 *
 * The browser adapter only depends on the public package files, so this script
 * fetches the latest npm tarballs and replaces the vendor files atomically.
 * The current skills.json is kept because it is a Fitdle-side convenience list.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'dogma-engine');
const CACHE = path.join(ROOT, '.cache');
const WORK = path.join(CACHE, 'dogma-update');
const NPM_CACHE = path.join(CACHE, 'npm-dogma');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
}

async function pack(name, destination) {
  run('npm', [
    '--cache', NPM_CACHE,
    'pack', `${name}@latest`,
    '--pack-destination', destination,
    '--silent',
  ]);
  const tarball = (await fsp.readdir(destination))
    .filter((name) => name.endsWith('.tgz'))
    .sort()
    .at(-1);
  if (!tarball) throw new Error(`no tarball produced for ${name}`);
  return path.join(destination, tarball);
}

function extract(tarball, destination) {
  fs.mkdirSync(destination, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', destination]);
}

async function packageVersion(directory) {
  const pkg = JSON.parse(await fsp.readFile(path.join(directory, 'package', 'package.json'), 'utf8'));
  return pkg.version;
}

async function main() {
  await fsp.rm(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(NPM_CACHE, { recursive: true });

  console.log('Packing latest @eveshipfit/dogma-engine and @eveshipfit/sde...');
  const enginePack = path.join(WORK, 'engine-pack');
  const sdePack = path.join(WORK, 'sde-pack');
  fs.mkdirSync(enginePack, { recursive: true });
  fs.mkdirSync(sdePack, { recursive: true });
  const engineTarball = await pack('@eveshipfit/dogma-engine', enginePack);
  const sdeTarball = await pack('@eveshipfit/sde', sdePack);

  const engineRoot = path.join(WORK, 'engine');
  const sdeRoot = path.join(WORK, 'sde');
  extract(engineTarball, engineRoot);
  extract(sdeTarball, sdeRoot);

  const enginePackage = path.join(engineRoot, 'package');
  const sdePackage = path.join(sdeRoot, 'package');
  const engineVersion = await packageVersion(engineRoot);
  const sdeVersion = await packageVersion(sdeRoot);

  const files = [
    [path.join(enginePackage, 'esf_dogma_engine.js'), 'esf_dogma_engine.js'],
    [path.join(enginePackage, 'esf_dogma_engine_bg.wasm'), 'esf_dogma_engine_bg.wasm'],
    [path.join(sdePackage, 'dist', 'sde.dat'), 'sde.dat'],
    [path.join(enginePackage, 'LICENSE'), 'LICENSE'],
    [path.join(sdePackage, 'LICENSE.EVE'), 'LICENSE.EVE'],
  ];
  for (const [source, name] of files) {
    if (!fs.existsSync(source)) throw new Error(`missing ${source}`);
    await fsp.copyFile(source, path.join(VENDOR, name));
  }

  if (!fs.existsSync(path.join(VENDOR, 'README.md'))) {
    await fsp.copyFile(path.join(enginePackage, 'README.md'), path.join(VENDOR, 'README.md'));
  }

  const meta = {
    updatedAt: new Date().toISOString(),
    dogmaEngine: engineVersion,
    sde: sdeVersion,
    source: 'npm @eveshipfit/dogma-engine + @eveshipfit/sde',
    note: 'skills.json is maintained by Fitdle and was not replaced.',
  };
  await fsp.writeFile(path.join(VENDOR, 'VERSION.json'), `${JSON.stringify(meta, null, 2)}\n`);
  await fsp.rm(WORK, { recursive: true, force: true });

  console.log(`Updated dogma engine ${engineVersion}, SDE ${sdeVersion}.`);
  console.log('Run npm test and smoke-test Audit mode before deploying.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
