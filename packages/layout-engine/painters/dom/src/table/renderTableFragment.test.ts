/**
 * Tests for table fragment rendering and metadata embedding
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderTableFragment } from './renderTableFragment.js';
import type {
  TableBlock,
  TableFragment,
  TableMeasure,
  BlockId,
  TableColumnBoundary,
  TableRowBoundary,
  ParagraphBlock,
  SdtMetadata,
} from '@superdoc/contracts';
import type { FragmentRenderContext } from '../renderer.js';

/**
 * Create a minimal table block for testing
 */
function createTestTableBlock(): TableBlock {
  return {
    kind: 'table',
    id: 'test-table-1' as BlockId,
    rows: [
      {
        id: 'row-1' as BlockId,
        cells: [
          {
            id: 'cell-1-1' as BlockId,
            paragraph: {
              kind: 'paragraph',
              id: 'para-1-1' as BlockId,
              runs: [],
            },
          },
        ],
      },
    ],
  };
}

/**
 * Create a minimal table measure
 */
function createTestTableMeasure(): TableMeasure {
  return {
    kind: 'table',
    rows: [
      {
        cells: [
          {
            paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
            width: 100,
            height: 20,
          },
        ],
        height: 20,
      },
    ],
    columnWidths: [100],
    totalWidth: 100,
    totalHeight: 20,
  };
}

/**
 * Create a test table fragment with metadata
 */
function createTestTableFragment(
  columnBoundaries?: TableColumnBoundary[],
  rowBoundaries?: TableRowBoundary[],
): TableFragment {
  return {
    kind: 'table',
    blockId: 'test-table-1' as BlockId,
    fromRow: 0,
    toRow: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    metadata: columnBoundaries
      ? {
          columnBoundaries,
          ...(rowBoundaries ? { rowBoundaries } : {}),
          coordinateSystem: 'fragment',
        }
      : undefined,
  };
}

