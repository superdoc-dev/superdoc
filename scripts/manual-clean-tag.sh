#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/manual-clean-tag.sh <version>
# Example: ./scripts/manual-clean-tag.sh v1.2.0-next.2

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: pnpm run manual-clean-tag -- <version>"
  echo ""
  echo "Examples:"
  echo "  pnpm run manual-clean-tag -- v1.2.0-next.2"
  echo "  pnpm run manual-clean-tag -- 1.2.0-next.2"
  exit 1
fi

# Ensure version starts with 'v'
if [[ ! "$VERSION" =~ ^v ]]; then
  VERSION="v$VERSION"
fi

echo "Cleaning up tag: $VERSION"
echo ""

# Delete local tag
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  git tag -d "$VERSION"
  echo "Deleted local tag $VERSION"
else
  echo "Local tag $VERSION does not exist, skipping"
fi

# Delete remote tag
if git ls-remote --tags origin "$VERSION" | grep -q "$VERSION"; then
  git push origin ":refs/tags/$VERSION"
  echo "Deleted remote tag $VERSION"
else
  echo "Remote tag $VERSION does not exist, skipping"
fi

# Delete remote note
NOTE_REF="refs/notes/semantic-release-$VERSION"
if git ls-remote origin "$NOTE_REF" | grep -q "$NOTE_REF"; then
  git push origin ":$NOTE_REF"
  echo "Deleted remote note $NOTE_REF"
else
  echo "Remote note $NOTE_REF does not exist, skipping"
fi

echo ""
echo "Done! Tag $VERSION cleaned up."
