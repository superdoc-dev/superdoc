/**
 * Resolve a ParagraphDirectionContext from paragraph w:pPr and parent contexts.
 *
 * Spec rules enforced here (the four "non-collapse" rules):
 *
 * 1. Section w:bidi MUST NOT propagate to paragraph inline direction.
 *    Per §17.6.1, section bidi affects section chrome only.
 *
 * 2. Table w:bidiVisual MUST NOT propagate to cell paragraph inline direction.
 *    Per §17.4.1, bidiVisual affects cell ordering only.
 *
 * 3. Run-level w:rtl MUST NOT bubble up to become paragraph inline direction.
 *    Run rtl is a per-run script-formatting signal, not paragraph state.
 *
 * 4. docDefaults paragraph w:bidi DOES inherit (§17.7.2). It arrives via the
 *    style-engine cascade, which resolves docDefaults/pPrDefault/pPr/bidi
 *    into the paragraph's `rightToLeft` property before this resolver runs.
 *
 * Writing mode (w:textDirection, §17.3.1.41) is the one direction-related
 * property that inherits across containers — paragraph falls back to its
 * cell's writing mode, then the section's, then horizontal-tb default.
 *
 * When no explicit paragraph w:bidi is set anywhere in the cascade,
 * inlineDirection is left undefined. Consumers should omit the `dir`
 * attribute and let the browser apply the Unicode Bidi Algorithm.
 */

import type {
  BaseDirection,
  CellDirectionContext,
  ParagraphDirectionContext,
  SectionDirectionContext,
  WritingMode,
} from '@superdoc/contracts';

/** Minimal shape of resolved paragraph properties consumed by the resolver. */
export type ParagraphPropertiesLike = {
  /**
   * w:pPr/w:bidi after the style-engine cascade. True/false reflects an explicit
   * setting in the paragraph or its style chain (including docDefaults). Undefined
   * means no explicit bidi in the entire cascade.
   */
  rightToLeft?: boolean;
  textDirection?: string;
};

// Per ECMA §17.18.93 the V-suffix variants share the line direction of their
// non-V siblings; the V suffix is glyph rotation, which CSS expresses through
// text-orientation, not writing-mode. So lrTbV/tbV collapse to horizontal-tb,
// tbRlV/rlV to vertical-rl, lrV to vertical-lr. Strict-spec short forms (lr,
// rl, tb) are accepted alongside the Word transitional 4-letter forms.
const writingModeFromTextDirection = (val: string | undefined): WritingMode | undefined => {
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

export const resolveParagraphDirection = (
  paragraphProperties: ParagraphPropertiesLike | undefined,
  parentSection: SectionDirectionContext,
  parentCell?: CellDirectionContext,
): ParagraphDirectionContext => {
  // Inline direction: ONLY paragraph-or-style w:bidi sets this.
  // Section pageDirection, table visualDirection, and run rtl are explicitly
  // not consulted here — they live on different axes per the spec.
  let inlineDirection: BaseDirection | undefined;
  if (paragraphProperties?.rightToLeft === true) {
    inlineDirection = 'rtl';
  } else if (paragraphProperties?.rightToLeft === false) {
    inlineDirection = 'ltr';
  }

  // Writing mode: paragraph override > cell > section > default.
  const explicit = writingModeFromTextDirection(paragraphProperties?.textDirection);
  const writingMode = explicit ?? parentCell?.writingMode ?? parentSection.writingMode;

  return { inlineDirection, writingMode };
};
