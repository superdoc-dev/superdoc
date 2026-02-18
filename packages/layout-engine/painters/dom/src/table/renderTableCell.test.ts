import { describe, it, expect, beforeEach } from 'vitest';
import { renderTableCell } from './renderTableCell.js';
import type {
  ParagraphBlock,
  ParagraphMeasure,
  TableCell,
  TableCellMeasure,
  ImageBlock,
  DrawingBlock,
  DrawingMeasure,
} from '@superdoc/contracts';

describe('renderTableCell', () => {
  let doc: Document;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('table-cell');
  });

  const expectCssColor = (actual: string, expectedHex: string): void => {
    const normalizedActual = actual.replace(/\s+/g, '').toLowerCase();
    let normalizedHex = expectedHex.toLowerCase();
    if (!normalizedHex.startsWith('#')) {
      normalizedHex = `#${normalizedHex}`;
    }
    if (normalizedHex.length === 4) {
      normalizedHex = `#${normalizedHex[1]}${normalizedHex[1]}${normalizedHex[2]}${normalizedHex[2]}${normalizedHex[3]}${normalizedHex[3]}`;
    }
    const r = Number.parseInt(normalizedHex.slice(1, 3), 16);
    const g = Number.parseInt(normalizedHex.slice(3, 5), 16);
    const b = Number.parseInt(normalizedHex.slice(5, 7), 16);
    const rgb = `rgb(${r},${g},${b})`;
    expect([normalizedHex, rgb]).toContain(normalizedActual);
  };

  const paragraphBlock: ParagraphBlock = {
    kind: 'paragraph',
    id: 'para-1',
    runs: [{ text: '1', fontFamily: 'Arial', fontSize: 16 }],
  };

  const paragraphMeasure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 1,
        width: 10,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      },
    ],
    totalHeight: 20,
  };

  const baseCellMeasure: TableCellMeasure = {
    blocks: [paragraphMeasure],
    width: 80,
    height: 20,
    gridColumnStart: 0,
    colSpan: 1,
    rowSpan: 1,
  };

  const baseCell: TableCell = {
    id: 'cell-1-1',
    blocks: [paragraphBlock],
    attrs: {},
  };

  const createBaseDeps = () => ({
    doc,
    x: 0,
    y: 0,
    rowHeight: 40,
    borders: undefined,
    useDefaultBorder: false,
    context: { sectionIndex: 0, pageIndex: 0, columnIndex: 0 },
    renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
    applySdtDataset: () => {
      // noop for tests
    },
  });

  it('centers content when verticalAlign is center', () => {
    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure: baseCellMeasure,
      cell: { ...baseCell, attrs: { verticalAlign: 'center' } },
    });

    // Content is now a child of cellElement
    const contentElement = cellElement.firstElementChild as HTMLElement;
    expect(contentElement).toBeTruthy();
    expect(contentElement?.style.justifyContent).toBe('center');
  });

  it('bottom-aligns content when verticalAlign is bottom', () => {
    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure: baseCellMeasure,
      cell: { ...baseCell, attrs: { verticalAlign: 'bottom' } },
    });

    // Content is now a child of cellElement
    const contentElement = cellElement.firstElementChild as HTMLElement;
    expect(contentElement).toBeTruthy();
    expect(contentElement?.style.justifyContent).toBe('flex-end');
  });

  it('applies padding directly to cell element', () => {
    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure: baseCellMeasure,
      cell: baseCell,
    });

    // Default padding is top: 0, left: 4, right: 4, bottom: 0
    expect(cellElement.style.paddingTop).toBe('0px');
    expect(cellElement.style.paddingLeft).toBe('4px');
    expect(cellElement.style.paddingRight).toBe('4px');
    expect(cellElement.style.paddingBottom).toBe('0px');
  });

  it('content fills cell with 100% width and height', () => {
    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure: baseCellMeasure,
      cell: baseCell,
    });

    // Content is now a child of cellElement
    const contentElement = cellElement.firstElementChild as HTMLElement;
    expect(contentElement?.style.width).toBe('100%');
    expect(contentElement?.style.height).toBe('100%');
  });

  it('cell uses overflow hidden to clip content', () => {
    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure: baseCellMeasure,
      cell: baseCell,
    });

    expect(cellElement.style.overflow).toBe('hidden');
  });

  it('renders image blocks inside table cells', () => {
    const imageBlock: ImageBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,AAA',
    };
    const imageMeasure = {
      kind: 'image' as const,
      width: 50,
      height: 40,
    };

    const cellMeasure: TableCellMeasure = {
      blocks: [imageMeasure],
      width: 80,
      height: 40,
      gridColumnStart: 0,
      colSpan: 1,
      rowSpan: 1,
    };

    const cell: TableCell = {
      id: 'cell-with-image',
      blocks: [imageBlock],
      attrs: {},
    };

    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure,
      cell,
    });

    const imgEl = cellElement.querySelector('img.superdoc-table-image') as HTMLImageElement | null;
    expect(imgEl).toBeTruthy();
    expect(imgEl?.parentElement?.style.height).toBe('40px');
  });

  it('absolutely positions anchored image blocks inside table cells', () => {
    const para: ParagraphBlock = {
      kind: 'paragraph',
      id: 'para-anchor',
      runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 16 }],
    };

    const anchoredImage: ImageBlock = {
      kind: 'image',
      id: 'img-anchored',
      src: 'data:image/png;base64,AAA',
      anchor: { isAnchored: true, alignH: 'left', offsetH: 10, vRelativeFrom: 'paragraph', offsetV: 5 },
      wrap: { type: 'None' },
      attrs: { anchorParagraphId: 'para-anchor' },
    };

    const cellMeasure: TableCellMeasure = {
      blocks: [
        paragraphMeasure,
        {
          kind: 'image' as const,
          width: 20,
          height: 10,
        },
      ],
      width: 80,
      height: 30,
      gridColumnStart: 0,
      colSpan: 1,
      rowSpan: 1,
    };

    const cell: TableCell = {
      id: 'cell-with-anchored-image',
      blocks: [para, anchoredImage],
      attrs: {},
    };

    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure,
      cell,
    });

    const imgEl = cellElement.querySelector('img.superdoc-table-image') as HTMLImageElement | null;
    expect(imgEl).toBeTruthy();
    expect(imgEl?.parentElement?.style.position).toBe('absolute');
    expect(imgEl?.parentElement?.style.left).toBe('10px');
    expect(imgEl?.parentElement?.style.top).toBe('5px');
  });

  it('adjusts column-relative anchored images by table indent and cell offset', () => {
    const para: ParagraphBlock = {
      kind: 'paragraph',
      id: 'para-anchor',
      runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 16 }],
    };

    const anchoredImage: ImageBlock = {
      kind: 'image',
      id: 'img-anchored',
      src: 'data:image/png;base64,AAA',
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'column',
        alignH: 'left',
        offsetH: 100,
        vRelativeFrom: 'paragraph',
        offsetV: 0,
      },
      wrap: { type: 'None' },
      attrs: { anchorParagraphId: 'para-anchor' },
    };

    const cellMeasure: TableCellMeasure = {
      blocks: [
        paragraphMeasure,
        {
          kind: 'image' as const,
          width: 20,
          height: 10,
        },
      ],
      width: 120,
      height: 30,
      gridColumnStart: 0,
      colSpan: 1,
      rowSpan: 1,
    };

    const cell: TableCell = {
      id: 'cell-with-anchored-image',
      blocks: [para, anchoredImage],
      attrs: {},
    };

    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      x: 40,
      tableIndent: 20,
      cellMeasure,
      cell,
    });

    const imgEl = cellElement.querySelector('img.superdoc-table-image') as HTMLImageElement | null;
    expect(imgEl).toBeTruthy();
    expect(imgEl?.parentElement?.style.left).toBe('40px');
  });

  it('absolutely positions anchored drawing blocks inside table cells', () => {
    const para: ParagraphBlock = {
      kind: 'paragraph',
      id: 'para-anchor',
      runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 16 }],
    };

    const anchoredDrawing: DrawingBlock = {
      kind: 'drawing',
      id: 'shape-anchored',
      drawingKind: 'vectorShape',
      geometry: { width: 10, height: 10 },
      anchor: { isAnchored: true, alignH: 'left', offsetH: 12, vRelativeFrom: 'paragraph', offsetV: 7 },
      wrap: { type: 'None' },
      attrs: { anchorParagraphId: 'para-anchor' },
    };

    const drawingMeasure: DrawingMeasure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: 30,
      height: 15,
      scale: 1,
      naturalWidth: 30,
      naturalHeight: 15,
      geometry: { width: 10, height: 10 },
    };

    const cellMeasure: TableCellMeasure = {
      blocks: [paragraphMeasure, drawingMeasure],
      width: 80,
      height: 40,
      gridColumnStart: 0,
      colSpan: 1,
      rowSpan: 1,
    };

    const cell: TableCell = {
      id: 'cell-with-anchored-drawing',
      blocks: [para, anchoredDrawing],
      attrs: {},
    };

    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure,
      cell,
      renderDrawingContent: () => doc.createElement('div'),
    });

    const drawingWrapper = cellElement.querySelector('div.superdoc-table-drawing')?.parentElement as HTMLElement | null;
    expect(drawingWrapper).toBeTruthy();
    expect(drawingWrapper?.style.position).toBe('absolute');
    expect(drawingWrapper?.style.left).toBe('12px');
    expect(drawingWrapper?.style.top).toBe('7px');
  });

  it('pushes text away from wrapSquare anchored images in table cells', () => {
    const para: ParagraphBlock = {
      kind: 'paragraph',
      id: 'para-wrap',
      runs: [{ text: 'Wrapped text', fontFamily: 'Arial', fontSize: 16 }],
    };

    const anchoredImage: ImageBlock = {
      kind: 'image',
      id: 'img-wrap',
      src: 'data:image/png;base64,AAA',
      anchor: { isAnchored: true, alignH: 'left', offsetH: 0, vRelativeFrom: 'paragraph', offsetV: 0 },
      wrap: { type: 'Square', wrapText: 'bothSides' },
      attrs: { anchorParagraphId: 'para-wrap' },
    };

    const cellMeasure: TableCellMeasure = {
      blocks: [
        paragraphMeasure,
        {
          kind: 'image' as const,
          width: 20,
          height: 10,
        },
      ],
      width: 80,
      height: 30,
      gridColumnStart: 0,
      colSpan: 1,
      rowSpan: 1,
    };

    const cell: TableCell = {
      id: 'cell-with-wrap',
      blocks: [para, anchoredImage],
      attrs: {},
    };

    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure,
      cell,
      renderLine: (_block, _line, _ctx, lineIndex) => {
        const el = doc.createElement('div');
        el.id = `line-${lineIndex}`;
        return el;
      },
    });

    const lineEl = cellElement.querySelector('#line-0') as HTMLElement | null;
    expect(lineEl).toBeTruthy();

    // contentWidthPx = 80 - 4 - 4 = 72. Excluded segment is [0, 20], so largest available interval is [20, 72].
    expect(lineEl?.style.marginLeft).toBe('20px');
    expect(lineEl?.style.marginRight).toBe('0px');
  });

  it('pushes text away from wrapSquare anchored drawings in table cells', () => {
    const para: ParagraphBlock = {
      kind: 'paragraph',
      id: 'para-wrap-drawing',
      runs: [{ text: 'Wrapped text', fontFamily: 'Arial', fontSize: 16 }],
    };

    const anchoredDrawing: DrawingBlock = {
      kind: 'drawing',
      id: 'shape-wrap',
      drawingKind: 'vectorShape',
      geometry: { width: 10, height: 10 },
      anchor: { isAnchored: true, alignH: 'left', offsetH: 0, vRelativeFrom: 'paragraph', offsetV: 0 },
      wrap: { type: 'Square', wrapText: 'bothSides' },
      attrs: { anchorParagraphId: 'para-wrap-drawing' },
    };

    const drawingMeasure: DrawingMeasure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: 20,
      height: 10,
      scale: 1,
      naturalWidth: 20,
      naturalHeight: 10,
      geometry: { width: 10, height: 10 },
    };

    const cellMeasure: TableCellMeasure = {
      blocks: [paragraphMeasure, drawingMeasure],
      width: 80,
      height: 30,
      gridColumnStart: 0,
      colSpan: 1,
      rowSpan: 1,
    };

    const cell: TableCell = {
      id: 'cell-with-wrap-drawing',
      blocks: [para, anchoredDrawing],
      attrs: {},
    };

    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure,
      cell,
      renderLine: (_block, _line, _ctx, lineIndex) => {
        const el = doc.createElement('div');
        el.id = `line-${lineIndex}`;
        return el;
      },
    });

    const lineEl = cellElement.querySelector('#line-0') as HTMLElement | null;
    expect(lineEl).toBeTruthy();
    expect(lineEl?.style.marginLeft).toBe('20px');
    expect(lineEl?.style.marginRight).toBe('0px');
  });

  it('does not apply wrapSquare margins when line already has padding', () => {
    const para: ParagraphBlock = {
      kind: 'paragraph',
      id: 'para-wrap-padding',
      runs: [{ text: 'Wrapped text', fontFamily: 'Arial', fontSize: 16 }],
      attrs: { indent: { left: 10 } },
    };

    const anchoredImage: ImageBlock = {
      kind: 'image',
      id: 'img-wrap-padding',
      src: 'data:image/png;base64,AAA',
      anchor: { isAnchored: true, alignH: 'left', offsetH: 0, vRelativeFrom: 'paragraph', offsetV: 0 },
      wrap: { type: 'Square', wrapText: 'bothSides' },
      attrs: { anchorParagraphId: 'para-wrap-padding' },
    };

    const cellMeasure: TableCellMeasure = {
      blocks: [
        paragraphMeasure,
        {
          kind: 'image' as const,
          width: 20,
          height: 10,
        },
      ],
      width: 80,
      height: 30,
      gridColumnStart: 0,
      colSpan: 1,
      rowSpan: 1,
    };

    const cell: TableCell = {
      id: 'cell-with-wrap-padding',
      blocks: [para, anchoredImage],
      attrs: {},
    };

    const { cellElement } = renderTableCell({
      ...createBaseDeps(),
      cellMeasure,
      cell,
      renderLine: (_block, _line, _ctx, lineIndex) => {
        const el = doc.createElement('div');
        el.id = `line-${lineIndex}`;
        return el;
      },
    });

    const lineEl = cellElement.querySelector('#line-0') as HTMLElement | null;
    expect(lineEl).toBeTruthy();
    expect(lineEl?.style.paddingLeft).toBe('10px');
    expect(lineEl?.style.marginLeft).toBe('');
    expect(lineEl?.style.width).toBe('');
  });

  describe('spacing.after margin-bottom rendering', () => {
    it('should apply margin-bottom for spacing.after on paragraphs', () => {
      const para1: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-1',
        runs: [{ text: 'First paragraph', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: 10 } },
      };

      const para2: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-2',
        runs: [{ text: 'Second paragraph', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: 20 } },
      };

      const measure1: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 15,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const measure2: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 16,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure1, measure2],
        width: 120,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-spacing',
        blocks: [para1, para2],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      expect(contentElement).toBeTruthy();

      // Get paragraph wrappers
      const paraWrappers = contentElement.children;
      expect(paraWrappers.length).toBe(2);

      const firstParaWrapper = paraWrappers[0] as HTMLElement;
      const secondParaWrapper = paraWrappers[1] as HTMLElement;

      // Both paragraphs should have margin-bottom for spacing.after
      expect(firstParaWrapper.style.marginBottom).toBe('10px');
      expect(secondParaWrapper.style.marginBottom).toBe('20px');
    });

    it('should apply spacing.after even to the last paragraph', () => {
      const lastPara: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-last',
        runs: [{ text: 'Last paragraph', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: 15 } },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 14,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-last',
        blocks: [lastPara],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Last paragraph should still have margin-bottom applied
      // This matches Word's behavior
      expect(paraWrapper.style.marginBottom).toBe('15px');
    });

    it('should only apply margin-bottom when spacing.after > 0', () => {
      const para1: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-1',
        runs: [{ text: 'Zero spacing', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: 0 } },
      };

      const para2: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-2',
        runs: [{ text: 'Negative spacing', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: -5 } },
      };

      const para3: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-3',
        runs: [{ text: 'Positive spacing', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: 10 } },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 10,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure, measure, measure],
        width: 120,
        height: 80,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-conditional',
        blocks: [para1, para2, para3],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrappers = contentElement.children;

      const wrapper1 = paraWrappers[0] as HTMLElement;
      const wrapper2 = paraWrappers[1] as HTMLElement;
      const wrapper3 = paraWrappers[2] as HTMLElement;

      // Zero and negative spacing should not result in margin-bottom
      expect(wrapper1.style.marginBottom).toBe('');
      expect(wrapper2.style.marginBottom).toBe('');

      // Positive spacing should have margin-bottom
      expect(wrapper3.style.marginBottom).toBe('10px');
    });

    it('should handle paragraphs without spacing.after attribute', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-no-spacing',
        runs: [{ text: 'No spacing attr', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {},
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 15,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-no-attr',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Should not have margin-bottom when no spacing.after
      expect(paraWrapper.style.marginBottom).toBe('');
    });

    it('should handle type safety for spacing.after', () => {
      const para1: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-1',
        runs: [{ text: 'Valid number', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: 10 } },
      };

      const para2: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-2',
        runs: [{ text: 'Invalid type', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: '15' as unknown as number } },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 10,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure, measure],
        width: 120,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-type-safety',
        blocks: [para1, para2],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrappers = contentElement.children;

      const wrapper1 = paraWrappers[0] as HTMLElement;
      const wrapper2 = paraWrappers[1] as HTMLElement;

      // Valid number should apply margin-bottom
      expect(wrapper1.style.marginBottom).toBe('10px');

      // Invalid type (string) should not apply margin-bottom
      expect(wrapper2.style.marginBottom).toBe('');
    });

    it('should only apply spacing when rendering entire block (not partial)', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-partial',
        runs: [{ text: 'Partial render test', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { spacing: { after: 15 } },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 10,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
          {
            fromRun: 0,
            fromChar: 10,
            toRun: 0,
            toChar: 19,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 40,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-partial',
        blocks: [para],
        attrs: {},
      };

      // Render only first line (partial)
      const { cellElement: partialCell } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        fromLine: 0,
        toLine: 1,
      });

      const partialContent = partialCell.firstElementChild as HTMLElement;
      const partialWrapper = partialContent.firstElementChild as HTMLElement;

      // Partial render should NOT apply spacing.after
      expect(partialWrapper.style.marginBottom).toBe('');

      // Render entire block
      const { cellElement: fullCell } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const fullContent = fullCell.firstElementChild as HTMLElement;
      const fullWrapper = fullContent.firstElementChild as HTMLElement;

      // Full render SHOULD apply spacing.after
      expect(fullWrapper.style.marginBottom).toBe('15px');
    });
  });

  describe('list marker rendering', () => {
    const createParagraphWithMarker = (markerText: string, markerWidth = 20, gutterWidth = 8, indentLeft = 30) => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-list',
        runs: [{ text: 'List item text', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          wordLayout: {
            marker: {
              markerText,
              markerBoxWidthPx: markerWidth,
              gutterWidthPx: gutterWidth,
              justification: 'left' as const,
              run: {
                fontFamily: 'Arial',
                fontSize: 14,
                bold: false,
                italic: false,
                color: '#000000',
              },
            },
            indentLeftPx: indentLeft,
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 14,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
        marker: {
          markerWidth,
          gutterWidth,
          indentLeft,
        },
      };

      return { para, measure };
    };

    it('should render bullet list marker with correct positioning', () => {
      const { para, measure } = createParagraphWithMarker('•');

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-bullet-list',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineContainer = paraWrapper.firstElementChild as HTMLElement;

      // Marker should be in a positioned container
      expect(lineContainer.style.position).toBe('relative');

      const markerEl = lineContainer.querySelector('.superdoc-paragraph-marker') as HTMLElement;
      expect(markerEl).toBeTruthy();
      expect(markerEl.textContent).toBe('•');
      expect(markerEl.style.position).toBe('absolute');
    });

    it('should render numbered list marker with correct text', () => {
      const { para, measure } = createParagraphWithMarker('1.');

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-numbered-list',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineContainer = paraWrapper.firstElementChild as HTMLElement;
      const markerEl = lineContainer.querySelector('.superdoc-paragraph-marker') as HTMLElement;

      expect(markerEl).toBeTruthy();
      expect(markerEl.textContent).toBe('1.');
    });

    it('should apply marker styling (font, color, bold, italic)', () => {
      const { para, measure } = createParagraphWithMarker('a)');
      if (para.attrs?.wordLayout?.marker) {
        para.attrs.wordLayout.marker.run = {
          fontFamily: 'Times New Roman',
          fontSize: 18,
          bold: true,
          italic: true,
          color: '#FF0000',
          letterSpacing: 2,
        };
      }

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-styled-marker',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineContainer = paraWrapper.firstElementChild as HTMLElement;
      const markerEl = lineContainer.querySelector('.superdoc-paragraph-marker') as HTMLElement;

      expect(markerEl.style.fontFamily).toBe('"Times New Roman", sans-serif');
      expect(markerEl.style.fontSize).toBe('18px');
      expect(markerEl.style.fontWeight).toBe('bold');
      expect(markerEl.style.fontStyle).toBe('italic');
      expectCssColor(markerEl.style.color, '#ff0000');
      expect(markerEl.style.letterSpacing).toBe('2px');
    });

    it('should handle marker justification (left, center, right)', () => {
      const testCases: Array<{ justification: 'left' | 'center' | 'right'; expectedAlign: string }> = [
        { justification: 'left', expectedAlign: 'left' },
        { justification: 'center', expectedAlign: 'center' },
        { justification: 'right', expectedAlign: 'right' },
      ];

      testCases.forEach(({ justification, expectedAlign }) => {
        const { para, measure } = createParagraphWithMarker('•');
        if (para.attrs?.wordLayout?.marker) {
          para.attrs.wordLayout.marker.justification = justification;
        }

        const cellMeasure: TableCellMeasure = {
          blocks: [measure],
          width: 120,
          height: 40,
          gridColumnStart: 0,
          colSpan: 1,
          rowSpan: 1,
        };

        const cell: TableCell = {
          id: `cell-marker-${justification}`,
          blocks: [para],
          attrs: {},
        };

        const { cellElement } = renderTableCell({
          ...createBaseDeps(),
          cellMeasure,
          cell,
        });

        const contentElement = cellElement.firstElementChild as HTMLElement;
        const paraWrapper = contentElement.firstElementChild as HTMLElement;
        const lineContainer = paraWrapper.firstElementChild as HTMLElement;
        const markerEl = lineContainer.querySelector('.superdoc-paragraph-marker') as HTMLElement;

        expect(markerEl.style.textAlign).toBe(expectedAlign);
      });
    });

    it('should apply proper indentation when marker is present', () => {
      const indentLeft = 50;
      const { para, measure } = createParagraphWithMarker('1.', 20, 8, indentLeft);

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-indented-marker',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineContainer = paraWrapper.firstElementChild as HTMLElement;
      const lineEl = lineContainer.querySelector('div:not(.superdoc-paragraph-marker)') as HTMLElement;

      // Text should have padding equal to indentLeft
      expect(lineEl.style.paddingLeft).toBe(`${indentLeft}px`);
    });

    it('should only render marker on first line of paragraph', () => {
      const { para, measure } = createParagraphWithMarker('•');

      // Add a second line
      const measureWith2Lines: ParagraphMeasure = {
        ...measure,
        lines: [
          ...(measure.lines ?? []),
          {
            fromRun: 0,
            fromChar: 14,
            toRun: 0,
            toChar: 28,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 40,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measureWith2Lines],
        width: 120,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-multiline-list',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // First child should be a container with marker
      const firstLineContainer = paraWrapper.children[0] as HTMLElement;
      const firstMarker = firstLineContainer.querySelector('.superdoc-paragraph-marker');
      expect(firstMarker).toBeTruthy();

      // Second child should be just a line element without marker
      const secondLine = paraWrapper.children[1] as HTMLElement;
      const secondMarker = secondLine.querySelector('.superdoc-paragraph-marker');
      expect(secondMarker).toBeNull();
    });

    it('should handle missing markerLayout gracefully', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-no-marker',
        runs: [{ text: 'Regular paragraph', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {},
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 17,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-no-marker',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const markerEl = paraWrapper.querySelector('.superdoc-paragraph-marker');

      expect(markerEl).toBeNull();
    });

    it('should handle paragraphs with markerLayout but zero markerWidth', () => {
      const { para, measure } = createParagraphWithMarker('', 0, 8, 30);

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-zero-width-marker',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const markerEl = paraWrapper.querySelector('.superdoc-paragraph-marker');

      // Marker should not be rendered when markerWidth is 0
      expect(markerEl).toBeNull();
    });

    it('should handle partial line rendering without marker on continuation', () => {
      const { para, measure } = createParagraphWithMarker('1.');

      const measureWith2Lines: ParagraphMeasure = {
        ...measure,
        lines: [
          ...(measure.lines ?? []),
          {
            fromRun: 0,
            fromChar: 14,
            toRun: 0,
            toChar: 28,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 40,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measureWith2Lines],
        width: 120,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-partial-render',
        blocks: [para],
        attrs: {},
      };

      // Render only the second line (skip first line with marker)
      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        fromLine: 1,
        toLine: 2,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const markerEl = paraWrapper.querySelector('.superdoc-paragraph-marker');

      // Marker should not be rendered when starting from line > 0
      expect(markerEl).toBeNull();
    });
  });

  describe('paragraph borders and shading (SD-1296)', () => {
    it('should apply paragraph borders to paraWrapper', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-with-borders',
        runs: [{ text: 'Text with border', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            top: { width: 2, style: 'solid', color: '#FF0000' },
            bottom: { width: 1, style: 'dashed', color: '#0000FF' },
            left: { width: 3, style: 'dotted', color: '#00FF00' },
            right: { width: 1, style: 'solid', color: '#000000' },
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 16,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-with-para-borders',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Verify borders are applied
      expect(paraWrapper.style.boxSizing).toBe('border-box');
      expect(paraWrapper.style.borderTopWidth).toBe('2px');
      expect(paraWrapper.style.borderTopStyle).toBe('solid');
      expectCssColor(paraWrapper.style.borderTopColor, '#ff0000');
      expect(paraWrapper.style.borderBottomWidth).toBe('1px');
      expect(paraWrapper.style.borderBottomStyle).toBe('dashed');
      expectCssColor(paraWrapper.style.borderBottomColor, '#0000ff');
      expect(paraWrapper.style.borderLeftWidth).toBe('3px');
      expect(paraWrapper.style.borderLeftStyle).toBe('dotted');
      expectCssColor(paraWrapper.style.borderLeftColor, '#00ff00');
      expect(paraWrapper.style.borderRightWidth).toBe('1px');
      expect(paraWrapper.style.borderRightStyle).toBe('solid');
      expectCssColor(paraWrapper.style.borderRightColor, '#000000');
    });

    it('should apply paragraph shading (background) to paraWrapper', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-with-shading',
        runs: [{ text: 'Shaded text', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          shading: {
            fill: '#FFFF00',
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 11,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-with-para-shading',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Verify shading is applied
      expectCssColor(paraWrapper.style.backgroundColor, '#ffff00');
    });

    it('should apply both borders and shading to the same paragraph', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-both-styles',
        runs: [{ text: 'Styled paragraph', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            top: { width: 1, style: 'solid', color: '#333333' },
            bottom: { width: 1, style: 'solid', color: '#333333' },
          },
          shading: {
            fill: '#E0E0E0',
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 16,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-both-styles',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Verify both borders and shading are applied
      expect(paraWrapper.style.borderTopWidth).toBe('1px');
      expect(paraWrapper.style.borderBottomWidth).toBe('1px');
      expectCssColor(paraWrapper.style.backgroundColor, '#e0e0e0');
    });

    it('should handle multiple paragraphs with different borders in same cell', () => {
      const para1: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-1',
        runs: [{ text: 'First paragraph', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            bottom: { width: 2, style: 'solid', color: '#FF0000' },
          },
        },
      };

      const para2: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-2',
        runs: [{ text: 'Second paragraph', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            top: { width: 1, style: 'dashed', color: '#0000FF' },
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 15,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure, measure],
        width: 120,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-multi-para-borders',
        blocks: [para1, para2],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrappers = contentElement.children;

      // First paragraph has bottom border
      const wrapper1 = paraWrappers[0] as HTMLElement;
      expect(wrapper1.style.borderBottomWidth).toBe('2px');
      expectCssColor(wrapper1.style.borderBottomColor, '#ff0000');

      // Second paragraph has top border
      const wrapper2 = paraWrappers[1] as HTMLElement;
      expect(wrapper2.style.borderTopWidth).toBe('1px');
      expect(wrapper2.style.borderTopStyle).toBe('dashed');
      expectCssColor(wrapper2.style.borderTopColor, '#0000ff');
    });

    it('should not apply borders when paragraph has no borders attribute', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-no-borders',
        runs: [{ text: 'No borders', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {},
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 10,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-no-borders',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // No borders should be applied
      expect(paraWrapper.style.borderTopWidth).toBe('');
      expect(paraWrapper.style.borderBottomWidth).toBe('');
      expect(paraWrapper.style.borderLeftWidth).toBe('');
      expect(paraWrapper.style.borderRightWidth).toBe('');
    });

    it('should handle border style "none" correctly', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-border-none',
        runs: [{ text: 'Border none', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            top: { width: 1, style: 'none', color: '#000000' },
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 11,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-border-none',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Border style 'none' should result in no visible border
      expect(paraWrapper.style.borderTopStyle).toBe('none');
      expect(paraWrapper.style.borderTopWidth).toBe('0px');
    });

    it('should handle zero width borders (width: 0)', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-zero-width',
        runs: [{ text: 'Zero width border', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            top: { width: 0, style: 'solid', color: '#FF0000' },
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 17,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-zero-width',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Zero width should render as '0px'
      expect(paraWrapper.style.borderTopWidth).toBe('0px');
      expect(paraWrapper.style.borderTopStyle).toBe('solid');
      expectCssColor(paraWrapper.style.borderTopColor, '#ff0000');
    });

    it('should clamp negative width borders to 0px', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-negative-width',
        runs: [{ text: 'Negative width border', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            left: { width: -5, style: 'solid', color: '#0000FF' },
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 21,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-negative-width',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Negative width should be clamped to '0px'
      expect(paraWrapper.style.borderLeftWidth).toBe('0px');
      expect(paraWrapper.style.borderLeftStyle).toBe('solid');
      expectCssColor(paraWrapper.style.borderLeftColor, '#0000ff');
    });

    it('should default to 1px when width is undefined', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-undefined-width',
        runs: [{ text: 'Undefined width', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            bottom: { style: 'dashed', color: '#00FF00' } as ParagraphBlock['attrs']['borders']['bottom'],
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 15,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-undefined-width',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Undefined width should default to '1px'
      expect(paraWrapper.style.borderBottomWidth).toBe('1px');
      expect(paraWrapper.style.borderBottomStyle).toBe('dashed');
      expectCssColor(paraWrapper.style.borderBottomColor, '#00ff00');
    });

    it('should only apply border to specified sides (e.g., only top)', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-top-only',
        runs: [{ text: 'Only top border', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          borders: {
            top: { width: 3, style: 'solid', color: '#FF00FF' },
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 15,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-top-only',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Only top border should be set
      expect(paraWrapper.style.borderTopWidth).toBe('3px');
      expect(paraWrapper.style.borderTopStyle).toBe('solid');
      expectCssColor(paraWrapper.style.borderTopColor, '#ff00ff');

      // Left, right, and bottom borders should remain unset
      expect(paraWrapper.style.borderLeftWidth).toBe('');
      expect(paraWrapper.style.borderRightWidth).toBe('');
      expect(paraWrapper.style.borderBottomWidth).toBe('');
    });

    it('should handle empty shading object (shading: {})', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-empty-shading',
        runs: [{ text: 'Empty shading', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          shading: {},
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-empty-shading',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // No background should be applied when shading object is empty (no fill property)
      expect(paraWrapper.style.backgroundColor).toBe('');
    });
  });

  describe('explicit segment positioning (SD-1472)', () => {
    /**
     * SD-1472: When segments have explicit x positions (from tabs), the indentation
     * should not be double-applied. The segments are already absolutely positioned,
     * so adding padding would shift them incorrectly, causing the first character
     * to be lost/hidden.
     */

    const createParagraphWithExplicitPositioning = (
      indent: { left?: number; hanging?: number; firstLine?: number; right?: number },
      segmentX?: number,
    ) => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-explicit-pos',
        runs: [{ text: 'A hello world text', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { indent },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 18,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            // When segmentX is provided, segments have explicit positioning (from tabs)
            segments: segmentX !== undefined ? [{ x: segmentX, width: 100 }] : undefined,
          },
        ],
        totalHeight: 20,
      };

      return { para, measure };
    };

    it('should not apply paddingLeft when segments have explicit x positions (prevents double indent)', () => {
      const { para, measure } = createParagraphWithExplicitPositioning(
        { left: 20, hanging: 30 },
        50, // Explicit x position from tab
      );

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-explicit-pos',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineEl = paraWrapper.firstElementChild as HTMLElement;

      // With explicit segment positioning, textIndent should be reset to 0
      // to prevent double-application of indentation
      expect(lineEl.style.textIndent).toBe('0px');
    });

    it('should apply adjusted padding for first line with explicit positioning and firstLineOffset', () => {
      const { para, measure } = createParagraphWithExplicitPositioning(
        { left: 20, hanging: 50, firstLine: 10 }, // firstLineOffset = 10 - 50 = -40
        30, // Explicit x position
      );

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-adjusted-padding',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineEl = paraWrapper.firstElementChild as HTMLElement;

      // adjustedPadding = effectiveLeftIndent (20) + firstLineOffset (-40) = -20
      // Since -20 <= 0, no paddingLeft should be applied
      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.textIndent).toBe('0px');
    });

    it('should apply positive adjusted padding when effectiveLeftIndent + firstLineOffset > 0', () => {
      const { para, measure } = createParagraphWithExplicitPositioning(
        { left: 50, hanging: 20, firstLine: 10 }, // firstLineOffset = 10 - 20 = -10
        30, // Explicit x position
      );

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-positive-adjusted',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineEl = paraWrapper.firstElementChild as HTMLElement;

      // adjustedPadding = effectiveLeftIndent (50) + firstLineOffset (-10) = 40
      expect(lineEl.style.paddingLeft).toBe('40px');
      expect(lineEl.style.textIndent).toBe('0px');
    });

    it('should clamp negative left indent to 0 when calculating adjusted padding', () => {
      const { para, measure } = createParagraphWithExplicitPositioning(
        { left: -15, hanging: 20, firstLine: 5 }, // firstLineOffset = 5 - 20 = -15
        30, // Explicit x position
      );

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-negative-left-clamped',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineEl = paraWrapper.firstElementChild as HTMLElement;

      // effectiveLeftIndent = max(0, -15) = 0
      // adjustedPadding = 0 + (-15) = -15 which is <= 0, so no padding
      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.textIndent).toBe('0px');
    });

    it('should apply normal indentation when segments do NOT have explicit positioning', () => {
      const { para, measure } = createParagraphWithExplicitPositioning(
        { left: 20, hanging: 30 },
        undefined, // No explicit x position
      );

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-no-explicit-pos',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineEl = paraWrapper.firstElementChild as HTMLElement;

      // Without explicit positioning, normal indent rules apply
      expect(lineEl.style.paddingLeft).toBe('20px');
      expect(lineEl.style.textIndent).toBe('-30px'); // firstLine(0) - hanging(30) = -30
    });

    it('should handle suppressFirstLineIndent flag', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-suppress',
        runs: [{ text: 'Suppressed indent', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          indent: { left: 20, hanging: 30, firstLine: 10 },
          suppressFirstLineIndent: true,
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 17,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-suppress-indent',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lineEl = paraWrapper.firstElementChild as HTMLElement;

      // When suppressFirstLineIndent is true, firstLineOffset should be 0
      // So textIndent should not be applied
      expect(lineEl.style.textIndent).toBe('');
      expect(lineEl.style.paddingLeft).toBe('20px');
    });

    it('should not apply list indent padding when segments have explicit positioning', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-list-explicit',
        runs: [{ text: 'List item with tabs', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          wordLayout: {
            marker: {
              markerText: '1.',
              markerBoxWidthPx: 20,
              gutterWidthPx: 8,
              justification: 'left' as const,
              run: { fontFamily: 'Arial', fontSize: 14 },
            },
            indentLeftPx: 40,
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 19,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
          {
            fromRun: 0,
            fromChar: 19,
            toRun: 0,
            toChar: 30,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            // Second line (continuation) has explicit positioning
            segments: [{ x: 40, width: 80 }],
          },
        ],
        totalHeight: 40,
        marker: { markerWidth: 20, gutterWidth: 8, indentLeft: 40 },
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-list-explicit-pos',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;

      // Second line (continuation) should NOT have paddingLeft applied
      // because it has explicit segment positioning
      const secondLine = paraWrapper.children[1] as HTMLElement;
      expect(secondLine.style.paddingLeft).toBe('');
    });
  });

  describe('hanging indent (SD-1295)', () => {
    const createMultiLineParagraph = (indent: {
      left?: number;
      hanging?: number;
      firstLine?: number;
      right?: number;
    }) => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-hanging',
        runs: [{ text: 'First line text. Second line text that wraps.', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          indent,
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 17,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
          {
            fromRun: 0,
            fromChar: 17,
            toRun: 0,
            toChar: 45,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 40,
      };

      return { para, measure };
    };

    it('should apply hanging indent: first line at left, body lines at left+hanging', () => {
      const { para, measure } = createMultiLineParagraph({
        left: 20,
        hanging: 30,
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-hanging',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // First line: paddingLeft = left (20px), textIndent = firstLine - hanging = 0 - 30 = -30px
      const firstLine = lines[0] as HTMLElement;
      expect(firstLine.style.paddingLeft).toBe('20px');
      expect(firstLine.style.textIndent).toBe('-30px');

      // Body line: paddingLeft = left = 20px
      const bodyLine = lines[1] as HTMLElement;
      expect(bodyLine.style.paddingLeft).toBe('20px');
      expect(bodyLine.style.textIndent).toBe('');
    });

    it('should handle firstLine + hanging combination', () => {
      const { para, measure } = createMultiLineParagraph({
        left: 20,
        hanging: 30,
        firstLine: 10, // First line indent of 10
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-firstline-hanging',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // First line: paddingLeft = left (20px), textIndent = firstLine - hanging = 10 - 30 = -20px
      const firstLine = lines[0] as HTMLElement;
      expect(firstLine.style.paddingLeft).toBe('20px');
      expect(firstLine.style.textIndent).toBe('-20px');

      // Body line: paddingLeft = left = 20px
      const bodyLine = lines[1] as HTMLElement;
      expect(bodyLine.style.paddingLeft).toBe('20px');
    });

    it('should handle left indent without hanging', () => {
      const { para, measure } = createMultiLineParagraph({
        left: 40,
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-left-only',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // Both lines should have same left padding (no hanging effect)
      const firstLine = lines[0] as HTMLElement;
      expect(firstLine.style.paddingLeft).toBe('40px');
      expect(firstLine.style.textIndent).toBe('');

      const bodyLine = lines[1] as HTMLElement;
      expect(bodyLine.style.paddingLeft).toBe('40px');
    });

    it('should handle firstLine indent without hanging', () => {
      const { para, measure } = createMultiLineParagraph({
        left: 20,
        firstLine: 15,
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-firstline-only',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // First line: paddingLeft = left (20px), textIndent = firstLine - hanging = 15 - 0 = 15px
      const firstLine = lines[0] as HTMLElement;
      expect(firstLine.style.paddingLeft).toBe('20px');
      expect(firstLine.style.textIndent).toBe('15px');

      // Body line: paddingLeft = left (20px), no hanging
      const bodyLine = lines[1] as HTMLElement;
      expect(bodyLine.style.paddingLeft).toBe('20px');
    });

    it('should apply right indent to all lines', () => {
      const { para, measure } = createMultiLineParagraph({
        left: 20,
        hanging: 30,
        right: 15,
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-right-indent',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // Both lines should have right padding
      const firstLine = lines[0] as HTMLElement;
      expect(firstLine.style.paddingRight).toBe('15px');

      const bodyLine = lines[1] as HTMLElement;
      expect(bodyLine.style.paddingRight).toBe('15px');
    });

    it('should not apply textIndent when firstLineOffset is zero', () => {
      const { para, measure } = createMultiLineParagraph({
        left: 20,
        hanging: 0,
        firstLine: 0,
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-zero-offset',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // First line should not have textIndent when offset is 0
      const firstLine = lines[0] as HTMLElement;
      expect(firstLine.style.textIndent).toBe('');
    });

    it('should handle partial rendering starting from body line', () => {
      const { para, measure } = createMultiLineParagraph({
        left: 20,
        hanging: 30,
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-partial',
        blocks: [para],
        attrs: {},
      };

      // Render only the second line (skip first line)
      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        fromLine: 1,
        toLine: 2,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // When starting from line 1 (body line), it should get body line treatment
      // paddingLeft = left = 20px
      const renderedLine = lines[0] as HTMLElement;
      expect(renderedLine.style.paddingLeft).toBe('20px');
      expect(renderedLine.style.textIndent).toBe('');
    });

    it('should handle negative hanging indent', () => {
      const { para, measure } = createMultiLineParagraph({
        left: 40,
        hanging: -20,
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-negative-hanging',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // First line: paddingLeft = left (40px), textIndent = firstLine - hanging = 0 - (-20) = 20px
      const firstLine = lines[0] as HTMLElement;
      expect(firstLine.style.paddingLeft).toBe('40px');
      expect(firstLine.style.textIndent).toBe('20px');

      // Body lines: negative hanging is ignored, only left indent applies
      // paddingLeft = left (40px) since hanging <= 0
      const bodyLine = lines[1] as HTMLElement;
      expect(bodyLine.style.paddingLeft).toBe('40px');
      expect(bodyLine.style.textIndent).toBe('');
    });

    it('should handle negative left indent', () => {
      const { para, measure } = createMultiLineParagraph({
        left: -15,
        hanging: 20,
      });

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 150,
        height: 60,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-negative-left',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      const contentElement = cellElement.firstElementChild as HTMLElement;
      const paraWrapper = contentElement.firstElementChild as HTMLElement;
      const lines = paraWrapper.children;

      // First line: negative leftIndent means no paddingLeft is applied (leftIndent > 0 check fails)
      // textIndent = firstLine - hanging = 0 - 20 = -20px
      const firstLine = lines[0] as HTMLElement;
      expect(firstLine.style.paddingLeft).toBe('');
      expect(firstLine.style.textIndent).toBe('-20px');

      // Body lines: negative leftIndent + positive hanging
      // PaddingLeft not applied because left indent is negative
      const bodyLine = lines[1] as HTMLElement;
      expect(bodyLine.style.paddingLeft).toBe('');
      expect(bodyLine.style.textIndent).toBe('');
    });
  });

  describe('renderDrawingContent callback', () => {
    it('should render ShapeGroup drawing blocks via callback', () => {
      const shapeGroupBlock = {
        kind: 'drawing' as const,
        id: 'drawing-1',
        drawingKind: 'shapeGroup' as const,
        geometry: { width: 200, height: 150, rotation: 0, flipH: false, flipV: false },
        shapes: [
          {
            shapeType: 'image',
            attrs: {
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              src: 'data:image/png;base64,test',
            },
          },
        ],
      };

      const drawingMeasure = {
        kind: 'drawing' as const,
        width: 200,
        height: 150,
      };

      const cellMeasure = {
        blocks: [drawingMeasure],
        width: 220,
        height: 170,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell = {
        id: 'cell-with-shapegroup',
        blocks: [shapeGroupBlock],
        attrs: {},
      };

      const mockRenderDrawingContent = (block: any): HTMLElement => {
        const div = doc.createElement('div');
        div.classList.add('mock-shapegroup');
        div.setAttribute('data-drawing-id', block.id);
        div.setAttribute('data-drawing-kind', block.drawingKind);
        return div;
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        renderDrawingContent: mockRenderDrawingContent,
      });

      const shapeGroupEl = cellElement.querySelector('.mock-shapegroup') as HTMLElement;
      expect(shapeGroupEl).toBeTruthy();
      expect(shapeGroupEl.getAttribute('data-drawing-id')).toBe('drawing-1');
      expect(shapeGroupEl.getAttribute('data-drawing-kind')).toBe('shapeGroup');
      expect(shapeGroupEl.style.width).toBe('100%');
      expect(shapeGroupEl.style.height).toBe('100%');
    });

    it('should render VectorShape drawing blocks via callback', () => {
      const vectorShapeBlock = {
        kind: 'drawing' as const,
        id: 'drawing-2',
        drawingKind: 'vectorShape' as const,
        geometry: { width: 100, height: 100, rotation: 0, flipH: false, flipV: false },
        shapeKind: 'rect' as const,
      };

      const drawingMeasure = {
        kind: 'drawing' as const,
        width: 100,
        height: 100,
      };

      const cellMeasure = {
        blocks: [drawingMeasure],
        width: 120,
        height: 120,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell = {
        id: 'cell-with-vectorshape',
        blocks: [vectorShapeBlock],
        attrs: {},
      };

      const mockRenderDrawingContent = (block: any): HTMLElement => {
        const div = doc.createElement('div');
        div.classList.add('mock-vectorshape');
        div.setAttribute('data-shape-kind', block.shapeKind);
        return div;
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        renderDrawingContent: mockRenderDrawingContent,
      });

      const vectorShapeEl = cellElement.querySelector('.mock-vectorshape') as HTMLElement;
      expect(vectorShapeEl).toBeTruthy();
      expect(vectorShapeEl.getAttribute('data-shape-kind')).toBe('rect');
      expect(vectorShapeEl.style.width).toBe('100%');
      expect(vectorShapeEl.style.height).toBe('100%');
    });

    it('should use placeholder fallback when callback is undefined', () => {
      const shapeGroupBlock = {
        kind: 'drawing' as const,
        id: 'drawing-3',
        drawingKind: 'shapeGroup' as const,
        geometry: { width: 200, height: 150, rotation: 0, flipH: false, flipV: false },
        shapes: [],
      };

      const drawingMeasure = {
        kind: 'drawing' as const,
        width: 200,
        height: 150,
      };

      const cellMeasure = {
        blocks: [drawingMeasure],
        width: 220,
        height: 170,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell = {
        id: 'cell-no-callback',
        blocks: [shapeGroupBlock],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        // renderDrawingContent is undefined
      });

      // Should render placeholder with diagonal stripes pattern
      const drawingWrapper = cellElement.querySelector('.superdoc-table-drawing') as HTMLElement;
      expect(drawingWrapper).toBeTruthy();

      const placeholder = drawingWrapper.firstChild as HTMLElement;
      expect(placeholder).toBeTruthy();
      expect(placeholder.classList.contains('superdoc-drawing-placeholder')).toBe(true);
      expect(placeholder.style.border).toContain('dashed');
    });

    it('should pass correct DrawingBlock parameter to callback', () => {
      const shapeGroupBlock = {
        kind: 'drawing' as const,
        id: 'drawing-4',
        drawingKind: 'shapeGroup' as const,
        geometry: { width: 300, height: 200, rotation: 45, flipH: true, flipV: false },
        shapes: [{ shapeType: 'image', attrs: { x: 0, y: 0, width: 100, height: 100, src: 'test.png' } }],
      };

      const drawingMeasure = {
        kind: 'drawing' as const,
        width: 300,
        height: 200,
      };

      const cellMeasure = {
        blocks: [drawingMeasure],
        width: 320,
        height: 220,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell = {
        id: 'cell-verify-params',
        blocks: [shapeGroupBlock],
        attrs: {},
      };

      let capturedBlock: any = null;

      const mockRenderDrawingContent = (block: any): HTMLElement => {
        capturedBlock = block;
        return doc.createElement('div');
      };

      renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        renderDrawingContent: mockRenderDrawingContent,
      });

      // Verify the callback received the correct block
      expect(capturedBlock).toBeTruthy();
      expect(capturedBlock.kind).toBe('drawing');
      expect(capturedBlock.id).toBe('drawing-4');
      expect(capturedBlock.drawingKind).toBe('shapeGroup');
      expect(capturedBlock.geometry.width).toBe(300);
      expect(capturedBlock.geometry.height).toBe(200);
      expect(capturedBlock.geometry.rotation).toBe(45);
      expect(capturedBlock.geometry.flipH).toBe(true);
      expect(capturedBlock.shapes.length).toBe(1);
    });

    it('should apply width and height styles to returned element', () => {
      const vectorShapeBlock = {
        kind: 'drawing' as const,
        id: 'drawing-5',
        drawingKind: 'vectorShape' as const,
        geometry: { width: 150, height: 100, rotation: 0, flipH: false, flipV: false },
        shapeKind: 'ellipse' as const,
      };

      const drawingMeasure = {
        kind: 'drawing' as const,
        width: 150,
        height: 100,
      };

      const cellMeasure = {
        blocks: [drawingMeasure],
        width: 170,
        height: 120,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell = {
        id: 'cell-verify-styles',
        blocks: [vectorShapeBlock],
        attrs: {},
      };

      const mockRenderDrawingContent = (block: any): HTMLElement => {
        const div = doc.createElement('div');
        div.classList.add('test-drawing-element');
        // Initially has no width/height styles
        return div;
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        renderDrawingContent: mockRenderDrawingContent,
      });

      const drawingEl = cellElement.querySelector('.test-drawing-element') as HTMLElement;
      expect(drawingEl).toBeTruthy();

      // Verify that width and height styles were applied by renderTableCell
      expect(drawingEl.style.width).toBe('100%');
      expect(drawingEl.style.height).toBe('100%');
    });
  });

  describe('SDT container styling in cells', () => {
    it('should set overflow:visible when cell contains SDT container (structuredContent block)', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-sdt',
        runs: [{ text: 'SDT content', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          sdt: {
            type: 'structuredContent',
            scope: 'block',
            id: 'sdt-1',
            alias: 'Test Block',
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 11,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-sdt-container',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      // Cell should have overflow:visible to allow SDT labels to extend outside
      expect(cellElement.style.overflow).toBe('visible');
    });

    it('should set overflow:visible when cell contains documentSection SDT', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-doc-section',
        runs: [{ text: 'Section content', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          sdt: {
            type: 'documentSection',
            id: 'section-1',
            title: 'My Section',
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 15,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-doc-section',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      expect(cellElement.style.overflow).toBe('visible');
    });

    it('should keep overflow:hidden when no SDT container is present', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-no-sdt',
        runs: [{ text: 'Regular paragraph', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {},
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 17,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-no-sdt',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      // Cell should maintain default overflow:hidden
      expect(cellElement.style.overflow).toBe('hidden');
    });

    it('should not apply SDT container styling when block SDT matches tableSdt', () => {
      const tableSdt = {
        type: 'structuredContent' as const,
        scope: 'block' as const,
        id: 'table-sdt',
        alias: 'Table Container',
      };

      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-same-sdt',
        runs: [{ text: 'Content in table SDT', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          sdt: tableSdt, // Same reference as tableSdt
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 20,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-table-sdt',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
        tableSdt, // Pass the same SDT as the table level
      });

      // Cell should keep overflow:hidden because block SDT matches tableSdt
      // (no duplicate container styling needed)
      expect(cellElement.style.overflow).toBe('hidden');
    });

    it('should keep overflow:hidden for inline scope structuredContent (not a block container)', () => {
      const para: ParagraphBlock = {
        kind: 'paragraph',
        id: 'para-inline-sdt',
        runs: [{ text: 'Inline SDT content', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          sdt: {
            type: 'structuredContent',
            scope: 'inline', // inline scope, not block
            id: 'inline-sdt-1',
            alias: 'Inline Field',
          },
        },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 18,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const cellMeasure: TableCellMeasure = {
        blocks: [measure],
        width: 120,
        height: 40,
        gridColumnStart: 0,
        colSpan: 1,
        rowSpan: 1,
      };

      const cell: TableCell = {
        id: 'cell-inline-sdt',
        blocks: [para],
        attrs: {},
      };

      const { cellElement } = renderTableCell({
        ...createBaseDeps(),
        cellMeasure,
        cell,
      });

      // Inline SDTs don't get container styling, so overflow stays hidden
      expect(cellElement.style.overflow).toBe('hidden');
    });
  });
});
