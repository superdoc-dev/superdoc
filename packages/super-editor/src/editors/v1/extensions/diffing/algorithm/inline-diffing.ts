import type { Node as PMNode } from 'prosemirror-model';
import { getAttributesDiff, getMarksDiff, type AttributesDiff, type MarksDiff } from './attributes-diffing';
import { normalizeInlineNodeJSON, normalizeInlineNodeAttrs, semanticInlineNodeKey } from './semantic-normalization';
import { diffSequences } from './sequence-diffing';
import { VOLATILE_RUN_ATTR_KEYS } from './identity-attrs';

type NodeJSON = ReturnType<PMNode['toJSON']>;
type MarkJSON = { type: string; attrs?: Record<string, unknown> };
const TRACK_CHANGE_MARK_NAMES = new Set(['trackInsert', 'trackDelete', 'trackFormat']);
const SAFE_SPAN_IGNORED_INLINE_RUN_ATTR_KEYS = [...VOLATILE_RUN_ATTR_KEYS, 'runPropertiesInlineKeys', 'fontFamily'];

/**
 * Supported diff operations for inline changes.
 */
type InlineAction = 'added' | 'deleted' | 'modified';

/**
 * Serialized representation of a text segment plus its run attributes.
 */
export type InlineTextToken = {
  kind: 'text';
  text: string;
  length: number;
  runAttrs: Record<string, unknown>;
  marks: MarkJSON[];
  offset?: number | null;
  // Inclusive PM position of the last source char in this token.
  endOffset?: number | null;
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

export interface InlineTokenSegment {
  tokens: InlineDiffToken[];
  isTextOnly: boolean;
  isIndividuallySafe: boolean;
  sourceStartTokenIdx: number;
}

export interface InlineDiffPlanEntry {
  oldSegment: InlineTokenSegment;
  newSegment: InlineTokenSegment;
  useWordLevel: boolean;
}

/**
 * Narrow an inline token to an inline-node token.
 *
 * @param token Inline token candidate.
 * @returns True when the token represents an inline node.
 */
function isInlineNodeToken(token: InlineDiffToken): token is InlineNodeToken {
  return token.kind === 'inlineNode';
}

/**
 * Determines whether a text-only span is eligible for word-level tokenization.
 *
 * The span must be semantically plain text on both sides: no inline anchors,
 * no tracked/comment markers, no field-like run metadata, and no formatting
 * drift between the old/new token sequences.
 */
export function isSafeSpan(oldTokens: InlineDiffToken[], newTokens: InlineDiffToken[]): boolean {
  const spanTokens = [...oldTokens, ...newTokens];
  if (spanTokens.some((token) => token.kind !== 'text')) {
    return false;
  }

  const textTokens = spanTokens as InlineTextToken[];
  if (textTokens.some((token) => hasUnsafeMarks(token.marks ?? []) || hasFieldLikeRunAttrs(token.runAttrs))) {
    return false;
  }

  return hasUniformTextFormatting(textTokens);
}

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
  marks?: MarkJSON[];
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
        // pos is the text node's first-character offset; pos-1 is the run's opening token,
        // so nodeAt(pos-1) returns the parent run node and its OOXML attrs.
        const runNode = pos > 0 ? pmNode.nodeAt(pos - 1) : null;
        const runAttrs = runNode?.attrs ?? {};
        const tokenOffset = baseOffset + pos;
        for (let i = 0; i < nodeText.length; i += 1) {
          content.push({
            kind: 'text',
            text: nodeText[i] ?? '',
            length: 1,
            runAttrs,
            offset: tokenOffset + i,
            endOffset: tokenOffset + i,
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
        if (node.type.name === 'structuredContent') {
          // Treat structuredContent as an atomic unit: emitting the parent as
          // inlineNode and also descending into descendants produces both an
          // inlineNode token and text tokens for the same content region, causing
          // double-application during replay (boundary leak + duplicate edits).
          return false;
        }
      }
    },
    0,
  );
  return content;
}

/**
 * Re-groups character-level text tokens into word-boundary tokens.
 *
 * Safe spans are guaranteed to be text-only and formatting-uniform, so we can
 * preserve the first token's attrs/marks while coalescing adjacent characters
 * that belong to the same lexical class.
 */
