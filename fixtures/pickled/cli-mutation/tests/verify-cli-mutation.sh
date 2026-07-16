#!/usr/bin/env bash
set -euo pipefail

test -f scripts/update-contract.sh
test -x scripts/update-contract.sh

grep -Fq "set -euo pipefail" scripts/update-contract.sh
grep -Fq "superdoc open ./contract.docx" scripts/update-contract.sh
grep -Fq "superdoc query match" scripts/update-contract.sh
grep -Fq -- "--select-json" scripts/update-contract.sh
grep -Fq -- "--require exactlyOne" scripts/update-contract.sh
grep -Eq "target|target-json|block-id|start|end" scripts/update-contract.sh
grep -Fq "superdoc replace" scripts/update-contract.sh
grep -Fq "superdoc save --in-place" scripts/update-contract.sh
grep -Fq "superdoc close" scripts/update-contract.sh

if grep -Eq "superdoc find.*(replace|target|mutation)|superdoc replace-legacy" scripts/update-contract.sh; then
  echo "CLI mutation fixture must use query match, not find or replace-legacy" >&2
  exit 1
fi
