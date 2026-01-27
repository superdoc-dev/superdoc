/**
 * Comprehensive test suite for text-run converters
 * Tests all functions for converting ProseMirror nodes to TextRun/TabRun blocks
 */

import { describe, it, expect, vi } from 'vitest';
import type { PMNode, PMMark, PositionMap, HyperlinkConfig } from '../types.js';
import type { TextRun, TabRun, SdtMetadata, TabStop, ParagraphIndent, ParagraphAttrs } from '@superdoc/contracts';
import { textNodeToRun, tabNodeToRun, tokenNodeToRun } from './text-run.js';
import * as marksModule from '../marks/index.js';

// Mock the applyMarksToRun function to isolate tests
vi.mock('../marks/index.js', () => ({
  applyMarksToRun: vi.fn(),
}));

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
    );
  });
});

// ============================================================================
// tabNodeToRun() Tests
// ============================================================================

describe('tabNodeToRun', () => {
  it('converts basic tab node with position', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 5, end: 6 });

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs);

    expect(result).toEqual({
      kind: 'tab',
      text: '\t',
      pmStart: 5,
      pmEnd: 6,
      tabIndex: 0,
      tabStops: undefined,
      indent: undefined,
      leader: null,
    });
  });

  it('returns null when position not found', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs);

    expect(result).toBeNull();
  });

  it('includes tab stops from paragraph attrs', () => {
    const tabStops: TabStop[] = [
      { position: 100, alignment: 'left' },
      { position: 200, alignment: 'center' },
    ];
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { tabs: tabStops };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs) as TabRun;

    expect(result.tabStops).toEqual(tabStops);
  });

  it('includes indent from paragraph attrs', () => {
    const indent: ParagraphIndent = {
      left: 20,
      right: 10,
      firstLine: 5,
    };
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { indent };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs) as TabRun;

    expect(result.indent).toEqual(indent);
  });

  it('includes leader character from tab node attrs', () => {
    const tabNode: PMNode = {
      type: 'tab',
      attrs: { leader: 'dot' },
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs) as TabRun;

    expect(result.leader).toBe('dot');
  });

  it('sets leader to null when not provided', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs) as TabRun;

    expect(result.leader).toBeNull();
  });

  it('tracks tabIndex correctly', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 5, paragraphAttrs) as TabRun;

    expect(result.tabIndex).toBe(5);
  });

  it('handles paragraph with empty attrs', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs) as TabRun;

    expect(result.tabStops).toBeUndefined();
    expect(result.indent).toBeUndefined();
  });

  it('handles paragraph with empty tabStops array', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { tabs: [] };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs) as TabRun;

    expect(result.tabStops).toEqual([]);
  });

  it('handles multiple tab stops in paragraph', () => {
    const tabStops: TabStop[] = [
      { position: 50, alignment: 'left' },
      { position: 100, alignment: 'center' },
      { position: 150, alignment: 'right' },
      { position: 200, alignment: 'decimal' },
    ];
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { tabs: tabStops };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 2, paragraphAttrs) as TabRun;

    expect(result.tabStops).toEqual(tabStops);
    expect(result.tabStops?.length).toBe(4);
  });

  it('handles complex indent values', () => {
    const indent: ParagraphIndent = {
      left: 48,
      right: 24,
      firstLine: 12,
      hanging: 6,
    };
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { indent };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs) as TabRun;

    expect(result.indent).toEqual(indent);
  });

  it('handles all leader types', () => {
    const leaders: Array<TabRun['leader']> = ['dot', 'hyphen', 'underscore', 'heavy', 'middleDot'];

    leaders.forEach((leader) => {
      const tabNode: PMNode = {
        type: 'tab',
        attrs: { leader },
      };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });

      const result = tabNodeToRun(tabNode, positions, 0, paragraphAttrs) as TabRun;

      expect(result.leader).toBe(leader);
    });
  });

  describe('mark application', () => {
    it('calls applyMarksToRun with node marks', () => {
      const applyMarksToRunMock = vi.mocked(marksModule.applyMarksToRun);
      applyMarksToRunMock.mockClear();

      const tabNode: PMNode = {
        type: 'tab',
        marks: [{ type: 'underline', attrs: { underlineType: 'single' } }],
      };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });

      tabNodeToRun(tabNode, positions, 0, paragraphAttrs);

      expect(applyMarksToRunMock).toHaveBeenCalledTimes(1);
      expect(applyMarksToRunMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tab' }), [
        { type: 'underline', attrs: { underlineType: 'single' } },
      ]);
    });

    it('calls applyMarksToRun with inherited marks', () => {
      const applyMarksToRunMock = vi.mocked(marksModule.applyMarksToRun);
      applyMarksToRunMock.mockClear();

      const tabNode: PMNode = { type: 'tab' };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });
      const inheritedMarks: PMMark[] = [{ type: 'underline', attrs: { underlineType: 'single' } }];

      tabNodeToRun(tabNode, positions, 0, paragraphAttrs, inheritedMarks);

      expect(applyMarksToRunMock).toHaveBeenCalledTimes(1);
      expect(applyMarksToRunMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tab' }), [
        { type: 'underline', attrs: { underlineType: 'single' } },
      ]);
    });

    it('combines node marks and inherited marks', () => {
      const applyMarksToRunMock = vi.mocked(marksModule.applyMarksToRun);
      applyMarksToRunMock.mockClear();

      const tabNode: PMNode = {
        type: 'tab',
        marks: [{ type: 'bold' }],
      };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });
      const inheritedMarks: PMMark[] = [{ type: 'underline', attrs: { underlineType: 'single' } }];

      tabNodeToRun(tabNode, positions, 0, paragraphAttrs, inheritedMarks);

      expect(applyMarksToRunMock).toHaveBeenCalledTimes(1);
      expect(applyMarksToRunMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tab' }), [
        { type: 'bold' },
        { type: 'underline', attrs: { underlineType: 'single' } },
      ]);
    });

    it('does not call applyMarksToRun when no marks present', () => {
      const applyMarksToRunMock = vi.mocked(marksModule.applyMarksToRun);
      applyMarksToRunMock.mockClear();

      const tabNode: PMNode = { type: 'tab' };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });

      tabNodeToRun(tabNode, positions, 0, paragraphAttrs);

      expect(applyMarksToRunMock).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// tokenNodeToRun() Tests
