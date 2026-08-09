#!/usr/bin/env bash
set -euo pipefail

superdoc open ./contract.docx
trap 'superdoc close --discard >/dev/null 2>&1 || true' EXIT
superdoc track-changes list
superdoc track-changes accept-all
superdoc save --out ./contract.accepted.docx
