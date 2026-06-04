/**
 * Extracts the field dispatch keyword from an instruction string.
 * Field type names are case-insensitive in OOXML; only normalize the dispatch
 * token so downstream processors still receive the original instruction text.
 *
 * @param {string} instruction
 * @returns {string}
 */
export function extractFieldKeyword(instruction) {
  return String(instruction ?? '')
    .trim()
    .split(/\s+/)[0]
    .toUpperCase();
}
