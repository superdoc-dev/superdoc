import safeRegex from 'safe-regex2';

export const MAX_TEXT_REGEX_PATTERN_LENGTH = 1024;

type CompileSafeTextRegexResult = { ok: true; regex: RegExp } | { ok: false; reason: string };

export function compileSafeTextRegex(
  pattern: string,
  options?: { caseSensitive?: boolean },
): CompileSafeTextRegexResult {
  if (pattern.length > MAX_TEXT_REGEX_PATTERN_LENGTH) {
    return {
      ok: false,
      reason: `Text query regex pattern exceeds ${MAX_TEXT_REGEX_PATTERN_LENGTH} characters.`,
    };
  }

  const flags = options?.caseSensitive ? 'g' : 'gi';
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    return {
      ok: false,
      reason: `Invalid text query regex: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!safeRegex(pattern)) {
    return {
      ok: false,
      reason: 'Unsafe text query regex rejected: pattern may cause excessive backtracking.',
    };
  }

  return { ok: true, regex };
}

export function isSafeTextRegex(pattern: string): boolean {
  return compileSafeTextRegex(pattern).ok;
}