function reTokenizeAsWords(tokens: InlineDiffToken[]): InlineDiffToken[] {
  const wordTokens: InlineDiffToken[] = [];
  let currentGroup: InlineTextToken | null = null;
  let currentCategory: 'word' | 'whitespace' | 'punctuation' | null = null;

  const pushCurrentGroup = () => {
    if (currentGroup) {
      wordTokens.push(currentGroup);
      currentGroup = null;
      currentCategory = null;
    }
  };

  for (const token of tokens) {
    if (token.kind !== 'text') {
      pushCurrentGroup();
      wordTokens.push(token);
      continue;
    }

    const tokenCategory = classifyTextToken(token.text);
    if (
      !currentGroup ||
      currentCategory !== tokenCategory ||
      !areInlineAttrsEqual(currentGroup.runAttrs, token.runAttrs) ||
      !areInlineMarksEqual(currentGroup.marks, token.marks)
    ) {
      pushCurrentGroup();
      currentGroup = { ...token };
      currentCategory = tokenCategory;
      continue;
    }

    currentGroup.text += token.text;
    currentGroup.length += token.length;
    // Preserve the right edge of the last source token so replay can span
    // multi-run words without reconstructing positions from string length.
    currentGroup.endOffset = token.endOffset ?? token.offset ?? currentGroup.endOffset ?? null;
  }

  pushCurrentGroup();
  return wordTokens;
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
  const oldSegments = segmentInlineTokens(oldContent);
  const newSegments = segmentInlineTokens(newContent);
  const segmentPlan = buildInlineDiffPlan(oldSegments, newSegments);

  if (!segmentPlan) {
    const shouldUseWordTokens = isSafeSpan(oldContent, newContent);
    const diffOldContent = shouldUseWordTokens ? reTokenizeAsWords(oldContent) : oldContent;
    const diffNewContent = shouldUseWordTokens ? reTokenizeAsWords(newContent) : newContent;
    return groupDiffs(buildRawDiffs(diffOldContent, diffNewContent), diffOldContent, oldParagraphEndPos);
  }

  const mergedOldTokens: InlineDiffToken[] = [];
  const allDiffs: RawDiff[] = [];

  for (const planEntry of segmentPlan) {
    const diffOldTokens = planEntry.useWordLevel
      ? reTokenizeAsWords(planEntry.oldSegment.tokens)
      : planEntry.oldSegment.tokens;
    const diffNewTokens = planEntry.useWordLevel
      ? reTokenizeAsWords(planEntry.newSegment.tokens)
      : planEntry.newSegment.tokens;
    const idxOffset = mergedOldTokens.length;

    mergedOldTokens.push(...diffOldTokens);
    allDiffs.push(...buildRawDiffs(diffOldTokens, diffNewTokens, idxOffset));
  }

  return groupDiffs(allDiffs, mergedOldTokens, oldParagraphEndPos);
}

export function segmentInlineTokens(tokens: InlineDiffToken[]): InlineTokenSegment[] {
  const segments: InlineTokenSegment[] = [];
  let currentSegment: InlineTokenSegment | null = null;

  const pushCurrentSegment = () => {
    if (currentSegment) {
      segments.push(currentSegment);
      currentSegment = null;
    }
  };

  tokens.forEach((token, index) => {
    const tokenIsText = token.kind === 'text';
    const tokenIsIndividuallySafe = tokenIsText ? isIndividuallySafeTextToken(token) : false;
    const previousToken = currentSegment?.tokens[currentSegment.tokens.length - 1];
    const shouldStartNewSegment =
      !currentSegment ||
      !previousToken ||
      !tokenIsText ||
      previousToken.kind !== 'text' ||
      !currentSegment.isTextOnly ||
      currentSegment.isIndividuallySafe !== tokenIsIndividuallySafe ||
      !areInlineAttrsEqual(previousToken.runAttrs, token.runAttrs) ||
      !areInlineMarksEqual(previousToken.marks, token.marks);

    if (shouldStartNewSegment) {
      pushCurrentSegment();
      currentSegment = {
        tokens: [token],
        isTextOnly: tokenIsText,
        isIndividuallySafe: tokenIsIndividuallySafe,
        sourceStartTokenIdx: index,
      };
      return;
    }

    currentSegment.tokens.push(token);
  });

  pushCurrentSegment();
  return segments;
}

