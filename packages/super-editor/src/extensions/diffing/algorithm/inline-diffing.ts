import type { Node as PMNode } from 'prosemirror-model';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing.ts';
import { diffSequences } from './sequence-diffing.ts';

/**
 * Supported diff operations for inline changes.
 */
type InlineAction = 'added' | 'deleted' | 'modified';

/**
 * Serialized representation of a single text character plus its run attributes.
 */
export type InlineTextToken = {
  kind: 'text';
  char: string;
  runAttrs: string;
};

/**
 * Flattened inline node token treated as a single diff unit.
 */
export type InlineNodeToken = {
  kind: 'inlineNode';
  node: PMNode;
  nodeType?: string;
  toJSON?: () => unknown;
};

/**
 * Union of inline token kinds used as input for Myers diffing.
 */
export type InlineDiffToken = InlineTextToken | InlineNodeToken;

/**
 * Intermediate text diff emitted by `diffSequences`.
 */
type RawTextDiff =
  | {
      action: Exclude<InlineAction, 'modified'>;
      idx: number;
      kind: 'text';
      text: string;
      runAttrs: string;
    }
  | {
      action: 'modified';
      idx: number;
      kind: 'text';
      newText: string;
      oldText: string;
      oldAttrs: string;
      newAttrs: string;
    };

/**
 * Intermediate inline node diff emitted by `diffSequences`.
 */
type RawInlineNodeDiff =
  | {
      action: Exclude<InlineAction, 'modified'>;
      idx: number;
      kind: 'inlineNode';
      node: PMNode;
      nodeType?: string;
    }
  | {
      action: 'modified';
      idx: number;
      kind: 'inlineNode';
      oldNode: PMNode;
      newNode: PMNode;
      nodeType?: string;
      oldAttrs?: Record<string, unknown>;
      newAttrs?: Record<string, unknown>;
    };

/**
 * Combined raw diff union for text and inline node tokens.
 */
type RawDiff = RawTextDiff | RawInlineNodeDiff;

/**
 * Maps flattened string indexes back to ProseMirror document positions.
 */
type PositionResolver = (index: number) => number | null;

/**
 * Final grouped inline diff exposed to downstream consumers.
 */
export interface InlineDiffResult {
  action: InlineAction;
  kind: 'text' | 'inlineNode';
  startPos: number | null;
  endPos: number | null;
  text?: string;
  oldText?: string;
  newText?: string;
  runAttrs?: Record<string, unknown>;
  runAttrsDiff?: AttributesDiff | null;
  node?: PMNode;
  nodeType?: string;
  oldNode?: PMNode;
  newNode?: PMNode;
  attrsDiff?: AttributesDiff | null;
}

/**
 * Computes text-level additions and deletions between two sequences using the generic sequence diff, mapping back to document positions.
 *
 * @param oldContent Source tokens.
 * @param newContent Target tokens.
 * @param oldPositionResolver Maps indexes to the original document.
 * @returns List of grouped inline diffs with document positions and text content.
 */
