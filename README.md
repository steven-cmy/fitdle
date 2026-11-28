# FITDLE

English | [简体中文](README.zh-CN.md)

![FITDLE](assets/share/og.png)

A ship-guessing game for EVE Online. You get a real killmail from zKillboard with the ship name hidden, and have to work out the hull from the evidence: stats, fitting, cargo and so on. Every wrong guess reveals a bit more.

The interface is available in English, German, Spanish, French, Japanese, Korean, Russian and Chinese.

## How to play

- **Standard**: each miss reveals more fitting and cargo. Stats your guess shares with the answer are shown right away.
- **Fitting Audit**: stats are calculated from the actual fit with all skills at V (using [dogma-engine](https://github.com/EVEShipFit/dogma-engine)). Your guesses don't show shared stats, and rarer hulls come up more often. Harder.
- **Timed**: evidence comes out on a clock, no matter how many guesses you make.

Log in with EVE SSO to play the daily puzzle (the same for everyone). Random targets you play while logged in are recorded too, in your record, stats and streak. Without logging in you play as a trainee: as much as you like, nothing is scored. You can also pick a killmail yourself, signed in or not: press CHOOSE KILLMAIL and paste a zKillboard link or a killID. A chosen or shared killmail is never scored.

Multiplayer rooms support all three modes, plus Arbitration Review, where players take turns as the Clue Giver.

## Self-hosting

You need an EVE developer application ([developers.eveonline.com](https://developers.eveonline.com/)) with the callback URL set to `https://your-domain/api/v1/auth/eve/callback`.

```bash
cp .env.example .env   # fill in PUBLIC_ORIGIN, EVE_CLIENT_ID, EVE_CLIENT_SECRET, SESSION_SECRET
docker run -d --name fitdle --restart unless-stopped \
  --env-file .env -p 127.0.0.1:8787:8787 -v fitdle-data:/data \
  ghcr.io/steven-cmy/fitdle:latest
```

Or use [compose.example.yml](compose.example.yml). Image tags are `latest`, the version number (as in `package.json`), `v` plus the version, and the commit SHA; replace `latest` to pin a version.

> Images used to be published at `registry.gitlab.com/cmy/fitdle`. That address is no longer updated; switch the image to the one above and keep your data volume as is.

A few notes:

- `SESSION_SECRET` can be any long random string, e.g. `openssl rand -base64 32`.
- It runs without SSO too, but then only trainee mode is available.
- The database lives at `/data/fitdle.sqlite`, so mount a volume there.
- On Unraid, set `PUID=99` and `PGID=100`.
- After changing `PUBLIC_ORIGIN`, recreate the container; a restart is not enough.
- The game day (the Daily target, streaks and the reset countdown) starts at 11:00 UTC by default. Set `FITDLE_GAME_DAY_START_UTC` to change it, either as `HH:MM` in UTC (e.g. `12:30`) or as minutes after 00:00 UTC (e.g. `750`), then recreate the container. An invalid value is logged at startup and 11:00 is used. Changing it moves the boundary of the current game day, so the Daily target may change once.
- The Daily target may be a killmail without a fit. Set `FITDLE_DAILY_ALLOW_EMPTY=false` (`0` and `no` work too) to pick only fitted ones, then recreate the container. The default is `true`; an unrecognized value is logged at startup and counts as `true`. A target already picked for the current game day stays as it is.
- All other options are documented in [.env.example](.env.example).

Put a reverse proxy in front for HTTPS. Rooms use WebSockets, so `/api/v1/rooms/<code>/ws` needs the upgrade headers:

```nginx
location ~ ^/api/v1/rooms/[^/]+/ws$ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}

location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Health check: `GET /api/v1/health`. If you only see trainee mode, check `/api/v1/meta` and the container logs.

## Development

Node 24+. The front end is plain ES modules with no bundler; the back end in `server/` is Fastify + SQLite.

```bash
npm install
npm run prepare:sde       # download the official SDE
npm run fetch:usage       # ship usage from the data branch
npm run build:catalog
npm run build:killpool
npm run build             # writes data/ and dist/
npm test

npm install --prefix server
npm run test:server
npm run server:start      # http://127.0.0.1:8787
```

For the front end alone, run `npm start` and open http://127.0.0.1:4173 (trainee mode).

UI strings for all 8 languages are in `js/messages/` and must keep the same keys. Use the official EVE translations for game terms (see [docs/i18n-glossary.md](docs/i18n-glossary.md)). More detailed conventions are in [AGENTS.md](AGENTS.md).

## CI

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): pull requests into `main` build, test and build the container image and start it once without pushing it, and require a new version and CHANGELOG section when the program changes, not for documentation or `.github/` changes (day-to-day pushes to `dev` run nothing). Merged changes on `main` deploy [GitHub Pages](https://steven-cmy.github.io/fitdle/) (the static trainee build). A version without a Release also gets its image published to GHCR and a Release when CHANGELOG has a matching section; an already released version is not pushed again unless the workflow is run manually. Pull requests into `main` are merged with a merge commit, and `dev` carries on without a reset.

## License

The code is [MIT](LICENSE). EVE Online, Pend Insurance, Secure Commerce Commission and the related names, game data, images and fonts belong to Fenris Creations (formerly CCP Games) and are not covered by the MIT license; see [NOTICE.md](NOTICE.md). This is an unofficial fan project, not affiliated with CCP or zKillboard.

The Eve Sans Neue, EveSans and Triglavian fonts in `assets/fonts/` are official EVE fonts owned by Fenris Creations. They are included only for this fan project; please don't reuse them elsewhere. Without them the UI falls back to system fonts and works the same. They will be removed right away if the rights holder asks; sources are listed in [NOTICE.md](NOTICE.md#fonts).
