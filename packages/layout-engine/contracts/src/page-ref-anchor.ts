import type {
  FlowBlock,
  Fragment,
  Layout,
  ListBlock,
  Measure,
  Page,
  PageRefLocation,
  ParagraphBlock,
  ParagraphMeasure,
  Run,
  TableBlock,
  TableCell,
  TableCellMeasure,
  TableFragment,
  TableMeasure,
} from './index.js';
import { computeFragmentPmRange } from './pm-range.js';

// Bookmark start/end markers are inline PM leaf nodes. A bookmark can legally sit
// immediately before visible text, and with start+end plus one wrapper/offset
// boundary the visible fragment may begin up to three PM positions later.
const MAX_BOOKMARK_MARKER_LEAD_DISTANCE = 3;

export function buildPageRefAnchorMap(
  bookmarks: Map<string, number>,
  layout: Layout,
  blocks: FlowBlock[] = [],
  measures: Measure[] = [],
): Map<string, PageRefLocation> {
  const anchors = new Map<string, PageRefLocation>();
  if (bookmarks.size === 0) return anchors;

  const blockById = new Map<string, FlowBlock>();
  const measureById = new Map<string, Measure>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const measure = measures[index];
    if (block && measure) {
      measureById.set(block.id, measure);
    }
  }

  for (const [bookmarkName, pmPosition] of bookmarks) {
    const location = findPageRefLocation(pmPosition, layout, blockById, measureById);
    if (location) {
      anchors.set(bookmarkName, { ...location, pmPosition });
    }
  }

  return anchors;
}

function findPageRefLocation(
  pmPosition: number,
  layout: Layout,
  blockById: Map<string, FlowBlock>,
  measureById: Map<string, Measure>,
): PageRefLocation | null {
  let nextLocation: PageRefLocation | null = null;
  let nextDistance = Number.POSITIVE_INFINITY;
  let hasPriorVisibleRange = false;

  for (const page of layout.pages) {
    for (const fragment of page.fragments) {
      if (fragmentContainsPosition(fragment, pmPosition)) {
        return pageRefLocationFromPage(page, pmPosition);
      }

      const block = blockById.get(fragment.blockId);
      if (fragment.kind === 'para' && block?.kind === 'paragraph' && blockContainsPosition(block, pmPosition)) {
        return pageRefLocationFromPage(page, pmPosition);
      }
      if (
        fragment.kind === 'table' &&
        block?.kind === 'table' &&
        tableContainsPosition(block, fragment, pmPosition, measureById.get(fragment.blockId))
      ) {
        return pageRefLocationFromPage(page, pmPosition);
      }
      if (
        fragment.kind === 'list-item' &&
        block?.kind === 'list' &&
        listItemContainsPosition(block, fragment.itemId, pmPosition)
      ) {
        return pageRefLocationFromPage(page, pmPosition);
      }

      const fragmentRange = fragmentPositionRange(fragment, block);
      if (fragmentRange?.end != null && fragmentRange.end <= pmPosition) {
        hasPriorVisibleRange = true;
      }
      const fragmentStart = fragmentRange?.start ?? null;
      if (fragmentStart != null && fragmentStart > pmPosition) {
        const distance = fragmentStart - pmPosition;
        if ((!hasPriorVisibleRange || distance <= MAX_BOOKMARK_MARKER_LEAD_DISTANCE) && distance < nextDistance) {
          nextDistance = distance;
          nextLocation = pageRefLocationFromPage(page, pmPosition);
        }
      }
    }
  }

  return nextLocation;
}

function pageRefLocationFromPage(page: Page, pmPosition: number): PageRefLocation {
  const displayNumber = Math.max(1, page.displayNumber ?? page.effectivePageNumber ?? page.number);
  return {
    physicalPage: page.number,
    displayNumber,
    displayText: page.numberText ?? String(displayNumber),
    pageFormat: page.pageNumberFormat,
    chapterNumberText: page.pageNumberChapterText,
    chapterSeparator: page.pageNumberChapterSeparator,
    sectionIndex: page.sectionIndex,
    pmPosition,
  };
}

function fragmentContainsPosition(fragment: Fragment, pmPosition: number): boolean {
  const range = fragment as { pmStart?: number; pmEnd?: number };
  return range.pmStart != null && range.pmEnd != null && pmPosition >= range.pmStart && pmPosition < range.pmEnd;
}

function blockContainsPosition(block: ParagraphBlock, pmPosition: number): boolean {
  const range = runRange(block.runs);
  return range != null && pmPosition >= range.start && pmPosition < range.end;
}

function tableContainsPosition(
  block: TableBlock,
  fragment: TableFragment,
  pmPosition: number,
  measure?: Measure,
): boolean {
  const fromRow = Math.max(0, fragment.fromRow);
  const toRow = Math.min(block.rows.length, fragment.toRow);
  const tableMeasure = measure?.kind === 'table' ? (measure as TableMeasure) : undefined;
  for (let rowIndex = fromRow; rowIndex < toRow; rowIndex += 1) {
    const row = block.rows[rowIndex];
    if (!row) continue;
    const isPartialRow = fragment.partialRow?.rowIndex === rowIndex;
    for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
      const cell = row.cells[cellIndex];
      if (!cell) continue;
      if (isPartialRow && tableMeasure) {
        const cellMeasure = tableMeasure.rows[rowIndex]?.cells[cellIndex];
        if (cellContainsPositionInLineRange(cell, cellMeasure, fragment.partialRow!, cellIndex, pmPosition)) {
          return true;
        }
        continue;
      }
      const blocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
      for (const childBlock of blocks) {
        if (childBlock.kind === 'paragraph' && blockContainsPosition(childBlock, pmPosition)) return true;
        if (childBlock.kind === 'table' && tableBlockContainsPosition(childBlock, pmPosition)) return true;
      }
    }
  }
  return false;
}

