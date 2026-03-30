/** Synthetic block id used for the semantic footnotes heading. */
export const SEMANTIC_FOOTNOTES_HEADING_BLOCK_ID = '__sd_semantic_footnotes_heading';
/** Prefix used for synthetic semantic footnote block ids. */
export const SEMANTIC_FOOTNOTE_BLOCK_ID_PREFIX = '__sd_semantic_footnote';

/**
 * Checks whether a block id belongs to semantic-flow synthetic footnote content.
 *
 * @param blockId - Layout block id to inspect.
 * @returns `true` when the id matches semantic footnote heading/body prefix.
 */
export function isSemanticFootnoteBlockId(blockId: string): boolean {
  return typeof blockId === 'string' && blockId.startsWith(SEMANTIC_FOOTNOTE_BLOCK_ID_PREFIX);
}
