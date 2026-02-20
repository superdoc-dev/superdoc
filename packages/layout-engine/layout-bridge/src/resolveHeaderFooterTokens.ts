/**
 * Header/Footer Token Resolution Module
 *
 * Resolves dynamic page number tokens in header and footer blocks.
 * Unlike body content (which is laid out once per page), headers and footers
 * are measured once and reused across multiple pages. This module resolves
 * tokens for a specific page context.
 *
 * This module is called BEFORE header/footer measurement to ensure the correct
 * page number is used when calculating dimensions and caching layouts.
 */

import type { FlowBlock, ParagraphBlock } from '@superdoc/contracts';

/**
 * Resolves page number tokens in a batch of header or footer blocks.
 *
 * Headers and footers can contain the same token types as body content
 * (pageNumber, totalPageCount), but they need to be resolved to the specific
 * page where the header/footer will appear. This function mutates the blocks
 * in-place to replace token placeholders with actual values.
 *
 * The function processes all variants in the batch (default, first, even, odd),
 * applying the same page context to all. This is correct because a single batch
 * represents headers/footers for one specific page.
 *
 * IMPORTANT: This function modifies blocks in-place. The calling code should
 * ensure that blocks are not shared between multiple page contexts, or should
 * create copies before calling this function.
 *
 * @param blocks - Array of FlowBlocks for a single header/footer variant
 * @param pageNumber - Current page number (1-indexed) where this header/footer appears
 * @param totalPages - Total number of pages in the document
 * @param pageNumberText - Optional preformatted page number string (e.g., "-1-")
 *
 * @example
 * ```typescript
 * // Resolve tokens for the header that will appear on page 3
 * const headerBlocks = adapter.getBlocks('header', 'default');
 * resolveHeaderFooterTokens(headerBlocks, 3, 10);
 * // Now headerBlocks contain "3" instead of "0" for PAGE field
 * // and "10" for NUMPAGES field
 * ```
 */
export function resolveHeaderFooterTokens(
  blocks: FlowBlock[],
  pageNumber: number,
  totalPages: number,
  pageNumberText?: string,
): void {
  // Validate inputs
  if (!blocks || blocks.length === 0) {
    return;
  }

  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    console.warn('[resolveHeaderFooterTokens] Invalid pageNumber:', pageNumber, '- using 1 as fallback');
    pageNumber = 1;
  }

  if (!Number.isFinite(totalPages) || totalPages < 1) {
    console.warn('[resolveHeaderFooterTokens] Invalid totalPages:', totalPages, '- using 1 as fallback');
    totalPages = 1;
  }

  const pageNumberStr = pageNumberText ?? String(pageNumber);
  const totalPagesStr = String(totalPages);

  // Process each block in the header/footer
  for (const block of blocks) {
    // Only paragraph blocks can contain runs with tokens
    if (block.kind !== 'paragraph') continue;

    const paraBlock = block as ParagraphBlock;

    // Iterate through runs in the paragraph
    for (const run of paraBlock.runs) {
      // Type guard: only TextRun can have token property
      if ('token' in run && run.token) {
        if (run.token === 'pageNumber') {
          // Replace placeholder text with actual page number for measurement.
          // IMPORTANT: Do NOT delete run.token - the painter needs it to
          // re-resolve the correct page number at render time for each page.
          // The text here is for measurement purposes (digit width).
          run.text = pageNumberStr;
        } else if (run.token === 'totalPageCount') {
          // Replace placeholder text with total page count for measurement.
          // IMPORTANT: Keep token for painter to re-resolve if needed.
          run.text = totalPagesStr;
        }
        // Note: pageReference tokens should not appear in headers/footers typically,
        // but if they do, they'll be handled by the PAGEREF resolution logic
      }
    }
  }
}

/**
 * Creates a deep copy of header/footer blocks to avoid mutating shared data.
 *
 * Since token resolution modifies blocks in-place, and the same header/footer
 * content may be used across multiple pages (with different page numbers),
 * we need to create independent copies for each page.
 *
 * This function performs a deep clone of the block structure, including runs
 * and all nested properties, to ensure complete isolation.
 *
 * @param blocks - Original blocks to copy
 * @returns Deep copy of the blocks
 *
 * @example
 * ```typescript
 * const originalBlocks = adapter.getBlocks('header', 'default');
 * const blocksForPage1 = cloneHeaderFooterBlocks(originalBlocks);
 * const blocksForPage2 = cloneHeaderFooterBlocks(originalBlocks);
 * // Now we can resolve tokens differently for each page
 * resolveHeaderFooterTokens(blocksForPage1, 1, 10);
 * resolveHeaderFooterTokens(blocksForPage2, 2, 10);
 * ```
 */
export function cloneHeaderFooterBlocks(blocks: FlowBlock[]): FlowBlock[] {
  if (!blocks || blocks.length === 0) {
    return [];
  }

  return blocks.map((block) => {
    if (block.kind === 'paragraph') {
      const paraBlock = block as ParagraphBlock;
      return {
        ...paraBlock,
        runs: paraBlock.runs.map((run) => ({ ...run })),
        attrs: paraBlock.attrs ? { ...paraBlock.attrs } : undefined,
      };
    }
    // For other block types, shallow copy is sufficient
    // (they don't contain tokens)
    return { ...block };
  });
}
