/**
 * Pure functions for building semantic footnote blocks in web-view mode.
 *
 * Extracted from PresentationEditor to keep the class focused on orchestration.
 * All functions are stateless — they depend only on their arguments.
 */
import type { FlowBlock } from '@superdoc/contracts';
import type { FootnotesLayoutInput } from './types.js';
import { SEMANTIC_FOOTNOTES_HEADING_BLOCK_ID, SEMANTIC_FOOTNOTE_BLOCK_ID_PREFIX } from './semantic-flow-constants.js';

/** Fallback style applied to the synthetic "Footnotes" heading in semantic flow. */
export const DEFAULT_SEMANTIC_FOOTNOTE_HEADING_STYLE = {
  fontFamily: 'Arial',
  fontSize: 14,
  bold: true,
  spacing: { before: 24, after: 12 },
} as const;

/**
 * Builds the array of synthetic FlowBlocks that represent footnotes appended
 * at the end of the document in semantic (web-view) mode.
 *
 * @param input - Footnote references and converted flow blocks grouped by footnote id.
 * @param footnotesMode - Semantic footnote rendering mode.
 * @returns Synthetic heading/body blocks to append to semantic flow layout.
 *
 * Returns an empty array when footnotes are absent or the mode is not `endOfDocument`.
 */
export function buildSemanticFootnoteBlocks(
  input: FootnotesLayoutInput | null,
  footnotesMode: 'endOfDocument' | undefined,
): FlowBlock[] {
  if (!input || input.refs.length === 0 || input.blocksById.size === 0) {
    return [];
  }
  if ((footnotesMode ?? 'endOfDocument') !== 'endOfDocument') {
    return [];
  }
  const orderedFootnoteIds: string[] = [];
  const seen = new Set<string>();
  input.refs.forEach((ref) => {
    if (!ref?.id || seen.has(ref.id)) return;
    seen.add(ref.id);
    orderedFootnoteIds.push(ref.id);
  });
  if (orderedFootnoteIds.length === 0) {
    return [];
  }

  const headingRunStyle = resolveSemanticFootnoteHeadingRunStyle(input.blocksById, orderedFootnoteIds);
  const result: FlowBlock[] = [createSemanticFootnoteHeadingBlock(headingRunStyle)];
  orderedFootnoteIds.forEach((id, footnoteIndex) => {
    const sourceBlocks = input.blocksById.get(id) ?? [];
    sourceBlocks.forEach((block, blockIndex) => {
      result.push(cloneFlowBlockForSemanticFootnote(block, id, footnoteIndex, blockIndex));
    });
  });
  return result;
}

function resolveSemanticFootnoteHeadingRunStyle(
  blocksById: Map<string, FlowBlock[]>,
  orderedFootnoteIds: string[],
): { fontFamily: string; fontSize: number } {
  for (const footnoteId of orderedFootnoteIds) {
    const blocks = blocksById.get(footnoteId) ?? [];
    for (const block of blocks) {
      if (block.kind !== 'paragraph') continue;
      for (const run of block.runs) {
        const fontFamily = (run as { fontFamily?: unknown }).fontFamily;
        const fontSize = (run as { fontSize?: unknown }).fontSize;
        if (typeof fontFamily === 'string' && fontFamily.length > 0 && typeof fontSize === 'number') {
          if (Number.isFinite(fontSize) && fontSize > 0) {
            return { fontFamily, fontSize };
          }
        }
      }
    }
  }

  return {
    fontFamily: DEFAULT_SEMANTIC_FOOTNOTE_HEADING_STYLE.fontFamily,
    fontSize: DEFAULT_SEMANTIC_FOOTNOTE_HEADING_STYLE.fontSize,
  };
}

function createSemanticFootnoteHeadingBlock(style: { fontFamily: string; fontSize: number }): FlowBlock {
  return {
    kind: 'paragraph',
    id: SEMANTIC_FOOTNOTES_HEADING_BLOCK_ID,
    attrs: {
      spacing: DEFAULT_SEMANTIC_FOOTNOTE_HEADING_STYLE.spacing,
    },
    runs: [
      {
        kind: 'text',
        text: 'Footnotes',
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        bold: DEFAULT_SEMANTIC_FOOTNOTE_HEADING_STYLE.bold,
      },
    ],
  };
}

function cloneFlowBlock(block: FlowBlock): FlowBlock {
  return JSON.parse(JSON.stringify(block)) as FlowBlock;
}

function stripPmRangesDeep(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((item) => stripPmRangesDeep(item));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown> & { pmStart?: unknown; pmEnd?: unknown };
  if ('pmStart' in record) {
    delete record.pmStart;
  }
  if ('pmEnd' in record) {
    delete record.pmEnd;
  }

  Object.values(record).forEach((nested) => stripPmRangesDeep(nested));
}

function cloneFlowBlockForSemanticFootnote(
  block: FlowBlock,
  footnoteId: string,
  footnoteIndex: number,
  blockIndex: number,
): FlowBlock {
  const cloned = cloneFlowBlock(block);
  stripPmRangesDeep(cloned);
  cloned.id = `${SEMANTIC_FOOTNOTE_BLOCK_ID_PREFIX}-${footnoteId}-${footnoteIndex}-${blockIndex}-${block.id}`;
  return cloned;
}
