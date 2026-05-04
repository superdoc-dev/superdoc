#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR/yjs-hub"

if ! node -e "require.resolve('@y/hub/package.json')" >/dev/null 2>&1; then
  pnpm install --ignore-workspace --lockfile=false
fi

USE_DOCKER=1
if [ "${1:-}" = "--no-docker" ]; then
  USE_DOCKER=0
fi

if [ "$USE_DOCKER" -eq 1 ]; then
  if docker info >/dev/null 2>&1; then
    pnpm run deps:up
  else
    echo "[yjs-hub] Docker daemon is not running."
    echo "[yjs-hub] Start Docker Desktop and retry, or run: ./run-yjs-hub.sh --no-docker"
    echo "[yjs-hub] In --no-docker mode you must provide local Redis (6379) and Postgres (5432/yhub)."
    exit 1
  fi
fi

pnpm run dev
