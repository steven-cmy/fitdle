#!/usr/bin/env node
/**
 * Assemble the deployable static site in dist/.
 * Only authored files + generated SDE catalog are copied.  zKillboard stats,
 * fittings and EVE images are fetched live by the browser and are never
 * downloaded into this folder.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'data');

if (!fs.existsSync(path.join(DATA, 'catalog.json'))) {
  throw new Error('Missing data/catalog.json. Run `node scripts/build-catalog.mjs` first.');
}

await fsp.rm(DIST, { recursive: true, force: true });
await fsp.mkdir(DIST, { recursive: true });

for (const file of ['index.html']) {
  await fsp.copyFile(path.join(ROOT, file), path.join(DIST, file));
}
for (const dir of ['js', 'styles', 'assets/fonts', 'assets/brand', 'data', 'vendor/dogma-engine']) {
  const source = path.join(ROOT, dir);
  if (!fs.existsSync(source)) continue;
  await fsp.cp(source, path.join(DIST, dir), { recursive: true });
}

// Static score pages give Discord/other crawlers real Open Graph metadata.
// They immediately redirect a human into the puzzle while the crawler reads
// the score-specific title/description.
const shareDir = path.join(DIST, 'share');
await fsp.mkdir(shareDir, { recursive: true });
for (const score of [1, 2, 3, 4, 5, 6]) {
  const title = `FITDLE — ${score}/6`;
  const description = score === 1
    ? 'One attempt. One kill. Target destroyed on the first guess.'
    : `I destroyed the target in ${score} attempts. Can you beat my score?`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="FITDLE">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<script>
const q = new URLSearchParams(location.search);
const target = new URL('../', location.href);
for (const key of ['d', 'mode']) {
  const value = q.get(key);
  if (value) target.searchParams.set(key, value);
}
location.replace(target.toString());
</script>
</head>
<body style="background:#05080c;color:#dceaf0;font-family:system-ui,sans-serif;padding:32px">
<p>${description}</p>
<p><a href="../" style="color:#f2a63b">Open FITDLE</a></p>
</body>
</html>`;
  await fsp.writeFile(path.join(shareDir, `${score}.html`), html);
}
const lostTitle = 'FITDLE — TARGET ESCAPED';
const lostDescription = 'The target escaped after six attempts. The killboard still has the answer.';
await fsp.writeFile(path.join(shareDir, 'lost.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${lostTitle}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="FITDLE">
<meta property="og:title" content="${lostTitle}">
<meta property="og:description" content="${lostDescription}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${lostTitle}">
<meta name="twitter:description" content="${lostDescription}">
<script>
const q = new URLSearchParams(location.search);
const target = new URL('../', location.href);
for (const key of ['d', 'mode']) {
  const value = q.get(key);
  if (value) target.searchParams.set(key, value);
}
location.replace(target.toString());
</script>
</head>
<body style="background:#05080c;color:#dceaf0;font-family:system-ui,sans-serif;padding:32px">
<p>${lostDescription}</p>
<p><a href="../" style="color:#f2a63b">Open FITDLE</a></p>
</body>
</html>`);

const bytes = (await fsp.stat(path.join(DIST, 'data/catalog.json'))).size;
console.log(`dist/ assembled (${(bytes / 1024 / 1024).toFixed(1)} MiB catalog, live zKill/images at runtime).`);
