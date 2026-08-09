/**
 * Merge config layers without letting an explicit `undefined` erase a value.
 *
 * Object spread treats a present-but-undefined key as a real assignment, so
 * `{ ...legacy, ...next }` clobbers `legacy.closeOnEscape` whenever `next`
 * carries `closeOnEscape: undefined`. That shape is common and unintentional:
 * configs assembled from optional properties, spreads, or destructured
 * arguments routinely carry keys whose value is undefined without the consumer
 * meaning anything by it.
 *
 * Everywhere this migration merges a new spelling over a legacy one, the rule
 * is the same as the single-value case: `undefined` means "unset, fall
 * through", and only an explicit value overrides.
 */

/**
 * Merge sources left to right, skipping keys whose value is `undefined`.
 *
 * Later sources win, as with spread. Non-object sources are ignored so callers
 * can pass a possibly-absent block without guarding first.
 *
 * @param {...(Record<string, unknown> | undefined)} sources
 * @returns {Record<string, unknown>}
 */
export function mergeDefined(...sources) {
  const merged = {};
  for (const source of sources) {
    if (typeof source !== 'object' || source === null) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Pick the first defined value, so `undefined` falls through but `null`,
 * `false`, and `0` are honored as deliberate choices.
 *
 * `??` already does this for null and undefined together, which is wrong when
 * `null` carries meaning — clearing an inherited resolver, for instance.
 *
 * @param {...unknown} values
 * @returns {unknown}
 */
export function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}
