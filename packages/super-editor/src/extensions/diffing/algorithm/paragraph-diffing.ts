import type { Node as PMNode } from 'prosemirror-model';
import { getInlineDiff, type InlineDiffToken, type InlineDiffResult } from './inline-diffing.ts';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing.ts';
import { getInsertionPos } from './diff-utils.ts';
import { levenshteinDistance } from './similarity.ts';

// Heuristics that prevent unrelated paragraphs from being paired as modifications.
const SIMILARITY_THRESHOLD = 0.65;
const MIN_LENGTH_FOR_SIMILARITY = 4;

type NodeJSON = ReturnType<PMNode['toJSON']>;

export interface ParagraphNodeInfo {
  node: PMNode;
  pos: number;
  depth: number;
  text: InlineDiffToken[];
  endPos: number;
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
 * @returns Snapshot containing tokens (with offsets) and derived metadata.
 */
export function createParagraphSnapshot(paragraph: PMNode, paragraphPos: number, depth: number): ParagraphNodeInfo {
  const text = buildParagraphContent(paragraph, paragraphPos);
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
 * Flattens a paragraph node into inline diff tokens, embedding absolute document offsets.
 *
 * @param paragraph Paragraph node being tokenized.
 * @param paragraphPos Absolute document position for the paragraph; used to offset resolver results.
 * @returns Flattened tokens enriched with document offsets.
 */
function buildParagraphContent(paragraph: PMNode, paragraphPos = 0): InlineDiffToken[] {
  const content: InlineDiffToken[] = [];
  const paragraphOffset = paragraphPos + 1;
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
        const runNode = paragraph.nodeAt(pos - 1);
        const runAttrs = runNode?.attrs ?? {};
        const baseOffset = paragraphOffset + pos;
        for (let i = 0; i < nodeText.length; i += 1) {
          content.push({
            kind: 'text',
            char: nodeText[i] ?? '',
            runAttrs,
            offset: baseOffset + i,
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
          pos: paragraphOffset + pos,
        });
      }
    },
    0,
  );
  return content;
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
