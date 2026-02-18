import { isEqual, isMatch } from 'lodash';

const normalizeAttrs = (attrs = {}) => {
  return Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined));
};

export const attrsExactlyMatch = (left = {}, right = {}) => {
  const normalizedLeft = normalizeAttrs(left);
  const normalizedRight = normalizeAttrs(right);
  return isEqual(normalizedLeft, normalizedRight);
};

const getTypeName = (markLike) => {
  return markLike?.type?.name ?? markLike?.type;
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
