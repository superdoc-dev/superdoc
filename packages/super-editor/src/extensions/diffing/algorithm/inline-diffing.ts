import type { Node as PMNode } from 'prosemirror-model';
import { getAttributesDiff, getMarksDiff, type AttributesDiff, type MarksDiff } from './attributes-diffing.ts';
import { diffSequences } from './sequence-diffing.ts';

type NodeJSON = ReturnType<PMNode['toJSON']>;
type MarkJSON = { type: string; attrs?: Record<string, unknown> };

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
  runAttrs: Record<string, unknown>;
  marks: MarkJSON[];
  offset?: number | null;
};

/**
 * Flattened inline node token treated as a single diff unit.
 */
export type InlineNodeToken = {
  kind: 'inlineNode';
  node: PMNode;
  nodeType?: string;
  toJSON?: () => unknown;
  nodeJSON?: NodeJSON;
  pos?: number | null;
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
      runAttrs: Record<string, unknown>;
      marks: MarkJSON[];
    }
  | {
      action: 'modified';
      idx: number;
      kind: 'text';
      newText: string;
      oldText: string;
      oldAttrs: Record<string, unknown>;
      newAttrs: Record<string, unknown>;
      oldMarks: MarkJSON[];
      newMarks: MarkJSON[];
    };

/**
 * Intermediate inline node diff emitted by `diffSequences`.
 */
type RawInlineNodeDiff =
  | {
      action: Exclude<InlineAction, 'modified'>;
      idx: number;
      kind: 'inlineNode';
      nodeJSON: NodeJSON;
      nodeType?: string;
    }
  | {
      action: 'modified';
      idx: number;
      kind: 'inlineNode';
      nodeType?: string;
      oldNodeJSON: NodeJSON;
      newNodeJSON: NodeJSON;
      attrsDiff: AttributesDiff | null;
    };

/**
 * Combined raw diff union for text and inline node tokens.
 */
type RawDiff = RawTextDiff | RawInlineNodeDiff;

/**
 * Final grouped inline diff exposed to downstream consumers.
 */
export interface InlineDiffResult {
  /** Change type for this inline segment. */
  action: InlineAction;
  /** Token kind associated with the diff. */
  kind: 'text' | 'inlineNode';
  /** Start position in the old document (or null when unknown). */
  startPos: number | null;
  /** End position in the old document (or null when unknown). */
  endPos: number | null;
  /** Inserted text for additions. */
  text?: string;
  /** Removed text for deletions/modifications. */
  oldText?: string;
  /** Inserted text for modifications. */
  newText?: string;
  /** Run attributes for added/deleted text. */
  runAttrs?: Record<string, unknown>;
  /** Attribute diff for modified runs. */
  runAttrsDiff?: AttributesDiff | null;
  /** Marks applied to added/deleted text. */
  marks?: Record<string, unknown>[];
  /** Mark diff for modified text. */
  marksDiff?: MarksDiff | null;
  /** Inline node type name for node diffs. */
  nodeType?: string;
  /** Serialized inline node payload for additions/deletions. */
  nodeJSON?: NodeJSON;
  /** Serialized inline node payload before the change. */
  oldNodeJSON?: NodeJSON;
  /** Serialized inline node payload after the change. */
  newNodeJSON?: NodeJSON;
  /** Attribute diff for modified inline nodes. */
  attrsDiff?: AttributesDiff | null;
}

/**
 * Tokenizes inline content into diffable text and inline-node tokens.
 *
 * @param pmNode ProseMirror node containing inline content.
 * @param baseOffset Offset applied to every token position (default: 0).
 * @returns Flattened inline tokens with offsets relative to the base offset.
 */
export function tokenizeInlineContent(pmNode: PMNode, baseOffset = 0): InlineDiffToken[] {
  const content: InlineDiffToken[] = [];
  pmNode.nodesBetween(
    0,
    pmNode.content.size,
    (node, pos) => {
      let nodeText = '';

      if (node.isText) {
        nodeText = node.text ?? '';
      } else if (node.isLeaf) {
        const leafTextFn = (node.type.spec as { leafText?: (node: PMNode) => string } | undefined)?.leafText;
        if (leafTextFn) {
          nodeText = leafTextFn(node);
        }
      }

      if (nodeText) {
        const runNode = pos > 0 ? pmNode.nodeAt(pos - 1) : null;
        const runAttrs = runNode?.attrs ?? {};
        const tokenOffset = baseOffset + pos;
        for (let i = 0; i < nodeText.length; i += 1) {
          content.push({
            kind: 'text',
            char: nodeText[i] ?? '',
            runAttrs,
            offset: tokenOffset + i,
            marks: node.marks?.map((mark) => mark.toJSON()) ?? [],
          });
        }
        return;
      }

      if (node.type.name !== 'run' && node.isInline) {
        content.push({
          kind: 'inlineNode',
          node,
          nodeType: node.type.name,
          nodeJSON: node.toJSON(),
          pos: baseOffset + pos,
        });
      }
    },
    0,
  );
  return content;
}

