/**
 * Resolve a SectionDirectionContext from a w:sectPr element.
 *
 * Section page direction is independent of paragraph inline direction.
 * Per ECMA-376 §17.6.1, section w:bidi affects section chrome only
 * (page numbers, columns) — it does NOT propagate to paragraph layout.
 *
 * The returned context flows down the resolver chain so children
 * (tables, cells, paragraphs) can read writing-mode defaults, but
 * children must NOT read pageDirection as paragraph inline direction.
 */

import type { BaseDirection, SectionDirectionContext, WritingMode } from '@superdoc/contracts';

const DEFAULT_PAGE_DIRECTION: BaseDirection = 'ltr';
const DEFAULT_WRITING_MODE: WritingMode = 'horizontal-tb';

/**
 * OOXML element shape from the converter; sectPr is a tree node with
 * named children (w:bidi, w:textDirection, w:rtlGutter, etc.).
 */
type SectPrElement = {
  elements?: Array<{
    name?: string;
    attributes?: Record<string, unknown>;
  }>;
};

/** Decide whether a boolean OOXML toggle is on or off. */
const isToggleOn = (val: unknown): boolean => {
  if (val === undefined || val === null) return true;
  if (val === '0' || val === 0 || val === false) return false;
  if (val === 'false' || val === 'off') return false;
  return true;
};

// Per ECMA §17.18.93. See resolveParagraphDirection for the V-suffix rationale.
const writingModeFromTextDirection = (val: unknown): WritingMode | undefined => {
  if (typeof val !== 'string') return undefined;
  switch (val) {
    case 'lrTb':
    case 'lrTbV':
    case 'tb':
    case 'tbV':
      return 'horizontal-tb';
    case 'tbRl':
    case 'tbRlV':
    case 'rl':
    case 'rlV':
      return 'vertical-rl';
    case 'btLr':
    case 'lr':
    case 'lrV':
    case 'tbLrV':
      return 'vertical-lr';
    default:
      return undefined;
  }
};

export const resolveSectionDirection = (sectPr: unknown): SectionDirectionContext => {
  let pageDirection: BaseDirection = DEFAULT_PAGE_DIRECTION;
  let writingMode: WritingMode = DEFAULT_WRITING_MODE;
  let rtlGutter = false;

  if (sectPr && typeof sectPr === 'object') {
    const elements = (sectPr as SectPrElement).elements;
    if (Array.isArray(elements)) {
      for (const el of elements) {
        if (!el?.name) continue;
        const val = el.attributes?.['w:val'] ?? el.attributes?.val;

        if (el.name === 'w:bidi' && isToggleOn(val)) {
          pageDirection = 'rtl';
          continue;
        }

        if (el.name === 'w:textDirection') {
          const mode = writingModeFromTextDirection(val);
          if (mode) writingMode = mode;
          continue;
        }

        if (el.name === 'w:rtlGutter' && isToggleOn(val)) {
          rtlGutter = true;
          continue;
        }
      }
    }
  }

  return { pageDirection, writingMode, rtlGutter };
};
