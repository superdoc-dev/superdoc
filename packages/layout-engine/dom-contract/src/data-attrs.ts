/**
 * DOM Contract: Data Attributes
 *
 * Named constants for `data-*` attributes stamped on rendered DOM elements.
 * These attributes are read by editor-side DOM observers, click-to-position
 * mapping, and bridge compatibility code.
 *
 * Each constant stores the full attribute name (e.g. `"data-pm-start"`) as it
 * appears in `getAttribute()` / `setAttribute()` calls and CSS selectors.
 *
 * The `DATASET_KEYS` mirror provides the camelCase equivalents used with
 * `element.dataset.*` access.
 */

/**
 * Full attribute names for use with `getAttribute` / `setAttribute` / CSS selectors.
 */
export const DATA_ATTRS = {
  /** ProseMirror start position of the element's content range. */
  PM_START: 'data-pm-start',

  /** ProseMirror end position of the element's content range. */
  PM_END: 'data-pm-end',

  /** Layout epoch stamp — incremented on each layout pass. */
  LAYOUT_EPOCH: 'data-layout-epoch',

  /** JSON-encoded table boundary metadata for resize overlays. */
  TABLE_BOUNDARIES: 'data-table-boundaries',
} as const;

/**
 * CamelCase keys for use with `element.dataset.*` property access.
 *
 * `element.dataset.pmStart` is equivalent to `element.getAttribute('data-pm-start')`.
 */
export const DATASET_KEYS = {
  PM_START: 'pmStart',
  PM_END: 'pmEnd',
  LAYOUT_EPOCH: 'layoutEpoch',
  TABLE_BOUNDARIES: 'tableBoundaries',
} as const;