export function buildInlineDiffPlan(
  oldSegments: InlineTokenSegment[],
  newSegments: InlineTokenSegment[],
): InlineDiffPlanEntry[] | null {
  if (oldSegments.length !== newSegments.length) {
    return null;
  }

  return oldSegments.map((oldSegment, index) => {
    const newSegment = newSegments[index]!;
    return {
      oldSegment,
      newSegment,
      useWordLevel:
        oldSegment.isTextOnly &&
        newSegment.isTextOnly &&
        oldSegment.isIndividuallySafe &&
        newSegment.isIndividuallySafe &&
        isSafeSpan(oldSegment.tokens, newSegment.tokens),
    };
  });
}

function buildRawDiffs(oldContent: InlineDiffToken[], newContent: InlineDiffToken[], idxOffset = 0): RawDiff[] {
  return diffSequences<InlineDiffToken, RawDiff, RawDiff, RawDiff>(oldContent, newContent, {
    comparator: inlineComparator,
    shouldProcessEqualAsModification,
    canTreatAsModification: (oldToken, newToken) => {
      if (isInlineNodeToken(oldToken) && isInlineNodeToken(newToken)) {
        return oldToken.node.type.name === newToken.node.type.name;
      }

      if (oldToken.kind === 'text' && newToken.kind === 'text') {
        return (
          areInlineAttrsEqual(oldToken.runAttrs, newToken.runAttrs) &&
          areInlineMarksEqual(oldToken.marks, newToken.marks)
        );
      }

      return false;
    },
    buildAdded: (token, oldIdx) => buildInlineDiff('added', token, oldIdx + idxOffset),
    buildDeleted: (token, oldIdx) => buildInlineDiff('deleted', token, oldIdx + idxOffset),
    buildModified: (oldToken, newToken, oldIdx) => buildInlineModified(oldToken, newToken, oldIdx + idxOffset),
  });
}

function buildInlineDiff(action: Exclude<InlineAction, 'modified'>, token: InlineDiffToken, oldIdx: number): RawDiff {
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
    text: token.text,
    runAttrs: token.runAttrs,
    marks: token.marks,
  };
}

function buildInlineModified(oldToken: InlineDiffToken, newToken: InlineDiffToken, oldIdx: number): RawDiff | null {
  if (oldToken.kind !== 'text' && newToken.kind !== 'text') {
    const oldNormalized = normalizeInlineNodeAttrs(oldToken.node.type.name, oldToken.node.attrs);
    const newNormalized = normalizeInlineNodeAttrs(newToken.node.type.name, newToken.node.attrs);
    const attrsDiff = getAttributesDiff(oldNormalized, newNormalized);
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
      newText: newToken.text,
      oldText: oldToken.text,
      oldAttrs: oldToken.runAttrs,
      newAttrs: newToken.runAttrs,
      oldMarks: oldToken.marks,
      newMarks: newToken.marks,
    };
  }

  return null;
}

/**
 * Compares two inline tokens to decide if they can be considered equal for the Myers diff.
 * Text tokens compare character equality. Inline nodes compare by semantic identity
 * (normalized JSON), not just type name, so that distinct images are not falsely paired.
 */
function inlineComparator(a: InlineDiffToken, b: InlineDiffToken): boolean {
  if (a.kind !== b.kind) {
    return false;
  }

  if (a.kind === 'text' && b.kind === 'text') {
    return a.text === b.text;
  }
  if (a.kind === 'inlineNode' && b.kind === 'inlineNode') {
    return semanticInlineNodeKey(a.node) === semanticInlineNodeKey(b.node);
  }
  return false;
}

/**
 * Returns true when any mark in the token belongs to tracked changes or
 * comment-anchored review metadata.
 */
