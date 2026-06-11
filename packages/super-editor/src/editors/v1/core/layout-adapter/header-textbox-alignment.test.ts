import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { measureBlock } from '@superdoc/measuring-dom';
import { resolveCanvas } from '@superdoc/measuring-dom/canvas-resolver';
import { installNodeCanvasPolyfill } from '@superdoc/measuring-dom';
import { createDomPainter } from '@superdoc/painter-dom';
import { resolveLayout } from '@superdoc/layout-resolved';
import type {
  Layout,
  Measure,
  ParagraphBlock,
  TableBlock,
  TableMeasure,
  TextPart,
  VectorShapeDrawing,
} from '@superdoc/contracts';

const { Canvas } = resolveCanvas();
installNodeCanvasPolyfill({ document, Canvas });

function createMetadataTextboxShape(): {
  shape: VectorShapeDrawing;
  tableBlock: TableBlock;
  tablePart: TextPart;
  rightPara: ParagraphBlock;
} {
  const rightPara: ParagraphBlock = {
    kind: 'paragraph',
    id: 'metadata-para',
    runs: [
      { text: 'KvK', fontFamily: 'Arial', fontSize: 12 },
      { text: ' ', fontFamily: 'Arial', fontSize: 12 },
      { kind: 'tab', text: '\t', fontSize: 12 },
      {
        text: 'KvK_number',
        fontFamily: 'Arial',
        fontSize: 12,
        sdt: {
          type: 'structuredContent',
          scope: 'inline',
          id: 'sdt-kvk',
          alias: 'KvK number',
        },
      },
      { kind: 'lineBreak' },
      { text: 'IBAN ', fontFamily: 'Arial', fontSize: 12 },
      { kind: 'tab', text: '\t', fontSize: 12 },
      {
        text: 'DE123456789',
        fontFamily: 'Arial',
        fontSize: 12,
        sdt: {
          type: 'structuredContent',
          scope: 'inline',
          id: 'sdt-iban',
          alias: 'IBAN',
        },
      },
      { kind: 'lineBreak' },
      { text: 'BIC', fontFamily: 'Arial', fontSize: 12 },
      { kind: 'tab', text: '\t', fontSize: 12 },
      {
        text: 'ABCDEFG',
        fontFamily: 'Arial',
        fontSize: 12,
        sdt: {
          type: 'structuredContent',
          scope: 'inline',
          id: 'sdt-bic',
          alias: 'BIC',
        },
      },
      { kind: 'lineBreak' },
    ],
    attrs: { spacing: { before: 0, line: 240, lineRule: 'auto' } },
  };

  const tableBlock: TableBlock = {
    kind: 'table',
    id: 'textbox-table',
    rows: [
      {
        id: 'row-1',
        cells: [
          {
            id: 'cell-left',
            blocks: [
              {
                kind: 'paragraph',
                id: 'address-para',
                runs: [{ text: 'Test Name', fontFamily: 'Arial', fontSize: 12 }],
                attrs: {},
              },
            ],
          },
          {
            id: 'cell-right',
            blocks: [rightPara],
          },
        ],
      },
    ],
    columnWidths: [283, 208],
  };

  const tablePart: TextPart = {
    kind: 'table',
    text: '',
    tableBlock,
  };

  const shape: VectorShapeDrawing = {
    kind: 'drawing',
    id: 'header-textbox-shape',
    drawingKind: 'vectorShape',
    geometry: { width: 572, height: 76, rotation: 0, flipH: false, flipV: false },
    textContent: { parts: [tablePart] },
    textAlign: 'left',
    textInsets: { top: 10, right: 10, bottom: 10, left: 10 },
  };

  return { shape, tableBlock, tablePart, rightPara };
}

