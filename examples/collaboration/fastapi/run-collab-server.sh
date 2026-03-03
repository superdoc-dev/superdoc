#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT_DIR"

echo "[collab] starting server from packages/superdoc (same as pnpm dev:collab)"
pnpm --prefix packages/superdoc run collab-server
