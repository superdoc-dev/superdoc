/**
 * Page Number Token Resolution Module
 *
 * Resolves dynamic page number tokens (pageNumber, totalPageCount, sectionPageCount) in layout fragments.
 * This module follows the same pattern as resolvePageRefs.ts for PAGEREF token resolution.
 *
 * Tokens are created during PM-to-FlowBlock conversion with placeholder text ('0'),
 * which is used for initial measurement. After layout completes and pages are numbered,
 * this module replaces the placeholder text with actual page numbers.
 *
 * Features:
 * - Supports section-aware display page numbers via numbering context
 * - Returns updated block clones (doesn't mutate originals)
 * - Integrates with two-pass convergence loop in incrementalLayout
 */

import {
  formatChapterPageNumberText,
  formatPageNumberFieldValue,
  formatSectionPageNumberText,
  type Layout,
  type FlowBlock,
  type ParagraphBlock,
  type Measure,
} from '@superdoc/contracts';
import type { DisplayPageInfo } from './pageNumbering';

/**
 * Numbering context for page token resolution.
 * Contains display page information for each physical page in the document.
 */
export interface NumberingContext {
  /** Total number of pages in the document */
  totalPages: number;
  /** Display page information for each page (indexed by physical page number - 1) */
  displayPages: DisplayPageInfo[];
}

/**
 * Result of page number token resolution.
 * Contains affected block IDs and their updated clones.
 */
export interface ResolvePageTokensResult {
  /** Set of block IDs that had tokens resolved */
  affectedBlockIds: Set<string>;
  /** Map of block ID to updated block clone (only for affected blocks) */
  updatedBlocks: Map<string, FlowBlock>;
}

/**
 * Resolves page number and total page count tokens in document blocks using layout and numbering context.
 *
 * This function walks through all pages and fragments in the layout, finding blocks with
 * page number tokens. For each affected block, it creates a clone with resolved token text,
 * using section-aware display page numbers from the numbering context.
 *
 * The function does NOT mutate original blocks - it returns clones of affected blocks.
 * This ensures thread-safety and allows for clean rollback if re-measurement fails.
 *
 * @param layout - Completed layout with page-numbered fragments
 * @param blocks - Original FlowBlocks array (will not be mutated)
 * @param measures - Measure array (parallel to blocks, used to detect hasPageTokens flag)
 * @param numberingCtx - Numbering context with display page info and total pages
 * @returns Result containing affected block IDs and updated block clones
 *
 * @example
 * ```typescript
 * const layout = layoutDocument(blocks, measures, options);
 * const numberingCtx = buildNumberingContext(layout, sections);
 * const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);
 *
 * if (result.affectedBlockIds.size > 0) {
 *   // Re-measure affected blocks and re-run pagination
 *   const updatedBlocks = blocks.map(b => result.updatedBlocks.get(b.id) ?? b);
 *   // ... remeasure and re-layout ...
 * }
 * ```
 */
