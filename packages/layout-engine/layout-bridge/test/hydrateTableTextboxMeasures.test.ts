import { describe, it, expect, vi } from 'vite-plus/test';
import type { FlowBlock, ParagraphBlock, ParagraphMeasure, TableBlock, TextboxDrawing } from '@superdoc/contracts';
import { hydrateTableTextboxMeasures } from '../src/hydrateTableTextboxMeasures';

const makeLine = (h: number) => ({
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 0,
  width: 100,
  ascent: h * 0.8,
  descent: h * 0.2,
  lineHeight: h,
});

const makeMeasure = (lineHeights: number[]): ParagraphMeasure => ({
  kind: 'paragraph',
  lines: lineHeights.map(makeLine),
  totalHeight: lineHeights.reduce((a, b) => a + b, 0),
});

const makeTextboxBlock = (id: string): TextboxDrawing => ({
  kind: 'drawing',
  drawingKind: 'textboxShape',
  id,
  geometry: { width: 120, height: 60, rotation: 0, flipH: false, flipV: false },
  contentBlocks: [{ kind: 'paragraph', id: `${id}-para`, runs: [{ text: 'Hello', pmStart: 1, pmEnd: 6 }] }],
  textInsets: { top: 4, right: 8, bottom: 4, left: 8 },
});

const makeTable = (cellBlocks: FlowBlock[][]): FlowBlock => ({
  kind: 'table',
  id: 'table-1',
  rows: cellBlocks.map((blocks, ri) => ({
    cells: [{ blocks, attrs: {} }],
    attrs: {},
  })),
  attrs: {},
});

describe('hydrateTableTextboxMeasures', () => {
  const tableTextbox = (blocks: FlowBlock[]): TextboxDrawing => {
    const table = blocks[0] as TableBlock;
    return table.rows[0]!.cells[0]!.blocks![0] as TextboxDrawing;
  };

  it('derives contentMeasures without mutating the source projection', () => {
    const textbox = makeTextboxBlock('tb-1');
    const blocks: FlowBlock[] = [makeTable([[textbox]])];
    const remeasure = vi.fn((_block: ParagraphBlock, _maxWidth: number) => makeMeasure([16]));

    const hydrated = hydrateTableTextboxMeasures(blocks, remeasure);

    expect(remeasure).toHaveBeenCalledOnce();
    expect(hydrated).not.toBe(blocks);
    expect(textbox.contentMeasures).toBeUndefined();
    expect(tableTextbox(hydrated).contentMeasures).toHaveLength(1);
    expect(tableTextbox(hydrated).contentMeasures?.[0].totalHeight).toBe(16);
  });

  it('passes contentWidth reduced by horizontal insets to remeasure', () => {
    const textbox = makeTextboxBlock('tb-2');
    const blocks: FlowBlock[] = [makeTable([[textbox]])];
    const remeasure = vi.fn((_block: ParagraphBlock, maxWidth: number) => makeMeasure([16]));

    hydrateTableTextboxMeasures(blocks, remeasure);

    // geometry.width(120) - insets.left(8) - insets.right(8) = 104
    expect(remeasure).toHaveBeenCalledWith(expect.anything(), 104);
  });

  it('skips non-drawing and non-table cell blocks', () => {
    const para: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };
    const blocks: FlowBlock[] = [makeTable([[para]])];
    const remeasure = vi.fn();

    const hydrated = hydrateTableTextboxMeasures(blocks, remeasure);

    expect(remeasure).not.toHaveBeenCalled();
    expect(hydrated).toBe(blocks);
  });

  it('recurses into nested tables', () => {
    const textbox = makeTextboxBlock('tb-nested');
    const innerTable = makeTable([[textbox]]);
    const blocks: FlowBlock[] = [makeTable([[innerTable]])];
    const remeasure = vi.fn((_block: ParagraphBlock, _maxWidth: number) => makeMeasure([14]));

    const hydrated = hydrateTableTextboxMeasures(blocks, remeasure);

    expect(remeasure).toHaveBeenCalledOnce();
    expect(textbox.contentMeasures).toBeUndefined();
    const outer = hydrated[0] as TableBlock;
    const inner = outer.rows[0]!.cells[0]!.blocks![0] as TableBlock;
    expect((inner.rows[0]!.cells[0]!.blocks![0] as TextboxDrawing).contentMeasures).toHaveLength(1);
  });

  it('skips non-table top-level blocks', () => {
    const para: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };
    const remeasure = vi.fn();

    const hydrated = hydrateTableTextboxMeasures([para], remeasure);

    expect(remeasure).not.toHaveBeenCalled();
    expect(hydrated[0]).toBe(para);
  });

  it('handles multiple textboxes across different cells', () => {
    const tb1 = makeTextboxBlock('tb-a');
    const tb2 = makeTextboxBlock('tb-b');
    const blocks: FlowBlock[] = [makeTable([[tb1], [tb2]])];
    const remeasure = vi.fn((_block: ParagraphBlock, _maxWidth: number) => makeMeasure([12]));

    const hydrated = hydrateTableTextboxMeasures(blocks, remeasure);

    expect(remeasure).toHaveBeenCalledTimes(2);
    expect(tb1.contentMeasures).toBeUndefined();
    expect(tb2.contentMeasures).toBeUndefined();
    const table = hydrated[0] as TableBlock;
    expect((table.rows[0]!.cells[0]!.blocks![0] as TextboxDrawing).contentMeasures).toHaveLength(1);
    expect((table.rows[1]!.cells[0]!.blocks![0] as TextboxDrawing).contentMeasures).toHaveLength(1);
  });

  it('accepts a deeply frozen projection and preserves every source identity', () => {
    const textbox = makeTextboxBlock('tb-frozen');
    const blocks: FlowBlock[] = [makeTable([[textbox]])];
    const freeze = (value: unknown, seen = new WeakSet<object>()): void => {
      if (value == null || typeof value !== 'object' || seen.has(value as object)) return;
      seen.add(value as object);
      for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen);
      Object.freeze(value);
    };
    freeze(blocks);

    const hydrated = hydrateTableTextboxMeasures(blocks, () => makeMeasure([18]));

    expect(Object.isFrozen(textbox)).toBe(true);
    expect(textbox.contentMeasures).toBeUndefined();
    expect(tableTextbox(hydrated).contentMeasures?.[0].totalHeight).toBe(18);
  });
});
