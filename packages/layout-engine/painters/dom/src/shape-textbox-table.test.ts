import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resolveLayout } from '@superdoc/layout-resolved';
import { createDomPainter } from './index.js';
import type { FlowBlock, Layout, Measure, TableBlock, TableMeasure, VectorShapeDrawing } from '@superdoc/contracts';

describe('shape textbox table tabs', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  it('renders tab runs inside textbox table cells', () => {
    const tableBlock: TableBlock = {
      kind: 'table',
      id: 'textbox-table',
      rows: [
        {
          id: 'row-1',
          cells: [
            {
              id: 'cell-1',
              blocks: [
                {
                  kind: 'paragraph',
                  id: 'para-1',
                  runs: [
                    { kind: 'tab', text: '\t', width: 48, fontFamily: 'Arial', fontSize: 12 },
                    { text: 'Right text', fontFamily: 'Arial', fontSize: 12 },
                  ],
                  attrs: {
                    tabs: [{ val: 'left', pos: 1420 }],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const tableMeasure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          height: 24,
          cells: [
            {
              width: 200,
              height: 24,
              blocks: [
                {
                  kind: 'paragraph',
                  lines: [
                    {
                      fromRun: 0,
                      fromChar: 0,
                      toRun: 1,
                      toChar: 10,
                      width: 180,
                      ascent: 10,
                      descent: 2,
                      lineHeight: 14,
                      segments: [
                        { runIndex: 0, fromChar: 0, toChar: 0, width: 48, x: 0 },
                        { runIndex: 1, fromChar: 0, toChar: 10, width: 80, x: 48 },
                      ],
                    },
                  ],
                  totalHeight: 14,
                },
              ],
              gridColumnStart: 0,
              colSpan: 1,
              rowSpan: 1,
            },
          ],
        },
      ],
      columnWidths: [200],
      totalWidth: 200,
      totalHeight: 24,
    };

    const vectorShapeBlock = {
      kind: 'drawing',
      id: 'shape-textbox',
      drawingKind: 'vectorShape',
      geometry: { width: 220, height: 80, rotation: 0, flipH: false, flipV: false },
      shapeKind: 'rect',
      textContent: {
        parts: [
          {
            kind: 'table',
            text: '',
            tableBlock,
            tableMeasure,
          },
        ],
      },
      textAlign: 'left',
    } as FlowBlock & VectorShapeDrawing;

    const vectorShapeMeasure: Measure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: 220,
      height: 80,
      scale: 1,
      naturalWidth: 220,
      naturalHeight: 80,
      geometry: { width: 220, height: 80, rotation: 0, flipH: false, flipV: false },
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'drawing',
              drawingKind: 'vectorShape',
              blockId: 'shape-textbox',
              x: 10,
              y: 10,
              width: 220,
              height: 80,
              geometry: { width: 220, height: 80, rotation: 0, flipH: false, flipV: false },
              scale: 1,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({});
    const resolvedLayout = resolveLayout({
      layout,
      flowMode: 'paginated',
      blocks: [vectorShapeBlock],
      measures: [vectorShapeMeasure],
    });
    painter.paint({ layout, resolvedLayout, blocks: [vectorShapeBlock], measures: [vectorShapeMeasure] }, mount);

    const lineEl = mount.querySelector('.superdoc-vector-shape .superdoc-line') as HTMLElement | null;
    expect(lineEl).toBeTruthy();
    const textSpan = lineEl?.querySelector('span:not([style*="visibility: hidden"])') as HTMLElement | null;
    expect(textSpan?.textContent).toBe('Right text');
    expect(parseFloat(textSpan?.style.left ?? '0')).toBeGreaterThan(0);
  });

  it('renders top-level tab parts in textbox content', () => {
    const vectorShapeBlock = {
      kind: 'drawing',
      id: 'shape-textbox-tabs',
      drawingKind: 'vectorShape',
      geometry: { width: 220, height: 40, rotation: 0, flipH: false, flipV: false },
      shapeKind: 'rect',
      textContent: {
        parts: [
          { kind: 'tab', text: '', formatting: { fontSize: 12 } },
          { text: 'Aligned', formatting: { fontSize: 12 } },
        ],
      },
      textAlign: 'left',
    } as FlowBlock & VectorShapeDrawing;

    const vectorShapeMeasure: Measure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: 220,
      height: 40,
      scale: 1,
      naturalWidth: 220,
      naturalHeight: 40,
      geometry: { width: 220, height: 40, rotation: 0, flipH: false, flipV: false },
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'drawing',
              drawingKind: 'vectorShape',
              blockId: 'shape-textbox-tabs',
              x: 10,
              y: 10,
              width: 220,
              height: 40,
              geometry: { width: 220, height: 40, rotation: 0, flipH: false, flipV: false },
              scale: 1,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({});
    const resolvedLayout = resolveLayout({
      layout,
      flowMode: 'paginated',
      blocks: [vectorShapeBlock],
      measures: [vectorShapeMeasure],
    });
    painter.paint({ layout, resolvedLayout, blocks: [vectorShapeBlock], measures: [vectorShapeMeasure] }, mount);

    const tabEl = mount.querySelector('.superdoc-vector-shape .superdoc-tab') as HTMLElement | null;
    expect(tabEl).toBeTruthy();
    expect(parseFloat(tabEl?.style.width ?? '0')).toBeGreaterThan(0);
    expect(mount.textContent).toContain('Aligned');
  });
});
