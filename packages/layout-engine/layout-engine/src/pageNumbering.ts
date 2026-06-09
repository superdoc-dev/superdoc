/**
 * Page Numbering Module
 *
 * Provides utilities for formatting page numbers and computing section-aware
 * display page numbers for document layout. This module supports MS Word parity
 * for page number formatting (decimal, roman numerals, letters) and section-aware
 * numbering with restart and offset support.
 *
 * Key Features:
 * - Format page numbers in multiple formats (decimal, roman, letters)
 * - Compute display page numbers based on section metadata
 * - Support section numbering restart and offset
 * - Handle continuous sections that inherit prior section's running count
 */

import {
  formatPageNumber,
  formatPageNumberFieldValue,
  formatSectionPageNumberText,
  type FlowBlock,
  type Layout,
  type Page,
  type PageNumberChapterSeparator,
  type PageNumberFormat,
  type ParagraphBlock,
  type SectionMetadata,
} from '@superdoc/contracts';
export { formatPageNumber, formatPageNumberFieldValue, formatSectionPageNumberText };
export type { PageNumberFormat };

export interface ChapterPageInfo {
  chapterNumberText?: string;
  chapterStyle?: number;
}

/**
 * Display page information for a single page in the document.
 * Contains both the physical page number and the section-aware display number.
 */
export interface DisplayPageInfo {
  /** Physical page number (1-indexed, continuous across the document) */
  physicalPage: number;
  /** Section-aware display page number (respects restart and offset) */
  displayNumber: number;
  /** Formatted display text (e.g., "III", "C", "23") */
  displayText: string;
  /** Index of the section this page belongs to */
  sectionIndex: number;
  /** Physical page count in the current section */
  sectionPageCount: number;
  /** Section PAGE number format before any run-local PAGE switch is applied. */
  pageFormat?: PageNumberFormat;
  /** MVP chapter prefix text derived from the nearest numbered Heading N marker. */
  chapterNumberText?: string;
  /** Separator between chapter prefix and page number component. */
  chapterSeparator?: PageNumberChapterSeparator;
}

const HEADING_STYLE_PREFIX = 'heading';
const CHAPTER_MARKER_SEPARATOR_RE = /[.\-:\u2013\u2014]/;
const CLEAN_CHAPTER_MARKER_RE = /^[A-Za-z0-9]+(?:[.\-:\u2013\u2014][A-Za-z0-9]+)*$/;

function normalizeHeadingStyleId(styleId: unknown): string | undefined {
  if (typeof styleId !== 'string') {
    return undefined;
  }
  return styleId.replace(/[\s_-]+/g, '').toLowerCase();
}

function getHeadingLevel(block: FlowBlock): number | undefined {
  if (block.kind !== 'paragraph') {
    return undefined;
  }

  const attrs = (block as ParagraphBlock).attrs;
  const resolvedHeadingLevel = attrs?.headingLevel;
  if (typeof resolvedHeadingLevel === 'number' && Number.isInteger(resolvedHeadingLevel) && resolvedHeadingLevel > 0) {
    return resolvedHeadingLevel;
  }

  // Adapter-provided headingLevel is authoritative; this keeps legacy/simple
  // projections working for English built-in style ids like Heading1.
  const normalizedStyleId = normalizeHeadingStyleId(attrs?.styleId);
  if (!normalizedStyleId?.startsWith(HEADING_STYLE_PREFIX)) {
    return undefined;
  }

  const rawLevel = normalizedStyleId.slice(HEADING_STYLE_PREFIX.length);
  if (!/^\d+$/.test(rawLevel)) {
    return undefined;
  }

  const level = Number(rawLevel);
  return Number.isInteger(level) && level > 0 ? level : undefined;
}

export function normalizeChapterMarkerText(markerText: unknown): string | undefined {
  if (typeof markerText !== 'string') {
    return undefined;
  }

  const withoutSuffix = markerText
    .trim()
    .replace(/[.)]\s*$/, '')
    .trim();
  if (!withoutSuffix) {
    return undefined;
  }

  return CLEAN_CHAPTER_MARKER_RE.test(withoutSuffix) ? withoutSuffix : undefined;
}

