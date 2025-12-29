import { getAttributesDiff } from './attributes-diffing.js';
import { diffSequences } from './sequence-diffing.js';

/**
 * @typedef {{kind: 'text', char: string, runAttrs: string}} InlineTextToken
 */

/**
 * @typedef {{kind: 'inlineNode', node: import('prosemirror-model').Node, nodeType?: string}} InlineNodeToken
 */

/**
 * @typedef {InlineTextToken|InlineNodeToken} InlineDiffToken
 */

/**
 * @typedef {{action: 'added'|'deleted'|'modified', kind: 'text'|'inlineNode', startPos: number|null, endPos: number|null, text?: string, oldText?: string, newText?: string, runAttrs?: Record<string, any>, runAttrsDiff?: import('./attributes-diffing.js').AttributesDiff, node?: import('prosemirror-model').Node, nodeType?: string, oldNode?: import('prosemirror-model').Node, newNode?: import('prosemirror-model').Node}} InlineDiffResult
 */

/**
 * Computes text-level additions and deletions between two sequences using the generic sequence diff, mapping back to document positions.
 * @param {InlineDiffToken[]} oldContent - Source tokens.
 * @param {InlineDiffToken[]} newContent - Target tokens.
 * @param {(index: number) => number|null} oldPositionResolver - Maps string indexes to the original document.
 * @param {(index: number) => number|null} [newPositionResolver=oldPositionResolver] - Maps string indexes to the updated document.
 * @returns {InlineDiffResult[]} List of grouped inline diffs with document positions and text content.
 */
