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

import type { Page, SectionMetadata } from '@superdoc/contracts';

/**
 * Page number format types supported by the layout engine.
 * These match MS Word's page numbering format options.
 */
export type PageNumberFormat = 'decimal' | 'upperRoman' | 'lowerRoman' | 'upperLetter' | 'lowerLetter' | 'numberInDash';

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
 * Converts a decimal number to uppercase Roman numeral format.
 *
 * Supports numbers from 1 to 3999. Uses standard Roman numeral rules
 * including subtractive notation (IV, IX, XL, XC, CD, CM).
 *
 * @param num - Number to convert (must be 1-3999)
 * @returns Roman numeral string in uppercase
 *
 * @example
 * ```typescript
 * toUpperRoman(1);    // "I"
 * toUpperRoman(4);    // "IV"
 * toUpperRoman(49);   // "XLIX"
 * toUpperRoman(1994); // "MCMXCIV"
 * ```
 */
function toUpperRoman(num: number): string {
  if (num < 1 || num > 3999) {
    // For numbers outside valid range, fall back to decimal
    return String(num);
  }

  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const numerals = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];

  let result = '';
  let remaining = num;

  for (let i = 0; i < values.length; i++) {
    while (remaining >= values[i]) {
      result += numerals[i];
      remaining -= values[i];
    }
  }

  return result;
}

/**
 * Converts a decimal number to lowercase Roman numeral format.
 *
 * Same conversion logic as uppercase Roman numerals, but returns
 * lowercase characters.
 *
 * @param num - Number to convert (must be 1-3999)
 * @returns Roman numeral string in lowercase
 *
 * @example
 * ```typescript
 * toLowerRoman(1);    // "i"
 * toLowerRoman(4);    // "iv"
 * toLowerRoman(49);   // "xlix"
 * ```
 */
function toLowerRoman(num: number): string {
  return toUpperRoman(num).toLowerCase();
}

/**
 * Converts a decimal number to uppercase letter format (A-Z, AA-ZZ, etc.).
 *
 * Uses Excel-style column naming: A, B, ..., Z, AA, AB, ..., AZ, BA, ...
 * This provides an alphabetical sequence that continues beyond 26.
 *
 * @param num - Number to convert (1-indexed)
 * @returns Letter sequence in uppercase
 *
 * @example
 * ```typescript
 * toUpperLetter(1);  // "A"
 * toUpperLetter(26); // "Z"
 * toUpperLetter(27); // "AA"
 * toUpperLetter(52); // "AZ"
 * ```
 */
function toUpperLetter(num: number): string {
  if (num < 1) {
    return 'A';
  }

  let result = '';
  let n = num;

  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }

  return result;
}

/**
 * Converts a decimal number to lowercase letter format (a-z, aa-zz, etc.).
 *
 * Same conversion logic as uppercase letters, but returns lowercase characters.
 *
 * @param num - Number to convert (1-indexed)
 * @returns Letter sequence in lowercase
 *
 * @example
 * ```typescript
 * toLowerLetter(1);  // "a"
 * toLowerLetter(26); // "z"
 * toLowerLetter(27); // "aa"
 * ```
 */
function toLowerLetter(num: number): string {
  return toUpperLetter(num).toLowerCase();
}

/**
 * Formats a page number according to the specified format.
 *
 * This function provides MS Word-compatible page number formatting.
 * Edge cases are handled as follows:
 * - Numbers <= 0 are clamped to 1
 * - Roman numerals outside 1-3999 fall back to decimal
 * - All formats handle arbitrarily large positive numbers
 *
 * @param pageNumber - Page number to format (will be clamped to minimum 1)
 * @param format - Desired output format
 * @returns Formatted page number string
 *
 * @example
 * ```typescript
 * formatPageNumber(5, 'decimal');      // "5"
 * formatPageNumber(5, 'upperRoman');   // "V"
 * formatPageNumber(5, 'lowerRoman');   // "v"
 * formatPageNumber(5, 'upperLetter');  // "E"
 * formatPageNumber(5, 'lowerLetter');  // "e"
 * formatPageNumber(0, 'decimal');      // "1" (clamped)
 * formatPageNumber(-5, 'decimal');     // "1" (clamped)
 * ```
 */
export function formatPageNumber(pageNumber: number, format: PageNumberFormat): string {
  // Clamp to minimum of 1 for edge cases
  const num = Math.max(1, pageNumber);

  switch (format) {
    case 'decimal':
      return String(num);
    case 'upperRoman':
      return toUpperRoman(num);
    case 'lowerRoman':
      return toLowerRoman(num);
    case 'upperLetter':
      return toUpperLetter(num);
    case 'lowerLetter':
      return toLowerLetter(num);
    case 'numberInDash':
      return `-${num}-`;
    default:
      // TypeScript exhaustiveness check - should never reach here
      return String(num);
  }
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