export function resolvePageNumberTokens(
  layout: Layout,
  blocks: FlowBlock[],
  measures: Measure[],
  numberingCtx: NumberingContext,
): ResolvePageTokensResult {
  const affectedBlockIds = new Set<string>();
  const updatedBlocks = new Map<string, FlowBlock>();

  // Validate inputs
  if (!layout?.pages || layout.pages.length === 0) {
    return { affectedBlockIds, updatedBlocks };
  }

  if (!numberingCtx || !numberingCtx.displayPages || numberingCtx.totalPages < 1) {
    console.warn('[resolvePageTokens] Invalid numbering context - skipping resolution');
    return { affectedBlockIds, updatedBlocks };
  }

  // Build block lookup map for O(1) access
  const blockMap = new Map<string, FlowBlock>();
  const blockHasTokensFlags = new Map<string, boolean>();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    blockMap.set(block.id, block);

    // Check if block has hasPageTokens flag for optimization
    // This flag should be set during import when tokens are detected
    if (block.kind === 'paragraph' && block.attrs && 'hasPageTokens' in block.attrs) {
      blockHasTokensFlags.set(block.id, Boolean(block.attrs.hasPageTokens));
    }
  }

  const totalPagesStr = String(numberingCtx.totalPages);

  // Track which blocks we've already processed to avoid duplicate work
  const processedBlocks = new Set<string>();

  // Iterate through all pages and fragments
  for (const page of layout.pages) {
    // Get display page info for this physical page
    const pageIndex = page.number - 1; // Convert to 0-indexed
    const displayPageInfo = numberingCtx.displayPages[pageIndex];

    if (!displayPageInfo) {
      console.warn(`[resolvePageTokens] No display page info for page ${page.number} - skipping`);
      continue;
    }

    const sectionPageCount = displayPageInfo.sectionPageCount || numberingCtx.totalPages || 1;
    for (const fragment of page.fragments) {
      // Paragraph fragments — original behaviour.
      if (fragment.kind === 'para') {
        const blockId = fragment.blockId;
        if (processedBlocks.has(blockId)) continue;

        const hasTokensFlag = blockHasTokensFlags.get(blockId);
        if (hasTokensFlag === false) continue;

        const block = blockMap.get(blockId);
        if (!block || block.kind !== 'paragraph') continue;

        if (!hasPageTokens(block)) {
          processedBlocks.add(blockId);
          continue;
        }

        const clonedBlock = cloneBlockWithResolvedTokens(
          block,
          displayPageInfo,
          totalPagesStr,
          numberingCtx.totalPages,
          sectionPageCount,
        );
        if (!clonedBlock) {
          processedBlocks.add(blockId);
          continue;
        }
        updatedBlocks.set(blockId, clonedBlock);
        affectedBlockIds.add(blockId);
        processedBlocks.add(blockId);
        continue;
      }

      // Body tables are intentionally NOT processed here.
      //
      // A body table can span multiple physical pages: the layout engine emits
      // one `kind === 'table'` fragment per page, all sharing the same
      // table.blockId, each with its own fromRow..toRow. Cloning the entire
      // table once with a single page's displayPageText would resolve every
      // PAGE field — including ones rendered on later pages — to the first
      // fragment's number. The correct fix is per-fragment substitution
      // (synthetic per-page block IDs + targeted row cloning), which is a
      // larger layout-pipeline change. Defer until a body-table-with-PAGE
      // fixture surfaces it.
      //
      // SD-1332 (the Linear ticket motivating this comment) is a footer-side
      // bug. Headers/footers go through layout-bridge/resolveHeaderFooterTokens,
      // which is page-local — each H/F page owns its own block clone — so
      // recursing into table cells THERE is safe and correct (see
      // forEachParagraphBlock in resolveHeaderFooterTokens.ts).
    }
  }

  return { affectedBlockIds, updatedBlocks };
}

/**
 * Checks if a paragraph block contains any page number tokens.
 *
 * @param block - Paragraph block to check
 * @returns True if block contains pageNumber, totalPageCount, or sectionPageCount tokens
 */
