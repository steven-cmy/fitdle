#!/bin/sh
set -eu

REPO="${FITDLE_REPO:-https://gitlab.com/cmy/fitdle.git}"
REF="${FITDLE_REF:-main}"
OUT="${OUTPUT_DIR:-/out}"
CACHE_DIR="${CACHE_DIR:-/cache}"
PUID="${PUID:-99}"
PGID="${PGID:-100}"
SITE_URL="${SITE_URL:-}"
FORCE_SDE="${FORCE_SDE:-0}"

log() {
  printf '[fitdle-oneshot] %s\n' "$*"
}

die() {
  printf '[fitdle-oneshot] ERROR: %s\n' "$*" >&2
  exit 1
}

case "$PUID" in
  ''|*[!0-9]*) die "PUID must be a numeric UID (got '$PUID')" ;;
esac
case "$PGID" in
  ''|*[!0-9]*) die "PGID must be a numeric GID (got '$PGID')" ;;
esac

umask 022

WORK="$(mktemp -d)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$WORK" "$STAGE"' EXIT HUP INT TERM

log "repository: $REPO ($REF)"
log "output:     $OUT (owner $PUID:$PGID)"

mkdir -p "$OUT"
mkdir -p "$CACHE_DIR"
mkdir -p "$WORK/repo"

GIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch "$REF" "$REPO" "$WORK/repo"

cd "$WORK/repo"
# Keep SDE, killpool and weights between one-shot runs without exposing them
# through the published output volume.
rm -rf .cache
ln -s "$CACHE_DIR" .cache

log "installing build tools"
npm install --no-audit --no-fund

log "checking cached SDE"
SDE_REFRESH=0
if [ "$FORCE_SDE" = "1" ]; then
  log "FORCE_SDE=1: downloading the official SDE"
  SDE_REFRESH=1
elif ! node scripts/check-sde-cache.mjs; then
  log "newer SDE detected: downloading the official SDE"
  SDE_REFRESH=1
fi
if [ "$SDE_REFRESH" = "1" ]; then
  npm run prepare:sde -- --refresh
else
  npm run prepare:sde
fi

log "building initial catalog"
npm run build:catalog

log "building fallback kill pool"
if [ "${FORCE_KILLPOOL:-0}" = "1" ] || [ ! -f .cache/killpool.json ] || ! node -e "const p=require('./.cache/killpool.json'); process.exit(Date.now()-Date.parse(p.generatedAt||0) < 86400000 ? 0 : 1)"; then
  npm run build:killpool
fi

log "refreshing ship usage weights"
if [ "${FORCE_WEIGHTS:-0}" = "1" ]; then
  npm run build:weights -- --refresh
else
  npm run build:weights
fi

log "building final static site"
if [ -n "$SITE_URL" ]; then
  SITE_URL="$SITE_URL" npm run build
else
  npm run build
fi

log "running tests"
npm test

log "preparing output"
cp -a dist/. "$STAGE"/
find "$STAGE" -type d -exec chmod 0755 {} +
find "$STAGE" -type f -exec chmod 0644 {} +
chown -R "$PUID:$PGID" "$STAGE"

# Only replace the old deployment after every build step and test succeeded.
# The target volume is expected to be dedicated to FITDLE.
find "$OUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$STAGE"/. "$OUT"/
chown "$PUID:$PGID" "$OUT"
chmod 0755 "$OUT"

log "done: $(find "$OUT" -type f | wc -l) files, owner $PUID:$PGID, dirs 755, files 644"