function hasUnsafeMarks(marks: MarkJSON[] = []): boolean {
  return marks.some(
    (mark) => TRACK_CHANGE_MARK_NAMES.has(mark.type) || mark.type === 'commentMark' || mark.type === 'comment',
  );
}

function isIndividuallySafeTextToken(token: InlineTextToken): boolean {
  return !hasUnsafeMarks(token.marks ?? []) && !hasFieldLikeRunAttrs(token.runAttrs);
}

/**
 * Conservatively detects field-like run metadata that should stay on the
 * character-level diff path.
 */
function hasFieldLikeRunAttrs(runAttrs: Record<string, unknown>): boolean {
  return objectContainsString(runAttrs, 'PAGEREF');
}

/**
 * Ensures every text token in the span shares the same marks and run attrs,
 * which implies there is no formatting drift between the old/new sides.
 */
function hasUniformTextFormatting(tokens: InlineTextToken[]): boolean {
  if (tokens.length === 0) {
    return true;
  }

  const [{ marks: referenceMarks, runAttrs: referenceRunAttrs }] = tokens;
  return tokens.every((token) => {
    return !getMarksDiff(referenceMarks, token.marks) && !getSafeSpanInlineAttrsDiff(referenceRunAttrs, token.runAttrs);
  });
}

/**
 * Recursively searches for a substring inside an arbitrary attribute payload.
 */
function objectContainsString(value: unknown, needle: string): boolean {
  if (typeof value === 'string') {
    return value.toUpperCase().includes(needle);
  }

  if (Array.isArray(value)) {
    return value.some((item) => objectContainsString(item, needle));
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => objectContainsString(item, needle));
  }

  return false;
}

/**
 * Buckets text into word / whitespace / punctuation classes for word-level
 * diff tokenization.
 */
function classifyTextToken(text: string): 'word' | 'whitespace' | 'punctuation' {
  if (/^\s+$/u.test(text)) {
    return 'whitespace';
  }
  if (/^\w+$/u.test(text)) {
    return 'word';
  }
  return 'punctuation';
}

/**
 * Determines whether equal tokens should still be treated as modifications, either because run attributes changed or the node payload differs.
 */
