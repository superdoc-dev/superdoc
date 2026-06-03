import { isEqual, isMatch } from 'lodash';

/**
 * @param {import('./types.js').Attrs} [attrs]
 * @returns {import('./types.js').Attrs}
 */
const normalizeAttrs = (attrs = {}) => {
  return Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined));
};

/**
 * @param {import('./types.js').Attrs} [attrs]
 * @returns {import('./types.js').Attrs}
 */
const stripUnsetInternalSnapshotAttrs = (attrs = {}) => {
  const nextAttrs = { ...attrs };
  if (nextAttrs.ooxmlHighlightClear === null || nextAttrs.ooxmlHighlightClear === undefined) {
    delete nextAttrs.ooxmlHighlightClear;
  }
  return nextAttrs;
};

/**
 * Create a `MarkSnapshot` from a mark type name and attribute bag.
 * Internal snapshot attrs (e.g. `ooxmlHighlightClear`) are stripped
 * when unset so equality checks are stable. The returned snapshot
 * always has `attrs` set (defaulting to `{}`).
 *
 * @param {string} type - The PM mark type name (e.g. `'bold'`).
 * @param {import('./types.js').Attrs} [attrs] - Attribute bag for the
 *   snapshot. Defaults to `{}`.
 * @returns {import('./types.js').MarkSnapshot} Normalized snapshot.
 */
export const createMarkSnapshot = (type, attrs = {}) => {
  return {
    type,
    attrs: stripUnsetInternalSnapshotAttrs(attrs),
  };
};

/**
 * Attribute values that are semantically equivalent to "not set" for tracking purposes.
 * These represent the default visual state and should not count as a change.
 */
const IDENTITY_ATTR_VALUES = {
  vertAlign: 'baseline',
  position: '0pt',
};

/**
 * Mark types where the mark's effect is determined entirely by its attributes.
 * An entry with empty normalized attrs means the mark has no visual effect.
 * In contrast, structural marks (bold, italic) have their effect from being present.
 */
const ATTRIBUTE_ONLY_MARKS = ['textStyle'];

/**
 * Normalize snapshot attrs for tracked change comparison.
 * Strips null/undefined AND identity values that represent the default visual state.
 *
 * @param {import('./types.js').Attrs} [attrs]
 * @returns {import('./types.js').Attrs}
 */
const normalizeSnapshotAttrs = (attrs = {}) => {
  const base = normalizeAttrs(attrs);
  return Object.fromEntries(Object.entries(base).filter(([key, value]) => IDENTITY_ATTR_VALUES[key] !== value));
};

/**
 * Extract the mark type name from either a live PM `Mark` (where
 * `.type` is a `MarkType` object) or a `MarkSnapshot` (where `.type`
 * is already a string).
 *
 * @param {import('./types.js').MarkLike | null | undefined} markLike
 * @returns {string | undefined} The mark type name, or `undefined` if
 *   the input is missing a `.type`.
 */
export const getTypeName = (markLike) => {
  return markLike?.type?.name ?? markLike?.type;
};

/**
 * Check whether a tracked format change is effectively a no-op.
 * Compares before/after snapshot lists after normalizing identity
 * attribute values and removing attribute-only marks (e.g. `textStyle`)
 * whose normalized attrs are empty.
 *
 * Accepts the permissive `SnapshotLike[]` shape because the caller
 * sources these lists from `formatChangeMark.attrs.before/after`, an
 * attribute bag that TS infers loosely. Runtime is tolerant of missing
 * fields (`getTypeName` returns `undefined`, attr merges guard with
 * `attrs || {}`).
 *
 * @param {import('./types.js').SnapshotLike[]} before
 * @param {import('./types.js').SnapshotLike[]} after
 * @returns {boolean} `true` when before and after produce the same
 *   visual state.
 */
export const isTrackFormatNoOp = (before, after) => {
  const normalize = (entries) =>
    entries
      .map((s) => ({
        type: getTypeName(s),
        attrs: normalizeSnapshotAttrs(s.attrs || {}),
      }))
      .filter((s) => {
        // For attribute-only marks (e.g. textStyle), empty attrs = no visual effect → filter out
        if (ATTRIBUTE_ONLY_MARKS.includes(s.type) && Object.keys(s.attrs).length === 0) return false;
        return true;
      });

  const normBefore = normalize(before);
  const normAfter = normalize(after);

  if (normBefore.length === 0 && normAfter.length === 0) return true;
  if (normBefore.length !== normAfter.length) return false;

  return (
    normBefore.every((b) => normAfter.some((a) => a.type === b.type && isEqual(a.attrs, b.attrs))) &&
    normAfter.every((a) => normBefore.some((b) => b.type === a.type && isEqual(b.attrs, a.attrs)))
  );
};