/**
 * Computes text-level additions and deletions between two sequences using the generic sequence diff, mapping back to document positions.
 *
 * @param oldContent Source tokens enriched with document offsets.
 * @param newContent Target tokens.
 * @param oldParagraphEndPos Absolute document position at the end of the old paragraph (used for trailing inserts).
 * @returns List of grouped inline diffs with document positions and text content.
 */
export function getInlineDiff(
  oldContent: InlineDiffToken[],
  newContent: InlineDiffToken[],
  oldParagraphEndPos: number,
): InlineDiffResult[] {
  const buildInlineDiff = (
    action: Exclude<InlineAction, 'modified'>,
    token: InlineDiffToken,
    oldIdx: number,
  ): RawDiff => {
    if (token.kind !== 'text') {
      return {
        action,
        idx: oldIdx,
        kind: 'inlineNode',
        nodeJSON: token.nodeJSON ?? token.node.toJSON(),
        nodeType: token.nodeType,
      };
    }
    return {
      action,
      idx: oldIdx,
      kind: 'text',
      text: token.char,
      runAttrs: token.runAttrs,
      marks: token.marks,
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
        const attrsDiff = getAttributesDiff(oldToken.node.attrs, newToken.node.attrs);
        return {
          action: 'modified',
          idx: oldIdx,
          kind: 'inlineNode',
          oldNodeJSON: oldToken.node.toJSON(),
          newNodeJSON: newToken.node.toJSON(),
          nodeType: oldToken.nodeType,
          attrsDiff,
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
          oldMarks: oldToken.marks,
          newMarks: newToken.marks,
        };
      }
      return null;
    },
  });

  return groupDiffs(diffs, oldContent, oldParagraphEndPos);
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
    return (
      Boolean(getAttributesDiff(oldToken.runAttrs, newToken.runAttrs)) ||
      oldToken.marks?.length !== newToken.marks?.length ||
      Boolean(getMarksDiff(oldToken.marks, newToken.marks))
    );
  }

  if (oldToken.kind === 'inlineNode' && newToken.kind === 'inlineNode') {
    const oldJSON = oldToken.node.toJSON();
    const newJSON = newToken.node.toJSON();
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
      runAttrs: Record<string, unknown>;
      marks: MarkJSON[];
    }
  | {
      action: 'modified';
      kind: 'text';
      startPos: number | null;
      endPos: number | null;
      newText: string;
      oldText: string;
      oldAttrs: Record<string, unknown>;
      newAttrs: Record<string, unknown>;
      oldMarks: MarkJSON[];
      newMarks: MarkJSON[];
    };

/**
 * Groups raw diff operations into contiguous ranges.
 *
 * @param diffs Raw diff operations from the sequence diff.
 * @param oldTokens Flattened tokens from the old paragraph, used to derive document positions.
 * @param oldParagraphEndPos Absolute document position marking the paragraph boundary.
 * @returns Grouped inline diffs with start/end document positions.
 */
function groupDiffs(diffs: RawDiff[], oldTokens: InlineDiffToken[], oldParagraphEndPos: number): InlineDiffResult[] {
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
      result.oldText = currentGroup.oldText;
      result.newText = currentGroup.newText;
      result.runAttrsDiff = getAttributesDiff(currentGroup.oldAttrs, currentGroup.newAttrs);
      result.marksDiff = getMarksDiff(currentGroup.oldMarks, currentGroup.newMarks);
    } else {
      result.text = currentGroup.text;
      result.runAttrs = currentGroup.runAttrs;
      result.marks = currentGroup.marks;
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
        startPos: resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos),
        endPos: resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos),
        nodeType: diff.nodeType,
        ...(diff.action === 'modified'
          ? {
              oldNodeJSON: diff.oldNodeJSON,
              newNodeJSON: diff.newNodeJSON,
              attrsDiff: diff.attrsDiff ?? null,
            }
          : { nodeJSON: diff.nodeJSON }),
      });
      continue;
    }

    if (!currentGroup || !canExtendGroup(currentGroup, diff, oldTokens, oldParagraphEndPos)) {
      pushCurrentGroup();
      currentGroup = createTextGroup(diff, oldTokens, oldParagraphEndPos);
    } else {
      extendTextGroup(currentGroup, diff, oldTokens, oldParagraphEndPos);
    }
  }

  pushCurrentGroup();
  return grouped;
}