export function getInlineDiff(oldContent, newContent, oldPositionResolver, newPositionResolver = oldPositionResolver) {
  const buildInlineDiff = (action, token, oldIdx) => {
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
    canTreatAsModification: (oldToken, newToken) =>
      oldToken.kind === newToken.kind && oldToken.kind !== 'text' && oldToken.node.type.type === newToken.node.type,
    buildAdded: (token, oldIdx) => buildInlineDiff('added', token, oldIdx),
    buildDeleted: (token, oldIdx) => buildInlineDiff('deleted', token, oldIdx),
    buildModified: (oldToken, newToken, oldIdx) => {
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

  const groupedDiffs = groupDiffs(diffs, oldPositionResolver);
  return groupedDiffs;
}

/**
 * Compares two inline tokens to decide if they can be considered equal for the Myers diff.
 * Text tokens compare character equality while inline nodes compare their type.
 * @param {InlineDiffToken} a
 * @param {InlineDiffToken} b
 * @returns {boolean}
 */
function inlineComparator(a, b) {
  if (a.kind !== b.kind) {
    return false;
  }

  if (a.kind === 'text') {
    return a.char === b.char;
  } else {
    return a.node.type === b.node.type;
  }
}

/**
 * Determines whether equal tokens should still be treated as modifications, either because run attributes changed or the node payload differs.
 * @param {InlineDiffToken} oldToken
 * @param {InlineDiffToken} newToken
 * @returns {boolean}
 */
function shouldProcessEqualAsModification(oldToken, newToken) {
  if (oldToken.kind === 'text') {
    return oldToken.runAttrs !== newToken.runAttrs;
  } else {
    return JSON.stringify(oldToken.toJSON()) !== JSON.stringify(newToken.toJSON());
  }
}

/**
 * Groups raw diff operations into contiguous ranges and converts serialized run attrs back to objects.
 * @param {Array<{action:'added'|'deleted'|'modified', idx:number, kind:'text'|'inlineNode', text?: string, runAttrs?: string, newText?: string, oldText?: string, oldAttrs?: string, newAttrs?: string, nodeType?: string, node?: import('prosemirror-model').Node, oldNode?: import('prosemirror-model').Node, newNode?: import('prosemirror-model').Node}>} diffs
 * @param {(index: number) => number|null} oldPositionResolver
 * @returns {InlineDiffResult[]}
 */
function groupDiffs(diffs, oldPositionResolver) {
  const grouped = [];
  let currentGroup = null;

  /**
   * Finalizes the current text group (if any) and appends it to the grouped result list.
   * Resets the working group so the caller can start accumulating the next run.
   */
  const pushCurrentGroup = () => {
    if (!currentGroup) {
      return;
    }
    const result = { ...currentGroup };
    if (currentGroup.action === 'modified') {
      const oldAttrs = JSON.parse(currentGroup.oldAttrs);
      const newAttrs = JSON.parse(currentGroup.newAttrs);
      result.runAttrsDiff = getAttributesDiff(oldAttrs, newAttrs);
      delete result.oldAttrs;
      delete result.newAttrs;
    } else {
      result.runAttrs = JSON.parse(currentGroup.runAttrs);
    }
    grouped.push(result);
    currentGroup = null;
  };

  // Iterate over raw diffs and group text changes where possible
  for (const diff of diffs) {
    if (diff.kind !== 'text') {
      pushCurrentGroup();
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

    if (!currentGroup || !canExtendGroup(currentGroup, diff, oldPositionResolver)) {
      pushCurrentGroup();
      currentGroup = createTextGroup(diff, oldPositionResolver);
    } else {
      extendTextGroup(currentGroup, diff, oldPositionResolver);
    }
  }

  pushCurrentGroup();
  return grouped;
}

/**
 * Builds a fresh text diff group seeded with the current diff token.
 * @param {{action:'added'|'deleted'|'modified', idx:number, kind:'text', text?: string, runAttrs?: string, newText?: string, oldText?: string, oldAttrs?: string, newAttrs?: string}} diff
 * @param {(index:number)=>number|null} positionResolver
 * @returns {{action:'added'|'deleted'|'modified', kind:'text', startPos:number, endPos:number, text?: string, runAttrs?: string, newText?: string, oldText?: string, oldAttrs?: string, newAttrs?: string}}
 */
function createTextGroup(diff, positionResolver) {
  const baseGroup = {
    action: diff.action,
    kind: 'text',
    startPos: positionResolver(diff.idx),
    endPos: positionResolver(diff.idx),
  };
  if (diff.action === 'modified') {
    baseGroup.newText = diff.newText;
    baseGroup.oldText = diff.oldText;
    baseGroup.oldAttrs = diff.oldAttrs;
    baseGroup.newAttrs = diff.newAttrs;
  } else {
    baseGroup.text = diff.text;
    baseGroup.runAttrs = diff.runAttrs;
  }
  return baseGroup;
}

/**
 * Expands the current text group with the incoming diff token.
 * Keeps start/end positions updated while concatenating text payloads.
 * @param {{action:'added'|'deleted'|'modified', kind:'text', startPos:number, endPos:number, text?: string, runAttrs?: string, newText?: string, oldText?: string, oldAttrs?: string, newAttrs?: string}} group
 * @param {{action:'added'|'deleted'|'modified', idx:number, kind:'text', text?: string, runAttrs?: string, newText?: string, oldText?: string}} diff
 * @param {(index:number)=>number|null} positionResolver
 */
function extendTextGroup(group, diff, positionResolver) {
  group.endPos = positionResolver(diff.idx);
  if (group.action === 'modified') {
    group.newText += diff.newText;
    group.oldText += diff.oldText;
  } else {
    group.text += diff.text;
  }
}

/**
 * Determines whether a text diff token can be merged into the current group.
 * Checks action, attributes, and adjacency constraints required by the grouping heuristic.
 * @param {{action:'added'|'deleted'|'modified', kind:'text', startPos:number, endPos:number, runAttrs?: string, oldAttrs?: string, newAttrs?: string}} group
 * @param {{action:'added'|'deleted'|'modified', idx:number, kind:'text', runAttrs?: string, oldAttrs?: string, newAttrs?: string}} diff
 * @param {(index:number)=>number|null} positionResolver
 * @returns {boolean}
 */
function canExtendGroup(group, diff, positionResolver) {
  if (group.action !== diff.action) {
    return false;
  }

  if (group.action === 'modified') {
    if (group.oldAttrs !== diff.oldAttrs || group.newAttrs !== diff.newAttrs) {
      return false;
    }
  } else if (group.runAttrs !== diff.runAttrs) {
    return false;
  }

  if (group.action === 'added') {
    return group.startPos === positionResolver(diff.idx);
  }
  return group.endPos + 1 === positionResolver(diff.idx);
}
