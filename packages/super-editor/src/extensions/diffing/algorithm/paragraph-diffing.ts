import type { Node as PMNode } from 'prosemirror-model';
import { getInlineDiff, type InlineDiffToken, type InlineDiffResult } from './inline-diffing.ts';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing.ts';
import { levenshteinDistance } from './similarity.ts';

// Heuristics that prevent unrelated paragraphs from being paired as modifications.
const SIMILARITY_THRESHOLD = 0.65;
const MIN_LENGTH_FOR_SIMILARITY = 4;

/**
 * Flattened token emitted from a paragraph. Delegates to inline diff tokens.
 */
export type ParagraphContentToken = InlineDiffToken;
/**
 * Maps flattened indexes back to the ProseMirror document.
 */
export type PositionResolver = (index: number) => number | null;

/**
 * Internal bookkeeping entry that remembers the start/end indexes for shallow nodes.
 */
interface ParagraphSegment {
  start: number;
  end: number;
  pos: number;
}

/**
 * Computed textual representation of a paragraph plus its index resolver.
 */
export interface ParagraphContent {
  text: ParagraphContentToken[];
  resolvePosition: PositionResolver;
}

/**
 * Bare reference to a paragraph node and its document position.
 */
export interface ParagraphNodeReference {
  node: PMNode;
  pos: number;
}

/**
 * Snapshot of a paragraph that includes its flattened text form.
 */
export interface ParagraphSnapshot extends ParagraphNodeReference {
  fullText: string;
}

/**
 * Paragraph snapshot extended with the tokenized content and resolver.
 */
export interface ParagraphResolvedSnapshot extends ParagraphSnapshot {
  text: ParagraphContentToken[];
  resolvePosition: PositionResolver;
}

/**
 * Diff payload produced when a paragraph is inserted.
 */
export interface AddedParagraphDiff {
  action: 'added';
  nodeType: string;
  node: PMNode;
  text: string;
  pos: number;
}

/**
 * Diff payload produced when a paragraph is deleted.
 */
export interface DeletedParagraphDiff {
  action: 'deleted';
  nodeType: string;
  node: PMNode;
  oldText: string;
  pos: number;
}

/**
 * Diff payload emitted when a paragraph changes, including inline edits.
 */
export interface ModifiedParagraphDiff {
  action: 'modified';
  nodeType: string;
  oldText: string;
  newText: string;
  pos: number;
  contentDiff: InlineDiffResult[];
  attrsDiff: AttributesDiff | null;
}

/**
 * Union of every diff variant the paragraph diffing logic can produce.
 */
export type ParagraphDiff = AddedParagraphDiff | DeletedParagraphDiff | ModifiedParagraphDiff;

/**
 * Flattens a paragraph node into text and provides a resolver to map string indices back to document positions.
 *
 * @param paragraph Paragraph node to flatten.
 * @param paragraphPos Position of the paragraph in the document.
 * @returns Concatenated text tokens and a resolver that maps indexes to document positions.
 */
export function getParagraphContent(paragraph: PMNode, paragraphPos = 0): ParagraphContent {
  const content: ParagraphContentToken[] = [];
  const segments: ParagraphSegment[] = [];

  paragraph.nodesBetween(
    0,
    paragraph.content.size,
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
        const start = content.length;
        const end = start + nodeText.length;
        const runNode = paragraph.nodeAt(pos - 1);
        const runAttrs = runNode?.attrs ?? {};
        segments.push({ start, end, pos });
        const chars = nodeText.split('').map((char) => ({
          kind: 'text',
          char,
          runAttrs: JSON.stringify(runAttrs),
        }));
        content.push(...(chars as ParagraphContentToken[]));
        return;
      }

      if (node.type.name !== 'run' && node.isInline) {
        const start = content.length;
        const end = start + 1;
        content.push({
          kind: 'inlineNode',
          node,
        });
        segments.push({ start, end, pos });
      }
    },
    0,
  );

  const resolvePosition: PositionResolver = (index) => {
    if (index < 0 || index > content.length) {
      return null;
    }

    for (const segment of segments) {
      if (index >= segment.start && index < segment.end) {
        return paragraphPos + 1 + segment.pos + (index - segment.start);
      }
    }

    return paragraphPos + 1 + paragraph.content.size;
  };

  return { text: content, resolvePosition };
}

