/**
 * Resolve a TableDirectionContext from w:tblPr properties and the parent section.
 *
 * Table visual direction (w:bidiVisual, §17.4.1) controls cell ordering
 * only — it does NOT propagate to cell paragraphs as inline direction.
 * Cell paragraphs decide their direction independently from their own w:pPr.
 */

import type { BaseDirection, SectionDirectionContext, TableDirectionContext } from '@superdoc/contracts';

/** Minimal shape of resolved table properties consumed by the resolver. */
export type TablePropertiesLike = {
  bidiVisual?: boolean;
};

export const resolveTableDirection = (
  tableProperties: TablePropertiesLike | undefined,
  parentSection: SectionDirectionContext,
): TableDirectionContext => {
  let visualDirection: BaseDirection | undefined;
  if (tableProperties?.bidiVisual === true) {
    visualDirection = 'rtl';
  }
  return { visualDirection, parentSection };
};
