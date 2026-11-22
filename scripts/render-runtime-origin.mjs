import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ORIGIN_SENTINEL = '__FITDLE_PUBLIC_ORIGIN__';

export function normalizePublicOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('PUBLIC_ORIGIN is required');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PUBLIC_ORIGIN is not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PUBLIC_ORIGIN must use http or https');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('PUBLIC_ORIGIN must not contain credentials, query or hash');
  }
  if (url.pathname !== '/') {
    throw new Error('PUBLIC_ORIGIN must be an origin without a path');
  }
  return url.origin;
}

async function renderDirectory(root, origin) {
  let changed = 0;
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      changed += await renderDirectory(full, origin);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = await fs.promises.readFile(full, 'utf8');
      if (html.includes(ORIGIN_SENTINEL)) {
        await fs.promises.writeFile(full, html.replaceAll(ORIGIN_SENTINEL, origin));
        changed += 1;
      }
    }
  }
  return changed;
}

export async function renderRuntimeOrigin({ root, origin }) {
  const safeOrigin = normalizePublicOrigin(origin);
  const dist = path.resolve(root);
  if (!fs.existsSync(dist)) throw new Error(`Static directory not found: ${dist}`);
  return { origin: safeOrigin, changed: await renderDirectory(dist, safeOrigin) };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    const root = path.resolve(import.meta.dirname, '..', 'dist');
    const result = await renderRuntimeOrigin({ root, origin: process.env.PUBLIC_ORIGIN });
    console.log(`Runtime origin: ${result.origin} (${result.changed} HTML files)`);
  } catch (error) {
    console.error(`FITDLE startup: ${error.message}`);
    process.exit(1);
  }
}
