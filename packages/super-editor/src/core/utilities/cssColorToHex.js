/**
 * Converts a CSS color value to hex format (#RRGGBB).
 * Handles rgb(), rgba(), hex, and returns null for empty/invalid input.
 *
 * @param {string|null|undefined} cssColor - A CSS color string
 * @returns {string|null} Hex color string or null
 */
export function cssColorToHex(cssColor) {
  if (!cssColor) return null;
  const trimmed = cssColor.trim();
  if (!trimmed) return null;

  // Already hex — pass through
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed;
  }

  // Parse rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return '#' + [r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('');
  }

  // Return as-is for other valid formats (named colors, etc.)
  // Browsers normalize pasted colors to rgb(), so this is a rare fallback
  return trimmed;
}