// ============================================================================

describe('tokenNodeToRun', () => {
  it('converts page number token with defaults', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
    };
    const positions: PositionMap = new WeakMap();

    const result = tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(result).toEqual({
      text: '0',
      token: 'pageNumber',
      fontFamily: 'Arial',
      fontSize: 16,
    });
  });

  it('converts total page count token', () => {
    const tokenNode: PMNode = {
      type: 'total-page-number',
    };
    const positions: PositionMap = new WeakMap();

    const result = tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'totalPageCount');

    expect(result.token).toBe('totalPageCount');
  });

  it('attaches PM position tracking when position exists', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
    };
    const positions: PositionMap = new WeakMap();
    positions.set(tokenNode, { start: 20, end: 21 });

    const result = tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(result.pmStart).toBe(20);
    expect(result.pmEnd).toBe(21);
  });

  it('handles token without position in map', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
    };
    const positions: PositionMap = new WeakMap();

    const result = tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(result.pmStart).toBeUndefined();
    expect(result.pmEnd).toBeUndefined();
  });

  it('applies node marks to token run', () => {
    const boldMark: PMMark = { type: 'bold' };
    const tokenNode: PMNode = {
      type: 'page-number',
      marks: [boldMark],
    };
    const positions: PositionMap = new WeakMap();

    tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [boldMark],
      {
        enableRichHyperlinks: false,
      },
      undefined,
    );
  });

  it('applies inherited marks to token run', () => {
    const italicMark: PMMark = { type: 'italic' };
    const tokenNode: PMNode = {
      type: 'page-number',
    };
    const positions: PositionMap = new WeakMap();

    tokenNodeToRun(tokenNode, positions, 'Arial', 16, [italicMark], 'pageNumber');

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [italicMark],
      {
        enableRichHyperlinks: false,
      },
      undefined,
    );
  });

  it('combines node marks and inherited marks for token', () => {
    const boldMark: PMMark = { type: 'bold' };
    const colorMark: PMMark = { type: 'textColor', attrs: { color: '#FF0000' } };
    const tokenNode: PMNode = {
      type: 'page-number',
      marks: [boldMark],
    };
    const positions: PositionMap = new WeakMap();

    tokenNodeToRun(tokenNode, positions, 'Arial', 16, [colorMark], 'pageNumber');

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [boldMark, colorMark],
      {
        enableRichHyperlinks: false,
      },
      undefined,
    );
  });

  it('uses custom hyperlink config for token', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    };
    const positions: PositionMap = new WeakMap();
    const hyperlinkConfig: HyperlinkConfig = { enableRichHyperlinks: true };

    tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber', hyperlinkConfig);

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      hyperlinkConfig,
      undefined,
    );
  });

  it('always uses placeholder text "0"', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
    };
    const positions: PositionMap = new WeakMap();

    const result = tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(result.text).toBe('0');
  });

  it('handles token with various token types', () => {
    const tokenTypes: Array<TextRun['token']> = ['pageNumber', 'totalPageCount'];

    tokenTypes.forEach((token) => {
      const tokenNode: PMNode = {
        type: token === 'pageNumber' ? 'page-number' : 'total-page-number',
      };
      const positions: PositionMap = new WeakMap();

      const result = tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], token);

      expect(result.token).toBe(token);
    });
  });

  it('handles token with complex mark combinations', () => {
    const marks: PMMark[] = [
      { type: 'bold' },
      { type: 'italic' },
      { type: 'underline', attrs: { style: 'double' } },
      { type: 'textSize', attrs: { size: 20 } },
      { type: 'fontFamily', attrs: { family: 'Times New Roman' } },
    ];
    const tokenNode: PMNode = {
      type: 'page-number',
      marks,
    };
    const positions: PositionMap = new WeakMap();

    tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      marks,
      {
        enableRichHyperlinks: false,
      },
      undefined,
    );
  });

  it('handles token without marks', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
    };
    const positions: PositionMap = new WeakMap();

    tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [],
      { enableRichHyperlinks: false },
      undefined,
    );
  });

  it('uses default hyperlink config when not provided', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
    };
    const positions: PositionMap = new WeakMap();

    tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      {
        enableRichHyperlinks: false,
      },
      undefined,
    );
  });

  it('uses custom font family and size', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
    };
    const positions: PositionMap = new WeakMap();

    const result = tokenNodeToRun(tokenNode, positions, 'Times New Roman', 24, [], 'pageNumber');

    expect(result.fontFamily).toBe('Times New Roman');
    expect(result.fontSize).toBe(24);
  });

  it('handles empty marks arrays', () => {
    const tokenNode: PMNode = {
      type: 'page-number',
      marks: [],
    };
    const positions: PositionMap = new WeakMap();

    tokenNodeToRun(tokenNode, positions, 'Arial', 16, [], 'pageNumber');

    expect(marksModule.applyMarksToRun).toHaveBeenCalledWith(
      expect.any(Object),
      [],
      { enableRichHyperlinks: false },
      undefined,
    );
  });
});
