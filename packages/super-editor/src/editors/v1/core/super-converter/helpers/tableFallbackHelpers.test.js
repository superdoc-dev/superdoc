// @ts-check
import { describe, expect, it, vi } from 'vitest';

// These unit tests use a 20:1 twips:px mock so the arithmetic stays round.
vi.mock('@core/super-converter/helpers.js', () => ({
  twipsToPixels: vi.fn((value) => (typeof value === 'number' ? value / 20 : null)),
  pixelsToTwips: vi.fn((value) => (typeof value === 'number' ? Math.round(value * 20) : 0)),
}));

vi.mock('../v3/handlers/w/tblGrid/tblGrid-helpers.js', () => ({
  DEFAULT_COLUMN_WIDTH_PX: 24,
  getSchemaDefaultColumnWidthPx: vi.fn(() => 24),
}));

import {
  DEFAULT_CONTENT_WIDTH_TWIPS,
  buildFallbackGridForTable,
  countColumnsInRow,
  getRawRowGridMetadata,
} from './tableFallbackHelpers.js';

const createCell = (gridSpan = 1) => ({
  name: 'w:tc',
  elements:
    gridSpan > 1
      ? [
          {
            name: 'w:tcPr',
            elements: [{ name: 'w:gridSpan', attributes: { 'w:val': String(gridSpan) } }],
          },
        ]
      : [],
});

const createRow = ({ gridBefore = 0, gridAfter = 0, wBefore, wAfter, cellSpans = [1] } = {}) => {
  const trPrElements = [];
  if (gridBefore > 0) {
    trPrElements.push({ name: 'w:gridBefore', attributes: { 'w:val': String(gridBefore) } });
  }
  if (gridAfter > 0) {
    trPrElements.push({ name: 'w:gridAfter', attributes: { 'w:val': String(gridAfter) } });
  }
  if (wBefore) {
    trPrElements.push({ name: 'w:wBefore', attributes: { 'w:w': String(wBefore.value), 'w:type': wBefore.type } });
  }
  if (wAfter) {
    trPrElements.push({ name: 'w:wAfter', attributes: { 'w:w': String(wAfter.value), 'w:type': wAfter.type } });
  }

  return {
    name: 'w:tr',
    elements: [
      ...(trPrElements.length > 0 ? [{ name: 'w:trPr', elements: trPrElements }] : []),
      ...cellSpans.map((span) => createCell(span)),
    ],
  };
};

describe('tableFallbackHelpers', () => {
  it('counts logical columns from row skips and cell spans', () => {
    const row = createRow({ gridBefore: 1, gridAfter: 2, cellSpans: [1, 3] });

    expect(countColumnsInRow(row)).toBe(7);
    expect(getRawRowGridMetadata(row)).toEqual({
      gridBefore: 1,
      gridAfter: 2,
      wBefore: null,
      wAfter: null,
    });
  });

  it('builds a fallback grid that preserves leading skipped columns', () => {
    const fallback = buildFallbackGridForTable({
      params: {},
      rows: [createRow({ gridBefore: 2, cellSpans: [1] })],
      tableWidth: { width: 180 },
    });

    expect(fallback).not.toBeNull();
    expect(fallback.grid).toHaveLength(3);
    expect(fallback.columnWidths).toHaveLength(3);
  });

  it('builds a fallback grid that preserves trailing skipped columns', () => {
    const fallback = buildFallbackGridForTable({
      params: {},
      rows: [createRow({ gridAfter: 2, cellSpans: [1] })],
      tableWidth: { width: 180 },
    });

    expect(fallback).not.toBeNull();
    expect(fallback.grid).toHaveLength(3);
    expect(fallback.columnWidths).toHaveLength(3);
  });

  it('uses multi-span cells when deriving logical column count without tblGrid', () => {
    const fallback = buildFallbackGridForTable({
      params: {},
      rows: [createRow({ cellSpans: [3] })],
      tableWidth: { width: 180 },
    });

    expect(fallback).not.toBeNull();
    expect(fallback.grid).toHaveLength(3);
    expect(fallback.columnWidths).toHaveLength(3);
  });

  it('defaults to full text extent when no explicit table width exists', () => {
    const fallback = buildFallbackGridForTable({
      params: {},
      rows: [createRow({ cellSpans: [2] })],
    });

    expect(fallback).not.toBeNull();
    expect(fallback.grid.reduce((sum, column) => sum + column.col, 0)).toBe(DEFAULT_CONTENT_WIDTH_TWIPS);
  });

  it('seeds skipped columns from wBefore and wAfter widths when present', () => {
    const fallback = buildFallbackGridForTable({
      params: {},
      rows: [
        createRow({
          gridBefore: 1,
          gridAfter: 2,
          wBefore: { value: 1440, type: 'dxa' },
          wAfter: { value: 2880, type: 'dxa' },
          cellSpans: [1],
        }),
      ],
      tableWidth: { width: 240 },
    });

    expect(fallback).not.toBeNull();
    expect(fallback.grid.map((column) => column.col)).toEqual([1440, 480, 1440, 1440]);
    expect(fallback.columnWidths).toEqual([72, 24, 72, 72]);
  });

  it('uses the widest skipped-column seeds across irregular multi-row fallback input', () => {
    const fallback = buildFallbackGridForTable({
      params: {},
      rows: [
        createRow({
          gridBefore: 1,
          wBefore: { value: 720, type: 'dxa' },
          cellSpans: [2],
        }),
        createRow({
          gridAfter: 2,
          wAfter: { value: 2880, type: 'dxa' },
          cellSpans: [1],
        }),
        createRow({
          gridBefore: 1,
          wBefore: { value: 1440, type: 'dxa' },
          gridAfter: 1,
          wAfter: { value: 960, type: 'dxa' },
          cellSpans: [1, 1],
        }),
      ],
      tableWidth: { width: 360 },
    });

    expect(fallback).not.toBeNull();
    expect(fallback.grid.map((column) => column.col)).toEqual([1440, 2880, 1440, 1440]);
    expect(fallback.columnWidths).toEqual([72, 144, 72, 72]);
  });
});
