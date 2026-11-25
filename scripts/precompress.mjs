/**
 * Write .br/.gz siblings for static assets so any host can serve them without
 * compressing per request (the Node service and GitLab Pages both pick them up).
 *
 * HTML is deliberately skipped: the container entrypoint rewrites it at start
 * with the runtime PUBLIC_ORIGIN, which would leave stale compressed copies.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

export const COMPRESSIBLE = new Set(['.js', '.css', '.json', '.svg', '.wasm', '.dat', '.webmanifest']);
const MIN_BYTES = 1024;
const CONCURRENCY = 4;

async function listFiles(root) {
  const entries = await fsp.readdir(root, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && COMPRESSIBLE.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

export async function precompress(root) {
  const queue = await listFiles(root);
  const totals = { files: 0, raw: 0, br: 0, gz: 0 };
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const source = await fsp.readFile(file);
      if (source.length < MIN_BYTES) continue;
      const [br, gz] = await Promise.all([
        brotli(source, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
          },
        }),
        gzip(source, { level: zlib.constants.Z_BEST_COMPRESSION }),
      ]);
      await Promise.all([fsp.writeFile(`${file}.br`, br), fsp.writeFile(`${file}.gz`, gz)]);
      totals.files += 1;
      totals.raw += source.length;
      totals.br += br.length;
      totals.gz += gz.length;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return totals;
}
