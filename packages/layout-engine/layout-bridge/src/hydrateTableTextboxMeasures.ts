import type { FlowBlock, ParagraphBlock, ParagraphMeasure, TableBlock, TextboxDrawing } from '@superdoc/contracts';
import { layoutTextboxContent } from '@superdoc/layout-engine';

type TextboxRemeasure = (block: ParagraphBlock, maxWidth: number) => ParagraphMeasure;

function hydrateTableBlock(table: TableBlock, remeasure: TextboxRemeasure): TableBlock {
  let nextRows: TableBlock['rows'] | null = null;

  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex]!;
    let nextCells: typeof row.cells | null = null;

    for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
      const cell = row.cells[cellIndex]!;
      const cellBlocks = cell.blocks ?? [];
      let nextCellBlocks: typeof cellBlocks | null = null;

      for (let blockIndex = 0; blockIndex < cellBlocks.length; blockIndex += 1) {
        const cellBlock = cellBlocks[blockIndex]!;
        let hydratedBlock = cellBlock;
        if (cellBlock.kind === 'drawing' && cellBlock.drawingKind === 'textboxShape') {
          hydratedBlock = {
            ...cellBlock,
            contentMeasures: layoutTextboxContent(cellBlock as TextboxDrawing, remeasure),
          };
        } else if (cellBlock.kind === 'table') {
          hydratedBlock = hydrateTableBlock(cellBlock, remeasure);
        }
        if (hydratedBlock === cellBlock) continue;
        nextCellBlocks ??= cellBlocks.slice();
        nextCellBlocks[blockIndex] = hydratedBlock;
      }

      if (!nextCellBlocks) continue;
      nextCells ??= row.cells.slice();
      nextCells[cellIndex] = { ...cell, blocks: nextCellBlocks };
    }

    if (!nextCells) continue;
    nextRows ??= table.rows.slice();
    nextRows[rowIndex] = { ...row, cells: nextCells };
  }

  return nextRows ? { ...table, rows: nextRows } : table;
}

/**
 * Derives table-cell textbox measurements without mutating the projection
 * plane supplied by the caller. Only the textbox and its table ancestry are
 * copied; documents without table textboxes retain their original identities.
 */
export function hydrateTableTextboxMeasures(blocks: FlowBlock[], remeasure: TextboxRemeasure): FlowBlock[] {
  let nextBlocks: FlowBlock[] | null = null;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.kind !== 'table') continue;
    const hydrated = hydrateTableBlock(block, remeasure);
    if (hydrated === block) continue;
    nextBlocks ??= blocks.slice();
    nextBlocks[index] = hydrated;
  }
  return nextBlocks ?? blocks;
}