function getChapterMarkerText(block: FlowBlock, headingLevel: number): string | undefined {
  if (block.kind !== 'paragraph') {
    return undefined;
  }

  const attrs = (block as ParagraphBlock).attrs;
  const markerText = normalizeChapterMarkerText(attrs?.wordLayout?.marker?.markerText);
  if (markerText && markerText.split(CHAPTER_MARKER_SEPARATOR_RE).length <= headingLevel) {
    return markerText;
  }

  // Empty Heading 1 markers in imported DOCX can still carry a structured
  // ordinal. Do not synthesize nested chapter prefixes from the last path
  // component; a visible multi-level marker is the only safe source for those.
  const listLevelOrdinal = attrs?.listLevelOrdinal;
  if (
    headingLevel === 1 &&
    typeof listLevelOrdinal === 'number' &&
    Number.isInteger(listLevelOrdinal) &&
    listLevelOrdinal > 0
  ) {
    return String(listLevelOrdinal);
  }

  return undefined;
}

function getBlockIdFromFragment(fragment: unknown): string | undefined {
  if (
    typeof fragment === 'object' &&
    fragment !== null &&
    'blockId' in fragment &&
    typeof (fragment as { blockId?: unknown }).blockId === 'string'
  ) {
    return (fragment as { blockId: string }).blockId;
  }
  return undefined;
}

function buildBlockById(blocks: FlowBlock[] | ReadonlyMap<string, FlowBlock>): ReadonlyMap<string, FlowBlock> {
  const blockById = new Map<string, FlowBlock>();
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      blockById.set(block.id, block);
    }
    return blockById;
  }

  return blocks;
}

function getActiveChapterNumberText(
  activeChapterByStyle: ReadonlyMap<number, string>,
  chapterStyle: number,
): { chapterNumberText: string; chapterStyle: number } | undefined {
  for (let headingLevel = chapterStyle; headingLevel > 0; headingLevel -= 1) {
    const chapterNumberText = activeChapterByStyle.get(headingLevel);
    if (chapterNumberText) {
      return { chapterNumberText, chapterStyle: headingLevel };
    }
  }

  return undefined;
}

function clearChildChapterNumberText(activeChapterByStyle: Map<number, string>, headingLevel: number): void {
  for (const activeHeadingLevel of activeChapterByStyle.keys()) {
    if (activeHeadingLevel > headingLevel) {
      activeChapterByStyle.delete(activeHeadingLevel);
    }
  }
}

export function buildChapterContextByPage(
  layout: Layout,
  blocks: FlowBlock[] | ReadonlyMap<string, FlowBlock>,
  sections: SectionMetadata[],
): Map<number, ChapterPageInfo> {
  const chapterStyles = new Set<number>();
  let maxChapterStyle = 0;
  const sectionByIndex = new Map<number, SectionMetadata>();
  for (const section of sections) {
    sectionByIndex.set(section.sectionIndex, section);
    const chapterStyle = section.numbering?.chapterStyle;
    if (typeof chapterStyle === 'number' && Number.isInteger(chapterStyle) && chapterStyle > 0) {
      chapterStyles.add(chapterStyle);
      maxChapterStyle = Math.max(maxChapterStyle, chapterStyle);
    }
  }

  const chapterInfoByPage = new Map<number, ChapterPageInfo>();
  if (chapterStyles.size === 0 || layout.pages.length === 0) {
    return chapterInfoByPage;
  }

  const blockById = buildBlockById(blocks);
  const activeChapterByStyle = new Map<number, string>();

  for (const page of layout.pages) {
    for (const fragment of page.fragments) {
      const blockId = getBlockIdFromFragment(fragment);
      if (!blockId) {
        continue;
      }

      const block = blockById.get(blockId);
      if (!block) {
        continue;
      }

      const headingLevel = getHeadingLevel(block);
      if (!headingLevel || headingLevel > maxChapterStyle) {
        continue;
      }

      const chapterNumberText = getChapterMarkerText(block, headingLevel);
      if (chapterNumberText) {
        clearChildChapterNumberText(activeChapterByStyle, headingLevel);
        activeChapterByStyle.set(headingLevel, chapterNumberText);
      }
    }

    const sectionIndex = page.sectionIndex ?? 0;
    const chapterStyle = sectionByIndex.get(sectionIndex)?.numbering?.chapterStyle;
    if (!chapterStyle) {
      continue;
    }

    const activeChapter = getActiveChapterNumberText(activeChapterByStyle, chapterStyle);
    if (activeChapter) {
      chapterInfoByPage.set(page.number, activeChapter);
    }
  }

  return chapterInfoByPage;
}
/**
 * Computes section-aware display page numbers for all pages in a document.
 *
 * This function implements MS Word's section numbering behavior:
 * - Each section can have its own page number format
 * - Sections can restart numbering at a specific value
 * - Continuous sections inherit the previous section's running count unless restart is set
 * - Display numbers are calculated as: pageIndexWithinSection + offset (or restart value)
 * - Display numbers are never less than 1
 *
 * Algorithm:
 * 1. Map each page to its owning section
 * 2. For each section:
 *    - If restart/start is set, begin counting from that value
 *    - Otherwise, continue from previous section's count
 * 3. For each page within a section:
 *    - Calculate displayIndex = pageIndexWithinSection + offset
 *    - Clamp displayNumber = max(1, displayIndex)
 *    - Format displayText using the section's number format
 *
 * @param pages - Array of pages from the layout (with page.number 1-indexed)
 * @param sections - Array of section metadata (aligned by sectionIndex)
 * @returns Array of display page information for each page
 *
 * @example
 * ```typescript
 * const pages = [
 *   { number: 1, ... },
 *   { number: 2, ... },
 *   { number: 3, ... },
 * ];
 * const sections = [
 *   { sectionIndex: 0, numbering: { format: 'lowerRoman', start: 1 } },
 *   { sectionIndex: 1, numbering: { format: 'decimal', start: 1 } },
 * ];
 * const displayInfo = computeDisplayPageNumber(pages, sections);
 * // displayInfo[0]: { physicalPage: 1, displayNumber: 1, displayText: "i", sectionIndex: 0 }
 * // displayInfo[1]: { physicalPage: 2, displayNumber: 2, displayText: "ii", sectionIndex: 0 }
 * // displayInfo[2]: { physicalPage: 3, displayNumber: 1, displayText: "1", sectionIndex: 1 }
 * ```
 */
