import type { Node as PMNode } from 'prosemirror-model';
import { getInlineDiff, type InlineDiffToken, type InlineDiffResult } from './inline-diffing.ts';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing.ts';
import { getInsertionPos } from './diff-utils.ts';
import { levenshteinDistance } from './similarity.ts';

// Heuristics that prevent unrelated paragraphs from being paired as modifications.
const SIMILARITY_THRESHOLD = 0.65;
const MIN_LENGTH_FOR_SIMILARITY = 4;

type NodeJSON = ReturnType<PMNode['toJSON']>;

/**
 * Maps flattened indexes back to the ProseMirror document.
 */
export type PositionResolver = (index: number) => number | null;

/**
 * Rich snapshot of a paragraph node with flattened content and helpers.
 */
export interface ParagraphNodeInfo {
  node: PMNode;
  pos: number;
  depth: number;
  text: InlineDiffToken[];
  resolvePosition: PositionResolver;
  fullText: string;
}

/**
 * Base shape shared by every paragraph diff payload.
 */
interface ParagraphDiffBase<Action extends 'added' | 'deleted' | 'modified'> {
  action: Action;
  nodeType: string;
  nodeJSON: NodeJSON;
  pos: number;
}

/**
 * Diff payload produced when a paragraph is inserted.
 */
export type AddedParagraphDiff = ParagraphDiffBase<'added'> & {
  text: string;
};

/**
 * Diff payload produced when a paragraph is deleted.
 */
export type DeletedParagraphDiff = ParagraphDiffBase<'deleted'> & {
  oldText: string;
};

/**
 * Diff payload emitted when a paragraph changes, including inline edits.
 */
export type ModifiedParagraphDiff = ParagraphDiffBase<'modified'> & {
  oldText: string;
  newText: string;
  contentDiff: InlineDiffResult[];
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
 * @returns Snapshot containing tokens, resolver, and derived metadata.
 */
export function createParagraphSnapshot(paragraph: PMNode, paragraphPos: number, depth: number): ParagraphNodeInfo {
  const { text, resolvePosition } = buildParagraphContent(paragraph, paragraphPos);
  return {
    node: paragraph,
    pos: paragraphPos,
    depth,
    text,
    resolvePosition,
    fullText: text.map((token) => (token.kind === 'text' ? token.char : '')).join(''),
  };
}

/**
 * Flattens a paragraph node into inline diff tokens and a resolver that tracks document positions.
 *
 * @param paragraph Paragraph node being tokenized.
 * @param paragraphPos Absolute document position for the paragraph; used to offset resolver results.
 * @returns Flattened tokens plus a resolver that maps token indexes back to document positions.
 */
function buildParagraphContent(
  paragraph: PMNode,
  paragraphPos = 0,
): { text: InlineDiffToken[]; resolvePosition: PositionResolver } {
  const content: InlineDiffToken[] = [];
  const segments: Array<{ start: number; end: number; pos: number }> = [];

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
          runAttrs,
        }));
        content.push(...(chars as InlineDiffToken[]));
        return;
      }

      if (node.type.name !== 'run' && node.isInline) {
        const start = content.length;
        const end = start + 1;
        content.push({
          kind: 'inlineNode',
          node,
          nodeType: node.type.name,
          nodeJSON: node.toJSON(),
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
  const contentDiff = getInlineDiff(oldParagraph.text, newParagraph.text, oldParagraph.resolvePosition);

  const attrsDiff = getAttributesDiff(oldParagraph.node.attrs, newParagraph.node.attrs);
  if (contentDiff.length === 0 && !attrsDiff) {
    return null;
  }

  return {
    action: 'modified',
    nodeType: oldParagraph.node.type.name,
    nodeJSON: oldParagraph.node.toJSON(),
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
