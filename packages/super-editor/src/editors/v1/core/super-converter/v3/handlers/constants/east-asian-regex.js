// @ts-check

// Matches characters in the East Asian scripts that typically use the
// separate eastAsia font family in OOXML documents.
export const EAST_ASIAN_CHARACTER_REGEX =
  /[\u1100-\u11FF\u2E80-\u2EFF\u2F00-\u2FDF\u3040-\u30FF\u3100-\u312F\u3130-\u318F\u31A0-\u31BF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/u;
