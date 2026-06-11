#!/usr/bin/env bash
set -euo pipefail

test -f src/ContractEditor.tsx

grep -Fq "SuperDocEditor" src/ContractEditor.tsx
grep -Fq "@superdoc-dev/react" src/ContractEditor.tsx
grep -Fq "@superdoc-dev/react/style.css" src/ContractEditor.tsx
grep -Fq "document={file}" src/ContractEditor.tsx
grep -Eq "documentMode=['\"]editing['\"]" src/ContractEditor.tsx
grep -Fq "onReady" src/ContractEditor.tsx

if grep -Eq "from ['\"]superdoc['\"]" src/ContractEditor.tsx; then
  echo "React wrapper fixture must not import from core superdoc directly" >&2
  exit 1
fi

if grep -Eq "documentMode=['\"](edit|view|suggest)['\"]" src/ContractEditor.tsx; then
  echo "unsupported documentMode name" >&2
  exit 1
fi
