#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/manual-tag.sh <version> <commit>
# Example: ./scripts/manual-tag.sh v1.2.0-next.1 b4903188
#          ./scripts/manual-tag.sh v1.2.0 HEAD

VERSION="${1:-}"
COMMIT="${2:-HEAD}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: pnpm run manual-tag -- <version> [commit]"
  echo ""
  echo "Examples:"
  echo "  pnpm run manual-tag -- v1.2.0-next.1 b4903188"
  echo "  pnpm run manual-tag -- v1.2.0 HEAD"
  exit 1
fi

# Ensure version starts with 'v'
if [[ ! "$VERSION" =~ ^v ]]; then
  VERSION="v$VERSION"
fi

# Extract version without 'v' prefix for semver parsing
VERSION_NUM="${VERSION#v}"

# Determine channel from version
if [[ "$VERSION_NUM" =~ -next\. ]]; then
  CHANNEL="next"
elif [[ "$VERSION_NUM" =~ -beta\. ]]; then
  CHANNEL="beta"
elif [[ "$VERSION_NUM" =~ -alpha\. ]]; then
  CHANNEL="alpha"
elif [[ "$VERSION_NUM" =~ -([a-z]+)\. ]]; then
  CHANNEL="${BASH_REMATCH[1]}"
else
  CHANNEL="latest"
fi

echo "Creating tag: $VERSION"
echo "  Commit: $COMMIT"
echo "  Channel: $CHANNEL"
echo ""

# Resolve commit to full hash
FULL_COMMIT=$(git rev-parse "$COMMIT")
echo "Resolved commit: $FULL_COMMIT"

# Check if tag already exists
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "Error: Tag $VERSION already exists"
  exit 1
fi

# Create the tag
git tag "$VERSION" "$FULL_COMMIT"
echo "Created tag $VERSION"

# Add semantic-release note
NOTE_REF="semantic-release-$VERSION"
NOTE_CONTENT="{\"channels\":[\"$CHANNEL\"]}"
git notes --ref="$NOTE_REF" add -m "$NOTE_CONTENT" "$VERSION"
echo "Added note: $NOTE_CONTENT (ref: $NOTE_REF)"

# Push tag and note
echo ""
echo "Pushing to origin..."
git push origin "$VERSION"
git push origin "refs/notes/$NOTE_REF"

echo ""
echo "Done! Tag $VERSION created with channel '$CHANNEL'"
echo ""
echo "Verify with:"
echo "  git log --tags='$VERSION' --decorate-refs='refs/tags/*' --no-walk --format='%d%x09%N' --notes='refs/notes/semantic-release*'"
