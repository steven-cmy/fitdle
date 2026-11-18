# syntax=docker/dockerfile:1

# Single all-in-one image: build the static site during the image build, then
# serve the finished dist/ from a minimal Node runtime.
FROM node:22-bookworm-slim AS build

ARG SITE_URL=http://127.0.0.1:4173

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm install --no-audit --no-fund
RUN npm run prepare:sde
RUN npm run build:catalog
RUN npm run build:killpool
RUN npm run build:weights -- --refresh
RUN SITE_URL="${SITE_URL}" npm run build
RUN npm test

FROM node:22-alpine AS runtime

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/serve.mjs ./scripts/serve.mjs

ENV HOST=0.0.0.0 \
    PORT=4173 \
    NODE_ENV=production

EXPOSE 4173
USER node

CMD ["node", "scripts/serve.mjs", "--root", "dist"]
