#!/usr/bin/env bash
# Build frontend for same-origin (nginx) and run full stack.
set -e

# Get the root directory
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

echo "Building frontend (docker config, same-origin API)..."
npm install
npm run build -- --configuration=docker

# Find where Angular put the files (handles different versions)
OUT=""
for path in dist/frontend/browser dist/frontend dist/browser dist; do
  if [ -f "$path/index.html" ]; then
    OUT="$path"
    break
  fi
done

if [ -z "$OUT" ]; then
  echo "Error: Build output not found. Check frontend/dist/."
  exit 1
fi

echo "Copying $OUT -> frontend-dist"
mkdir -p "$ROOT/frontend-dist"
rm -rf "$ROOT/frontend-dist/*"
cp -r "$OUT"/* "$ROOT/frontend-dist/"

cd "$ROOT"
echo "Starting Docker Compose (nginx + backend + redis + postgres)..."
docker compose up -d --build

echo "Done. Open http://localhost (all traffic via nginx)."
