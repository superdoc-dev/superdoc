import { isEqual, isMatch } from 'lodash';

const normalizeAttrs = (attrs = {}) => {
  return Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined));
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
 */
const normalizeSnapshotAttrs = (attrs = {}) => {
  const base = normalizeAttrs(attrs);
  return Object.fromEntries(Object.entries(base).filter(([key, value]) => IDENTITY_ATTR_VALUES[key] !== value));
};

export const getTypeName = (markLike) => {
  return markLike?.type?.name ?? markLike?.type;
};

/**
 * Check if a tracked format change is effectively a no-op.
 * Compares before and after snapshots after normalizing identity attribute values.
 * A no-op means the format change has no net visual effect.
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

export const attrsExactlyMatch = (left = {}, right = {}) => {
  const normalizedLeft = normalizeAttrs(left);
  const normalizedRight = normalizeAttrs(right);
  return isEqual(normalizedLeft, normalizedRight);
};

const marksMatch = (left, right, exact = true) => {
  if (!left || !right || getTypeName(left) !== getTypeName(right)) {
    return false;
  }

  if (!exact) {
    return true;
  }

  return attrsExactlyMatch(left.attrs || {}, right.attrs || {});
};

export const markSnapshotMatchesStepMark = (snapshot, stepMark, exact = true) => {
  return marksMatch(snapshot, stepMark, exact);
};

export const hasMatchingMark = (marks, stepMark) => {
  return marks.some((mark) => {
    return marksMatch(mark, stepMark, true);
  });
};

export const upsertMarkSnapshotByType = (snapshots, incoming) => {
  const withoutSameType = snapshots.filter((mark) => mark.type !== incoming.type);
  return [...withoutSameType, incoming];
};

const markMatchesSnapshot = (mark, snapshot, exact = true) => {
  return marksMatch(mark, snapshot, exact);
};

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

export const findMarkInRangeBySnapshot = ({ doc, from, to, snapshot }) => {
  let exactMatch = null;
  let subsetMatch = null;
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

    if (!typeOnlyMatch) {
      const fallback = node.marks.find((mark) => markMatchesSnapshot(mark, snapshot, false));
      if (fallback) {
        typeOnlyMatch = fallback;
      }
    }
  });

  const liveMark = exactMatch || subsetMatch || (shouldFallbackToTypeOnly ? typeOnlyMatch : null);
  if (!liveMark) console.debug('[track-changes] could not find live mark for snapshot', snapshot);
  return liveMark;
};
