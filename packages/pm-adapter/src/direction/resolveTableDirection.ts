/**
 * Resolve a TableDirectionContext from w:tblPr properties and the parent section.
 *
 * Table visual direction (w:bidiVisual, §17.4.1) controls cell ordering
 * only — it does NOT propagate to cell paragraphs as inline direction.
 * Cell paragraphs decide their direction independently from their own w:pPr.
 *
 * The OOXML w:bidiVisual element is named `rightToLeft` on the resolved
 * `TableProperties` type from the style-engine, matching the existing
 * importer/exporter convention. We accept either name for safety.
 */

import type { BaseDirection, SectionDirectionContext, TableDirectionContext } from '@superdoc/contracts';

/**
 * Minimal shape of resolved table properties consumed by the resolver.
 * Matches `TableProperties.rightToLeft` from the style-engine; `bidiVisual`
 * is accepted as an alias for callers that read raw w:tblPr.
 */
export type TablePropertiesLike = {
  rightToLeft?: boolean;
  bidiVisual?: boolean;
};

export const resolveTableDirection = (
  tableProperties: TablePropertiesLike | undefined,
  parentSection: SectionDirectionContext,
): TableDirectionContext => {
  let visualDirection: BaseDirection | undefined;
  // Mirror the paragraph resolver shape (resolveParagraphDirection): explicit
  // false is a real signal and must be distinguished from "no signal." Per
  // ECMA-376 §17.4.1 + §17.17.4, w:bidiVisual w:val="0" is an explicit-false
  // that can override a style-cascade true. SD-3141.
  if (tableProperties?.rightToLeft === true || tableProperties?.bidiVisual === true) {
    visualDirection = 'rtl';
  } else if (tableProperties?.rightToLeft === false || tableProperties?.bidiVisual === false) {
    visualDirection = 'ltr';
  }
  return { visualDirection, parentSection };
};
