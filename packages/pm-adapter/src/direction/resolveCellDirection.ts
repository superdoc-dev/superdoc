/**
 * Resolve a CellDirectionContext from w:tcPr properties and the parent table.
 *
 * Cells carry writing mode (w:textDirection, §17.4.72) which inherits from
 * the parent section when absent. Cell paragraph inline direction is NOT
 * decided here — paragraphs in the cell read their own w:pPr/w:bidi.
 */

import type { CellDirectionContext, TableDirectionContext, WritingMode } from '@superdoc/contracts';

/** Minimal shape of resolved table-cell properties consumed by the resolver. */
export type CellPropertiesLike = {
  textDirection?: string;
};

// Per ECMA §17.18.93. See resolveParagraphDirection for the V-suffix rationale.
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

export const resolveCellDirection = (
  cellProperties: CellPropertiesLike | undefined,
  parentTable: TableDirectionContext,
): CellDirectionContext => {
  const explicit = writingModeFromTextDirection(cellProperties?.textDirection);
  return {
    writingMode: explicit ?? parentTable.parentSection.writingMode,
    parentTable,
  };
};
