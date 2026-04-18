import type { TableFragment, ResolvedTableItem } from '@superdoc/contracts';
import { getCellSpacingPx } from '@superdoc/contracts';
import { requireResolvedBlockAndMeasure, type BlockMapEntry } from './resolvedBlockLookup.js';

/** Mirrors fragmentKey() for table fragments. */
function resolveTableFragmentId(fragment: TableFragment): string {
  const partialKey = fragment.partialRow
    ? `:${fragment.partialRow.fromLineByCell.join(',')}-${fragment.partialRow.toLineByCell.join(',')}`
    : '';
  return `table:${fragment.blockId}:${fragment.fromRow}:${fragment.toRow}${partialKey}`;
}

/**
 * Resolves a table fragment into a ResolvedTableItem with pre-extracted block/measure data.
 *
 * Pre-computes:
 * - cellSpacingPx: measure.cellSpacingPx ?? getCellSpacingPx(block.attrs?.cellSpacing)
 * - effectiveColumnWidths: fragment.columnWidths ?? measure.columnWidths
 */
export function resolveTableItem(
  fragment: TableFragment,
  fragmentIndex: number,
  pageIndex: number,
  blockMap: Map<string, BlockMapEntry>,
): ResolvedTableItem {
  const { block, measure } = requireResolvedBlockAndMeasure(blockMap, fragment.blockId, 'table', 'table', 'table');

  return {
    kind: 'fragment',
    fragmentKind: 'table',
    id: resolveTableFragmentId(fragment),
    pageIndex,
    x: fragment.x,
    y: fragment.y,
    width: fragment.width,
    height: fragment.height,
    zIndex: undefined, // tables don't have zIndex at fragment level
    blockId: fragment.blockId,
    fragmentIndex,
    block,
    measure,
    cellSpacingPx: measure.cellSpacingPx ?? getCellSpacingPx(block.attrs?.cellSpacing),
    effectiveColumnWidths: fragment.columnWidths ?? measure.columnWidths,
  };
}
