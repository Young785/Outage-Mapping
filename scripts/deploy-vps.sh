#!/usr/bin/env bash
# Run on the Hostinger VPS after git push (via GitHub Actions or manual SSH).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pull latest main"
git fetch origin main
git reset --hard origin/main

echo "==> Install dependencies"
npm ci

echo "==> Build Next.js"
export NODE_ENV=production
export APP_ENV=production
npm run build

echo "==> Restart app"
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrRestart ecosystem.config.cjs --update-env
  pm2 save
else
  echo "PM2 not found. Start manually: npm start"
  exit 1
fi

echo "==> Deploy complete ($(git rev-parse --short HEAD))"
