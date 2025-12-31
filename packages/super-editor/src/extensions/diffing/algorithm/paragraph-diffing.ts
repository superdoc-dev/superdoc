import type { Node as PMNode } from 'prosemirror-model';
import { getInlineDiff, tokenizeInlineContent, type InlineDiffToken, type InlineDiffResult } from './inline-diffing.ts';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing.ts';
import { getInsertionPos } from './diff-utils.ts';
import { levenshteinDistance } from './similarity.ts';

// Heuristics that prevent unrelated paragraphs from being paired as modifications.
const SIMILARITY_THRESHOLD = 0.65;
const MIN_LENGTH_FOR_SIMILARITY = 4;

type NodeJSON = ReturnType<PMNode['toJSON']>;

export interface ParagraphNodeInfo {
  /** ProseMirror paragraph node reference. */
  node: PMNode;
  /** Absolute position of the paragraph in the document. */
  pos: number;
  /** Depth of the paragraph within the document tree. */
  depth: number;
  /** Flattened inline tokens for inline diffing. */
  text: InlineDiffToken[];
  /** Absolute end position used for trailing inserts. */
  endPos: number;
  /** Plain-text representation of the paragraph content. */
  fullText: string;
}

/**
 * Base shape shared by every paragraph diff payload.
 */
interface ParagraphDiffBase<Action extends 'added' | 'deleted' | 'modified'> {
  /** Change type for this paragraph. */
  action: Action;
  /** Node type name (always `paragraph`). */
  nodeType: string;
  /** Anchor position in the old document for replaying diffs. */
  pos: number;
}

/**
 * Diff payload produced when a paragraph is inserted.
 */
type AddedParagraphDiff = ParagraphDiffBase<'added'> & {
  /** Serialized paragraph payload inserted into the document. */
  nodeJSON: NodeJSON;
  /** Plain-text content of the inserted paragraph. */
  text: string;
};

/**
 * Diff payload produced when a paragraph is deleted.
 */
type DeletedParagraphDiff = ParagraphDiffBase<'deleted'> & {
  /** Serialized paragraph payload removed from the document. */
  nodeJSON: NodeJSON;
  /** Plain-text content of the removed paragraph. */
  oldText: string;
};

/**
 * Diff payload emitted when a paragraph changes, including inline edits.
 */
type ModifiedParagraphDiff = ParagraphDiffBase<'modified'> & {
  /** Serialized paragraph payload before the change. */
  oldNodeJSON: NodeJSON;
  /** Serialized paragraph payload after the change. */
  newNodeJSON: NodeJSON;
  /** Plain-text content before the change. */
  oldText: string;
  /** Plain-text content after the change. */
  newText: string;
  /** Inline diff operations within the paragraph. */
  contentDiff: InlineDiffResult[];
  /** Attribute-level diff for the paragraph. */
  attrsDiff: AttributesDiff | null;
};

/**
 * Union of every diff variant the paragraph diffing logic can produce.
 */
export type ParagraphDiff = AddedParagraphDiff | DeletedParagraphDiff | ModifiedParagraphDiff;

/**
 * Creates a reusable snapshot that stores flattened paragraph content plus position metadata.
 *
 * @param paragraph Paragraph node to flatten.
 * @param paragraphPos Position of the paragraph in the document.
 * @param depth Depth of the paragraph within the document tree.
 * @returns Snapshot containing tokens (with offsets) and derived metadata.
 */
export function createParagraphSnapshot(paragraph: PMNode, paragraphPos: number, depth: number): ParagraphNodeInfo {
  const text = tokenizeInlineContent(paragraph, paragraphPos + 1);
  return {
    node: paragraph,
    pos: paragraphPos,
    depth,
    text,
    endPos: paragraphPos + 1 + paragraph.content.size,
    fullText: text.map((token) => (token.kind === 'text' ? token.char : '')).join(''),
  };
}

/**
 * Determines whether equal paragraph nodes should still be marked as modified because their serialized structure differs.
 *
 * @param oldParagraph Previous paragraph node reference.
 * @param newParagraph Updated paragraph node reference.
 * @returns True when the serialized JSON payload differs.
 */
export function shouldProcessEqualAsModification(
  oldParagraph: ParagraphNodeInfo,
  newParagraph: ParagraphNodeInfo,
): boolean {
  return JSON.stringify(oldParagraph.node.toJSON()) !== JSON.stringify(newParagraph.node.toJSON());
}

/**
 * Compares two paragraphs for identity based on paraId or text content.
 */
export function paragraphComparator(oldParagraph: ParagraphNodeInfo, newParagraph: ParagraphNodeInfo): boolean {
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
  paragraph: ParagraphNodeInfo,
  previousOldNodeInfo?: Pick<ParagraphNodeInfo, 'node' | 'pos' | 'depth'>,
): AddedParagraphDiff {
  return {
    action: 'added',
    nodeType: paragraph.node.type.name,
    nodeJSON: paragraph.node.toJSON(),
    text: paragraph.fullText,
    pos: getInsertionPos(paragraph.depth, previousOldNodeInfo),
  };
}

/**
 * Builds a normalized payload describing a paragraph deletion so diff consumers can show removals with all context.
 */
export function buildDeletedParagraphDiff(paragraph: ParagraphNodeInfo): DeletedParagraphDiff {
  return {
    action: 'deleted',
    nodeType: paragraph.node.type.name,
    nodeJSON: paragraph.node.toJSON(),
    oldText: paragraph.fullText,
    pos: paragraph.pos,
  };
}

/**
 * Builds the payload for a paragraph modification, including text-level diffs, so renderers can highlight edits inline.
 */
export function buildModifiedParagraphDiff(
  oldParagraph: ParagraphNodeInfo,
  newParagraph: ParagraphNodeInfo,
): ModifiedParagraphDiff | null {
  const contentDiff = getInlineDiff(oldParagraph.text, newParagraph.text, oldParagraph.endPos);

  const attrsDiff = getAttributesDiff(oldParagraph.node.attrs, newParagraph.node.attrs);
  if (contentDiff.length === 0 && !attrsDiff) {
    return null;
  }

  return {
    action: 'modified',
    nodeType: oldParagraph.node.type.name,
    oldNodeJSON: oldParagraph.node.toJSON(),
    newNodeJSON: newParagraph.node.toJSON(),
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
export function canTreatAsModification(oldParagraph: ParagraphNodeInfo, newParagraph: ParagraphNodeInfo): boolean {
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
