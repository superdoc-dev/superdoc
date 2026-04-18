/**
 * @param {string} json
 * @returns {Object}
 */
export function parseTagValueJSON(json) {
  if (typeof json !== 'string') {
    return {};
  }

  const trimmed = json.trim();

  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}
