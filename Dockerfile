# syntax=docker/dockerfile:1
# All-in-one FITDLE image: builds the SDE catalog and static assets, then runs
# the online service which serves dist/, /api and /ws from one origin.

FROM node:24-bookworm-slim AS build

# The published image is origin-neutral; the entrypoint renders the runtime
# PUBLIC_ORIGIN into the static HTML before starting the service.
ARG PUBLIC_ORIGIN=__FITDLE_PUBLIC_ORIGIN__
ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm install --no-audit --no-fund \
  && npm ci --prefix server --no-audit --no-fund

# CI passes 1 to reuse the .cache files of its build job. By default the image
# fetches everything itself, so a local build never picks up an old cache.
ARG REUSE_BUILD_CACHE=0

COPY . .
RUN if [ "$REUSE_BUILD_CACHE" = "1" ] && node scripts/build-cache.mjs; then \
    echo "Reusing CI build cache"; \
  else \
    rm -rf .cache && npm run prepare:sde; \
  fi
RUN npm run build:catalog
RUN if [ "$REUSE_BUILD_CACHE" = "1" ] && [ -f .cache/killpool.json ]; then \
    echo "Reusing CI kill pool"; \
  else \
    npm run build:killpool; \
  fi
RUN if [ "$REUSE_BUILD_CACHE" = "1" ] && [ -f .cache/ship-weights.json ]; then \
    echo "Reusing CI ship weights"; \
  else \
    npm run build:weights; \
  fi
# Monthly zKill usage per hull from the data branch; without it every hull keeps
# the start weight. CI hands over the file it already downloaded.
RUN if [ "$REUSE_BUILD_CACHE" != "1" ] || [ ! -f .cache/ship-usage.json ]; then npm run fetch:usage; fi \
  && { [ -f .cache/ship-usage.json ] || echo '{"version":1,"ships":{}}' > .cache/ship-usage.json; } \
  && cp .cache/ship-usage.json data/ship-usage.json
RUN npm run build
RUN npm test
RUN npm test --prefix server

FROM node:24-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="FITDLE" \
      org.opencontainers.image.description="FITDLE full-stack EVE Online claims puzzle service" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    STATIC_DIR=dist \
    DATABASE_PATH=/data/fitdle.sqlite \
    PUID=1000 \
    PGID=1000

# Ownership is set while copying: a later recursive chown would store every file
# in the image a second time.
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/data/catalog.json /app/data/manifest.json /app/data/search.json /app/data/module-fallback.json /app/data/ship-usage.json ./data/
COPY --chown=node:node --from=build /app/data/refs/en.json ./data/refs/en.json
COPY --chown=node:node --from=build /app/js ./js
COPY --chown=node:node --from=build /app/server/package.json ./server/package.json
COPY --chown=node:node --from=build /app/server/node_modules ./server/node_modules
COPY --chown=node:node --from=build /app/server/src ./server/src
COPY --chown=node:node --from=build /app/scripts/render-runtime-origin.mjs ./scripts/render-runtime-origin.mjs
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh

# Audit and Arbitration rooms run the dogma engine on the server; js/dogma.js
# resolves it at /app/vendor, so point that at the copy already in dist/.
RUN ln -s dist/vendor /app/vendor \
  && chmod +x /app/docker/entrypoint.sh \
  && mkdir -p /data \
  && chown node:node /data

# The entrypoint starts as root only to make the database volume writable,
# then drops to the unprivileged node user before starting the service.
VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker/entrypoint.sh"]
