#!/usr/bin/env bash
# Captures the current IT-923 footnote layout state from the live dev server.
#
# Usage:
#   ./capture.sh [DEV_PORT] [FIXTURE_PATH]
#
# Defaults:
#   DEV_PORT     = auto-detected (first 909x listening)
#   FIXTURE_PATH = ~/Documents/sd-2656-it923-current-fixtures/fixture.docx
#
# Output:
#   tools/sd-2656-footnote-analyzer/output/superdoc-state.json
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_PORT="${1:-}"
FIXTURE="${2:-$HOME/Documents/sd-2656-it923-current-fixtures/fixture.docx}"

if [ -z "$DEV_PORT" ]; then
  DEV_PORT=$(lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep -oE '909[0-9]+' | sort -u | head -1)
fi
if [ -z "$DEV_PORT" ]; then
  echo "ERROR: no dev server on 909x. Run 'pnpm dev' first." >&2
  exit 1
fi
if [ ! -f "$FIXTURE" ]; then
  echo "ERROR: fixture not found: $FIXTURE" >&2
  exit 1
fi

echo "[capture] dev port: $DEV_PORT"
echo "[capture] fixture:  $FIXTURE"

agent-browser open "http://localhost:$DEV_PORT" > /dev/null 2>&1
sleep 4

# Find the file input ref. snapshot -i lines like: `- button "Choose File" [ref=e2]`
SNAP=$(agent-browser snapshot -i 2>&1)
FILE_REF=$(echo "$SNAP" | grep "Choose File" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
if [ -z "$FILE_REF" ]; then
  echo "ERROR: could not find file input ref" >&2
  echo "$SNAP" | head -10 >&2
  exit 1
fi
echo "[capture] file input: $FILE_REF"

agent-browser upload "$FILE_REF" "$FIXTURE" > /dev/null 2>&1
echo "[capture] uploaded — waiting 18s for full layout convergence"
sleep 18

# Sanity check: how many pages did SuperDoc produce?
PAGES=$(agent-browser eval "document.querySelectorAll('[data-page-index]').length" 2>&1 | tail -1 | tr -d '"')
echo "[capture] SuperDoc rendered $PAGES pages (Word: 49)"

# To ensure virtualized pages are mounted, scroll to bottom and back.
agent-browser eval "document.querySelector('.dev-app__main').scrollTop = 1e9" > /dev/null 2>&1
sleep 2
agent-browser eval "document.querySelector('.dev-app__main').scrollTop = 0" > /dev/null 2>&1
sleep 1

# Extract state from layout snapshot.
EXTRACTOR=$(cat "$ROOT/scripts/extract-page-state.js")
OUT_JSON=$(agent-browser eval "$EXTRACTOR" 2>&1 | tail -1)

# agent-browser wraps output in quotes for strings; strip them.
# The eval result is a JSON-stringified payload; agent-browser returns it as
# the string literal (wrapped in quotes with escaped quotes inside).
# We use a Python helper to safely decode.
mkdir -p "$ROOT/output"
echo "$OUT_JSON" | python3 -c "
import sys, json
raw = sys.stdin.read().strip()
# agent-browser may print: \"{\\\"totalPages\\\":...\\\"}\"
if raw.startswith('\"') and raw.endswith('\"'):
    raw = json.loads(raw)
# raw is now a JSON string; validate it parses.
parsed = json.loads(raw)
print(json.dumps(parsed, indent=2))
" > "$ROOT/output/superdoc-state.json"

echo "[capture] wrote $ROOT/output/superdoc-state.json"
python3 -c "
import json
d = json.load(open('$ROOT/output/superdoc-state.json'))
print(f'  totalPages = {d[\"totalPages\"]}')
print(f'  pages with body refs = {sum(1 for p in d[\"pages\"] if p[\"bodyRefs\"])}')
print(f'  pages with footnote slices = {sum(1 for p in d[\"pages\"] if p[\"footnoteSlices\"])}')
"
