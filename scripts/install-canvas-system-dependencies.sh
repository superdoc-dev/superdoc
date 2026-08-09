#!/usr/bin/env bash
set -euo pipefail

apt_timeout="${APT_COMMAND_TIMEOUT:-10m}"
export DEBIAN_FRONTEND="${DEBIAN_FRONTEND:-noninteractive}"

apt_opts=(
  -o Acquire::Retries=3
  -o Dpkg::Use-Pty=0
)

if [ -n "${APT_ARCHIVE_CACHE_DIR:-}" ]; then
  mkdir -p "${APT_ARCHIVE_CACHE_DIR}"
  apt_opts+=(-o "Dir::Cache::Archives=${APT_ARCHIVE_CACHE_DIR}")
fi

run_apt() {
  local label="$1"
  shift

  echo "::group::${label}"
  echo "Running ${label} with ${apt_timeout} timeout"

  set +e
  timeout "${apt_timeout}" sudo apt-get "${apt_opts[@]}" "$@"
  local status=$?
  set -e

  echo "::endgroup::"

  if [ "${status}" -eq 0 ]; then
    return 0
  fi

  if [ "${status}" -eq 124 ]; then
    echo "::error::${label} timed out after ${apt_timeout}"
  else
    echo "::error::${label} failed with status ${status}"
  fi

  date -u '+utc=%Y-%m-%dT%H:%M:%SZ' || true
  ps -ef | grep -E '[a]pt|[d]pkg' || true
  if command -v fuser >/dev/null 2>&1; then
    sudo fuser -v /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend /var/cache/apt/archives/lock || true
  fi
  df -h || true
  exit "${status}"
}

run_apt "apt-get update" update
run_apt "apt-get install canvas system dependencies" install -y --no-install-recommends \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  libpixman-1-dev
