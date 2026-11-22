#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  case "$PUID" in
    ''|*[!0-9]*) echo "FITDLE startup: PUID must be a positive integer" >&2; exit 1 ;;
  esac
  case "$PGID" in
    ''|*[!0-9]*) echo "FITDLE startup: PGID must be a positive integer" >&2; exit 1 ;;
  esac
  if [ "$PUID" -le 0 ] || [ "$PGID" -le 0 ]; then
    echo "FITDLE startup: PUID and PGID must be greater than 0" >&2
    exit 1
  fi

  DB_PATH="${DATABASE_PATH:-/data/fitdle.sqlite}"
  DB_DIR="$(dirname "$DB_PATH")"
  case "$DB_DIR" in
    /|'')
      echo "FITDLE startup: DATABASE_PATH must point inside a writable directory" >&2
      exit 1
      ;;
  esac
  mkdir -p "$DB_DIR"
  chown -R "$PUID:$PGID" "$DB_DIR" /data /app/dist
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups /app/docker/entrypoint.sh "$@"
fi

if [ -z "${PUBLIC_ORIGIN:-}" ]; then
  echo "FITDLE startup: PUBLIC_ORIGIN is required (for example https://fitdle.example.com)" >&2
  exit 1
fi

node /app/scripts/render-runtime-origin.mjs
exec node /app/server/src/index.mjs
