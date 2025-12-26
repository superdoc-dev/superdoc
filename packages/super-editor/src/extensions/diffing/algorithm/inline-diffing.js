import { myersDiff } from './myers-diff.js';
import { getAttributesDiff } from './attributes-diffing.js';
import { diffSequences } from './sequence-diffing.js';

/**
 * Computes text-level additions and deletions between two strings using Myers diff algorithm, mapping back to document positions.
 * @param {{char: string, runAttrs: Record<string, any>}[]} oldContent - Source text.
 * @param {{char: string, runAttrs: Record<string, any>}[]} newContent - Target text.
 * @param {(index: number) => number|null} oldPositionResolver - Maps string indexes to the original document.
 * @param {(index: number) => number|null} [newPositionResolver=oldPositionResolver] - Maps string indexes to the updated document.
 * @returns {Array<object>} List of addition/deletion ranges with document positions and text content.
 */
export function getInlineDiff(oldContent, newContent, oldPositionResolver, newPositionResolver = oldPositionResolver) {
  const buildCharDiff = (action, token, oldIdx) => {
    if (token.kind !== 'text') {
      return {
        action,
        idx: oldIdx,
        ...token,
      };
    } else {
      return {
        action,
        idx: oldIdx,
        kind: 'text',
        text: token.char,
        runAttrs: token.runAttrs,
      };
    }
  };
  let diffs = diffSequences(oldContent, newContent, {
    comparator: inlineComparator,
    shouldProcessEqualAsModification,
    canTreatAsModification: (oldToken, newToken, oldIdx, newIdx) =>
      oldToken.kind === newToken.kind && oldToken.kind !== 'text' && oldToken.node.type.type === newToken.node.type,
    buildAdded: (token, oldIdx, newIdx) => buildCharDiff('added', token, oldIdx),
    buildDeleted: (token, oldIdx, newIdx) => buildCharDiff('deleted', token, oldIdx),
    buildModified: (oldToken, newToken, oldIdx, newIdx) => {
      if (oldToken.kind !== 'text') {
        return {
          action: 'modified',
          idx: oldIdx,
          kind: 'inlineNode',
          oldNode: oldToken.node,
          newNode: newToken.node,
          nodeType: oldToken.nodeType,
        };
      } else {
        return {
          action: 'modified',
          idx: oldIdx,
          kind: 'text',
          newText: newToken.char,
          oldText: oldToken.char,
          oldAttrs: oldToken.runAttrs,
          newAttrs: newToken.runAttrs,
        };
      }
    },
  });

  const groupedDiffs = groupDiffs(diffs, oldPositionResolver, newPositionResolver);
  return groupedDiffs;
}

function inlineComparator(a, b) {
  if (a.kind !== b.kind) {
    return false;
  }

  if (a.kind === 'text') {
    return a.char === b.char;
  } else {
    return true;
  }
}

function shouldProcessEqualAsModification(oldToken, newToken) {
  if (oldToken.kind === 'text') {
    return oldToken.runAttrs !== newToken.runAttrs;
  } else {
    return JSON.stringify(oldToken.nodeAttrs) !== JSON.stringify(newToken.nodeAttrs);
  }
}

function groupDiffs(diffs, oldPositionResolver, newPositionResolver) {
  const grouped = [];
  let currentGroup = null;

  const compareDiffs = (group, diff) => {
    if (group.action !== diff.action) {
      return false;
    }
    if (group.action === 'modified') {
      return group.oldAttrs === diff.oldAttrs && group.newAttrs === diff.newAttrs;
    }
    return group.runAttrs === diff.runAttrs;
  };

  const comparePositions = (group, diff) => {
    if (group.action === 'added') {
      return group.startPos === oldPositionResolver(diff.idx);
    } else {
      return group.endPos + 1 === oldPositionResolver(diff.idx);
    }
  };

  for (const diff of diffs) {
    if (diff.kind !== 'text') {
      if (currentGroup != null) {
        grouped.push(currentGroup);
        currentGroup = null;
      }
      grouped.push({
        action: diff.action,
        kind: 'inlineNode',
        startPos: oldPositionResolver(diff.idx),
        endPos: oldPositionResolver(diff.idx),
        nodeType: diff.nodeType,
        ...(diff.action === 'modified'
          ? {
              oldNode: diff.oldNode,
              newNode: diff.newNode,
              diffNodeAttrs: getAttributesDiff(diff.oldAttrs, diff.newAttrs),
            }
          : { node: diff.node }),
      });
      continue;
    }
    if (currentGroup == null) {
      currentGroup = {
        action: diff.action,
        startPos: oldPositionResolver(diff.idx),
        endPos: oldPositionResolver(diff.idx),
        kind: 'text',
      };
      if (diff.action === 'modified') {
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
        action: diff.action,
        startPos: oldPositionResolver(diff.idx),
        endPos: oldPositionResolver(diff.idx),
        kind: 'text',
      };
      if (diff.action === 'modified') {
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
      if (diff.action === 'modified') {
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
    if (group.kind === 'inlineNode') {
      return ret;
    }
    if (group.action === 'modified') {
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
