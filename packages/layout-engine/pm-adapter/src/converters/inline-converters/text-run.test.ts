/**
 * Comprehensive test suite for text-run converters
 * Tests all functions for converting ProseMirror nodes to TextRun/TabRun blocks
 */

import { describe, it, expect, vi } from 'vitest';
import type { PMNode, PMMark, PositionMap, HyperlinkConfig, ThemeColorPalette, ConverterContext } from '../types.js';
import type { TextRun, SdtMetadata } from '@superdoc/contracts';
import type { RunProperties } from '@superdoc/style-engine/ooxml';
import { textNodeToRun as baseTextNodeToRun, tokenNodeToRun } from './text-run.js';
import * as marksModule from '../../marks/index.js';

// Mock the applyMarksToRun function to isolate tests
vi.mock('../../marks/index.js', () => ({
  applyMarksToRun: vi.fn(),
}));

vi.mock('./common.js', () => ({
  applyInlineRunProperties: vi.fn((run) => run),
}));

const DEFAULT_HYPERLINK_CONFIG: HyperlinkConfig = { enableRichHyperlinks: false };

const textNodeToRun = (
  textNode: PMNode,
  positions: PositionMap,
  defaultFont: string,
  defaultSize: number,
  inheritedMarks: PMMark[] = [],
  sdtMetadata?: SdtMetadata,
  hyperlinkConfig: HyperlinkConfig = DEFAULT_HYPERLINK_CONFIG,
  themeColors?: ThemeColorPalette,
  enableComments = false,
  runProperties?: RunProperties,
  converterContext?: ConverterContext,
) =>
  baseTextNodeToRun({
    node: textNode,
    positions,
    defaultFont,
    defaultSize,
    inheritedMarks,
    sdtMetadata,
    hyperlinkConfig,
    themeColors,
    enableComments,
    runProperties,
    converterContext,
  });

// ============================================================================
// textNodeToRun() Tests
// ============================================================================

