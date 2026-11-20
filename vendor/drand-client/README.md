# drand-client vendor

Pinned browser ESM build of the official drand JavaScript client.

- Package: `drand-client@1.4.2`
- Source: https://github.com/drand/drand-client
- Bundle: https://cdn.jsdelivr.net/npm/drand-client@1.4.2/build/esm/index.mjs
- Vendored file: `index.js` (renamed from `index.mjs` so static hosts that do not
  map `.mjs` to a JavaScript MIME type can still load it as a module).
- License: Apache-2.0 OR MIT (see `LICENSE-APACHE` and `LICENSE-MIT`)
- The bundle includes its own `@noble/curves` notices.

Do not fetch this library from a CDN at runtime. FITDLE uses the vendored file
so the daily seed path does not depend on a JavaScript CDN.