function shouldProcessEqualAsModification(oldToken: InlineDiffToken, newToken: InlineDiffToken): boolean {
  if (oldToken.kind === 'text' && newToken.kind === 'text') {
    return (
      Boolean(getInlineAttrsDiff(oldToken.runAttrs, newToken.runAttrs)) ||
      oldToken.marks?.length !== newToken.marks?.length ||
      Boolean(getMarksDiff(oldToken.marks, newToken.marks))
    );
  }

  if (oldToken.kind === 'inlineNode' && newToken.kind === 'inlineNode') {
    const oldJSON = normalizeInlineNodeJSON(oldToken.node.toJSON());
    const newJSON = normalizeInlineNodeJSON(newToken.node.toJSON());
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

function canBridgeSingleSpaceGap(
  currentGroup: TextDiffGroup,
  diff: RawTextDiff,
  oldTokens: InlineDiffToken[],
  oldParagraphEndPos: number,
): boolean {
  if (currentGroup.action !== 'modified' || diff.action !== 'modified') {
    return false;
  }

  if (
    !areInlineAttrsEqual(currentGroup.oldAttrs, diff.oldAttrs) ||
    !areInlineAttrsEqual(currentGroup.newAttrs, diff.newAttrs)
  ) {
    return false;
  }
  if (
    !areInlineMarksEqual(currentGroup.oldMarks, diff.oldMarks) ||
    !areInlineMarksEqual(currentGroup.newMarks, diff.newMarks)
  ) {
    return false;
  }

  const diffPos = resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos);
  if (diffPos == null || currentGroup.endPos == null) {
    return false;
  }
  if (diffPos !== currentGroup.endPos + 2) {
    return false;
  }

  return resolveDocumentTextSlice(oldTokens, currentGroup.endPos + 1, diffPos - 1) === ' ';
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
          endPos: resolveTextGroupEndPosition(diff, oldTokens, oldParagraphEndPos),
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
          endPos:
            diff.action === 'added'
              ? resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos)
              : resolveTextGroupEndPosition(diff, oldTokens, oldParagraphEndPos),
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
  const shouldBridgeSingleSpace = canBridgeSingleSpaceGap(group, diff, oldTokens, oldParagraphEndPos);
  group.endPos =
    group.action === 'added'
      ? resolveTokenPosition(oldTokens, diff.idx, oldParagraphEndPos)
      : resolveTextGroupEndPosition(diff, oldTokens, oldParagraphEndPos);
  if (group.action === 'modified' && diff.action === 'modified') {
    if (shouldBridgeSingleSpace) {
      group.newText += ' ';
      group.oldText += ' ';
    }
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
  return group.endPos + 1 === diffPos || canBridgeSingleSpaceGap(group, diff, oldTokens, oldParagraphEndPos);
}

/**
 * Returns the inclusive end position in the old document for a text diff.
 */
function resolveTextGroupEndPosition(
  diff: RawTextDiff,
  oldTokens: InlineDiffToken[],
  oldParagraphEndPos: number,
): number | null {
  return resolveTokenEndPosition(oldTokens, diff.idx, oldParagraphEndPos);
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
 * Maps a raw diff index back to the inclusive end position for the
 * corresponding token span in the old document.
 *
 * Text tokens can span multiple runs after word re-tokenization, so the end
 * position must come from the last source token offset rather than
 * `offset + text.length - 1`.
 *
 * @param tokens Flattened tokens from the old paragraph.
 * @param idx Index provided by the Myers diff output.
 * @param paragraphEndPos Absolute document position marking the paragraph boundary.
 * @returns Inclusive end position or null when the index is outside the known ranges.
 */
function resolveTokenEndPosition(tokens: InlineDiffToken[], idx: number, paragraphEndPos: number): number | null {
  if (idx < 0) {
    return null;
  }
  const token = tokens[idx];
  if (token) {
    if (token.kind === 'text') {
      if (token.endOffset != null) {
        return token.endOffset;
      }
      if (token.offset == null) {
        return null;
      }
      return token.offset + token.length - 1;
    }
    return token.pos ?? null;
  }
  if (idx === tokens.length) {
    return paragraphEndPos;
  }
  return null;
}

function resolveDocumentTextSlice(tokens: InlineDiffToken[], startPos: number, endPos: number): string {
  if (endPos < startPos) {
    return '';
  }

  let text = '';
  for (const token of tokens) {
    if (token.kind !== 'text' || token.offset == null) {
      continue;
    }

    const tokenStart = token.offset;
    const tokenEnd = token.endOffset ?? token.offset + token.length - 1;
    if (tokenEnd < startPos || tokenStart > endPos) {
      continue;
    }

    const sliceStart = Math.max(startPos - tokenStart, 0);
    const sliceEnd = Math.min(endPos - tokenStart + 1, token.text.length);
    text += token.text.slice(sliceStart, sliceEnd);
  }

  return text;
}

/**
 * Compares two sets of inline attributes and determines if they are equal.
 *
 * @param a - The first set of attributes to compare.
 * @param b - The second set of attributes to compare.
 * @returns `true` if the attributes are equal, `false` otherwise.
 */
function areInlineAttrsEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  return !getInlineAttrsDiff(a ?? {}, b ?? {});
}

/**
 * Computes attribute diffs for inline text semantics while ignoring volatile
 * OOXML revision metadata that should not affect granularity decisions.
 */
function getInlineAttrsDiff(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): AttributesDiff | null {
  return getAttributesDiff(a ?? {}, b ?? {}, VOLATILE_RUN_ATTR_KEYS);
}

/**
 * Computes the attr diff used only for granularity eligibility checks.
 * This intentionally ignores importer/bookkeeping churn such as
 * `runPropertiesInlineKeys` and OOXML font-family payload differences that do
 * not necessarily correspond to a visible text-style change.
 */
function getSafeSpanInlineAttrsDiff(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): AttributesDiff | null {
  return getAttributesDiff(a ?? {}, b ?? {}, SAFE_SPAN_IGNORED_INLINE_RUN_ATTR_KEYS);
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
