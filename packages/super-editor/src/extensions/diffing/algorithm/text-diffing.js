import { myersDiff } from './myers-diff.js';
import { getAttributesDiff } from './attributes-diffing.js';
import { diffSequences } from './sequence-diffing.js';

/**
 * Computes text-level additions and deletions between two strings using Myers diff algorithm, mapping back to document positions.
 * @param {{char: string, runAttrs: Record<string, any>}[]} oldText - Source text.
 * @param {{char: string, runAttrs: Record<string, any>}[]} newText - Target text.
 * @param {(index: number) => number|null} oldPositionResolver - Maps string indexes to the original document.
 * @param {(index: number) => number|null} [newPositionResolver=oldPositionResolver] - Maps string indexes to the updated document.
 * @returns {Array<object>} List of addition/deletion ranges with document positions and text content.
 */
export function getTextDiff(oldText, newText, oldPositionResolver, newPositionResolver = oldPositionResolver) {
  const buildCharDiff = (type, char, oldIdx) => ({
    type,
    idx: oldIdx,
    text: char.char,
    runAttrs: char.runAttrs,
  });
  let diffs = diffSequences(oldText, newText, {
    comparator: (a, b) => a.char === b.char,
    shouldProcessEqualAsModification: (oldChar, newChar) => oldChar.runAttrs !== newChar.runAttrs,
    canTreatAsModification: (oldChar, newChar) => false,
    buildAdded: (char, oldIdx, newIdx) => buildCharDiff('added', char, oldIdx),
    buildDeleted: (char, oldIdx, newIdx) => buildCharDiff('deleted', char, oldIdx),
    buildModified: (oldChar, newChar, oldIdx, newIdx) => ({
      type: 'modified',
      idx: oldIdx,
      newText: newChar.char,
      oldText: oldChar.char,
      oldAttrs: oldChar.runAttrs,
      newAttrs: newChar.runAttrs,
    }),
  });

  const groupedDiffs = groupDiffs(diffs, oldPositionResolver, newPositionResolver);
  return groupedDiffs;
}

function groupDiffs(diffs, oldPositionResolver, newPositionResolver) {
  const grouped = [];
  let currentGroup = null;

  const compareDiffs = (group, diff) => {
    if (group.type !== diff.type) {
      return false;
    }
    if (group.type === 'modified') {
      return group.oldAttrs === diff.oldAttrs && group.newAttrs === diff.newAttrs;
    }
    return group.runAttrs === diff.runAttrs;
  };

  const comparePositions = (group, diff) => {
    if (group.type === 'added') {
      return group.startPos === oldPositionResolver(diff.idx);
    } else {
      return group.endPos + 1 === oldPositionResolver(diff.idx);
    }
  };

  for (const diff of diffs) {
    if (currentGroup == null) {
      currentGroup = {
        type: diff.type,
        startPos: oldPositionResolver(diff.idx),
        endPos: oldPositionResolver(diff.idx),
      };
      if (diff.type === 'modified') {
        currentGroup.newText = diff.newText;
        currentGroup.oldText = diff.oldText;
        currentGroup.oldAttrs = diff.oldAttrs;
        currentGroup.newAttrs = diff.newAttrs;
      } else {
        currentGroup.text = diff.text;
        currentGroup.runAttrs = diff.runAttrs;
      }
    } else if (!compareDiffs(currentGroup, diff) || !comparePositions(currentGroup, diff)) {
      grouped.push(currentGroup);
      currentGroup = {
        type: diff.type,
        startPos: oldPositionResolver(diff.idx),
        endPos: oldPositionResolver(diff.idx),
      };
      if (diff.type === 'modified') {
        currentGroup.newText = diff.newText;
        currentGroup.oldText = diff.oldText;
        currentGroup.oldAttrs = diff.oldAttrs;
        currentGroup.newAttrs = diff.newAttrs;
      } else {
        currentGroup.text = diff.text;
        currentGroup.runAttrs = diff.runAttrs;
      }
    } else {
      currentGroup.endPos = oldPositionResolver(diff.idx);
      if (diff.type === 'modified') {
        currentGroup.newText += diff.newText;
        currentGroup.oldText += diff.oldText;
      } else {
        currentGroup.text += diff.text;
      }
    }
  }

  if (currentGroup != null) grouped.push(currentGroup);
  return grouped.map((group) => {
    let ret = { ...group };
    if (group.type === 'modified') {
      ret.oldAttrs = JSON.parse(group.oldAttrs);
      ret.newAttrs = JSON.parse(group.newAttrs);
      ret.runAttrsDiff = getAttributesDiff(ret.oldAttrs, ret.newAttrs);
      delete ret.oldAttrs;
      delete ret.newAttrs;
    } else {
      ret.runAttrs = JSON.parse(group.runAttrs);
    }
    return ret;
  });
}
