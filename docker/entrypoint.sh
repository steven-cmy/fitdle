#!/bin/sh
set -eu

if [ -z "${PUBLIC_ORIGIN:-}" ]; then
  echo "FITDLE startup: PUBLIC_ORIGIN is required (for example https://fitdle.example.com)" >&2
  exit 1
fi

node /app/scripts/render-runtime-origin.mjs
exec node /app/server/src/index.mjs
