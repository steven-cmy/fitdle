#!/bin/sh
set -eu

REPO="${FITDLE_REPO:-https://gitlab.com/cmy/fitdle.git}"
REF="${FITDLE_REF:-main}"
OUT="${OUTPUT_DIR:-/out}"
PUID="${PUID:-99}"
PGID="${PGID:-100}"
SITE_URL="${SITE_URL:-}"

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
mkdir -p "$WORK/repo"

GIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch "$REF" "$REPO" "$WORK/repo"

cd "$WORK/repo"

log "installing build tools"
npm install --no-audit --no-fund

log "fetching official SDE"
npm run prepare:sde

log "building fallback kill pool"
npm run build:killpool

log "building catalog and first dist"
npm run build

log "refreshing ship usage weights"
npm run build:weights -- --refresh

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
