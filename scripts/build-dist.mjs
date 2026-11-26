#!/usr/bin/env node
/**
 * Assemble the deployable static site in dist/.
 * Only authored files + generated SDE catalog are copied. zKillboard stats,
 * fittings and EVE images are fetched live by the browser and are never
 * downloaded into this folder.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { loadBuildEnv } from './build-env.mjs';
import { precompress } from './precompress.mjs';
import { versionAssets } from './version-assets.mjs';
import { LOCALES, MESSAGES } from '../js/i18n.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV = loadBuildEnv(ROOT);
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'data');

if (!fs.existsSync(path.join(DATA, 'catalog.json'))) {
  throw new Error('Missing data/catalog.json. Run `node scripts/build-catalog.mjs` first.');
}

await fsp.rm(DIST, { recursive: true, force: true });
await fsp.mkdir(DIST, { recursive: true });

for (const dir of ['js', 'styles', 'assets/fonts', 'assets/brand', 'assets/share', 'data', 'vendor/dogma-engine']) {
  const source = path.join(ROOT, dir);
  if (!fs.existsSync(source)) continue;
  await fsp.cp(source, path.join(DIST, dir), { recursive: true });
}
for (const file of ['assets/watchlist.json', 'assets/boot-flavor.json', 'assets/claim-departments.json']) {
  const source = path.join(ROOT, file);
  if (!fs.existsSync(source)) continue;
  await fsp.mkdir(path.dirname(path.join(DIST, file)), { recursive: true });
  await fsp.copyFile(source, path.join(DIST, file));
}
{
  // The browser loads its own language only.
  const { departments } = JSON.parse(await fsp.readFile(path.join(ROOT, 'assets', 'claim-departments.json'), 'utf8'));
  const dir = path.join(DIST, 'assets', 'claim-departments');
  await fsp.mkdir(dir, { recursive: true });
  for (const [locale, groups] of Object.entries(departments)) {
    await fsp.writeFile(path.join(dir, `${locale}.json`), JSON.stringify({ departments: { [locale]: groups } }));
  }
}

// Localized static score pages give Discord/other crawlers real Open Graph
// metadata. Humans are redirected into the puzzle; crawlers never see the
// answer or target hull in the preview.
const SITE_URL = (
  ENV.PUBLIC_ORIGIN
  || process.env.PAGES_URL
  || process.env.CI_PAGES_URL
  || 'http://127.0.0.1:4173'
).replace(/\/+$/, '');

const runtimeManifest = JSON.parse(await fsp.readFile(path.join(DATA, 'manifest.json'), 'utf8'));
// data/manifest.json stays readable; the shipped copy drops its indentation.
await fsp.writeFile(path.join(DIST, 'data', 'manifest.json'), JSON.stringify(runtimeManifest));

// Per-language catalogs: rules and search data stay identical, while the long
// localized texts are limited to one language plus the English fallback. The
// complete data/catalog.json is still shipped as a fallback for the browser.
const fullCatalog = JSON.parse(await fsp.readFile(path.join(DATA, 'catalog.json'), 'utf8'));
const catalogDir = path.join(DIST, 'data', 'catalog');
await fsp.mkdir(catalogDir, { recursive: true });
for (const locale of LOCALES) {
  const pick = (texts) => (texts && typeof texts === 'object'
    ? Object.fromEntries(Object.entries(texts).filter(([key]) => key === locale || key === 'en'))
    : texts);
  const ships = fullCatalog.ships.map((ship) => ({
    ...ship,
    descriptions: pick(ship.descriptions),
    bonuses: pick(ship.bonuses),
    bonusEntries: (ship.bonusEntries || []).map((entry) => ({
      ...entry,
      ...(entry.skill ? { skill: pick(entry.skill) } : {}),
      ...(entry.text ? { text: pick(entry.text) } : {}),
    })),
  }));
  await fsp.writeFile(path.join(catalogDir, `${locale}.json`), JSON.stringify({ ...fullCatalog, ships }));
}

const IMAGE_BASE = String(runtimeManifest?.images?.baseUrl || '').replace(/\/+$/, '');

const indexHtml = (await fsp.readFile(path.join(ROOT, 'index.html'), 'utf8'))
  .replaceAll('__SITE_URL__', SITE_URL)
  .replaceAll('__IMAGE_BASE__', IMAGE_BASE);
await fsp.writeFile(path.join(DIST, 'index.html'), indexHtml);

const shareImage = (key, locale) => `${SITE_URL}/assets/share/og-${key}-${locale}.png?v=5`;
const OG_LOCALES = {
  en: 'en_US', de: 'de_DE', es: 'es_ES', fr: 'fr_FR',
  ja: 'ja_JP', ko: 'ko_KR', ru: 'ru_RU', zh: 'zh_CN',
};
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fill = (template, vars = {}) => String(template || '')
  .replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
const message = (locale, key, vars = {}) => fill(MESSAGES[locale]?.[key] || MESSAGES.en[key] || key, vars);

const shareDir = path.join(DIST, 'share');
await fsp.mkdir(shareDir, { recursive: true });

function sharePage({ key, locale, title, description, depth, image = null }) {
  const canonical = `${SITE_URL}/share/${key}/${locale}.html`;
  const imageUrl = image || shareImage(key, locale);
  const redirect = depth === 2 ? '../../' : '../';
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(imageUrl);
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#05080c">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="FITDLE">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:secure_url" content="${safeImage}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${safeTitle}">
<meta property="og:locale" content="${OG_LOCALES[locale] || 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
<meta name="twitter:image:alt" content="${safeTitle}">
<script>
try { localStorage.setItem('fitdle:v1:lang', '${locale}'); } catch {}
const q = new URLSearchParams(location.search);
const target = new URL('${redirect}', location.href);
for (const key of ['kb', 'killmail', 'kill', 'rule', 't']) {
  const value = q.get(key);
  if (value) target.searchParams.set(key, value);
}
location.replace(target.toString());
</script>
</head>
<body style="background:#05080c;color:#dceaf0;font-family:system-ui,sans-serif;padding:32px">
<p>${safeDescription}</p>
<p><a href="${redirect}" style="color:#f2a63b">${escapeHtml(message(locale, 'share.open'))}</a></p>
</body>
</html>`;
}

// Free and timed runs share one score-independent card per language.
for (const key of ['free', 'timed']) {
  const dir = path.join(shareDir, key);
  await fsp.mkdir(dir, { recursive: true });
  for (const locale of LOCALES) {
    await fsp.writeFile(path.join(dir, `${locale}.html`), sharePage({
      key, locale,
      title: message(locale, `share.${key}Title`),
      description: message(locale, `share.${key}Description`),
      depth: 2,
      image: `${SITE_URL}/assets/share/og.png?v=5`,
    }));
  }
}
for (const score of [1, 2, 3, 4, 5, 6]) {
  const scoreKey = String(score);
  const one = score === 1;
  const dir = path.join(shareDir, scoreKey);
  await fsp.mkdir(dir, { recursive: true });
  for (const locale of LOCALES) {
    const title = `FITDLE — ${message(locale, one ? 'share.oneTitle' : 'share.winTitle', { score })}`;
    const description = message(locale, one ? 'share.oneBody' : 'share.winBody', { score });
    await fsp.writeFile(path.join(dir, `${locale}.html`), sharePage({
      key: scoreKey, locale, title, description, depth: 2,
    }));
    if (locale === 'en') {
      await fsp.writeFile(path.join(shareDir, `${scoreKey}.html`), sharePage({
        key: scoreKey, locale, title, description, depth: 1,
      }));
    }
  }
}
for (const locale of LOCALES) {
  const title = `FITDLE — ${message(locale, 'share.lostTitle')}`;
  const description = message(locale, 'share.lostBody');
  const dir = path.join(shareDir, 'lost');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${locale}.html`), sharePage({
    key: 'lost', locale, title, description, depth: 2,
  }));
  if (locale === 'en') {
    await fsp.writeFile(path.join(shareDir, 'lost.html'), sharePage({
      key: 'lost', locale, title, description, depth: 1,
    }));
  }
}

const release = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
console.log(`Asset version: ${await versionAssets(DIST, release)}`);

if (process.env.FITDLE_SKIP_PRECOMPRESS !== '1') {
  const totals = await precompress(DIST);
  const mib = (value) => (value / 1024 / 1024).toFixed(1);
  console.log(`Precompressed ${totals.files} files: ${mib(totals.raw)} MiB -> ${mib(totals.br)} MiB br / ${mib(totals.gz)} MiB gz.`);
}

const bytes = (await fsp.stat(path.join(DIST, 'data/catalog.json'))).size;
console.log(`dist/ assembled (${(bytes / 1024 / 1024).toFixed(1)} MiB catalog, live zKill/images at runtime).`);
