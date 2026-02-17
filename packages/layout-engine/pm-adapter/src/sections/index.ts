/**
 * Sections Module
 *
 * Barrel export for section-related functionality.
 */

// Types
export type {
  SectionRange,
  SectionSignature,
  SectPrElement,
  SectPrChildElement,
  ParagraphProperties,
  SectPrLikeObject,
} from './types.js';

export { SectionType, DEFAULT_PARAGRAPH_SECTION_TYPE, DEFAULT_BODY_SECTION_TYPE } from './types.js';

// Extraction
export { extractSectionData, parseColumnCount, parseColumnGap, parseColumnSeparator } from './extraction.js';

// Analysis
export {
  analyzeSectionRanges,
  buildSectionRangesFromParagraphs,
  findParagraphsWithSectPr,
  shouldIgnoreSectionBreak,
  publishSectionMetadata,
  createFinalSectionFromBodySectPr,
  createDefaultFinalSection,
} from './analysis.js';

// Breaks
export {
  createSectionBreakBlock,
  shouldRequirePageBoundary,
  hasIntrinsicBoundarySignals,
  isSectPrElement,
  hasSectPr,
  getSectPrFromNode,
  isSectionBreakBlock,
  signaturesEqual,
  shallowObjectEquals,
} from './breaks.js';
