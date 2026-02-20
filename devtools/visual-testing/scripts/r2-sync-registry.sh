#!/usr/bin/env bash
# Add an uploaded doc to the R2 corpus registry.
#
# Usage:
#   pnpm r2:sync-registry tables/cell-shading.docx
#
# Prerequisites:
#   wrangler login  (one-time browser auth)
#   jq              (brew install jq)

set -euo pipefail

BUCKET="docx-test-corpus"
TMP_DIR="$(mktemp -d)"
REGISTRY_FILE="${TMP_DIR}/registry.json"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

KEY="${1:?Usage: pnpm r2:sync-registry <relative-path> (e.g. tables/cell-shading.docx)}"

# Download current registry
echo "Fetching registry.json..."
if wrangler r2 object get "${BUCKET}/registry.json" --remote --file "$REGISTRY_FILE" 2>/dev/null; then
  echo "Found existing registry."
else
  echo "No existing registry — starting fresh."
  echo '{"updated_at":"","docs":[]}' > "$REGISTRY_FILE"
fi

# Derive fields from key
FILENAME="$(basename "$KEY")"
GROUP="$(dirname "$KEY")"
if [ "$GROUP" = "." ]; then
  GROUP=""
fi
DOC_ID="$(echo "$KEY" | sed 's/\.docx$//' | tr '/' '-' | tr -c 'A-Za-z0-9._-' '-' | tr '[:upper:]' '[:lower:]' | sed 's/^-//;s/-$//')"

# Update registry: add or replace entry matching this relative_path
UPDATED="$(jq \
  --arg key "$KEY" \
  --arg doc_id "$DOC_ID" \
  --arg filename "$FILENAME" \
  --arg group "$GROUP" \
  '
  .docs |= (
    [.[] | select(.relative_path != $key)] +
    [{
      doc_id: $doc_id,
      doc_rev: "manual",
      filename: $filename,
      group: (if $group == "" then null else $group end),
      relative_path: $key
    }]
    | sort_by(.relative_path)
  )
  | .updated_at = (now | todate)
  ' "$REGISTRY_FILE")"

echo "$UPDATED" | jq '.' > "$REGISTRY_FILE"

DOC_COUNT="$(echo "$UPDATED" | jq '.docs | length')"
echo "Registry: ${DOC_COUNT} doc(s). Added: ${KEY} (doc_id=${DOC_ID})"

# Upload updated registry
echo "Uploading registry.json..."
wrangler r2 object put "${BUCKET}/registry.json" --remote --file "$REGISTRY_FILE" --content-type "application/json"
echo "Done."
