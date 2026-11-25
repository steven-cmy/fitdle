/**
 * Give every script and stylesheet reference in dist/ one shared version query.
 *
 * Proxies and CDNs may cache .js/.css for a long time while HTML stays fresh.
 * Without a version, a browser could mix modules of two releases. Sources are
 * not touched and there is no bundling: only relative specifiers are rewritten.
 */
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

const IMPORT = /(\b(?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g;

async function listScripts(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

export function versionImports(source, version) {
  return source.replace(IMPORT, (_, head, quote, specifier) => `${head}${quote}${specifier}?v=${version}${quote}`);
}

export function versionHtml(html, version) {
  return html
    .replace(/(<link rel="stylesheet" href="styles\/[^"?]+\.css)(")/g, `$1?v=${version}$2`)
    .replace(/(<script type="module" src="js\/[^"?]+\.js)(")/g, `$1?v=${version}$2`);
}

/** Rewrite dist/ in place and return the version string. */
export async function versionAssets(dist, release) {
  const scripts = await listScripts(path.join(dist, 'js'));
  const styles = (await fsp.readdir(path.join(dist, 'styles'))).filter((name) => name.endsWith('.css')).sort()
    .map((name) => path.join(dist, 'styles', name));
  const hash = crypto.createHash('sha256');
  for (const file of [...scripts, ...styles, path.join(dist, 'vendor', 'dogma-engine', 'esf_dogma_engine.js')]) {
    hash.update(await fsp.readFile(file).catch(() => ''));
  }
  const version = `${release}-${hash.digest('hex').slice(0, 8)}`;
  for (const file of scripts) {
    const source = await fsp.readFile(file, 'utf8');
    const next = versionImports(source, version);
    if (next !== source) await fsp.writeFile(file, next);
  }
  const index = path.join(dist, 'index.html');
  await fsp.writeFile(index, versionHtml(await fsp.readFile(index, 'utf8'), version));
  return version;
}
