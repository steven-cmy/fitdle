# FITDLE Brand Assets

Current app icon is the existing F claim-file mark and is a temporary brand.
The final logo can replace these files without changing HTML or JS references.

## Files

| File | Size | Purpose |
| --- | --- | --- |
| `app-icon.svg` | 64×64 viewBox | Master source for the app mark. Keep `favicon.svg` in sync. |
| `favicon.svg` | 64×64 viewBox | Browser SVG favicon. |
| `favicon-16.png` | 16×16 | Browser favicon fallback. |
| `favicon-32.png` | 32×32 | Browser favicon fallback. |
| `favicon.ico` | 16/32 multi-size | Legacy browser and Windows favicon. |
| `apple-touch-icon.png` | 180×180 | iOS home-screen icon. Must have an opaque background. |
| `icon-192.png` | 192×192 | Web App Manifest icon. |
| `icon-512.png` | 512×512 | Web App Manifest icon. |
| `icon-maskable-512.png` | 512×512 | Android maskable icon. Keep the mark inside the central safe area. |
| `site.webmanifest` | — | App name, theme colors and manifest icons. |

## Replacing the logo

1. Export the final mark as `app-icon.svg` and copy the same artwork to
   `favicon.svg`.
2. Export the PNG sizes above from the same master art. Do not crop each size
   independently.
3. Keep the maskable mark inside the central 80% safe area.
4. Update `fitdleMark()` in `js/brand.js` because the topbar mark is inline SVG,
   not one of these files.
5. If the brand palette changes, update `#05080c`, `#c8a15a` and `#5ee6ff` in
   the assets and the matching CSS variables together.
6. Run `npm run build` and verify `dist/assets/brand/` contains the new files.

The filenames are stable: replacing these files is enough for browser tabs,
iOS home screen, Android install, and the Web App Manifest.
