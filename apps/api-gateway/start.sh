#!/bin/sh
set -e
for pkg in types database redis kafka; do
  rm -rf /app/node_modules/@finflow/$pkg
  mkdir -p /app/node_modules/@finflow/$pkg
  printf '{"main":"../../packages/%s/dist/index.js"}' "$pkg" > /app/node_modules/@finflow/$pkg/package.json
done
echo "[startup] @finflow symlink patch done"
exec node apps/api-gateway/dist/server.js