describe('renderTableFragment', () => {
  let doc: Document;
  let context: FragmentRenderContext;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('test');
    context = {
      sectionIndex: 0,
      pageIndex: 0,
      columnIndex: 0,
    };
  });

  it('writes PM range attributes on the table fragment wrapper', () => {
    const fragment = {
      ...createTestTableFragment(),
      pmStart: 12,
      pmEnd: 34,
    };
    const measure = createTestTableMeasure();

    const element = renderTableFragment({
      doc,
      fragment,
      context,
      block: createTestTableBlock(),
      measure,
      cellSpacingPx: 0,
      effectiveColumnWidths: measure.columnWidths,
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {
        // The table renderer owns PM range metadata for table wrappers.
      },
      applySdtDataset: () => {
        // Not relevant to this metadata test.
      },
      applyStyles: () => {
        // Not relevant to this metadata test.
      },
    });

    expect(element.dataset.pmStart).toBe('12');
    expect(element.dataset.pmEnd).toBe('34');
  });

  it('renders a nested table SDT own label when the parent boundary label is suppressed', () => {
    const parentSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'parent-sdt',
      alias: 'Parent',
    };
    const childSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'child-sdt',
      alias: 'Child',
    };
    const block = createTestTableBlock();
    block.attrs = {
      sdt: childSdt,
      containerSdt: parentSdt,
    };
    const measure = createTestTableMeasure();

    const element = renderTableFragment({
      doc,
      fragment: createTestTableFragment(),
      context,
      block,
      measure,
      cellSpacingPx: 0,
      effectiveColumnWidths: measure.columnWidths,
      sdtBoundary: {
        isStart: false,
        isEnd: true,
        showLabel: false,
        ownIsStart: true,
        ownIsEnd: true,
        ownShowLabel: true,
        ownIsNested: true,
      },
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {
        // Intentionally empty for test mock
      },
      applySdtDataset: () => {
        // Intentionally empty for test mock
      },
      applyStyles: () => {
        // Intentionally empty for test mock
      },
    });

    expect(element.dataset.sdtContainerShowLabel).toBe('true');
    expect(element.querySelector('.superdoc-structured-content-block__label')?.textContent).toBe('Child');
  });

  it('applies outer left/right borders in separate mode even when cellSpacing is unset or zero', () => {
    const block = createTestTableBlock();
    block.attrs = {
      borderCollapse: 'separate',
      borders: {
        left: { style: 'single', width: 2, color: '#ff0000' },
        right: { style: 'single', width: 3, color: '#0000ff' },
      },
    };

    const element = renderTableFragment({
      doc,
      fragment: createTestTableFragment(),
      context,
      block,
      measure: createTestTableMeasure(),
      cellSpacingPx: 0,
      effectiveColumnWidths: [100],
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {
        // Intentionally empty for test mock
      },
      applySdtDataset: () => {
        // Intentionally empty for test mock
      },
      applyStyles: () => {
        // Intentionally empty for test mock
      },
    });

    expect(element.style.borderLeftWidth).toBe('2px');
    expect(element.style.borderRightWidth).toBe('3px');
  });

  // SD-3308 review: in separate-borders mode a COMPOUND table border (triple/thinThick*)
  // is painted by the nested-rectangle outline/middle-grid overlay. The container's CSS
  // border keeps its band WIDTH (separate-mode gap geometry) but its color must be
  // transparent on compound sides, or applyBorder's solid band renders a filled slab
  // under the overlay rules. A plain single border stays painted normally.
  it('makes the separate-mode container border transparent on compound sides (no solid slab)', () => {
    const block = createTestTableBlock();
    block.attrs = {
      borderCollapse: 'separate',
      borders: {
        top: { style: 'triple', width: 2, color: '#000000' }, // compound -> transparent
        left: { style: 'single', width: 2, color: '#ff0000' }, // plain -> stays painted
      },
    };

    const element = renderTableFragment({
      doc,
      fragment: createTestTableFragment(),
      context,
      block,
      measure: createTestTableMeasure(),
      cellSpacingPx: 6,
      effectiveColumnWidths: [100],
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {},
      applySdtDataset: () => {},
      applyStyles: () => {},
    });

    // compound top: width kept (band), color transparent so the overlay rules are the only paint
    expect(element.style.borderTopWidth).not.toBe('');
    expect(element.style.borderTopColor).toBe('transparent');
    // plain single left: normal solid paint, not transparent
    expect(element.style.borderLeftStyle).toBe('solid');
    expect(element.style.borderLeftColor).not.toBe('transparent');
    // the compound overlay still paints the frame rules
    expect(element.querySelector('.superdoc-compound-border-outline')).not.toBeNull();
  });

  // SD-3028: a table-level `double` is NOT a multi-rule overlay style — it renders via the
  // boundary cells' native CSS `border-style: double` (two equal rules). The fragment outline
  // and the separate-mode transparent treatment must skip it, or a third rule stacks on top.
  it('does not draw the compound outline for a table-level double (native cells render it)', () => {
    const block = createTestTableBlock();
    block.attrs = {
      borders: {
        top: { style: 'double', width: 2, color: '#000000' },
        bottom: { style: 'double', width: 2, color: '#000000' },
        left: { style: 'double', width: 2, color: '#000000' },
        right: { style: 'double', width: 2, color: '#000000' },
      },
    };

    const element = renderTableFragment({
      doc,
      fragment: createTestTableFragment(),
      context,
      block,
      measure: createTestTableMeasure(),
      cellSpacingPx: 0,
      effectiveColumnWidths: [100],
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {},
      applySdtDataset: () => {},
      applyStyles: () => {},
    });

    // No compound outline / mid-grid / per-cell rects for a plain double.
    expect(element.querySelector('.superdoc-compound-border-outline')).toBeNull();
    expect(element.querySelector('.superdoc-compound-border-midring')).toBeNull();
    expect(element.querySelectorAll('.superdoc-compound-border-rect').length).toBe(0);
    // The boundary cell carries a real, visible double border (not transparent-ized).
    const cell = element.querySelector('div[style*="border"]') as HTMLElement | null;
    expect(cell).not.toBeNull();
    expect(cell!.style.borderTopStyle === 'double' || cell!.style.borderBottomStyle === 'double').toBe(true);
  });

  // SD-3308: Word paints the MIDDLE rule of table-level 3-rule bands as a continuous
  // grid (measured: the divider's middle rule runs unbroken through the row band and
  // meets the boundary band's middle ring). The fragment paints one ring inset by
  // outer rule + gap plus full-length center strips per interior gridline.
  it('paints a continuous middle grid for table-level triple borders', () => {
    const para = (id: string): ParagraphBlock => ({ kind: 'paragraph', id: id as BlockId, runs: [] });
    const block: TableBlock = {
      kind: 'table',
      id: 'triple-grid' as BlockId,
      attrs: {
        borders: {
          top: { style: 'triple', width: 2, color: '#000000' },
          bottom: { style: 'triple', width: 2, color: '#000000' },
          left: { style: 'triple', width: 2, color: '#000000' },
          right: { style: 'triple', width: 2, color: '#000000' },
          insideH: { style: 'triple', width: 2, color: '#000000' },
          insideV: { style: 'triple', width: 2, color: '#000000' },
        },
      },
      rows: [
        {
          id: 'r0' as BlockId,
          cells: [
            { id: 'c00' as BlockId, blocks: [para('p00')] },
            { id: 'c01' as BlockId, blocks: [para('p01')] },
          ],
        },
        {
          id: 'r1' as BlockId,
          cells: [
            { id: 'c10' as BlockId, blocks: [para('p10')] },
            { id: 'c11' as BlockId, blocks: [para('p11')] },
          ],
        },
      ],
    };
    const cellMeasure = {
      blocks: [{ kind: 'paragraph' as const, lines: [], totalHeight: 20 }],
      width: 100,
      height: 20,
    };
    const measure: TableMeasure = {
      kind: 'table',
      rows: [
        { cells: [cellMeasure, cellMeasure], height: 20 },
        { cells: [cellMeasure, cellMeasure], height: 20 },
      ],
      columnWidths: [100, 100],
      totalWidth: 200,
      totalHeight: 40,
    };
    const fragment: TableFragment = {
      kind: 'table',
      blockId: 'triple-grid' as BlockId,
      fromRow: 0,
      toRow: 2,
      x: 0,
      y: 0,
      width: 200,
      height: 40,
    };

    const element = renderTableFragment({
      doc,
      fragment,
      context,
      block,
      measure,
      cellSpacingPx: 0,
      effectiveColumnWidths: measure.columnWidths,
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {},
      applySdtDataset: () => {},
      applyStyles: () => {},
    });

    // Per-cell mids are suppressed (table-level provides the grid).
    expect(element.querySelectorAll('.superdoc-compound-border-mid').length).toBe(0);

    // Ring inset by outer rule + gap = 4, borders 2px.
    const ring = element.querySelector('.superdoc-compound-border-midring') as HTMLElement;
    expect(ring).toBeTruthy();
    expect(ring.style.left).toBe('4px');
    expect(ring.style.top).toBe('4px');
    expect(ring.style.borderTop).toMatch(/2px solid/);
    expect(ring.style.borderLeft).toMatch(/2px solid/);

    // Interior vertical center strip: centered on the gridline (x=100), spanning
    // between the ring's middle rules (continuous through the row band).
    const verticals = [...element.querySelectorAll('.superdoc-compound-border-midv')] as HTMLElement[];
    expect(verticals.length).toBe(1);
    expect(verticals[0].style.left).toBe('99px');
    expect(verticals[0].style.width).toBe('2px');
    expect(verticals[0].style.top).toBe('4px');
    expect(verticals[0].style.height).toBe(`${40 - 8}px`);

    // Interior horizontal center strip: at row boundary + midOffset, full width
    // between the ring's middle rules.
    const horizontals = [...element.querySelectorAll('.superdoc-compound-border-midh')] as HTMLElement[];
    expect(horizontals.length).toBe(1);
    expect(horizontals[0].style.top).toBe('24px');
    expect(horizontals[0].style.height).toBe('2px');
    expect(horizontals[0].style.left).toBe('4px');
    expect(horizontals[0].style.width).toBe(`${200 - 8}px`);
  });

  it('suppresses child chrome when table containerSdt shares id-less metadata', () => {
    const sharedSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      alias: 'Shared Container',
    };
    const block: TableBlock = {
      kind: 'table',
      id: 'container-sdt-table' as BlockId,
      attrs: {
        containerSdt: sharedSdt,
      },
      rows: [
        {
          id: 'container-sdt-row' as BlockId,
          cells: [
            {
              id: 'container-sdt-cell' as BlockId,
              blocks: [
                {
                  kind: 'paragraph',
                  id: 'container-sdt-para' as BlockId,
                  runs: [{ text: 'Shared', fontFamily: 'Arial', fontSize: 16 }],
                  attrs: {
                    containerSdt: sharedSdt,
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const measure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          cells: [
            {
              blocks: [
                {
                  kind: 'paragraph',
                  lines: [
                    {
                      fromRun: 0,
                      fromChar: 0,
                      toRun: 0,
                      toChar: 6,
                      width: 60,
                      ascent: 12,
                      descent: 4,
                      lineHeight: 20,
                    },
                  ],
                  totalHeight: 20,
                },
              ],
              width: 100,
              height: 20,
              gridColumnStart: 0,
              colSpan: 1,
              rowSpan: 1,
            },
          ],
          height: 20,
        },
      ],
      columnWidths: [100],
      totalWidth: 100,
      totalHeight: 20,
    };

    const element = renderTableFragment({
      doc,
      fragment: createTestTableFragment(),
      context,
      block,
      measure,
      cellSpacingPx: 0,
      effectiveColumnWidths: measure.columnWidths,
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {},
      applySdtDataset: () => {},
      applyStyles: (el, styles) => Object.assign(el.style, styles),
    });

    const chromeElements = [
      ...(element.classList.contains('superdoc-structured-content-block') ? [element] : []),
      ...Array.from(element.querySelectorAll('.superdoc-structured-content-block')),
    ];
    expect(chromeElements).toHaveLength(1);
  });

  it('preserves keyed ancestor suppression through an id-less table SDT', () => {
    const idlessTableSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      alias: 'Idless Table',
    };
    const outerSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'outer-sdt',
      alias: 'Outer',
    };
    const block: TableBlock = {
      kind: 'table',
      id: 'idless-nested-table' as BlockId,
      attrs: {
        sdt: idlessTableSdt,
      },
      rows: [
        {
          id: 'idless-nested-row' as BlockId,
          cells: [
            {
              id: 'idless-nested-cell' as BlockId,
              blocks: [
                {
                  kind: 'paragraph',
                  id: 'idless-nested-para' as BlockId,
                  runs: [{ text: 'Nested', fontFamily: 'Arial', fontSize: 16 }],
                  attrs: {
                    containerSdt: outerSdt,
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const measure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          cells: [
            {
              blocks: [
                {
                  kind: 'paragraph',
                  lines: [
                    {
                      fromRun: 0,
                      fromChar: 0,
                      toRun: 0,
                      toChar: 6,
                      width: 60,
                      ascent: 12,
                      descent: 4,
                      lineHeight: 20,
                    },
                  ],
                  totalHeight: 20,
                },
              ],
              width: 100,
              height: 20,
              gridColumnStart: 0,
              colSpan: 1,
              rowSpan: 1,
            },
          ],
          height: 20,
        },
      ],
      columnWidths: [100],
      totalWidth: 100,
      totalHeight: 20,
    };

    const element = renderTableFragment({
      doc,
      fragment: createTestTableFragment(),
      context,
      block,
      measure,
      cellSpacingPx: 0,
      effectiveColumnWidths: measure.columnWidths,
      ancestorContainerKey: 'structuredContent:outer-sdt',
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {},
      applySdtDataset: () => {},
      applyStyles: (el, styles) => Object.assign(el.style, styles),
    });

    const chromeElements = [
      ...(element.classList.contains('superdoc-structured-content-block') ? [element] : []),
      ...Array.from(element.querySelectorAll('.superdoc-structured-content-block')),
    ];
    expect(chromeElements).toHaveLength(1);
    expect(chromeElements[0].querySelector('.superdoc-structured-content__label')?.textContent).toBe('Idless Table');
  });

  it('omits the table SDT label but keeps the wrapper when chrome is none', () => {
    const block = createTestTableBlock();
    block.attrs = {
      sdt: {
        type: 'structuredContent',
        scope: 'block',
        id: 'table-sdt-none',
        alias: 'Table Control',
      },
    };

    const element = renderTableFragment({
      doc,
      fragment: createTestTableFragment(),
      context,
      block,
      measure: createTestTableMeasure(),
      cellSpacingPx: 0,
      effectiveColumnWidths: [100],
      chrome: 'none',
      renderLine: () => doc.createElement('div'),
      applyFragmentFrame: () => {},
      applySdtDataset: () => {},
      applyStyles: (el, styles) => Object.assign(el.style, styles),
    });

    const chromeElements = [
      ...(element.classList.contains('superdoc-structured-content-block') ? [element] : []),
      ...Array.from(element.querySelectorAll('.superdoc-structured-content-block')),
    ];
    // Wrapper is still produced (proves the SDT path ran; host/custom UI and
    // the geometry APIs depend on it)...
    expect(chromeElements.length).toBeGreaterThanOrEqual(1);
    // ...but the built-in label is not emitted under chrome: 'none'.
    expect(element.querySelector('.superdoc-structured-content__label')).toBeFalsy();
  });

  describe('merged-cell border ownership', () => {
    it('renders the outer right border for a merged header cell in collapsed mode', () => {
      const block: TableBlock = {
        kind: 'table',
        id: 'merged-border-table' as BlockId,
        attrs: {
          borders: {
            top: { style: 'single', width: 2, color: '#000000' },
            right: { style: 'single', width: 2, color: '#000000' },
            bottom: { style: 'single', width: 2, color: '#000000' },
            left: { style: 'single', width: 2, color: '#000000' },
            insideH: { style: 'single', width: 1, color: '#333333' },
            insideV: { style: 'single', width: 1, color: '#333333' },
          },
        },
        rows: [
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1' as BlockId,
                colSpan: 2,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              {
                id: 'cell-2-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-1' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-2-2' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-2' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 200,
                height: 20,
                gridColumnStart: 0,
                colSpan: 2,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 40,
      };

      const fragment: TableFragment = {
        kind: 'table',
        blockId: block.id,
        fromRow: 0,
        toRow: 2,
        x: 0,
        y: 0,
        width: 200,
        height: 40,
      };

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const mergedHeaderCell = element.children[0] as HTMLElement;
      expect(mergedHeaderCell.style.borderRightWidth).toBe('2px');
      expect(mergedHeaderCell.style.borderRightStyle).toBe('solid');
    });
  });

  describe('metadata embedding', () => {
    it('should embed metadata in data-table-boundaries attribute', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [{ index: 0, x: 0, width: 100, minWidth: 25, resizable: true }];
      const fragment = createTestTableFragment(columnBoundaries);

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.columns).toBeDefined();
      expect(parsed.columns).toHaveLength(1);
      expect(parsed.columns[0]).toMatchObject({
        i: 0,
        x: 0,
        w: 100,
        min: 25,
        r: 1,
      });
    });

    // Build a one-row measure whose single cell occupies only column 0, leaving
    // the last grid column as an empty trailing gridAfter spacer.
    const spacerMeasure = (spacerWidth: number): TableMeasure => ({
      kind: 'table',
      rows: [
        {
          cells: [
            {
              paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
              width: 100,
              height: 20,
              gridColumnStart: 0,
              colSpan: 1,
            },
          ],
          height: 20,
        },
      ],
      columnWidths: [100, spacerWidth],
      totalWidth: 100 + spacerWidth,
      totalHeight: 20,
    });

    const renderSpacerTable = (spacerWidth: number): Element =>
      renderTableFragment({
        doc,
        fragment: createTestTableFragment([
          { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
          { index: 1, x: 100, width: spacerWidth, minWidth: 25, resizable: true },
        ]),
        context,
        block: createTestTableBlock(),
        measure: spacerMeasure(spacerWidth),
        cellSpacingPx: 0,
        effectiveColumnWidths: [100, spacerWidth],
        renderLine: () => doc.createElement('div'),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
        applyStyles: () => {},
      });

    it('omits the resize boundary for a degenerate trailing gridAfter spacer column (SD-3345)', () => {
      // Spacer is narrower than its own min width → degenerate → its left-edge
      // resize boundary is suppressed so it does not crowd the table-edge handle.
      const parsed = JSON.parse(renderSpacerTable(7).getAttribute('data-table-boundaries')!);
      expect(parsed.segments[1]).toEqual([]);
    });

    it('keeps the resize boundary for a normal-width trailing column (control)', () => {
      // Same shape but the trailing column meets its min width → not degenerate →
      // the boundary is kept. Proves the suppression is gated on degeneracy.
      const parsed = JSON.parse(renderSpacerTable(40).getAttribute('data-table-boundaries')!);
      expect(parsed.segments[1].length).toBeGreaterThan(0);
    });

    it('should embed row boundary metadata when rowBoundaries are present', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [{ index: 0, x: 0, width: 100, minWidth: 25, resizable: true }];
      const rowBoundaries: TableRowBoundary[] = [{ index: 0, y: 0, height: 20, minHeight: 10, resizable: true }];
      const fragment = createTestTableFragment(columnBoundaries, rowBoundaries);

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0]).toMatchObject({
        i: 0,
        y: 0,
        h: 20,
        min: 10,
        r: 1,
      });
    });

    it('should apply contentTop offset to row boundary y positions', () => {
      const block = createTestTableBlock();
      block.attrs = {
        borderCollapse: 'separate',
        borders: {
          top: { size: 2, color: '#000000', val: 'single' },
          right: { size: 2, color: '#000000', val: 'single' },
          bottom: { size: 2, color: '#000000', val: 'single' },
          left: { size: 2, color: '#000000', val: 'single' },
        },
      };

      const measure = createTestTableMeasure();
      measure.tableBorderWidths = { top: 2, right: 2, bottom: 2, left: 2 };

      const columnBoundaries: TableColumnBoundary[] = [{ index: 0, x: 0, width: 100, minWidth: 25, resizable: true }];
      const rowBoundaries: TableRowBoundary[] = [{ index: 0, y: 3, height: 20, minHeight: 10, resizable: false }];
      const fragment = createTestTableFragment(columnBoundaries, rowBoundaries);

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0]).toMatchObject({
        i: 0,
        y: 5, // row y (3) + contentTop (2)
        h: 20,
        min: 10,
        r: 0,
      });
    });

    it('should produce valid JSON serialization', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 150, minWidth: 30, resizable: true },
      ];
      const fragment = createTestTableFragment(columnBoundaries);

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      // Should not throw when parsing
      expect(() => JSON.parse(metadataAttr!)).not.toThrow();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.columns).toHaveLength(2);
    });

    it('should handle missing metadata gracefully', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment(); // No metadata

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      // Should not crash
      expect(element).toBeDefined();
      // Should not have data-table-boundaries attribute
      expect(element.getAttribute('data-table-boundaries')).toBeNull();
    });

    it('should handle empty columnBoundaries array', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment([]);

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.columns).toHaveLength(0);
    });

    it('should correctly map resizable flag to binary', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 150, minWidth: 30, resizable: false },
      ];
      const fragment = createTestTableFragment(columnBoundaries);

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      const parsed = JSON.parse(metadataAttr!);

      // First column: resizable: true -> r: 1
      expect(parsed.columns[0].r).toBe(1);
      // Second column: resizable: false -> r: 0
      expect(parsed.columns[1].r).toBe(0);
    });

    it('should embed block ID in data-sd-block-id attribute', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment();

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.getAttribute('data-sd-block-id')).toBe('test-table-1');
    });

    it('should add superdoc-table-fragment class', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment();

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.classList.contains('superdoc-table-fragment')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return placeholder when doc is not available', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment();

      // Spy on console.error to verify logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Intentionally empty - suppress console output during tests
      });

      const element = renderTableFragment({
        doc: null as unknown as Document, // Simulate missing doc
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.classList.contains('superdoc-error-placeholder')).toBe(true);
      expect(element.textContent).toContain('Document not available');

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith('DomPainter: document is not available');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('metadata format', () => {
    it('should use compact property names (i, x, w, min, r)', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [{ index: 0, x: 50, width: 100, minWidth: 25, resizable: true }];
      const fragment = createTestTableFragment(columnBoundaries);

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      const parsed = JSON.parse(metadataAttr!);

      // Should use compact names
      expect(parsed.columns[0]).toHaveProperty('i');
      expect(parsed.columns[0]).toHaveProperty('x');
      expect(parsed.columns[0]).toHaveProperty('w');
      expect(parsed.columns[0]).toHaveProperty('min');
      expect(parsed.columns[0]).toHaveProperty('r');

      // Should not use long names
      expect(parsed.columns[0]).not.toHaveProperty('index');
      expect(parsed.columns[0]).not.toHaveProperty('width');
      expect(parsed.columns[0]).not.toHaveProperty('minWidth');
      expect(parsed.columns[0]).not.toHaveProperty('resizable');
    });

    it('should preserve numeric precision', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 123.456, width: 789.012, minWidth: 25.5, resizable: true },
      ];
      const fragment = createTestTableFragment(columnBoundaries);

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      const parsed = JSON.parse(metadataAttr!);

      expect(parsed.columns[0].x).toBe(123.456);
      expect(parsed.columns[0].w).toBe(789.012);
      expect(parsed.columns[0].min).toBe(25.5);
    });
  });

  describe('cell width rescaling (SD-1859)', () => {
    it('should use fragment.columnWidths for cell widths when present', () => {
      // Simulates a mixed-orientation doc: table measured at landscape width (432px per col)
      // but rendered in portrait where fragment.columnWidths rescales to 312px per col.
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-1' as BlockId,
        rows: [
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-1' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-1-2' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-2' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 432,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 432,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [432, 432],
        totalWidth: 864,
        totalHeight: 20,
      };

      // Fragment with rescaled column widths (portrait: 624px total)
      const fragment: TableFragment = {
        kind: 'table',
        blockId: 'test-table-1' as BlockId,
        fromRow: 0,
        toRow: 1,
        x: 0,
        y: 0,
        width: 624,
        height: 20,
        columnWidths: [312, 312], // rescaled from [432, 432]
      };

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: fragment.columnWidths ?? measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
        applyStyles: () => {},
      });

      // Find rendered cell elements (absolutely positioned divs inside container)
      const cells = element.querySelectorAll<HTMLElement>('div[style*="position: absolute"]');
      expect(cells.length).toBeGreaterThanOrEqual(2);

      // Cell 1: should be at x=0, width=312 (not 432)
      const cell1 = cells[0];
      expect(cell1.style.left).toBe('0px');
      expect(cell1.style.width).toBe('312px');

      // Cell 2: should be at x=312, width=312 (not 432)
      const cell2 = cells[1];
      expect(cell2.style.left).toBe('312px');
      expect(cell2.style.width).toBe('312px');
    });

    it('should fall back to cellMeasure.width when fragment.columnWidths is absent', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      // Fragment without columnWidths — should use measure.columnWidths
      const fragment: TableFragment = {
        kind: 'table',
        blockId: 'test-table-1' as BlockId,
        fromRow: 0,
        toRow: 1,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        // no columnWidths
      };

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: fragment.columnWidths ?? measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
        applyStyles: () => {},
      });

      const cells = element.querySelectorAll<HTMLElement>('div[style*="position: absolute"]');
      expect(cells.length).toBeGreaterThanOrEqual(1);

      // Should use measure.columnWidths[0] = 100
      expect(cells[0].style.width).toBe('100px');
    });
  });

  describe('boundary segment logic', () => {
    it('should create segments for cells with varying rowspan', () => {
      // Create a table with mixed rowspans:
      // Row 0: [Cell(colspan=1, rowspan=2), Cell(colspan=1, rowspan=1)]
      // Row 1: [Cell(colspan=1, rowspan=1)] (only one cell due to rowspan above)
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-segments' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              {
                id: 'cell-0-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-0' as BlockId,
                  runs: [],
                },
                attrs: { colspan: 1, rowspan: 2 },
              },
              {
                id: 'cell-0-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-1' as BlockId,
                  runs: [],
                },
                attrs: { colspan: 1, rowspan: 1 },
              },
            ],
          },
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-1' as BlockId,
                  runs: [],
                },
                attrs: { colspan: 1, rowspan: 1 },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 40,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 2,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 40,
      };

      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 100, minWidth: 25, resizable: true },
      ];

      const fragment = createTestTableFragment(columnBoundaries);
      fragment.fromRow = 0;
      fragment.toRow = 2;

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.segments).toBeDefined();
      expect(Array.isArray(parsed.segments)).toBe(true);

      // Column 0 should have no segments at boundary (it's the left edge)
      // Column 1 should have segments where cells end at column 1
      expect(parsed.segments[1]).toBeDefined();
      expect(Array.isArray(parsed.segments[1])).toBe(true);
    });

    it('should handle cells spanning multiple rows with boundary detection', () => {
      // Table with a cell spanning 3 rows in first column
      // This means column boundary 1 exists only in rows where column 1 has actual cells
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-rowspan' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              {
                id: 'cell-0-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-0' as BlockId,
                  runs: [],
                },
                attrs: { colspan: 1, rowspan: 3 },
              },
              {
                id: 'cell-0-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              {
                id: 'cell-2-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 60,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 3,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 60,
      };

      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 100, minWidth: 25, resizable: true },
      ];

      const fragment = createTestTableFragment(columnBoundaries);
      fragment.fromRow = 0;
      fragment.toRow = 3;

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.segments).toBeDefined();

      // Verify segments exist for column 1 (where cells actually end)
      expect(parsed.segments[1]).toBeDefined();
      expect(Array.isArray(parsed.segments[1])).toBe(true);
      expect(parsed.segments[1].length).toBeGreaterThan(0);
    });

    it('should handle empty rows gracefully', () => {
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-empty' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              {
                id: 'cell-0-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-0' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          // Empty row - no cells
          {
            id: 'row-1' as BlockId,
            cells: [],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              {
                id: 'cell-2-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-0' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100],
        totalWidth: 100,
        totalHeight: 60,
      };

      const columnBoundaries: TableColumnBoundary[] = [{ index: 0, x: 0, width: 100, minWidth: 25, resizable: true }];

      const fragment = createTestTableFragment(columnBoundaries);
      fragment.fromRow = 0;
      fragment.toRow = 3;

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      // Should not crash with empty row
      expect(element).toBeDefined();
      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();
    });

    it('should properly merge adjacent segments', () => {
      // Table where boundary exists in consecutive rows - should merge into single segment
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-merge' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              {
                id: 'cell-0-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-0' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-0-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-0' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-1-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              {
                id: 'cell-2-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-0' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-2-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 60,
      };

      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 100, minWidth: 25, resizable: true },
      ];

      const fragment = createTestTableFragment(columnBoundaries);
      fragment.fromRow = 0;
      fragment.toRow = 3;

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.segments).toBeDefined();

      // Column 1 boundary should exist in all three rows
      // Should be merged into a single segment
      expect(parsed.segments[1]).toBeDefined();
      expect(Array.isArray(parsed.segments[1])).toBe(true);

      // Verify that segments are being created
      // Since all rows have the boundary at column 1, it should merge into fewer segments
      const col1Segments = parsed.segments[1];
      expect(col1Segments.length).toBeGreaterThan(0);

      // Each segment should have c (column), y (position), h (height)
      col1Segments.forEach((seg: { c: number; y: number; h: number }) => {
        expect(seg).toHaveProperty('c');
        expect(seg).toHaveProperty('y');
        expect(seg).toHaveProperty('h');
        expect(typeof seg.y).toBe('number');
        expect(typeof seg.h).toBe('number');
      });
    });

    it('should scope segments to fragment row range for split tables', () => {
      // A 3-row table split across two pages:
      // Fragment 1 (page 1): rows 0-1, height 60
      // Fragment 2 (page 2): row 2, height 30
      // Each fragment should only have segments matching its own rows.
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-split' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              { id: 'cell-0-0' as BlockId, paragraph: { kind: 'paragraph', id: 'p-0-0' as BlockId, runs: [] } },
              { id: 'cell-0-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-0-1' as BlockId, runs: [] } },
            ],
          },
          {
            id: 'row-1' as BlockId,
            cells: [
              { id: 'cell-1-0' as BlockId, paragraph: { kind: 'paragraph', id: 'p-1-0' as BlockId, runs: [] } },
              { id: 'cell-1-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-1-1' as BlockId, runs: [] } },
            ],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              { id: 'cell-2-0' as BlockId, paragraph: { kind: 'paragraph', id: 'p-2-0' as BlockId, runs: [] } },
              { id: 'cell-2-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-2-1' as BlockId, runs: [] } },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 0,
                colSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 1,
                colSpan: 1,
              },
            ],
            height: 30,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 0,
                colSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 1,
                colSpan: 1,
              },
            ],
            height: 30,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 0,
                colSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 1,
                colSpan: 1,
              },
            ],
            height: 30,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 90,
      };

      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 100, minWidth: 25, resizable: true },
      ];

      const renderDeps = {
        doc,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: (_block: ParagraphBlock, _line: unknown, _ctx: unknown, _lineIndex: number, _isLastLine: boolean) =>
          doc.createElement('div'),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
        applyStyles: () => {},
      };

      // Fragment 1: rows 0-1 (height = 60)
      const fragment1: TableFragment = {
        kind: 'table',
        blockId: 'test-table-split' as BlockId,
        fromRow: 0,
        toRow: 2,
        x: 0,
        y: 0,
        width: 200,
        height: 60,
        continuesOnNext: true,
        metadata: { columnBoundaries, coordinateSystem: 'fragment' },
      };

      const el1 = renderTableFragment({ ...renderDeps, fragment: fragment1 });
      const parsed1 = JSON.parse(el1.getAttribute('data-table-boundaries')!);

      // Fragment 1 has 2 rows of height 30 each → segment height should be 60
      expect(parsed1.segments[1]).toHaveLength(1);
      expect(parsed1.segments[1][0].h).toBe(60);
      expect(parsed1.segments[1][0].y).toBe(0);

      // Fragment 2: row 2 only (height = 30)
      const fragment2: TableFragment = {
        kind: 'table',
        blockId: 'test-table-split' as BlockId,
        fromRow: 2,
        toRow: 3,
        x: 0,
        y: 0,
        width: 200,
        height: 30,
        continuesFromPrev: true,
        metadata: { columnBoundaries, coordinateSystem: 'fragment' },
      };

      const el2 = renderTableFragment({ ...renderDeps, fragment: fragment2 });
      const parsed2 = JSON.parse(el2.getAttribute('data-table-boundaries')!);

      // Fragment 2 has 1 row of height 30 → segment height should be 30
      expect(parsed2.segments[1]).toHaveLength(1);
      expect(parsed2.segments[1][0].h).toBe(30);
      expect(parsed2.segments[1][0].y).toBe(0);
    });
  });

  describe('RTL table (bidiVisual)', () => {
    it('mirrors ghost cell x positions for RTL tables with rowspan continuations', () => {
      // 2-column RTL table where col 0 has rowSpan=2.
      // Fragment 2 continues from fragment 1, so col 0 becomes a ghost cell.
      const block: TableBlock = {
        kind: 'table',
        id: 'rtl-ghost-table' as BlockId,
        attrs: {
          tableProperties: { rightToLeft: true },
          borders: {
            top: { style: 'single', width: 1, color: '#000' },
            bottom: { style: 'single', width: 1, color: '#000' },
            insideH: { style: 'single', width: 1, color: '#000' },
            insideV: { style: 'single', width: 1, color: '#000' },
          },
        },
        rows: [
          {
            id: 'row-1' as BlockId,
            cells: [
              { id: 'c-1-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-1-1' as BlockId, runs: [] } },
              { id: 'c-1-2' as BlockId, paragraph: { kind: 'paragraph', id: 'p-1-2' as BlockId, runs: [] } },
            ],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              { id: 'c-2-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-2-1' as BlockId, runs: [] } },
              { id: 'c-2-2' as BlockId, paragraph: { kind: 'paragraph', id: 'p-2-2' as BlockId, runs: [] } },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              { width: 100, height: 20, gridColumnStart: 0, colSpan: 1, rowSpan: 2 },
              { width: 200, height: 20, gridColumnStart: 1, colSpan: 1, rowSpan: 1 },
            ],
            height: 20,
          },
          {
            cells: [{ width: 200, height: 20, gridColumnStart: 1, colSpan: 1, rowSpan: 1 }],
            height: 20,
          },
        ],
        columnWidths: [100, 200],
        totalWidth: 300,
        totalHeight: 40,
      };

      // Fragment 2: continuation from row 1 (only row 1 body, ghost for col 0)
      const fragment: TableFragment = {
        kind: 'table',
        blockId: 'rtl-ghost-table' as BlockId,
        fromRow: 1,
        toRow: 2,
        continuesFromPrev: true,
        x: 0,
        y: 0,
        width: 300,
        height: 20,
      };

      const el = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: () => doc.createElement('div'),
        applyStyles: (e, s) => Object.assign(e.style, s),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
      });

      // Ghost cell for col 0 (rowSpan=2, width=100) should be mirrored.
      // In LTR: ghostX=0. In RTL: ghostX = 300 - 0 - 100 = 200.
      const ghostCells = Array.from(el.querySelectorAll('div')).filter(
        (d) => d.style.position === 'absolute' && d.style.overflow === 'hidden' && d.childElementCount === 0,
      );

      expect(ghostCells.length).toBeGreaterThanOrEqual(1);
      const ghostLeft = parseFloat(ghostCells[0].style.left);
      // Ghost should be on the right side (x=200), not left (x=0)
      expect(ghostLeft).toBe(200);
    });

    it('passes isRtl to renderTableRow for body rows', () => {
      const block: TableBlock = {
        kind: 'table',
        id: 'rtl-pass-table' as BlockId,
        attrs: { tableProperties: { rightToLeft: true } },
        rows: [
          {
            id: 'row-1' as BlockId,
            cells: [
              { id: 'c-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-1' as BlockId, runs: [] } },
              { id: 'c-2' as BlockId, paragraph: { kind: 'paragraph', id: 'p-2' as BlockId, runs: [] } },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              { width: 100, height: 20, gridColumnStart: 0, colSpan: 1, rowSpan: 1 },
              { width: 100, height: 20, gridColumnStart: 1, colSpan: 1, rowSpan: 1 },
            ],
            height: 20,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 20,
      };

      const fragment: TableFragment = {
        kind: 'table',
        blockId: 'rtl-pass-table' as BlockId,
        fromRow: 0,
        toRow: 1,
        x: 0,
        y: 0,
        width: 200,
        height: 20,
      };

      const el = renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: () => doc.createElement('div'),
        applyStyles: (e, s) => Object.assign(e.style, s),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
      });

      // Cells should be mirrored: col 0 at x=100, col 1 at x=0
      const cells = Array.from(el.querySelectorAll('div')).filter(
        (d) => d.style.position === 'absolute' && d.style.width === '100px',
      );

      const positions = cells.map((c) => parseFloat(c.style.left)).sort((a, b) => a - b);
      expect(positions).toEqual([0, 100]);
    });
  });

  describe('interior row boundary gap strips (SD-3028)', () => {
    // Word paints the boundary between two rows as ONE continuous line across the UNION of
    // both rows' extents (300dpi probes: gridBefore/gridAfter slivers render with insideH).
    // Cells below own their own span; segments with a cell above but none below get a strip.
    const para = (id: string) => ({ kind: 'paragraph' as const, id: id as BlockId, runs: [] });
    const measuredCell = (gridColumnStart: number, colSpan: number, width: number, rowSpan = 1) => ({
      paragraph: { kind: 'paragraph' as const, lines: [], totalHeight: 20 },
      width,
      height: 20,
      gridColumnStart,
      colSpan,
      rowSpan,
    });
    const fragmentFor = (block: TableBlock, width: number, height: number, toRow: number): TableFragment => ({
      kind: 'table',
      blockId: block.id,
      fromRow: 0,
      toRow,
      x: 0,
      y: 0,
      width,
      height,
    });
    const render = (block: TableBlock, measure: TableMeasure, fragment: TableFragment) =>
      renderTableFragment({
        doc,
        fragment,
        context,
        block,
        measure,
        cellSpacingPx: 0,
        effectiveColumnWidths: measure.columnWidths,
        renderLine: () => doc.createElement('div'),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
        applyStyles: () => {},
      });
    const gapStrips = (el: HTMLElement): HTMLElement[] =>
      Array.from(el.querySelectorAll('.superdoc-row-boundary-gap')) as HTMLElement[];

    it('paints insideH strips over gridBefore/gridAfter slivers of a narrower row (SD-1513)', () => {
      // Grid [20, 100, 15]: row 0 spans all three columns; row 1 covers only col 1.
      const block: TableBlock = {
        kind: 'table',
        id: 'gap-table' as BlockId,
        attrs: {
          borders: {
            top: { style: 'single', width: 1, color: '#000000' },
            bottom: { style: 'single', width: 1, color: '#000000' },
            left: { style: 'single', width: 1, color: '#000000' },
            right: { style: 'single', width: 1, color: '#000000' },
            insideH: { style: 'single', width: 1, color: '#FF0000' },
            insideV: { style: 'single', width: 1, color: '#FF00FF' },
          },
        },
        rows: [
          { id: 'r0' as BlockId, cells: [{ id: 'c0' as BlockId, colSpan: 3, paragraph: para('p0') }] },
          { id: 'r1' as BlockId, cells: [{ id: 'c1' as BlockId, paragraph: para('p1') }] },
        ],
      };
      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          { cells: [measuredCell(0, 3, 135)], height: 20 },
          { cells: [measuredCell(1, 1, 100)], height: 20 },
        ],
        columnWidths: [20, 100, 15],
        totalWidth: 135,
        totalHeight: 40,
      };
      const el = render(block, measure, fragmentFor(block, 135, 40, 2));

      const strips = gapStrips(el);
      expect(strips.length).toBe(2);
      const lefts = strips.map((s) => parseFloat(s.style.left)).sort((a, b) => a - b);
      const widths = strips.map((s) => parseFloat(s.style.width)).sort((a, b) => a - b);
      expect(lefts).toEqual([0, 120]);
      expect(widths).toEqual([15, 20]);
      for (const strip of strips) {
        expect(strip.style.top).toBe('20px');
        expect(strip.style.borderTopStyle).toBe('solid');
        expect(strip.style.borderTopColor.toLowerCase()).toBe('#ff0000');
      }
      // The wide cell above must NOT paint its own interior bottom (the strip + the cell
      // below own the boundary); painting it too would double the line.
      const aboveCell = el.children[0] as HTMLElement;
      expect(aboveCell.style.borderBottomWidth).toBe('');
    });

    it('paints the uncovered span with the above cell own bottom border when there are no table borders (SD-3345 callout)', () => {
      // The 23_notification shape: a full-width callout cell with its own borders above a
      // narrower row (gridAfter). The strip closes the bottom-right corner in the callout color.
      const blue = { style: 'single' as const, width: 1, color: '#342D8C' };
      const block: TableBlock = {
        kind: 'table',
        id: 'callout-table' as BlockId,
        rows: [
          {
            id: 'r0' as BlockId,
            cells: [
              {
                id: 'callout' as BlockId,
                colSpan: 2,
                attrs: { borders: { top: blue, left: blue, right: blue, bottom: blue } },
                paragraph: para('p0'),
              },
            ],
          },
          { id: 'r1' as BlockId, cells: [{ id: 'opt' as BlockId, paragraph: para('p1') }] },
        ],
      };
      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          { cells: [measuredCell(0, 2, 200)], height: 20 },
          { cells: [measuredCell(0, 1, 100)], height: 20 },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 40,
      };
      const el = render(block, measure, fragmentFor(block, 200, 40, 2));

      const strips = gapStrips(el);
      expect(strips.length).toBe(1);
      expect(strips[0].style.left).toBe('100px');
      expect(strips[0].style.width).toBe('100px');
      expect(strips[0].style.top).toBe('20px');
      expect(strips[0].style.borderTopColor.toLowerCase()).toBe('#342d8c');
      // The callout does not also paint its interior bottom (single line, no doubling).
      const callout = el.children[0] as HTMLElement;
      expect(callout.style.borderBottomWidth).toBe('');
    });

    it('does not paint a strip inside a rowspan crossing the boundary', () => {
      const block: TableBlock = {
        kind: 'table',
        id: 'span-table' as BlockId,
        attrs: {
          borders: {
            insideH: { style: 'single', width: 1, color: '#FF0000' },
          },
        },
        rows: [
          {
            id: 'r0' as BlockId,
            cells: [
              { id: 'tall' as BlockId, rowSpan: 2, paragraph: para('p0') },
              { id: 'top' as BlockId, paragraph: para('p1') },
            ],
          },
          { id: 'r1' as BlockId, cells: [{ id: 'under' as BlockId, paragraph: para('p2') }] },
        ],
      };
      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          { cells: [measuredCell(0, 1, 100, 2), measuredCell(1, 1, 100)], height: 20 },
          { cells: [measuredCell(1, 1, 100)], height: 20 },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 40,
      };
      const el = render(block, measure, fragmentFor(block, 200, 40, 2));

      // Col 0 is a vMerge (no edge), col 1 is covered below (the cell paints its own top).
      expect(gapStrips(el).length).toBe(0);
    });

    it('mirrors strip positions for RTL tables', () => {
      const block: TableBlock = {
        kind: 'table',
        id: 'rtl-gap-table' as BlockId,
        attrs: {
          tableProperties: { rightToLeft: true },
          borders: {
            insideH: { style: 'single', width: 1, color: '#FF0000' },
          },
        },
        rows: [
          { id: 'r0' as BlockId, cells: [{ id: 'c0' as BlockId, colSpan: 2, paragraph: para('p0') }] },
          { id: 'r1' as BlockId, cells: [{ id: 'c1' as BlockId, paragraph: para('p1') }] },
        ],
      };
      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          { cells: [measuredCell(0, 2, 150)], height: 20 },
          { cells: [measuredCell(0, 1, 100)], height: 20 },
        ],
        columnWidths: [100, 50],
        totalWidth: 150,
        totalHeight: 40,
      };
      const el = render(block, measure, fragmentFor(block, 150, 40, 2));

      const strips = gapStrips(el);
      expect(strips.length).toBe(1);
      // Logical gap is cols [1,2) = x 100..150; mirrored: left = 150 - 100 - 50 = 0.
      expect(strips[0].style.left).toBe('0px');
      expect(strips[0].style.width).toBe('50px');
    });

    it('paints no strip when neither the above cell nor the table defines a border for the edge', () => {
      const block: TableBlock = {
        kind: 'table',
        id: 'borderless-gap-table' as BlockId,
        rows: [
          { id: 'r0' as BlockId, cells: [{ id: 'c0' as BlockId, colSpan: 2, paragraph: para('p0') }] },
          { id: 'r1' as BlockId, cells: [{ id: 'c1' as BlockId, paragraph: para('p1') }] },
        ],
      };
      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          { cells: [measuredCell(0, 2, 200)], height: 20 },
          { cells: [measuredCell(0, 1, 100)], height: 20 },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 40,
      };
      const el = render(block, measure, fragmentFor(block, 200, 40, 2));

      expect(gapStrips(el).length).toBe(0);
    });
  });
});