describe('textNodeToRun', () => {
  it('converts basic text node with defaults', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'Hello World',
    };
    const positions: PositionMap = new WeakMap();

    const result = textNodeToRun(textNode, positions, 'Arial', 16);

    expect(result).toEqual({
      text: 'Hello World',
      fontFamily: 'Arial',
      fontSize: 16,
    });
    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [],
      { enableRichHyperlinks: false },
      undefined,
      undefined,
      false,
    );
  });

  it('attaches PM position tracking when position exists', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'Test',
    };
    const positions: PositionMap = new WeakMap();
    positions.set(textNode, { start: 10, end: 14 });

    const result = textNodeToRun(textNode, positions, 'Arial', 16);

    expect(result.pmStart).toBe(10);
    expect(result.pmEnd).toBe(14);
  });

  it('handles text node without position in map', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'Test',
    };
    const positions: PositionMap = new WeakMap();

    const result = textNodeToRun(textNode, positions, 'Arial', 16);

    expect(result.pmStart).toBeUndefined();
    expect(result.pmEnd).toBeUndefined();
  });

  it('applies node marks to run', () => {
    const boldMark: PMMark = { type: 'bold' };
    const italicMark: PMMark = { type: 'italic' };
    const textNode: PMNode = {
      type: 'text',
      text: 'Formatted',
      marks: [boldMark, italicMark],
    };
    const positions: PositionMap = new WeakMap();

    textNodeToRun(textNode, positions, 'Arial', 16);

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [boldMark, italicMark],
      {
        enableRichHyperlinks: false,
      },
      undefined,
      undefined,
      false,
    );
  });

  it('applies inherited marks to run', () => {
    const linkMark: PMMark = { type: 'link', attrs: { href: 'https://example.com' } };
    const textNode: PMNode = {
      type: 'text',
      text: 'Link text',
    };
    const positions: PositionMap = new WeakMap();

    textNodeToRun(textNode, positions, 'Arial', 16, [linkMark]);

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [linkMark],
      {
        enableRichHyperlinks: false,
      },
      undefined,
      undefined,
      false,
    );
  });

  it('combines node marks and inherited marks', () => {
    const boldMark: PMMark = { type: 'bold' };
    const linkMark: PMMark = { type: 'link', attrs: { href: 'https://example.com' } };
    const textNode: PMNode = {
      type: 'text',
      text: 'Bold link',
      marks: [boldMark],
    };
    const positions: PositionMap = new WeakMap();

    textNodeToRun(textNode, positions, 'Arial', 16, [linkMark]);

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [boldMark, linkMark],
      {
        enableRichHyperlinks: false,
      },
      undefined,
      undefined,
      false,
    );
  });

  it('attaches SDT metadata when provided', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'SDT text',
    };
    const positions: PositionMap = new WeakMap();
    const sdtMetadata: SdtMetadata = {
      tag: 'test-tag',
      id: 'sdt-1',
    };

    const result = textNodeToRun(textNode, positions, 'Arial', 16, [], sdtMetadata);

    expect(result.sdt).toEqual(sdtMetadata);
  });

  it('does not attach SDT metadata when undefined', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'No SDT',
    };
    const positions: PositionMap = new WeakMap();

    const result = textNodeToRun(textNode, positions, 'Arial', 16);

    expect(result.sdt).toBeUndefined();
  });

  it('uses custom hyperlink config when provided', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'Link',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    };
    const positions: PositionMap = new WeakMap();
    const hyperlinkConfig: HyperlinkConfig = { enableRichHyperlinks: true };

    textNodeToRun(textNode, positions, 'Arial', 16, [], undefined, hyperlinkConfig);

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      hyperlinkConfig,
      undefined,
      undefined,
      false,
    );
  });

  it('handles empty text node', () => {
    const textNode: PMNode = {
      type: 'text',
      text: '',
    };
    const positions: PositionMap = new WeakMap();

    const result = textNodeToRun(textNode, positions, 'Arial', 16);

    expect(result.text).toBe('');
  });

  it('handles text node without text property', () => {
    const textNode: PMNode = {
      type: 'text',
    };
    const positions: PositionMap = new WeakMap();

    const result = textNodeToRun(textNode, positions, 'Arial', 16);

    expect(result.text).toBe('');
  });

  it('handles special characters in text', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'Special: \n\t\r\u00A0',
    };
    const positions: PositionMap = new WeakMap();

    const result = textNodeToRun(textNode, positions, 'Arial', 16);

    expect(result.text).toBe('Special: \n\t\r\u00A0');
  });

  it('handles very long text content', () => {
    const longText = 'a'.repeat(10000);
    const textNode: PMNode = {
      type: 'text',
      text: longText,
    };
    const positions: PositionMap = new WeakMap();

    const result = textNodeToRun(textNode, positions, 'Arial', 16);

    expect(result.text).toBe(longText);
    expect(result.text.length).toBe(10000);
  });

  it('handles multiple marks with complex types', () => {
    const marks: PMMark[] = [
      { type: 'bold' },
      { type: 'italic' },
      { type: 'underline', attrs: { style: 'single' } },
      { type: 'textColor', attrs: { color: '#FF0000' } },
      { type: 'highlight', attrs: { color: '#FFFF00' } },
    ];
    const textNode: PMNode = {
      type: 'text',
      text: 'Heavily formatted',
      marks,
    };
    const positions: PositionMap = new WeakMap();

    textNodeToRun(textNode, positions, 'Arial', 16);

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      marks,
      {
        enableRichHyperlinks: false,
      },
      undefined,
      undefined,
      false,
    );
  });

  it('handles SDT metadata with all properties', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'Complex SDT',
    };
    const positions: PositionMap = new WeakMap();
    const sdtMetadata: SdtMetadata = {
      tag: 'complex-tag',
      id: 'sdt-123',
      alias: 'Test Alias',
      lock: 'contentLocked',
    };

    const result = textNodeToRun(textNode, positions, 'Arial', 16, [], sdtMetadata);

    expect(result.sdt).toEqual(sdtMetadata);
  });

  it('uses default hyperlink config when not provided', () => {
    const textNode: PMNode = {
      type: 'text',
      text: 'Default config',
    };
    const positions: PositionMap = new WeakMap();

    textNodeToRun(textNode, positions, 'Arial', 16);

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      {
        enableRichHyperlinks: false,
      },
      undefined,
      undefined,
      false,
    );
  });
});