export function getInlineDiff(
  oldContent: InlineDiffToken[],
  newContent: InlineDiffToken[],
  oldPositionResolver: PositionResolver,
): InlineDiffResult[] {
  const buildInlineDiff = (action: InlineAction, token: InlineDiffToken, oldIdx: number): RawDiff => {
    if (token.kind !== 'text') {
      return {
        action,
        idx: oldIdx,
        kind: 'inlineNode',
        node: token.node,
        nodeType: token.nodeType,
      };
    }
    return {
      action,
      idx: oldIdx,
      kind: 'text',
      text: token.char,
      runAttrs: token.runAttrs,
    };
  };

  const diffs = diffSequences<InlineDiffToken, RawDiff, RawDiff, RawDiff>(oldContent, newContent, {
    comparator: inlineComparator,
    shouldProcessEqualAsModification,
    canTreatAsModification: (oldToken, newToken) =>
      oldToken.kind === newToken.kind && oldToken.kind !== 'text' && oldToken.node.type === newToken.node.type,
    buildAdded: (token, oldIdx) => buildInlineDiff('added', token, oldIdx),
    buildDeleted: (token, oldIdx) => buildInlineDiff('deleted', token, oldIdx),
    buildModified: (oldToken, newToken, oldIdx) => {
      if (oldToken.kind !== 'text' && newToken.kind !== 'text') {
        return {
          action: 'modified',
          idx: oldIdx,
          kind: 'inlineNode',
          oldNode: oldToken.node,
          newNode: newToken.node,
          nodeType: oldToken.nodeType,
        };
      }
      if (oldToken.kind === 'text' && newToken.kind === 'text') {
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
      return null;
    },
  });

  return groupDiffs(diffs, oldPositionResolver);
}

/**
 * Compares two inline tokens to decide if they can be considered equal for the Myers diff.
 * Text tokens compare character equality while inline nodes compare their type.
 */
function inlineComparator(a: InlineDiffToken, b: InlineDiffToken): boolean {
  if (a.kind !== b.kind) {
    return false;
  }

  if (a.kind === 'text' && b.kind === 'text') {
    return a.char === b.char;
  }
  if (a.kind === 'inlineNode' && b.kind === 'inlineNode') {
    return a.node.type === b.node.type;
  }
  return false;
}

/**
 * Determines whether equal tokens should still be treated as modifications, either because run attributes changed or the node payload differs.
 */
function shouldProcessEqualAsModification(oldToken: InlineDiffToken, newToken: InlineDiffToken): boolean {
  if (oldToken.kind === 'text' && newToken.kind === 'text') {
    return oldToken.runAttrs !== newToken.runAttrs;
  }

  if (oldToken.kind === 'inlineNode' && newToken.kind === 'inlineNode') {
    const oldJSON = oldToken.toJSON?.() ?? oldToken.node.toJSON();
    const newJSON = newToken.toJSON?.() ?? newToken.node.toJSON();
    return JSON.stringify(oldJSON) !== JSON.stringify(newJSON);
  }

  return false;
}

/**
 * Accumulator structure used while coalescing contiguous text diffs.
 */
type TextDiffGroup =
  | {
      action: Exclude<InlineAction, 'modified'>;
      kind: 'text';
      startPos: number | null;
      endPos: number | null;
      text: string;
      runAttrs: string;
    }
  | {
      action: 'modified';
      kind: 'text';
      startPos: number | null;
      endPos: number | null;
      newText: string;
      oldText: string;
      oldAttrs: string;
      newAttrs: string;
    };

/**
 * Groups raw diff operations into contiguous ranges and converts serialized run attrs back to objects.
 *
 * @param diffs Raw diff operations from the sequence diff.
 * @param oldPositionResolver Maps text indexes to original document positions.
 * @returns Grouped inline diffs with start/end document positions.
 */
function groupDiffs(diffs: RawDiff[], oldPositionResolver: PositionResolver): InlineDiffResult[] {
  const grouped: InlineDiffResult[] = [];
  let currentGroup: TextDiffGroup | null = null;

  const pushCurrentGroup = () => {
    if (!currentGroup) {
      return;
    }
    const result: InlineDiffResult = {
      action: currentGroup.action,
      kind: 'text',
      startPos: currentGroup.startPos,
      endPos: currentGroup.endPos,
    };

    if (currentGroup.action === 'modified') {
      const oldAttrs = JSON.parse(currentGroup.oldAttrs);
      const newAttrs = JSON.parse(currentGroup.newAttrs);
      result.oldText = currentGroup.oldText;
      result.newText = currentGroup.newText;
      result.runAttrsDiff = getAttributesDiff(oldAttrs, newAttrs);
    } else {
      result.text = currentGroup.text;
      result.runAttrs = JSON.parse(currentGroup.runAttrs);
    }

    grouped.push(result);
    currentGroup = null;
  };

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
              attrsDiff: getAttributesDiff(diff.oldNode.attrs, diff.newNode.attrs),
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
 */
function createTextGroup(diff: RawTextDiff, positionResolver: PositionResolver): TextDiffGroup {
  const baseGroup =
    diff.action === 'modified'
      ? {
          action: diff.action,
          kind: 'text' as const,
          startPos: positionResolver(diff.idx),
          endPos: positionResolver(diff.idx),
          newText: diff.newText,
          oldText: diff.oldText,
          oldAttrs: diff.oldAttrs,
          newAttrs: diff.newAttrs,
        }
      : {
          action: diff.action,
          kind: 'text' as const,
          startPos: positionResolver(diff.idx),
          endPos: positionResolver(diff.idx),
          text: diff.text,
          runAttrs: diff.runAttrs,
        };

  return baseGroup;
}

/**
 * Expands the current text group with the incoming diff token.
 * Keeps start/end positions updated while concatenating text payloads.
 */
function extendTextGroup(group: TextDiffGroup, diff: RawTextDiff, positionResolver: PositionResolver): void {
  group.endPos = positionResolver(diff.idx);
  if (group.action === 'modified' && diff.action === 'modified') {
    group.newText += diff.newText;
    group.oldText += diff.oldText;
  } else if (group.action !== 'modified' && diff.action !== 'modified') {
    group.text += diff.text;
  }
}

/**
 * Determines whether a text diff token can be merged into the current group.
 * Checks action, attributes, and adjacency constraints required by the grouping heuristic.
 */
function canExtendGroup(group: TextDiffGroup, diff: RawTextDiff, positionResolver: PositionResolver): boolean {
  if (group.action !== diff.action) {
    return false;
  }

  if (group.action === 'modified' && diff.action === 'modified') {
    if (group.oldAttrs !== diff.oldAttrs || group.newAttrs !== diff.newAttrs) {
      return false;
    }
  } else if (group.action !== 'modified' && diff.action !== 'modified') {
    if (group.runAttrs !== diff.runAttrs) {
      return false;
    }
  } else {
    return false;
  }

  if (group.action === 'added') {
    return group.startPos === positionResolver(diff.idx);
  }
  return (group.endPos ?? 0) + 1 === positionResolver(diff.idx);
}