/**
 * Builds a fresh text diff group seeded with the current diff token.
 */
function createTextGroup(diff: RawTextDiff, oldTokens: InlineDiffToken[], oldParagraphEndPos: number): TextDiffGroup {
  const baseGroup =
    diff.action === 'modified'
      ? {
          action: diff.action,
          kind: 'text' as const,
          startPos: resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos),
          endPos: resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos),
          newText: diff.newText,
          oldText: diff.oldText,
          oldAttrs: diff.oldAttrs,
          newAttrs: diff.newAttrs,
          oldMarks: diff.oldMarks,
          newMarks: diff.newMarks,
        }
      : {
          action: diff.action,
          kind: 'text' as const,
          startPos: resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos),
          endPos: resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos),
          text: diff.text,
          runAttrs: diff.runAttrs,
          marks: diff.marks,
        };

  return baseGroup;
}

/**
 * Expands the current text group with the incoming diff token.
 * Keeps start/end positions updated while concatenating text payloads.
 */
function extendTextGroup(
  group: TextDiffGroup,
  diff: RawTextDiff,
  oldTokens: InlineDiffToken[],
  oldParagraphEndPos: number,
): void {
  group.endPos = resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos);
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
function canExtendGroup(
  group: TextDiffGroup,
  diff: RawTextDiff,
  oldTokens: InlineDiffToken[],
  oldParagraphEndPos: number,
): boolean {
  if (group.action !== diff.action) {
    return false;
  }

  if (group.action === 'modified' && diff.action === 'modified') {
    if (!areInlineAttrsEqual(group.oldAttrs, diff.oldAttrs) || !areInlineAttrsEqual(group.newAttrs, diff.newAttrs)) {
      return false;
    }
    if (!areInlineMarksEqual(group.oldMarks, diff.oldMarks) || !areInlineMarksEqual(group.newMarks, diff.newMarks)) {
      return false;
    }
  } else if (group.action !== 'modified' && diff.action !== 'modified') {
    if (!areInlineAttrsEqual(group.runAttrs, diff.runAttrs)) {
      return false;
    }
    if (!areInlineMarksEqual(group.marks, diff.marks)) {
      return false;
    }
  } else {
    return false;
  }

  const diffPos = resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos);
  if (group.action === 'added') {
    return group.startPos === diffPos;
  }
  if (diffPos == null || group.endPos == null) {
    return false;
  }
  return group.endPos + 1 === diffPos;
}

/**
 * Maps a raw diff index back to an absolute document position using the original token offsets.
 *
 * @param tokens Flattened tokens from the old paragraph.
 * @param idx Index provided by the Myers diff output.
 * @param paragraphEndPos Absolute document position marking the paragraph boundary; used when idx equals the token length.
 * @returns Document position or null when the index is outside the known ranges.
 */
function resolveTokenPosition(tokens: InlineDiffToken[], idx: number, paragraphEndPos: number): number | null {
  if (idx < 0) {
    return null;
  }
  const token = tokens[idx];
  if (token) {
    if (token.kind === 'text') {
      return token.offset ?? null;
    }
    return token.pos ?? null;
  }
  if (idx === tokens.length) {
    return paragraphEndPos;
  }
  return null;
}

/**
 * Compares two sets of inline attributes and determines if they are equal.
 *
 * @param a - The first set of attributes to compare.
 * @param b - The second set of attributes to compare.
 * @returns `true` if the attributes are equal, `false` otherwise.
 */
function areInlineAttrsEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  return !getAttributesDiff(a ?? {}, b ?? {});
}

/**
 * Compares two sets of inline marks and determines if they are equal.
 *
 * @param a - The first set of marks to compare.
 * @param b - The second set of marks to compare.
 * @returns `true` if the marks are equal, `false` otherwise.
 */
function areInlineMarksEqual(a: MarkJSON[] | undefined, b: MarkJSON[] | undefined): boolean {
  return !getMarksDiff(a ?? [], b ?? []);
}
