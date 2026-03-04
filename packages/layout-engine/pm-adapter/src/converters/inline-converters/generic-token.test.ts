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
