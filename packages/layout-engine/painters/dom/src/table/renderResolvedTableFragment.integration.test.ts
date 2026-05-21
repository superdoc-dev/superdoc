import { describe, expect, it, vi } from 'vitest';
import type {
  DrawingBlock,
  DrawingMeasure,
  ResolvedTableItem,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '@superdoc/contracts';
import type { FragmentRenderContext } from '../renderer.js';
import { renderResolvedTableFragment } from './renderResolvedTableFragment.js';

describe('renderResolvedTableFragment integration', () => {
  it('resolves vector shape textbox PAGE fields through the table drawing callback path', () => {
    const doc = document.implementation.createHTMLDocument('table-fragment');
    const context: FragmentRenderContext = {
      section: 'body',
      pageIndex: 8,
      pageNumber: 9,
      pageNumberText: 'ix',
      totalPages: 12,
    };
    const drawingBlock: DrawingBlock = {
      kind: 'drawing',
      id: 'drawing-table-page-field',
      drawingKind: 'vectorShape',
      geometry: { width: 120, height: 60, rotation: 0, flipH: false, flipV: false },
      shapeKind: 'rect',
      fillColor: '#ffffff',
      strokeColor: '#000000',
      textContent: {
        parts: [{ text: 'Page ' }, { text: '', fieldType: 'PAGE' }],
      },
    } as DrawingBlock;
    const drawingMeasure: DrawingMeasure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: 120,
      height: 60,
      scale: 1,
      naturalWidth: 120,
      naturalHeight: 60,
      geometry: { width: 120, height: 60, rotation: 0, flipH: false, flipV: false },
    };
    const block: TableBlock = {
      kind: 'table',
      id: 'table-page-field',
      rows: [
        {
          id: 'row-page-field',
          cells: [{ id: 'cell-page-field', blocks: [drawingBlock], attrs: {} }],
          attrs: {},
        },
      ],
    };
    const measure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          height: 80,
          cells: [
            {
              width: 140,
              height: 80,
              gridColumnStart: 0,
              colSpan: 1,
              rowSpan: 1,
              blocks: [drawingMeasure],
            },
          ],
        },
      ],
      columnWidths: [140],
      totalWidth: 140,
      totalHeight: 80,
    };
    const fragment: TableFragment = {
      kind: 'table',
      blockId: block.id,
      fromRow: 0,
      toRow: 1,
      x: 0,
      y: 0,
      width: 140,
      height: 80,
    };
    const resolvedItem: ResolvedTableItem = {
      kind: 'fragment',
      fragmentKind: 'table',
      id: 'table:table-page-field:0:1',
      pageIndex: 8,
      x: 0,
      y: 0,
      width: 140,
      height: 80,
      blockId: block.id,
      fragment,
      fragmentIndex: 0,
      block,
      measure,
      cellSpacingPx: 0,
      effectiveColumnWidths: [140],
    };

    const el = renderResolvedTableFragment({
      doc,
      fragment,
      context,
      resolvedItem,
      renderLine: vi.fn(() => doc.createElement('span')),
      capturePaintSnapshotLine: vi.fn(),
      applyFragmentFrame: vi.fn(),
      applyResolvedFragmentFrame: vi.fn(),
      createErrorPlaceholder: vi.fn((blockId: string) => {
        const placeholder = doc.createElement('div');
        placeholder.textContent = `[Render Error: ${blockId}]`;
        return placeholder;
      }),
    });

    const shape = el.querySelector('.superdoc-vector-shape') as HTMLElement | null;
    expect(shape).toBeTruthy();
    expect(shape?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Page ix');
  });
});
