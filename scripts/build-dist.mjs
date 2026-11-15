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
import { LOCALES, MESSAGES } from '../js/i18n.js';

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
for (const dir of ['js', 'styles', 'assets/fonts', 'assets/brand', 'assets/share', 'data', 'vendor/dogma-engine']) {
  const source = path.join(ROOT, dir);
  if (!fs.existsSync(source)) continue;
  await fsp.cp(source, path.join(DIST, dir), { recursive: true });
}

// Localized static score pages give Discord/other crawlers real Open Graph
// metadata. Humans are redirected into the puzzle; crawlers never see the
// answer or target hull in the preview.
function localSiteUrl() {
  if (process.env.CI) return '';
  try {
    const file = path.join(ROOT, '.cache', 'local.env');
    if (!fs.existsSync(file)) return '';
    const line = fs.readFileSync(file, 'utf8').split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('SITE_URL='));
    return line ? line.slice('SITE_URL='.length).trim() : '';
  } catch {
    return '';
  }
}
const SITE_URL = (
  process.env.SITE_URL
  || process.env.CI_PAGES_URL
  || localSiteUrl()
  || 'http://127.0.0.1:4173'
).replace(/\/$/, '');
const shareImage = (key, locale) => `${SITE_URL}/assets/share/og-${key}-${locale}.png?v=2`;
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

function sharePage({ key, locale, title, description, depth }) {
  const canonical = `${SITE_URL}/share/${key}/${locale}.html`;
  const image = shareImage(key, locale);
  const redirect = depth === 2 ? '../../' : '../';
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
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
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${OG_LOCALES[locale] || 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<script>
const q = new URLSearchParams(location.search);
const target = new URL('${redirect}', location.href);
for (const key of ['d', 'mode', 'lang']) {
  const value = q.get(key);
  if (value) target.searchParams.set(key, value);
}
if (!target.searchParams.has('lang')) target.searchParams.set('lang', '${locale}');
location.replace(target.toString());
</script>
</head>
<body style="background:#05080c;color:#dceaf0;font-family:system-ui,sans-serif;padding:32px">
<p>${safeDescription}</p>
<p><a href="${redirect}" style="color:#f2a63b">${escapeHtml(message(locale, 'share.open'))}</a></p>
</body>
</html>`;
}

for (const score of [1, 2, 3, 4, 5, 6]) {
  const scoreKey = String(score);
  for (const locale of LOCALES) {
    const one = score === 1;
    const title = `FITDLE — ${message(locale, one ? 'share.oneTitle' : 'share.winTitle', { score })}`;
    const description = message(locale, one ? 'share.oneBody' : 'share.winBody', { score });
    const dir = path.join(shareDir, scoreKey);
    await fsp.mkdir(dir, { recursive: true });
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

const bytes = (await fsp.stat(path.join(DIST, 'data/catalog.json'))).size;
console.log(`dist/ assembled (${(bytes / 1024 / 1024).toFixed(1)} MiB catalog, live zKill/images at runtime).`);
