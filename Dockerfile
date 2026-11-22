# syntax=docker/dockerfile:1
# All-in-one FITDLE image: builds the SDE catalog and static assets, then runs
# the online service which serves dist/, /api and /ws from one origin.

FROM node:24-bookworm-slim AS build

ARG PUBLIC_ORIGIN=http://127.0.0.1:8787
ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm install --no-audit --no-fund \
  && npm ci --prefix server --no-audit --no-fund

COPY . .
RUN npm run prepare:sde
RUN npm run build:catalog
RUN npm run build:killpool
RUN npm run build:weights -- --refresh
RUN npm run build
RUN npm test
RUN npm test --prefix server

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    STATIC_DIR=dist \
    DATABASE_PATH=/data/fitdle.sqlite

COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY --from=build /app/js ./js
COPY --from=build /app/server ./server

RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.mjs"]