function hasPageTokens(block: ParagraphBlock): boolean {
  for (const run of block.runs) {
    if (
      'token' in run &&
      (run.token === 'pageNumber' || run.token === 'totalPageCount' || run.token === 'sectionPageCount')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Clones a paragraph block and resolves all page number tokens in its runs.
 *
 * This creates a deep clone of the block's runs array and resolves any pageNumber
 * or totalPageCount tokens by replacing the text while preserving token metadata
 * for later convergence passes.
 *
 * @param block - Original paragraph block (will not be mutated)
 * @param displayPageInfo - Section-aware page number data for this physical page
 * @param totalPagesStr - Total page count as string
 * @returns Cloned block with resolved tokens
 */
function cloneBlockWithResolvedTokens(
  block: ParagraphBlock,
  displayPageInfo: DisplayPageInfo,
  totalPagesStr: string,
  totalPages: number,
  sectionPageCount: number,
): ParagraphBlock | undefined {
  let changed = false;
  // Clone the runs array and resolve tokens
  const clonedRuns = block.runs.map((run) => {
    // Check if this run has a page token
    if ('token' in run && run.token) {
      if (run.token === 'pageNumber') {
        const resolvedText = run.pageNumberFieldFormat
          ? formatChapterPageNumberText({
              pageComponent: formatPageNumberFieldValue(displayPageInfo.displayNumber, run.pageNumberFieldFormat),
              chapterNumberText: displayPageInfo.chapterNumberText,
              chapterSeparator: displayPageInfo.chapterSeparator,
            })
          : displayPageInfo.chapterNumberText
            ? formatSectionPageNumberText({
                displayNumber: displayPageInfo.displayNumber,
                pageFormat: displayPageInfo.pageFormat ?? 'decimal',
                chapterNumberText: displayPageInfo.chapterNumberText,
                chapterSeparator: displayPageInfo.chapterSeparator,
              })
            : displayPageInfo.displayText;
        changed ||= run.text !== resolvedText;
        return {
          ...run,
          text: resolvedText,
        };
      } else if (run.token === 'totalPageCount') {
        const resolvedText = run.pageNumberFieldFormat
          ? formatPageNumberFieldValue(totalPages, run.pageNumberFieldFormat)
          : totalPagesStr;
        changed ||= run.text !== resolvedText;
        return {
          ...run,
          text: resolvedText,
        };
      } else if (run.token === 'sectionPageCount') {
        const resolvedText = run.pageNumberFieldFormat
          ? formatPageNumberFieldValue(sectionPageCount, run.pageNumberFieldFormat)
          : String(sectionPageCount);
        changed ||= run.text !== resolvedText;
        return {
          ...run,
          text: resolvedText,
        };
      }
    }

    // No token or different token - return as-is
    return run;
  });

  // Return cloned block with new runs
  return changed
    ? {
        ...block,
        runs: clonedRuns,
      }
    : undefined;
}

/**
 * Resolves page number tokens in paragraph blocks.
 *
 * This is a helper function that processes a single paragraph block's runs,
 * resolving any pageNumber or totalPageCount tokens. It's designed to be called
 * from the layout pipeline where both the layout and blocks are available.
 *
 * @param block - Paragraph block to process
 * @param pageNumber - Current page number (1-indexed)
 * @param totalPages - Total number of pages in the document
 * @returns True if any tokens were resolved in this block
 *
 * @example
 * ```typescript
 * const wasModified = resolveTokensInBlock(paragraphBlock, 3, 10);
 * if (wasModified) {
 *   // Block was modified, may need re-measurement
 * }
 * ```
 */
export function resolveTokensInBlock(block: ParagraphBlock, pageNumber: number, totalPages: number): boolean {
  if (block.kind !== 'paragraph') {
    return false;
  }

  // Validate inputs
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    console.warn('[resolvePageTokens] Invalid pageNumber:', pageNumber, '- using 1 as fallback');
    pageNumber = 1;
  }

  if (!Number.isFinite(totalPages) || totalPages < 1) {
    console.warn('[resolvePageTokens] Invalid totalPages:', totalPages, '- using 1 as fallback');
    totalPages = 1;
  }

  const pageNumberStr = String(pageNumber);
  const totalPagesStr = String(totalPages);
  let blockModified = false;

  // Iterate through runs in the paragraph
  for (const run of block.runs) {
    // Type guard: only TextRun can have token property
    if ('token' in run && run.token) {
      if (run.token === 'pageNumber') {
        // Replace placeholder text with actual page number
        run.text = run.pageNumberFieldFormat
          ? formatPageNumberFieldValue(pageNumber, run.pageNumberFieldFormat)
          : pageNumberStr;
        // Clear token metadata to treat as normal text after resolution
        delete run.token;
        delete run.pageNumberFieldFormat;
        blockModified = true;
      } else if (run.token === 'totalPageCount') {
        // Replace placeholder text with total page count
        run.text = run.pageNumberFieldFormat
          ? formatPageNumberFieldValue(totalPages, run.pageNumberFieldFormat)
          : totalPagesStr;
        // Clear token metadata to treat as normal text after resolution
        delete run.token;
        delete run.pageNumberFieldFormat;
        blockModified = true;
      }
      // Note: pageReference tokens are handled by resolvePageRefs.ts
    }
  }

  return blockModified;
}
