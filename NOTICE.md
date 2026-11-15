# NOTICE

FITDLE is an unofficial, non-commercial fan project. It is not affiliated with,
endorsed by, or sponsored by Fenris Creations (formerly CCP hf. / CCP Games) or
zKillboard.

## EVE Online

EVE Online, the EVE logo, ship names, ship models, icons, descriptions, localized
strings and all related intellectual property are the property of Fenris
Creations (formerly CCP hf. / CCP Games).

- Static data: EVE Static Data Export
  <https://developers.eveonline.com/static-data/>
- Ship renders, ship icons and module icons: EVE image service
  (`images.evetech.net`), loaded directly by the browser at runtime for
  non-commercial fan use. No image files are bundled in `dist/`.
- Ship and module text: EVE SDE official localizations (EN, DE, ES, FR, JA, KO,
  RU, ZH).

These assets are not covered by the MIT license that applies to the Fitdle
source code.

## Dogma engine

Abyssal fitting simulation uses **EVEShip.fit's dogma-engine** (MIT,
<https://github.com/EVEShipFit/dogma-engine>) and its patched SDE data
(`@eveshipfit/sde`). The vendored copies live in `vendor/dogma-engine/` with
their licenses in `LICENSE` and `LICENSE.EVE`.

## zKillboard

Killmail statistics, fitted modules, loss values, usage ranks, sample killmails
and the "active hull" signal are requested live from zKillboard's public API by
the browser.

- API documentation: <https://zkillboard.com/api/docs/>
- MCP documentation: <https://zkillboard.com/mcp/>

Abyssal mode also reads fitted-module dogma attributes from EVE ESI
(`https://esi.evetech.net`) to simulate navigation and defense values. The UTC
game day is obtained from Cloudflare's public `cdn-cgi/trace` endpoint.

Please respect zKillboard's API etiquette. Fitdle makes only the two requests
needed for the daily target and relies on upstream Nginx / Cloudflare caching;
it does not scrape HTML or persist API responses locally.

## Fonts

The optional EVE font faces (Eve Sans Neue and classic EveSans) are bundled
locally in `assets/fonts/`, extracted from the community font pack at
<https://make.itworks.cc/assets/fonts/eve_fonts_all.css> for local,
non-commercial fan use. They are Fenris Creations assets and are not covered by the MIT
license. When a glyph is missing, the UI falls back to system sans/黑体 stacks
(PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK, Source Han Sans,
WenQuanYi Micro Hei, Malgun Gothic, Yu Gothic, Segoe UI).

The hidden Triglavian font easter egg uses the **Triglavian** WOFF2 face from
the user-provided `eve-fonts.css` (base64 `@font-face`), converted from EVE
Online client assets. It is bundled locally for the same non-commercial fan
use and is not covered by the MIT license. Unsupported glyphs fall back to the
normal system stack.

## Code

The Fitdle source code is MIT licensed. See [LICENSE](LICENSE).

If you are a rights holder and believe an asset should not be included, please
open an issue or contact the maintainer so it can be removed.
