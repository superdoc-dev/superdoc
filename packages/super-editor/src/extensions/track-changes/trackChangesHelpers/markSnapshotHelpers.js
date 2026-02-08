import { objectIncludes } from '@core/utilities/objectIncludes.js';

export const attrsExactlyMatch = (left = {}, right = {}) => {
  return objectIncludes(left, right) && objectIncludes(right, left);
};

export const markSnapshotMatchesStepMark = (snapshot, stepMark, exact = true) => {
  if (!snapshot || !stepMark || snapshot.type !== stepMark.type.name) {
    return false;
  }

  if (!exact) {
    return true;
  }

  return attrsExactlyMatch(snapshot.attrs || {}, stepMark.attrs || {});
};

export const hasMatchingMark = (marks, stepMark) => {
  return marks.some((mark) => {
    return mark.type === stepMark.type && attrsExactlyMatch(mark.attrs || {}, stepMark.attrs || {});
  });
};

export const upsertMarkSnapshotByType = (snapshots, incoming) => {
  const withoutSameType = snapshots.filter((mark) => mark.type !== incoming.type);
  return [...withoutSameType, incoming];
};

const markMatchesSnapshot = (mark, snapshot, exact = true) => {
  if (!mark || !snapshot || mark.type.name !== snapshot.type) {
    return false;
  }

  if (!exact) {
    return true;
  }

  return attrsExactlyMatch(mark.attrs || {}, snapshot.attrs || {});
};

export const findMarkInRangeBySnapshot = ({ doc, from, to, snapshot }) => {
  let exactMatch = null;
  let typeOnlyMatch = null;
  const shouldFallbackToTypeOnly = !snapshot?.attrs || Object.keys(snapshot.attrs).length === 0;

  doc.nodesBetween(from, to, (node) => {
    if (!node.isInline) {
      return;
    }

    const exact = node.marks.find((mark) => markMatchesSnapshot(mark, snapshot, true));
    if (exact && !exactMatch) {
      exactMatch = exact;
      return false;
    }

    if (!typeOnlyMatch) {
      const fallback = node.marks.find((mark) => markMatchesSnapshot(mark, snapshot, false));
      if (fallback) {
        typeOnlyMatch = fallback;
      }
    }
  });

  return exactMatch || (shouldFallbackToTypeOnly ? typeOnlyMatch : null);
};
