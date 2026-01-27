/**
 * Comprehensive tests for table border utility functions
 *
 * Tests cover:
 * - applyBorder: Border application to DOM elements (tests borderStyleToCSS and isValidHexColor indirectly)
 * - applyCellBorders: Multi-side border application
 * - borderValueToSpec: TableBorderValue to BorderSpec conversion
 * - resolveTableBorderValue: Border value resolution with fallbacks
 * - resolveTableCellBorders: Cell-specific border resolution based on position
 * - createTableBorderOverlay: Border overlay element creation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { BorderSpec, CellBorders, TableBorders, TableBorderValue, TableFragment } from '@superdoc/contracts';
import {
  applyBorder,
  applyCellBorders,
  borderValueToSpec,
  resolveTableBorderValue,
  resolveTableCellBorders,
  createTableBorderOverlay,
} from './border-utils.js';

describe('applyBorder', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  it('should apply border with single style (converts to solid)', () => {
    const border: BorderSpec = { style: 'single', width: 2, color: '#FF0000' };
    applyBorder(element, 'Top', border);
    // Browsers may normalize colors to rgb() format
    expect(element.style.borderTop).toMatch(/2px solid (#FF0000|rgb\(255,\s*0,\s*0\))/i);
  });

  it('should apply border with double style', () => {
    const border: BorderSpec = { style: 'double', width: 2, color: '#FF0000' };
    applyBorder(element, 'Top', border);
    expect(element.style.borderTop).toMatch(/2px double (#FF0000|rgb\(255,\s*0,\s*0\))/i);
  });

  it('should apply border with dashed style', () => {
    const border: BorderSpec = { style: 'dashed', width: 1, color: '#00FF00' };
    applyBorder(element, 'Top', border);
    expect(element.style.borderTop).toMatch(/1px dashed (#00FF00|rgb\(0,\s*255,\s*0\))/i);
  });

  it('should apply border with dotted style', () => {
    const border: BorderSpec = { style: 'dotted', width: 1, color: '#0000FF' };
    applyBorder(element, 'Top', border);
    expect(element.style.borderTop).toMatch(/1px dotted (#0000FF|rgb\(0,\s*0,\s*255\))/i);
  });

  it('should convert triple to solid CSS', () => {
    const border: BorderSpec = { style: 'triple', width: 2, color: '#FF0000' };
    applyBorder(element, 'Top', border);
    expect(element.style.borderTop).toMatch(/2px solid (#FF0000|rgb\(255,\s*0,\s*0\))/i);
  });

  it('should handle thick border with width multiplier', () => {
    const border: BorderSpec = { style: 'thick', width: 1, color: '#000000' };
    applyBorder(element, 'Top', border);
    // Thick borders use max(width * 2, 3)
    expect(element.style.borderTop).toMatch(/3px solid (#000000|rgb\(0,\s*0,\s*0\))/i);
  });

  it('should handle thick border with larger width', () => {
    const border: BorderSpec = { style: 'thick', width: 3, color: '#000000' };
    applyBorder(element, 'Top', border);
    expect(element.style.borderTop).toMatch(/6px solid (#000000|rgb\(0,\s*0,\s*0\))/i);
  });

  it('should set border to none for none style', () => {
    const border: BorderSpec = { style: 'none', width: 2, color: '#FF0000' };
    applyBorder(element, 'Top', border);
    // Setting border to 'none' results in empty string or 'none' depending on browser
    expect(
      ['', 'none', 'medium', '0px'].includes(element.style.borderTop) || /none/i.test(element.style.borderTop),
    ).toBe(true);
  });

  it('should set border to none for zero width', () => {
    const border: BorderSpec = { style: 'single', width: 0, color: '#FF0000' };
    applyBorder(element, 'Top', border);
    // Setting border to 'none' results in empty string or 'none' depending on browser
    expect(
      ['', 'none', 'medium', '0px'].includes(element.style.borderTop) || /none/i.test(element.style.borderTop),
    ).toBe(true);
  });

  it('should sanitize invalid hex color to black', () => {
    const border: BorderSpec = { style: 'single', width: 1, color: 'invalid' };
    applyBorder(element, 'Top', border);
    expect(element.style.borderTop).toMatch(/1px solid (#000000|rgb\(0,\s*0,\s*0\))/i);
  });

  it('should default width to 1 if missing', () => {
    const border: BorderSpec = { style: 'single', color: '#FF0000' };
    applyBorder(element, 'Top', border);
    expect(element.style.borderTop).toMatch(/1px solid (#FF0000|rgb\(255,\s*0,\s*0\))/i);
  });

  it('should default color to black if missing', () => {
    const border: BorderSpec = { style: 'single', width: 2 };
    applyBorder(element, 'Top', border);
    expect(element.style.borderTop).toMatch(/2px solid (#000000|rgb\(0,\s*0,\s*0\))/i);
  });

  it('should do nothing if border is undefined', () => {
    applyBorder(element, 'Top', undefined);
    expect(element.style.borderTop).toBe('');
  });

  it('should apply to all four sides', () => {
    const border: BorderSpec = { style: 'single', width: 1, color: '#FF0000' };
    applyBorder(element, 'Top', border);
    applyBorder(element, 'Right', border);
    applyBorder(element, 'Bottom', border);
    applyBorder(element, 'Left', border);
    const pattern = /1px solid (#FF0000|rgb\(255,\s*0,\s*0\))/i;
    expect(element.style.borderTop).toMatch(pattern);
    expect(element.style.borderRight).toMatch(pattern);
    expect(element.style.borderBottom).toMatch(pattern);
    expect(element.style.borderLeft).toMatch(pattern);
  });
});

describe('applyCellBorders', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  it('should apply borders to all four sides', () => {
    const borders: CellBorders = {
      top: { style: 'single', width: 1, color: '#FF0000' },
      right: { style: 'single', width: 2, color: '#00FF00' },
      bottom: { style: 'single', width: 3, color: '#0000FF' },
      left: { style: 'single', width: 4, color: '#FFFF00' },
    };
    applyCellBorders(element, borders);
    expect(element.style.borderTop).toMatch(/1px solid (#FF0000|rgb\(255,\s*0,\s*0\))/i);
    expect(element.style.borderRight).toMatch(/2px solid (#00FF00|rgb\(0,\s*255,\s*0\))/i);
    expect(element.style.borderBottom).toMatch(/3px solid (#0000FF|rgb\(0,\s*0,\s*255\))/i);
    expect(element.style.borderLeft).toMatch(/4px solid (#FFFF00|rgb\(255,\s*255,\s*0\))/i);
  });

  it('should handle partial border definitions', () => {
    const borders: CellBorders = {
      top: { style: 'single', width: 1, color: '#FF0000' },
      bottom: { style: 'single', width: 1, color: '#0000FF' },
    };
    applyCellBorders(element, borders);
    expect(element.style.borderTop).toMatch(/1px solid (#FF0000|rgb\(255,\s*0,\s*0\))/i);
    expect(element.style.borderBottom).toMatch(/1px solid (#0000FF|rgb\(0,\s*0,\s*255\))/i);
    expect(element.style.borderRight).toBe('');
    expect(element.style.borderLeft).toBe('');
  });

  it('should do nothing if borders is undefined', () => {
    applyCellBorders(element, undefined);
    expect(element.style.borderTop).toBe('');
    expect(element.style.borderRight).toBe('');
    expect(element.style.borderBottom).toBe('');
    expect(element.style.borderLeft).toBe('');
  });
});

describe('borderValueToSpec', () => {
  it('should return undefined for null', () => {
    expect(borderValueToSpec(null)).toBeUndefined();
  });

  it('should return undefined for undefined', () => {
    expect(borderValueToSpec(undefined)).toBeUndefined();
  });

  it('should convert {none: true} to none style', () => {
    const result = borderValueToSpec({ none: true });
    expect(result).toEqual({ style: 'none', width: 0 });
  });

  it('should convert complete TableBorderValue', () => {
    const value: TableBorderValue = { style: 'single', width: 2, color: '#FF0000', space: 1 };
    const result = borderValueToSpec(value);
    expect(result).toEqual({ style: 'single', width: 2, color: '#FF0000', space: 1 });
  });

  it('should handle size property (legacy)', () => {
    const value = { size: 4, color: '#00FF00' } as unknown as TableBorderValue;
    const result = borderValueToSpec(value);
    expect(result).toEqual({ style: 'single', width: 4, color: '#00FF00' });
  });

  it('should prefer width over size', () => {
    const value = { width: 3, size: 5, color: '#0000FF' } as unknown as TableBorderValue;
    const result = borderValueToSpec(value);
    expect(result).toEqual({ style: 'single', width: 3, color: '#0000FF' });
  });

  it('should default style to single', () => {
    const value = { width: 2, color: '#FF0000' } as unknown as TableBorderValue;
    const result = borderValueToSpec(value);
    expect(result).toEqual({ style: 'single', width: 2, color: '#FF0000' });
  });
});

describe('resolveTableBorderValue', () => {
  it('should return explicit border if provided', () => {
    const explicit: TableBorderValue = { style: 'double', width: 4, color: '#FF0000' };
    const fallback: TableBorderValue = { style: 'single', width: 1, color: '#000000' };
    const result = resolveTableBorderValue(explicit, fallback);
    expect(result).toEqual({ style: 'double', width: 4, color: '#FF0000' });
  });

  it('should use fallback if explicit is undefined', () => {
    const fallback: TableBorderValue = { style: 'single', width: 1, color: '#000000' };
    const result = resolveTableBorderValue(undefined, fallback);
    expect(result).toEqual({ style: 'single', width: 1, color: '#000000' });
  });

  it('should use fallback if explicit is null', () => {
    const fallback: TableBorderValue = { style: 'single', width: 1, color: '#000000' };
    const result = resolveTableBorderValue(null, fallback);
    expect(result).toEqual({ style: 'single', width: 1, color: '#000000' });
  });

  it('should return undefined if both are undefined', () => {
    expect(resolveTableBorderValue(undefined, undefined)).toBeUndefined();
  });

  it('should handle {none: true} in explicit', () => {
    const explicit: TableBorderValue = { none: true };
    const fallback: TableBorderValue = { style: 'single', width: 1, color: '#000000' };
    const result = resolveTableBorderValue(explicit, fallback);
    expect(result).toEqual({ style: 'none', width: 0 });
  });
});

describe('resolveTableCellBorders', () => {
  // Tests use single-owner border model: each cell owns TOP and LEFT,
  // only edge cells (last row/col) own BOTTOM and RIGHT
  const tableBorders: TableBorders = {
    top: { style: 'single', width: 2, color: '#FF0000' },
    right: { style: 'single', width: 2, color: '#00FF00' },
    bottom: { style: 'single', width: 2, color: '#0000FF' },
    left: { style: 'single', width: 2, color: '#FFFF00' },
    insideH: { style: 'single', width: 1, color: '#888888' },
    insideV: { style: 'single', width: 1, color: '#CCCCCC' },
  };

  it('should use top/left borders for top-left corner cell (no bottom/right)', () => {
    // Cell (0,0) in 3x3: owns top and left, but NOT bottom/right (those come from adjacent cells)
    const result = resolveTableCellBorders(tableBorders, 0, 0, 3, 3);
    expect(result.top).toEqual({ style: 'single', width: 2, color: '#FF0000' });
    expect(result.left).toEqual({ style: 'single', width: 2, color: '#FFFF00' });
    expect(result.bottom).toBeUndefined(); // Not last row
    expect(result.right).toBeUndefined(); // Not last col
  });

  it('should use bottom/right borders for bottom-right corner cell', () => {
    // Cell (2,2) in 3x3: is last row AND last col, so owns all four borders
    const result = resolveTableCellBorders(tableBorders, 2, 2, 3, 3);
    expect(result.bottom).toEqual({ style: 'single', width: 2, color: '#0000FF' });
    expect(result.right).toEqual({ style: 'single', width: 2, color: '#00FF00' });
    expect(result.top).toEqual({ style: 'single', width: 1, color: '#888888' });
    expect(result.left).toEqual({ style: 'single', width: 1, color: '#CCCCCC' });
  });

  it('should use insideH/insideV for middle cells (no bottom/right)', () => {
    // Cell (1,1) in 3x3: interior cell owns only top and left (insideH/insideV)
    const result = resolveTableCellBorders(tableBorders, 1, 1, 3, 3);
    expect(result.top).toEqual({ style: 'single', width: 1, color: '#888888' });
    expect(result.bottom).toBeUndefined(); // Not last row - bottom comes from cell below
    expect(result.left).toEqual({ style: 'single', width: 1, color: '#CCCCCC' });
    expect(result.right).toBeUndefined(); // Not last col - right comes from cell to the right
  });

  it('should handle single row table (has both top and bottom)', () => {
    // Cell in single row table: is both first AND last row
    const result = resolveTableCellBorders(tableBorders, 0, 1, 1, 3);
    expect(result.top).toEqual({ style: 'single', width: 2, color: '#FF0000' });
    expect(result.bottom).toEqual({ style: 'single', width: 2, color: '#0000FF' });
    // Middle column - no right border
    expect(result.right).toBeUndefined();
  });

  it('should handle single column table (has both left and right)', () => {
    // Cell in single column table: is both first AND last column
    const result = resolveTableCellBorders(tableBorders, 1, 0, 3, 1);
    expect(result.left).toEqual({ style: 'single', width: 2, color: '#FFFF00' });
    expect(result.right).toEqual({ style: 'single', width: 2, color: '#00FF00' });
    // Middle row - no bottom border
    expect(result.bottom).toBeUndefined();
  });
});

describe('createTableBorderOverlay', () => {
  let doc: Document;
  let fragment: TableFragment;

  beforeEach(() => {
    doc = document;
    fragment = {
      kind: 'table',
      blockId: 'test-block',
      x: 0,
      y: 0,
      width: 500,
      height: 300,
      fromRow: 0,
      toRow: 3,
    };
  });

  it('should create overlay with table borders', () => {
    const tableBorders: TableBorders = {
      top: { style: 'single', width: 2, color: '#FF0000' },
      right: { style: 'single', width: 2, color: '#00FF00' },
      bottom: { style: 'single', width: 2, color: '#0000FF' },
      left: { style: 'single', width: 2, color: '#FFFF00' },
    };

    const overlay = createTableBorderOverlay(doc, fragment, tableBorders);
    expect(overlay).toBeTruthy();
    expect(overlay?.classList.contains('superdoc-table-border')).toBe(true);
    expect(overlay?.style.width).toBe('500px');
    expect(overlay?.style.height).toBe('300px');
    expect(overlay?.style.position).toBe('absolute');
    expect(overlay?.style.borderTop).toMatch(/2px solid (#FF0000|rgb\(255,\s*0,\s*0\))/i);
    expect(overlay?.style.borderRight).toMatch(/2px solid (#00FF00|rgb\(0,\s*255,\s*0\))/i);
    expect(overlay?.style.borderBottom).toMatch(/2px solid (#0000FF|rgb\(0,\s*0,\s*255\))/i);
    expect(overlay?.style.borderLeft).toMatch(/2px solid (#FFFF00|rgb\(255,\s*255,\s*0\))/i);
  });

  it('should return null when no borders are defined', () => {
    const tableBorders: TableBorders = {};
    const overlay = createTableBorderOverlay(doc, fragment, tableBorders);
    expect(overlay).toBeNull();
  });

  it('should handle partial border definitions', () => {
    const tableBorders: TableBorders = {
      top: { style: 'single', width: 2, color: '#FF0000' },
      bottom: { style: 'single', width: 2, color: '#0000FF' },
    };

    const overlay = createTableBorderOverlay(doc, fragment, tableBorders);
    expect(overlay).toBeTruthy();
    expect(overlay?.style.borderTop).toMatch(/2px solid (#FF0000|rgb\(255,\s*0,\s*0\))/i);
    expect(overlay?.style.borderBottom).toMatch(/2px solid (#0000FF|rgb\(0,\s*0,\s*255\))/i);
  });

  it('should handle {none: true} borders', () => {
    const tableBorders: TableBorders = {
      top: { none: true },
      bottom: { style: 'single', width: 2, color: '#0000FF' },
    };

    const overlay = createTableBorderOverlay(doc, fragment, tableBorders);
    expect(overlay).toBeTruthy();
    expect(overlay?.style.borderBottom).toMatch(/2px solid (#0000FF|rgb\(0,\s*0,\s*255\))/i);
  });
});