/**
 * Determines whether equal paragraph nodes should still be marked as modified because their serialized structure differs.
 *
 * @param oldParagraph Previous paragraph node reference.
 * @param newParagraph Updated paragraph node reference.
 * @returns True when the serialized JSON payload differs.
 */
export function shouldProcessEqualAsModification(
  oldParagraph: ParagraphNodeReference,
  newParagraph: ParagraphNodeReference,
): boolean {
  return JSON.stringify(oldParagraph.node.toJSON()) !== JSON.stringify(newParagraph.node.toJSON());
}

/**
 * Compares two paragraphs for identity based on paraId or text content.
 */
export function paragraphComparator(oldParagraph: ParagraphSnapshot, newParagraph: ParagraphSnapshot): boolean {
  const oldId = oldParagraph?.node?.attrs?.paraId;
  const newId = newParagraph?.node?.attrs?.paraId;
  if (oldId && newId && oldId === newId) {
    return true;
  }
  return oldParagraph?.fullText === newParagraph?.fullText;
}

/**
 * Builds a normalized payload describing a paragraph addition, ensuring all consumers receive the same metadata shape.
 */
export function buildAddedParagraphDiff(
  paragraph: ParagraphSnapshot,
  previousOldNodeInfo?: ParagraphNodeReference,
): AddedParagraphDiff {
  const previousNodeSize = previousOldNodeInfo?.node.nodeSize ?? 0;
  const previousPos = previousOldNodeInfo?.pos ?? -1;
  const pos = previousPos >= 0 ? previousPos + previousNodeSize : 0;
  return {
    action: 'added',
    nodeType: paragraph.node.type.name,
    node: paragraph.node,
    text: paragraph.fullText,
    pos,
  };
}

/**
 * Builds a normalized payload describing a paragraph deletion so diff consumers can show removals with all context.
 */
export function buildDeletedParagraphDiff(paragraph: ParagraphSnapshot): DeletedParagraphDiff {
  return {
    action: 'deleted',
    nodeType: paragraph.node.type.name,
    node: paragraph.node,
    oldText: paragraph.fullText,
    pos: paragraph.pos,
  };
}

/**
 * Builds the payload for a paragraph modification, including text-level diffs, so renderers can highlight edits inline.
 */
export function buildModifiedParagraphDiff(
  oldParagraph: ParagraphResolvedSnapshot,
  newParagraph: ParagraphResolvedSnapshot,
): ModifiedParagraphDiff | null {
  const contentDiff = getInlineDiff(
    oldParagraph.text,
    newParagraph.text,
    oldParagraph.resolvePosition,
    newParagraph.resolvePosition,
  );

  const attrsDiff = getAttributesDiff(oldParagraph.node.attrs, newParagraph.node.attrs);
  if (contentDiff.length === 0 && !attrsDiff) {
    return null;
  }

  return {
    action: 'modified',
    nodeType: oldParagraph.node.type.name,
    oldText: oldParagraph.fullText,
    newText: newParagraph.fullText,
    pos: oldParagraph.pos,
    contentDiff,
    attrsDiff,
  };
}

/**
 * Decides whether a delete/insert pair should be reinterpreted as a modification to minimize noisy diff output.
 */
export function canTreatAsModification(oldParagraph: ParagraphSnapshot, newParagraph: ParagraphSnapshot): boolean {
  if (paragraphComparator(oldParagraph, newParagraph)) {
    return true;
  }

  const oldText = oldParagraph.fullText;
  const newText = newParagraph.fullText;
  const maxLength = Math.max(oldText.length, newText.length);
  if (maxLength < MIN_LENGTH_FOR_SIMILARITY) {
    return false;
  }

  const similarity = getTextSimilarityScore(oldText, newText);
  return similarity >= SIMILARITY_THRESHOLD;
}

/**
 * Scores the similarity between two text strings so the diff can decide if they represent the same conceptual paragraph.
 */
function getTextSimilarityScore(oldText: string, newText: string): number {
  if (!oldText && !newText) {
    return 1;
  }

  const distance = levenshteinDistance(oldText, newText);
  const maxLength = Math.max(oldText.length, newText.length) || 1;
  return 1 - distance / maxLength;
}
