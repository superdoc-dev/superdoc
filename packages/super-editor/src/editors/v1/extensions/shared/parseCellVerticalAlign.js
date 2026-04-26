// @ts-check

/**
 * Parse `vertical-align` from inline styles on table cells (TD/TH), e.g. pasted HTML.
 * Maps CSS `middle` to the schema value `center`.
 *
 * @param {HTMLElement} element
 * @returns {string | null}
 */
export function parseCellVerticalAlignFromStyle(element) {
  const value = element.style?.verticalAlign;
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'middle') return 'center';
  return normalized;
}