/**
 * Compare two attribute bags for exact equality after normalizing
 * null/undefined entries out of each side.
 *
 * @param {import('./types.js').Attrs} [left]
 * @param {import('./types.js').Attrs} [right]
 * @returns {boolean}
 */
export const attrsExactlyMatch = (left = {}, right = {}) => {
  const normalizedLeft = normalizeAttrs(left);
  const normalizedRight = normalizeAttrs(right);
  return isEqual(normalizedLeft, normalizedRight);
};

/**
 * @param {import('./types.js').MarkLike | null | undefined} left
 * @param {import('./types.js').MarkLike | null | undefined} right
 * @param {boolean} [exact=true] - When `false`, only type names need to
 *   match (attrs are ignored).
 * @returns {boolean}
 */
const marksMatch = (left, right, exact = true) => {
  if (!left || !right || getTypeName(left) !== getTypeName(right)) {
    return false;
  }

  if (!exact) {
    return true;
  }

  return attrsExactlyMatch(left.attrs || {}, right.attrs || {});
};

/**
 * Check whether a snapshot matches a step mark (either by full attr
 * equality or by type name only, depending on `exact`).
 *
 * @param {import('./types.js').MarkLike} snapshot
 * @param {import('./types.js').MarkLike} stepMark
 * @param {boolean} [exact=true]
 * @returns {boolean}
 */
export const markSnapshotMatchesStepMark = (snapshot, stepMark, exact = true) => {
  return marksMatch(snapshot, stepMark, exact);
};

/**
 * Check whether any mark in `marks` matches `stepMark` exactly
 * (same type name and attrs).
 *
 * @param {import('./types.js').MarkLike[]} marks
 * @param {import('./types.js').MarkLike} stepMark
 * @returns {boolean}
 */
export const hasMatchingMark = (marks, stepMark) => {
  return marks.some((mark) => {
    return marksMatch(mark, stepMark, true);
  });
};

/**
 * Insert or update a snapshot in `snapshots` keyed by `type`. Merges
 * `incoming.attrs` over the existing entry's attrs when a match exists;
 * otherwise appends a freshly normalized snapshot.
 *
 * Accepts the permissive `SnapshotLike[]` input (callers may source
 * from `formatChangeMark.attrs.*`). Output is the strict
 * `MarkSnapshot[]` because `createMarkSnapshot` is the only path for
 * new entries and it always normalizes.
 *
 * @param {import('./types.js').SnapshotLike[]} snapshots - Current set.
 * @param {import('./types.js').MarkSnapshot} incoming - Snapshot to merge in.
 * @returns {import('./types.js').MarkSnapshot[]} New array (input not mutated).
 */
export const upsertMarkSnapshotByType = (snapshots, incoming) => {
  const existing = snapshots.find((mark) => mark.type === incoming.type);
  if (existing) {
    const merged = {
      ...existing,
      attrs: stripUnsetInternalSnapshotAttrs({ ...existing.attrs, ...incoming.attrs }),
    };
    return snapshots.map((mark) => (mark === existing ? merged : mark));
  }
  return [...snapshots, createMarkSnapshot(incoming.type, incoming.attrs)];
};

/**
 * @param {import('./types.js').MarkLike | null | undefined} mark
 * @param {import('./types.js').MarkLike | null | undefined} snapshot
 * @param {boolean} [exact=true]
 * @returns {boolean}
 */
const markMatchesSnapshot = (mark, snapshot, exact = true) => {
  return marksMatch(mark, snapshot, exact);
};

/**
 * @param {import('./types.js').PmMark | null | undefined} mark - Live PM mark.
 * @param {import('./types.js').MarkSnapshot | null | undefined} snapshot
 * @returns {boolean} `true` when the live mark's attrs are a superset of
 *   the snapshot's normalized attrs (and snapshot has at least one attr).
 */