export function computeDisplayPageNumber(
  pages: Page[],
  sections: SectionMetadata[],
  chapterInfoByPage?: ReadonlyMap<number, ChapterPageInfo>,
): DisplayPageInfo[] {
  const result: DisplayPageInfo[] = [];

  if (pages.length === 0) {
    return result;
  }

  // Build a map from sectionIndex to section metadata for fast lookup
  const sectionMap = new Map<number, SectionMetadata>();
  for (const section of sections) {
    sectionMap.set(section.sectionIndex, section);
  }

  const sectionPageCounts = new Map<number, number>();
  for (const page of pages) {
    const sectionIndex = page.sectionIndex ?? 0;
    sectionPageCounts.set(sectionIndex, (sectionPageCounts.get(sectionIndex) ?? 0) + 1);
  }

  // Track running page counter across sections
  let runningCounter = 1;
  let currentSectionIndex = -1;
  // Reserved for future per-section page counting (e.g., "Page X of Y in this section")
  let _pagesInCurrentSection = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // Determine which section this page belongs to using page.sectionIndex
    // which is stamped during layout based on section breaks.
    // Falls back to 0 for backward compatibility with documents without section tracking.
    const pageSectionIndex = page.sectionIndex ?? 0;

    // Check if we're entering a new section
    if (pageSectionIndex !== currentSectionIndex) {
      // Entering a new section
      const sectionMetadata = sectionMap.get(pageSectionIndex);

      if (sectionMetadata?.numbering?.start !== undefined) {
        // Section has explicit restart
        runningCounter = sectionMetadata.numbering.start;
      }
      // else: continuous section - keep runningCounter from previous section

      currentSectionIndex = pageSectionIndex;
      _pagesInCurrentSection = 0;
    }

    // Get section metadata and numbering format
    const sectionMetadata = sectionMap.get(pageSectionIndex);
    const format: PageNumberFormat = sectionMetadata?.numbering?.format ?? 'decimal';
    const chapterInfo = chapterInfoByPage?.get(page.number);
    const chapterNumberText = chapterInfo?.chapterNumberText;
    const chapterSeparator =
      chapterNumberText && sectionMetadata?.numbering?.chapterStyle
        ? (sectionMetadata.numbering.chapterSeparator ?? 'hyphen')
        : undefined;

    // Calculate display number
    // displayNumber is the running counter for this page (can be negative or zero)
    const displayNumber = runningCounter;
    // formatPageNumber will clamp to 1 for display purposes
    const displayText = formatSectionPageNumberText({
      displayNumber,
      pageFormat: format,
      chapterNumberText,
      chapterSeparator,
    });

    result.push({
      physicalPage: page.number,
      displayNumber,
      displayText,
      sectionIndex: pageSectionIndex,
      sectionPageCount: sectionPageCounts.get(pageSectionIndex) ?? pages.length,
      ...(chapterNumberText ? { pageFormat: format } : {}),
      ...(chapterNumberText ? { chapterNumberText } : {}),
      ...(chapterSeparator ? { chapterSeparator } : {}),
    });

    // Increment counters
    runningCounter++;
    _pagesInCurrentSection++;
  }

  return result;
}
