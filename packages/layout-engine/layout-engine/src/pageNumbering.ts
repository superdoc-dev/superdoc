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
  type Page,
  type PageNumberFormat,
  type SectionMetadata,
} from '@superdoc/contracts';
export { formatPageNumber, formatPageNumberFieldValue };
export type { PageNumberFormat };

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
export function computeDisplayPageNumber(pages: Page[], sections: SectionMetadata[]): DisplayPageInfo[] {
  const result: DisplayPageInfo[] = [];

  if (pages.length === 0) {
    return result;
  }

  // Build a map from sectionIndex to section metadata for fast lookup
  const sectionMap = new Map<number, SectionMetadata>();
  for (const section of sections) {
    sectionMap.set(section.sectionIndex, section);
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

    // Calculate display number
    // displayNumber is the running counter for this page (can be negative or zero)
    const displayNumber = runningCounter;
    // formatPageNumber will clamp to 1 for display purposes
    const displayText = formatPageNumber(displayNumber, format);

    result.push({
      physicalPage: page.number,
      displayNumber,
      displayText,
      sectionIndex: pageSectionIndex,
    });

    // Increment counters
    runningCounter++;
    _pagesInCurrentSection++;
  }

  return result;
}
