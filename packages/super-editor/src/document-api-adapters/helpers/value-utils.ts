/**
 * Shared scalar utility functions for document-api adapters.
 */

/**
 * Returns the value as a string if it is a non-empty string, otherwise `undefined`.
 *
 * @param value - The value to test.
 */
export function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Coerces a value to a finite number. Accepts numbers and numeric strings.
 *
 * @param value - The value to coerce.
 * @returns A finite number, or `undefined` if the value cannot be coerced.
 */
export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Coerces a value to a stable ID string. Accepts non-empty strings and finite numbers.
 *
 * @param value - The value to coerce.
 * @returns A string ID, or `undefined` if the value is not a valid identifier.
 */
export function toId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Extracts a comment ID from node attributes, checking `commentId`, `importedId`, and `w:id` in order.
 *
 * @param attrs - The attributes record to search.
 * @returns The first non-empty comment ID found, or `undefined`.
 */
export function resolveCommentIdFromAttrs(attrs: Record<string, unknown>): string | undefined {
  return toNonEmptyString(attrs.commentId) ?? toNonEmptyString(attrs.importedId) ?? toNonEmptyString(attrs['w:id']);
}

/**
 * Normalizes whitespace in a text excerpt and returns `undefined` for empty results.
 *
 * @param text - The raw text to normalize.
 * @returns Trimmed text with collapsed whitespace, or `undefined` if empty.
 */
export function normalizeExcerpt(text: string): string | undefined {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length ? trimmed : undefined;
}
