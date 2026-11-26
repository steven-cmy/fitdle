# FITDLE

English | [简体中文](README.zh-CN.md)

![FITDLE](assets/share/og.png)

A ship-guessing game for EVE Online. You get a real killmail from zKillboard with the ship name hidden, and have to work out the hull from clues: stats, fitting, cargo and so on. Every wrong guess reveals a bit more.

The interface is available in English, German, Spanish, French, Japanese, Korean, Russian and Chinese.

## How to play

- **Standard**: each miss reveals more fitting and cargo. Stats your guess shares with the answer are shown right away.
- **Fitting Audit**: stats are calculated from the actual fit with all skills at V (using [dogma-engine](https://github.com/EVEShipFit/dogma-engine)). Harder.
- **Timed**: clues come out on a clock, no matter how many guesses you make.

Log in with EVE SSO to play the daily puzzle (the same for everyone) and keep a record and streak. Without logging in you get practice mode: play as much as you like, nothing is scored.

Multiplayer rooms support all three modes, plus Arbitration, where players take turns as the dealer.

## Self-hosting

You need an EVE developer application ([developers.eveonline.com](https://developers.eveonline.com/)) with the callback URL set to `https://your-domain/api/v1/auth/eve/callback`.

```bash
cp .env.example .env   # fill in PUBLIC_ORIGIN, EVE_CLIENT_ID, EVE_CLIENT_SECRET, SESSION_SECRET
docker run -d --name fitdle --restart unless-stopped \
  --env-file .env -p 127.0.0.1:8787:8787 -v fitdle-data:/data \
  ghcr.io/steven-cmy/fitdle:latest
```

Or use [compose.example.yml](compose.example.yml). Image tags are `latest`, the version (e.g. `1.0.55`), `v` plus the version, and the commit SHA; replace `latest` to pin a version.

> Images used to be published at `registry.gitlab.com/cmy/fitdle`. That address is no longer updated; switch the image to the one above and keep your data volume as is.

A few notes:

- `SESSION_SECRET` can be any long random string, e.g. `openssl rand -base64 32`.
- It runs without SSO too, but then only practice mode is available.
- The database lives at `/data/fitdle.sqlite`, so mount a volume there.
- On Unraid, set `PUID=99` and `PGID=100`.
- After changing `PUBLIC_ORIGIN`, recreate the container; a restart is not enough.
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

Health check: `GET /api/v1/health`. If you only see practice mode, check `/api/v1/meta` and the container logs.

## Development

Node 24+. The front end is plain ES modules with no bundler; the back end in `server/` is Fastify + SQLite.

```bash
npm install
npm run prepare:sde       # download the official SDE
npm run build:catalog
npm run build:killpool
npm run build:weights
npm run build             # writes data/ and dist/
npm test

npm install --prefix server
npm run test:server
npm run server:start      # http://127.0.0.1:8787
```

For the front end alone, run `npm start` and open http://127.0.0.1:4173 (practice mode).

UI strings for all 8 languages are in `js/messages/` and must keep the same keys. Use the official EVE translations for game terms (see [docs/i18n-glossary.md](docs/i18n-glossary.md)). More detailed conventions are in [AGENTS.md](AGENTS.md).

## CI

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): pull requests into `main` only build and test, and require a new version and CHANGELOG section when the program changes, not for documentation or `.github/` changes (day-to-day pushes to `dev` run nothing). Merged changes on `main` publish the image to GHCR, deploy [GitHub Pages](https://steven-cmy.github.io/fitdle/) (the static practice build), and create a Release when the version changes and CHANGELOG has a matching section. After a `dev` pull request is merged, [reset-dev.yml](.github/workflows/reset-dev.yml) resets `dev` to the merged `main`; if `dev` has moved since, it leaves the branch alone and comments on the pull request.

## License

The code is [MIT](LICENSE). EVE Online, Pend Insurance, Secure Commerce Commission and the related names, game data, images and fonts belong to Fenris Creations (formerly CCP Games) and are not covered by the MIT license; see [NOTICE.md](NOTICE.md). This is an unofficial fan project, not affiliated with CCP or zKillboard.

The Eve Sans Neue, EveSans and Triglavian fonts in `assets/fonts/` are official EVE fonts owned by Fenris Creations. They are included only for this fan project; please don't reuse them elsewhere. Without them the UI falls back to system fonts and works the same. They will be removed right away if the rights holder asks; sources are listed in [NOTICE.md](NOTICE.md#fonts).
