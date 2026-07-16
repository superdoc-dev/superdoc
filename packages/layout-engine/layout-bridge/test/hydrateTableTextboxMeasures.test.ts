import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, ParagraphBlock, ParagraphMeasure, TextboxDrawing } from '@superdoc/contracts';
import { hydrateTableTextboxMeasures } from '../src/incrementalLayout';

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
  it('sets contentMeasures on a textboxShape drawing in a table cell', () => {
    const textbox = makeTextboxBlock('tb-1');
    const blocks: FlowBlock[] = [makeTable([[textbox]])];
    const remeasure = vi.fn((_block: ParagraphBlock, _maxWidth: number) => makeMeasure([16]));

    hydrateTableTextboxMeasures(blocks, remeasure);

    expect(remeasure).toHaveBeenCalledOnce();
    expect(textbox.contentMeasures).toHaveLength(1);
    expect(textbox.contentMeasures?.[0].totalHeight).toBe(16);
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

    hydrateTableTextboxMeasures(blocks, remeasure);

    expect(remeasure).not.toHaveBeenCalled();
  });

  it('recurses into nested tables', () => {
    const textbox = makeTextboxBlock('tb-nested');
    const innerTable = makeTable([[textbox]]);
    const blocks: FlowBlock[] = [makeTable([[innerTable]])];
    const remeasure = vi.fn((_block: ParagraphBlock, _maxWidth: number) => makeMeasure([14]));

    hydrateTableTextboxMeasures(blocks, remeasure);

    expect(remeasure).toHaveBeenCalledOnce();
    expect(textbox.contentMeasures).toHaveLength(1);
  });

  it('skips non-table top-level blocks', () => {
    const para: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };
    const remeasure = vi.fn();

    hydrateTableTextboxMeasures([para], remeasure);

    expect(remeasure).not.toHaveBeenCalled();
  });

  it('handles multiple textboxes across different cells', () => {
    const tb1 = makeTextboxBlock('tb-a');
    const tb2 = makeTextboxBlock('tb-b');
    const blocks: FlowBlock[] = [makeTable([[tb1], [tb2]])];
    const remeasure = vi.fn((_block: ParagraphBlock, _maxWidth: number) => makeMeasure([12]));

    hydrateTableTextboxMeasures(blocks, remeasure);

    expect(remeasure).toHaveBeenCalledTimes(2);
    expect(tb1.contentMeasures).toHaveLength(1);
    expect(tb2.contentMeasures).toHaveLength(1);
  });
});