const markAttrsIncludeSnapshotAttrs = (mark, snapshot) => {
  if (!mark || !snapshot || mark.type.name !== snapshot.type) {
    return false;
  }

  const normalizedMarkAttrs = normalizeAttrs(mark.attrs || {});
  const normalizedSnapshotAttrs = normalizeAttrs(snapshot.attrs || {});

  if (Object.keys(normalizedSnapshotAttrs).length === 0) {
    return false;
  }

  return isMatch(normalizedMarkAttrs, normalizedSnapshotAttrs);
};

// Attribute-only marks (like textStyle) can be serialized with different attr density
// between snapshot and live state. This overlap matcher lets reject find the live mark
// when exact/subset comparisons fail but shared attrs still clearly identify the mark.
/**
 * @param {import('./types.js').PmMark | null | undefined} mark
 * @param {import('./types.js').MarkSnapshot | null | undefined} snapshot
 * @returns {boolean}
 */
const markAttrsMatchOnOverlap = (mark, snapshot) => {
  if (!mark || !snapshot || mark.type.name !== snapshot.type) {
    return false;
  }

  if (!ATTRIBUTE_ONLY_MARKS.includes(snapshot.type)) {
    return false;
  }

  const normalizedMarkAttrs = normalizeAttrs(mark.attrs || {});
  const normalizedSnapshotAttrs = normalizeAttrs(snapshot.attrs || {});
  const markKeys = Object.keys(normalizedMarkAttrs);
  const snapshotKeys = Object.keys(normalizedSnapshotAttrs);

  if (markKeys.length === 0 || snapshotKeys.length === 0) {
    return false;
  }

  const overlapKeys = markKeys.filter((key) => Object.prototype.hasOwnProperty.call(normalizedSnapshotAttrs, key));
  if (overlapKeys.length === 0) {
    return false;
  }

  return overlapKeys.every((key) => isEqual(normalizedMarkAttrs[key], normalizedSnapshotAttrs[key]));
};

/**
 * Find the live PM mark in `[from, to]` that best matches `snapshot`.
 * Priority: exact attr match → snapshot-subset → attribute overlap →
 * type-only fallback (only when snapshot has no attrs). Returns `null`
 * if no candidate is found.
 *
 * @param {object} args
 * @param {import('./types.js').PmNode} args.doc - Document to scan.
 * @param {number} args.from - Range start position (inclusive).
 * @param {number} args.to - Range end position (exclusive).
 * @param {import('./types.js').MarkSnapshot} args.snapshot - Target snapshot.
 * @returns {import('./types.js').PmMark | null} The matching live mark,
 *   or `null` if none found.
 */
export const findMarkInRangeBySnapshot = ({ doc, from, to, snapshot }) => {
  let exactMatch = null;
  let subsetMatch = null;
  let overlapMatch = null;
  let typeOnlyMatch = null;
  const normalizedSnapshotAttrs = normalizeAttrs(snapshot?.attrs || {});
  const hasSnapshotAttrs = Object.keys(normalizedSnapshotAttrs).length > 0;
  const shouldFallbackToTypeOnly = !hasSnapshotAttrs;

  doc.nodesBetween(from, to, (node) => {
    // nodesBetween cannot be fully broken; skip extra scans once exact match is found.
    if (exactMatch) {
      return false;
    }

    if (!node.isInline) {
      return;
    }

    const exact = node.marks.find((mark) => markMatchesSnapshot(mark, snapshot, true));
    if (exact && !exactMatch) {
      exactMatch = exact;
      return false;
    }

    if (!subsetMatch) {
      const subset = node.marks.find((mark) => markAttrsIncludeSnapshotAttrs(mark, snapshot));
      if (subset) {
        subsetMatch = subset;
      }
    }

    if (!overlapMatch) {
      const overlap = node.marks.find((mark) => markAttrsMatchOnOverlap(mark, snapshot));
      if (overlap) {
        overlapMatch = overlap;
      }
    }

    if (!typeOnlyMatch) {
      const fallback = node.marks.find((mark) => markMatchesSnapshot(mark, snapshot, false));
      if (fallback) {
        typeOnlyMatch = fallback;
      }
    }
  });

  const liveMark = exactMatch || subsetMatch || overlapMatch || (shouldFallbackToTypeOnly ? typeOnlyMatch : null);
  if (!liveMark) console.debug('[track-changes] could not find live mark for snapshot', snapshot);
  return liveMark;
};
