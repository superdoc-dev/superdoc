/**
 * Normalizes runProperties objects so empty or invalid values are treated as null.
 *
 * @param {Record<string, unknown> | null | undefined} runProperties
 * @returns {Record<string, unknown> | null}
 */
export function normalizeRunProperties(runProperties) {
  if (!runProperties || typeof runProperties !== 'object') return null;
  return Object.keys(runProperties).length > 0 ? runProperties : null;
}
