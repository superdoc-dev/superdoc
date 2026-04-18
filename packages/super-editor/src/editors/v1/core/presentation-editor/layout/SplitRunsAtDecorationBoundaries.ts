import type {
  DrawingBlock,
  FlowBlock,
  ImageBlock,
  ListBlock,
  ParagraphBlock,
  Run,
  TableBlock,
  TableCell,
  TableRow,
  TextRun,
} from '@superdoc/contracts';

/** Cell blocks union (FlowBlock minus ListBlock); matches TableCell['blocks']. */
type TableCellBlock = ParagraphBlock | ImageBlock | DrawingBlock | TableBlock;

export type DecorationRange = { from: number; to: number };

function getBoundaries(ranges: DecorationRange[]): number[] {
  const set = new Set<number>();
  for (const r of ranges) {
    if (Number.isFinite(r.from)) set.add(r.from);
    if (Number.isFinite(r.to)) set.add(r.to);
  }
  return [...set].sort((a, b) => a - b);
}

function isTextRun(run: Run): run is TextRun {
  return 'text' in run && typeof (run as TextRun).text === 'string';
}

function splitParagraphRuns(paragraph: ParagraphBlock, boundaries: number[]): ParagraphBlock {
  const newRuns: Run[] = [];
  for (const run of paragraph.runs) {
    if (!isTextRun(run)) {
      newRuns.push(run);
      continue;
    }
    const start = run.pmStart;
    const end = run.pmEnd;
    if (start == null || end == null || start >= end) {
      newRuns.push(run);
      continue;
    }
    const runBoundaries = boundaries.filter((b) => b > start && b < end);
    if (runBoundaries.length === 0) {
      newRuns.push(run);
      continue;
    }
    const positions = [start, ...runBoundaries, end];
    for (let i = 0; i < positions.length - 1; i++) {
      const segStart = positions[i];
      const segEnd = positions[i + 1];
      const charStart = segStart - start;
      const charEnd = segEnd - start;
      const segmentText = run.text.slice(charStart, charEnd);
      if (segmentText.length === 0) continue;
      newRuns.push({
        ...run,
        text: segmentText,
        pmStart: segStart,
        pmEnd: segEnd,
      });
    }
  }
  return { ...paragraph, runs: newRuns };
}

function splitRunsInTableCell(cell: TableCell, boundaries: number[]): TableCell {
  const result: TableCell = { ...cell };
  if (cell.paragraph) {
    result.paragraph = splitParagraphRuns(cell.paragraph, boundaries);
  }
  if (cell.blocks?.length) {
    result.blocks = cell.blocks.map((b): TableCellBlock => {
      if (b.kind === 'paragraph') return splitParagraphRuns(b, boundaries);
      if (b.kind === 'table') return splitRunsInBlock(b, boundaries) as TableBlock;
      // Image and drawing blocks have no runs to split; return unchanged
      return b;
    });
  }
  return result;
}

function splitRunsInBlock(block: FlowBlock, boundaries: number[]): FlowBlock {
  if (block.kind === 'paragraph') {
    return splitParagraphRuns(block, boundaries);
  }
  if (block.kind === 'table') {
    const table = block as TableBlock;
    return {
      ...table,
      rows: table.rows.map((row: TableRow) => ({
        ...row,
        cells: row.cells.map((cell) => splitRunsInTableCell(cell, boundaries)),
      })),
    };
  }
  if (block.kind === 'list') {
    const list = block as ListBlock;
    return {
      ...list,
      items: list.items.map((item) => ({
        ...item,
        paragraph: splitParagraphRuns(item.paragraph, boundaries),
      })),
    };
  }
  return block;
}

/**
 * Splits text runs in flow blocks at decoration boundaries so that no run
 * spans across a boundary. This allows the decoration bridge to apply
 * classes only to runs fully inside a decoration range — background on the
 * actual text (like the highlight mark) without applying a document mark.
 *
 * @param blocks - Flow blocks from toFlowBlocks
 * @param ranges - Decoration ranges (e.g. from collectDecorationRanges)
 * @returns New blocks with runs split at boundaries (does not mutate input)
 */
export function splitRunsAtDecorationBoundaries(blocks: FlowBlock[], ranges: DecorationRange[]): FlowBlock[] {
  if (ranges.length === 0) return blocks;
  const boundaries = getBoundaries(ranges);
  return blocks.map((block) => splitRunsInBlock(block, boundaries));
}
