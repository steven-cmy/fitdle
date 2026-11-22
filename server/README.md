# FITDLE online service

Node 24 service that provides EVE SSO sessions, online targets/results,
statistics and authoritative WebSocket rooms. It also serves `dist/`.

```bash
npm install --prefix server
npm run build            # produce dist/ and data/
npm run server:start
```

Default: `http://127.0.0.1:8787/` serving `dist/` plus `/api` and `/ws`.

The service loads the repository-root `.env`; process environment variables take
precedence. Configure only `PUBLIC_ORIGIN` (plus the EVE client id/secret and
`SESSION_SECRET`) for a single-domain deployment. The OAuth callback, share/OG
origin, same-origin API base and secure-cookie flag are derived. Set
`API_ORIGIN` only when the API is hosted separately from the browser site.

```dotenv
PUBLIC_ORIGIN=https://fitdle.example.com
EVE_CLIENT_ID=...
EVE_CLIENT_SECRET=...
SESSION_SECRET=...
```

EVE application callback URL:

```text
${API_ORIGIN || PUBLIC_ORIGIN}/api/v1/auth/eve/callback
```

The app requests only `publicData`, keeps the client secret server-side, and
validates the SSO issuer/audience and JWT expiry. `FITDLE_DEV_AUTH=1` enables the
local `/api/v1/auth/dev` helper and must never be enabled in production.

The service uses SQLite through `node:sqlite`; no second runtime database is
required. `DATABASE_PATH` defaults to `.cache/fitdle-online.sqlite`; container
deployments should point it at a persistent volume. `ROOM_MAX_PLAYERS` controls
the total room-seat limit (default 8, allowed 2..32; includes spectators and
offline seats). `ROOM_ARBITRATION_BIG_ROUNDS` / `ROOM_ARBITRATION_MAX_BIG_ROUNDS` set the Arbitration
big-round default and host cap; `ROOM_TIMED_DURATION_MINUTES` /
`ROOM_TIMED_MAX_DURATION_MINUTES` set the Timed room duration default and cap.
Do not commit the database file. Daily targets and room answers
are server-side state and must not be exposed through logs or public stats.