function cellContainsPositionInLineRange(
  cell: TableCell,
  cellMeasure: TableCellMeasure | undefined,
  partialRow: NonNullable<TableFragment['partialRow']>,
  cellIndex: number,
  pmPosition: number,
): boolean {
  if (!cellMeasure) return false;

  const totalLines = getCellTotalLines(cellMeasure);
  const rawFromLine = partialRow.fromLineByCell[cellIndex];
  const rawToLine = partialRow.toLineByCell[cellIndex];
  const fromLine = typeof rawFromLine === 'number' && rawFromLine >= 0 ? Math.min(rawFromLine, totalLines) : 0;
  const toLine =
    typeof rawToLine === 'number'
      ? Math.max(0, Math.min(rawToLine === -1 ? totalLines : rawToLine, totalLines))
      : totalLines;

  const range = computeCellLineRange(cell, cellMeasure, fromLine, Math.max(fromLine, toLine));
  return range != null && pmPosition >= range.start && pmPosition < range.end;
}

function computeCellLineRange(
  cell: TableCell,
  cellMeasure: TableCellMeasure,
  fromLine: number,
  toLine: number,
): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  const blocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
  const measures = cellMeasure.blocks ?? (cellMeasure.paragraph ? [cellMeasure.paragraph] : []);
  const blockCount = Math.min(blocks.length, measures.length);

  let lineOffset = 0;
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const childBlock = blocks[blockIndex];
    const childMeasure = measures[blockIndex];
    const lineCount = getBlockLineCount(childMeasure);
    const blockFromLine = Math.max(fromLine, lineOffset) - lineOffset;
    const blockToLine = Math.min(toLine, lineOffset + lineCount) - lineOffset;

    if (childBlock?.kind === 'paragraph' && childMeasure?.kind === 'paragraph' && blockFromLine < blockToLine) {
      const range = computeFragmentPmRange(
        childBlock,
        (childMeasure as ParagraphMeasure).lines,
        blockFromLine,
        blockToLine,
      );
      if (range.pmStart != null) start = Math.min(start, range.pmStart);
      if (range.pmEnd != null) end = Math.max(end, range.pmEnd);
    }

    lineOffset += lineCount;
  }

  return Number.isFinite(start) && Number.isFinite(end) && start < end ? { start, end } : null;
}

function getCellTotalLines(cellMeasure: TableCellMeasure): number {
  const measures = cellMeasure.blocks ?? (cellMeasure.paragraph ? [cellMeasure.paragraph] : []);
  return measures.reduce((total, measure) => total + getBlockLineCount(measure), 0);
}

function getBlockLineCount(measure: Measure | undefined): number {
  if (!measure) return 0;
  if (measure.kind === 'paragraph') return (measure as ParagraphMeasure).lines.length;
  if (measure.kind === 'table') return (measure as TableMeasure).rows.length;
  return 1;
}

function tableBlockContainsPosition(block: TableBlock, pmPosition: number): boolean {
  for (const row of block.rows) {
    for (const cell of row.cells) {
      const blocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
      for (const childBlock of blocks) {
        if (childBlock.kind === 'paragraph' && blockContainsPosition(childBlock, pmPosition)) return true;
        if (childBlock.kind === 'table' && tableBlockContainsPosition(childBlock, pmPosition)) return true;
      }
    }
  }
  return false;
}

function fragmentPositionRange(
  fragment: Fragment,
  block: FlowBlock | undefined,
): { start: number; end: number } | null {
  const fullRange = fragment as { pmStart?: number; pmEnd?: number };
  if (fullRange.pmStart != null && fullRange.pmEnd != null) return { start: fullRange.pmStart, end: fullRange.pmEnd };
  if (block?.kind === 'paragraph') return runRange(block.runs);
  if (block?.kind === 'table') return tableRunRange(block);
  if (fragment.kind === 'list-item' && block?.kind === 'list') {
    return listItemRunRange(block, fragment.itemId);
  }
  return null;
}

function listItemContainsPosition(block: ListBlock, itemId: string, pmPosition: number): boolean {
  const range = listItemRunRange(block, itemId);
  return range != null && pmPosition >= range.start && pmPosition < range.end;
}

function listItemRunRange(block: ListBlock, itemId: string): { start: number; end: number } | null {
  const item = block.items.find((candidate) => candidate.id === itemId);
  return item ? runRange(item.paragraph.runs) : null;
}

function tableRunRange(block: TableBlock): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const row of block.rows) {
    for (const cell of row.cells) {
      const blocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
      for (const childBlock of blocks) {
        const range =
          childBlock.kind === 'paragraph'
            ? runRange(childBlock.runs)
            : childBlock.kind === 'table'
              ? tableRunRange(childBlock)
              : null;
        if (!range) continue;
        start = Math.min(start, range.start);
        end = Math.max(end, range.end);
      }
    }
  }
  return Number.isFinite(start) && Number.isFinite(end) && start < end ? { start, end } : null;
}

function runRange(runs: Run[]): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const range = run as { pmStart?: number; pmEnd?: number };
    if (range.pmStart != null) start = Math.min(start, range.pmStart);
    if (range.pmEnd != null) end = Math.max(end, range.pmEnd);
  }
  return Number.isFinite(start) && Number.isFinite(end) && start < end ? { start, end } : null;
}
