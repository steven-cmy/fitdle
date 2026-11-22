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

## Pend Insurance and Secure Commerce Commission

Pend Insurance and the Secure Commerce Commission are EVE Online NPC
organizations. Their names, logos, associated marks and related intellectual
property are the property of Fenris Creations (formerly CCP hf. / CCP Games).
FITDLE uses their corporation logos from the official EVE image service at
runtime for non-commercial fan use. The logos are not bundled in `dist/` and can
be removed by changing `js/brand.js`.

FITDLE is an unofficial, non-commercial fan project. It is not affiliated with,
endorsed by, or sponsored by Fenris Creations, CCP Games, Pend Insurance or the
Secure Commerce Commission.

## Dogma engine

The Fitting Audit simulation uses **EVEShip.fit's dogma-engine** (MIT,
<https://github.com/EVEShipFit/dogma-engine>) and its patched SDE data
(`@eveshipfit/sde`). The vendored copies live in `vendor/dogma-engine/` with
their licenses in `LICENSE` and `LICENSE.EVE`.

## zKillboard

Killmail statistics, fitted modules, loss values, usage ranks, sample killmails
and the "active hull" signal are requested live from zKillboard's public API by
the browser.

- API documentation: <https://zkillboard.com/api/docs/>
- MCP documentation: <https://zkillboard.com/mcp/>

Fitting Audit uses the vendored dogma engine and local module fallback data; it
does not request fitted-module attributes from ESI at runtime. The browser uses
ESI for character/corporation/alliance names and Platinum insurance prices, and
the EVE image service for ship, module and corporation images.

The UTC game day comes from the server's configured game-day boundary; the
browser verifies the clock against the manifest HTTP date.

Please respect zKillboard's API etiquette. The browser requests target
killmails and public ship statistics, and caches public responses locally for a
short time; the FITDLE server does not persist those API responses.

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