describe('shape textbox table metadata alignment', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  it('preserves two-column grid widths and tab-separated label/value lines', async () => {
    const { shape, tableBlock, tablePart, rightPara } = createMetadataTextboxShape();

    expect(shape.textAlign).toBe('left');
    expect(tableBlock.columnWidths?.length).toBe(2);

    const leftCell = tableBlock.rows[0]?.cells[0];
    const rightCell = tableBlock.rows[0]?.cells[1];
    expect(leftCell?.blocks.length).toBeGreaterThan(0);
    expect(rightCell?.blocks.length).toBeGreaterThan(0);
    expect(rightPara.runs.some((r) => r.kind === 'tab')).toBe(true);

    const innerWidth = 552;
    const tableMeasure = (await measureBlock(tableBlock, { maxWidth: innerWidth })) as TableMeasure;
    const colWidths = tableMeasure.columnWidths;
    expect(colWidths[0]).toBeGreaterThan(colWidths[1]);

    const totalGrid = colWidths.reduce((a, b) => a + b, 0);
    expect(totalGrid).toBeGreaterThan(innerWidth * 0.85);

    const rightLines = tableMeasure.rows[0]?.cells[1]?.blocks[0]?.lines ?? [];
    expect(rightLines.length).toBeGreaterThanOrEqual(3);

    for (const line of rightLines.slice(0, 3)) {
      const segments = line.segments ?? [];
      const positioned = segments.filter((s) => (s.x ?? 0) > 0);
      expect(positioned.length).toBeGreaterThan(0);
    }

    const insets = shape.textInsets ?? { top: 10, right: 10, bottom: 10, left: 10 };
    const geometryWidth = shape.geometry?.width ?? 572;
    const innerWidthForPaint = Math.max(1, geometryWidth - insets.left - insets.right);
    const tableMeasureForPaint = (await measureBlock(tableBlock, { maxWidth: innerWidthForPaint })) as TableMeasure;
    const blockWithMeasure = {
      ...shape,
      textContent: {
        parts: [{ ...tablePart, tableMeasure: tableMeasureForPaint }],
      },
    };
    const vectorShapeMeasure: Measure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: geometryWidth,
      height: shape.geometry?.height ?? 76,
      scale: 1,
      naturalWidth: geometryWidth,
      naturalHeight: shape.geometry?.height ?? 76,
      geometry: shape.geometry!,
    };
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'drawing',
              drawingKind: 'vectorShape',
              blockId: shape.id,
              x: 0,
              y: 0,
              width: geometryWidth,
              height: shape.geometry?.height ?? 76,
              geometry: shape.geometry!,
              scale: 1,
            },
          ],
        },
      ],
    };
    const painter = createDomPainter({ contentControlsChrome: 'none' });
    const resolvedLayout = resolveLayout({
      layout,
      flowMode: 'paginated',
      blocks: [blockWithMeasure],
      measures: [vectorShapeMeasure],
    });
    painter.paint({ layout, resolvedLayout, blocks: [blockWithMeasure], measures: [vectorShapeMeasure] }, mount);

    const tableEl = mount.querySelector('.superdoc-table-fragment') as HTMLElement | null;
    expect(tableEl).toBeTruthy();
    const tableWidthPx = parseFloat(tableEl!.style.width || '0');
    expect(tableWidthPx).toBeGreaterThan(0);
    expect(tableWidthPx / innerWidthForPaint).toBeGreaterThan(0.85);

    const firstLine = tableMeasureForPaint.rows[0]?.cells[1]?.blocks[0]?.lines[0];
    expect(firstLine?.segments?.some((s) => (s.x ?? 0) > 0)).toBe(true);

    const valueSegment = firstLine?.segments?.find((seg) => {
      const run = rightPara.runs[seg.runIndex];
      return run && run.kind !== 'tab' && 'text' in run && run.text?.includes('KvK_number');
    });
    expect(valueSegment?.x).toBeGreaterThan(0);

    const kvkSpan = Array.from(mount.querySelectorAll('.superdoc-line span')).find(
      (el) => (el as HTMLElement).textContent === 'KvK',
    ) as HTMLElement | undefined;
    const kvkNumberSpan = Array.from(mount.querySelectorAll('.superdoc-line span')).find(
      (el) => (el as HTMLElement).textContent === 'KvK_number',
    ) as HTMLElement | undefined;
    expect(kvkSpan).toBeTruthy();
    expect(kvkNumberSpan).toBeTruthy();

    const kvkLine = kvkSpan!.closest('.superdoc-line') as HTMLElement;
    const numberLine = kvkNumberSpan!.closest('.superdoc-line') as HTMLElement;
    expect(kvkLine).toBe(numberLine);

    const visualLeft = (el: HTMLElement): number => {
      let node: HTMLElement | null = el;
      let left = 0;
      while (node && !node.classList.contains('superdoc-line')) {
        left += parseFloat(node.style.left || '0');
        node = node.parentElement;
      }
      return left;
    };

    const visualTop = (el: HTMLElement): number => {
      let node: HTMLElement | null = el;
      let top = 0;
      while (node && !node.classList.contains('superdoc-line')) {
        top += parseFloat(node.style.top || '0');
        node = node.parentElement;
      }
      return top;
    };

    const kvkLeft = visualLeft(kvkSpan!);
    const numberLeft = visualLeft(kvkNumberSpan!);
    expect(numberLeft - kvkLeft).toBeGreaterThan(10);
    expect(visualTop(kvkSpan!)).toBeCloseTo(visualTop(kvkNumberSpan!), 1);

    const ibanSpan = Array.from(mount.querySelectorAll('.superdoc-line span')).find((el) =>
      (el as HTMLElement).textContent?.startsWith('IBAN'),
    ) as HTMLElement | undefined;
    const ibanValueSpan = Array.from(mount.querySelectorAll('.superdoc-line span')).find(
      (el) => (el as HTMLElement).textContent === 'DE123456789',
    ) as HTMLElement | undefined;
    const bicSpan = Array.from(mount.querySelectorAll('.superdoc-line span')).find(
      (el) => (el as HTMLElement).textContent === 'BIC',
    ) as HTMLElement | undefined;
    const bicValueSpan = Array.from(mount.querySelectorAll('.superdoc-line span')).find(
      (el) => (el as HTMLElement).textContent === 'ABCDEFG',
    ) as HTMLElement | undefined;

    expect(ibanSpan).toBeTruthy();
    expect(ibanValueSpan).toBeTruthy();
    expect(bicSpan).toBeTruthy();
    expect(bicValueSpan).toBeTruthy();
    expect(visualTop(ibanSpan!)).toBeCloseTo(visualTop(ibanValueSpan!), 1);
    expect(visualTop(bicSpan!)).toBeCloseTo(visualTop(bicValueSpan!), 1);
    expect(visualLeft(ibanValueSpan!)).toBeCloseTo(visualLeft(kvkNumberSpan!), 1);
    expect(visualLeft(bicValueSpan!)).toBeCloseTo(visualLeft(kvkNumberSpan!), 1);

    const rightLinesForPaint = tableMeasureForPaint.rows[0]?.cells[1]?.blocks[0]?.lines ?? [];
    const trailingLine = rightLinesForPaint[3];
    const contentLine = rightLinesForPaint[2];
    expect(trailingLine?.lineHeight).toBeCloseTo(contentLine?.lineHeight ?? 0, 1);
  });
});
