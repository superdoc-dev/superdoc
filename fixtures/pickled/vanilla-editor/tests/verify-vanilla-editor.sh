#!/usr/bin/env bash
set -euo pipefail

test -f src/embed-superdoc.js

grep -Fq "SuperDoc" src/embed-superdoc.js
grep -Fq "superdoc/style.css" src/embed-superdoc.js
grep -Eq "from ['\"]superdoc['\"]" src/embed-superdoc.js
grep -Fq "embedSuperDoc" src/embed-superdoc.js
grep -Fq "new SuperDoc" src/embed-superdoc.js
grep -Fq "selector" src/embed-superdoc.js
grep -Fq "#editor" src/embed-superdoc.js
grep -Fq "documents" src/embed-superdoc.js
grep -Eq "type:[[:space:]]*['\"]docx['\"]" src/embed-superdoc.js
grep -Eq "data:[[:space:]]*file" src/embed-superdoc.js
grep -Eq "documentMode:[[:space:]]*['\"]editing['\"]" src/embed-superdoc.js

if grep -Eq "documentMode:[[:space:]]*['\"](edit|view|suggest)['\"]" src/embed-superdoc.js; then
  echo "unsupported documentMode name" >&2
  exit 1
fi
