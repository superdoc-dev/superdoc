#!/usr/bin/env bash
# ci-vitest-shard.sh — Run vitest test files in memory-safe batches.
#
# Discovers all test files from the vitest project directories, sorts them
# by file size (heaviest first), distributes across CI shards via round-robin,
# then runs each shard's files in small batches (separate vitest processes)
# so memory is fully released between batches.
#
# Usage: scripts/ci-vitest-shard.sh <shard-index> <total-shards> [batch-size]
#   shard-index:  1-based CI matrix shard number
#   total-shards: total number of CI matrix shards
#   batch-size:   files per vitest invocation (default: 20)

set -euo pipefail

SHARD_INDEX="${1:?Usage: ci-vitest-shard.sh <shard-index> <total-shards> [batch-size]}"
TOTAL_SHARDS="${2:?Usage: ci-vitest-shard.sh <shard-index> <total-shards> [batch-size]}"
BATCH_SIZE="${3:-20}"

# Project directories from vitest.config.mjs
PROJECTS=(
  packages/super-editor
  packages/superdoc
  packages/ai
  packages/collaboration-yjs
  packages/layout-engine/contracts
  packages/layout-engine/layout-bridge
  packages/layout-engine/measuring/dom
  packages/layout-engine/painters/dom
  packages/layout-engine/pm-adapter
  packages/layout-engine/tests
  apps/vscode-ext
)

# Files that must run solo (high memory usage, e.g. crypto operations).
# These are excluded from batched runs and executed individually at the end.
SOLO_FILES=(
  'packages/super-editor/src/core/ooxml-encryption/decrypt-docx.integration.test.ts'
)

# Discover all test files and sort by size descending (heaviest first)
ALL_FILES=$(
  for dir in "${PROJECTS[@]}"; do
    if [ -d "$dir" ]; then
      find "$dir" -name '*.test.ts' -o -name '*.test.js' | while read -r f; do
        # Skip solo files
        for solo in "${SOLO_FILES[@]}"; do
          [ "$f" = "$solo" ] && continue 2
        done
        size=$(wc -c < "$f")
        echo "$size $f"
      done
    fi
  done | sort -rn | awk '{print $2}'
)

# Round-robin distribute across shards (1-based indexing)
SHARD_FILES=()
i=1
while IFS= read -r file; do
  if [ -n "$file" ] && [ $(( (i - 1) % TOTAL_SHARDS + 1 )) -eq "$SHARD_INDEX" ]; then
    SHARD_FILES+=("$file")
  fi
  i=$((i + 1))
done <<< "$ALL_FILES"

echo "=== Shard $SHARD_INDEX/$TOTAL_SHARDS: ${#SHARD_FILES[@]} test files, batch size $BATCH_SIZE ==="

# Run in batches
total=${#SHARD_FILES[@]}
batch_num=0
for ((start=0; start<total; start+=BATCH_SIZE)); do
  batch_num=$((batch_num + 1))
  end=$((start + BATCH_SIZE))
  if [ $end -gt $total ]; then end=$total; fi

  batch=("${SHARD_FILES[@]:start:BATCH_SIZE}")
  echo "--- Batch $batch_num (files $((start+1))-$end of $total) ---"

  pnpm exec vitest run "${batch[@]}"
done

# Solo files are skipped in CI — they need dedicated investigation
# for memory usage. See: https://github.com/superdoc-dev/superdoc/pull/2577
echo "=== Skipped solo files (run separately): ${SOLO_FILES[*]} ==="

echo "=== Shard $SHARD_INDEX/$TOTAL_SHARDS complete: $total files in $batch_num batches ==="
