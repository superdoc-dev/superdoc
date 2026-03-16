#!/usr/bin/env bash
# Consumer typecheck integration test (SD-2227).
#
# Packs the built superdoc package into a tarball and type-checks a minimal
# consumer project with skipLibCheck: false. This catches broken .d.ts imports
# (pnpm paths, workspace refs, missing ambient types) that internal type-check
# doesn't detect because it runs inside the monorepo.
#
# Prerequisites: `pnpm run build` must have run first (dist/ must exist).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$(mktemp -d)"

cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

echo "==> Packing superdoc..."
TARBALL=$(cd "$PKG_DIR" && npm pack --pack-destination "$WORK_DIR" --quiet)

echo "==> Setting up consumer project..."
cp "$SCRIPT_DIR/test.ts" "$WORK_DIR/test.ts"
cp "$SCRIPT_DIR/tsconfig.json" "$WORK_DIR/tsconfig.json"

# Install typescript and @types/node first
npm install --prefix "$WORK_DIR" typescript @types/node --save-dev --silent

# Extract superdoc AFTER npm install (so npm doesn't wipe it)
mkdir -p "$WORK_DIR/node_modules/superdoc"
tar xzf "$WORK_DIR/$TARBALL" -C "$WORK_DIR/node_modules/superdoc" --strip-components=1

echo "==> Running tsc --noEmit (skipLibCheck: false)..."
cd "$WORK_DIR"
npx tsc --noEmit

echo "==> Consumer typecheck passed (0 errors)"
