import { describe, it, expect, vi } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import type { PMNode, PositionMap } from '../../types.js';
import type { InlineConverterParams } from './common.js';
import { SUBSCRIPT_SUPERSCRIPT_SCALE } from '../../constants.js';

vi.mock('./text-run.js', () => ({
  textNodeToRun: vi.fn(
    (params: InlineConverterParams): TextRun => ({
      text: params.node.text || '',
      fontFamily: params.defaultFont,
      fontSize: params.defaultSize,
    }),
  ),
}));

import { footnoteReferenceToBlock } from './footnote-reference.js';

function makeParams(overrides: Partial<InlineConverterParams> = {}): InlineConverterParams {
  const node: PMNode = { type: 'footnoteReference', attrs: { id: '1' } };
  return {
    node,
    positions: new WeakMap(),
    defaultFont: 'Calibri',
    defaultSize: 16,
    inheritedMarks: [],
    sdtMetadata: undefined,
    hyperlinkConfig: { enableRichHyperlinks: false },
    themeColors: undefined,
    runProperties: undefined,
    paragraphProperties: undefined,
    converterContext: {
      footnoteNumberById: { '1': 1, '2': 2, '10': 10 },
    } as unknown as InlineConverterParams['converterContext'],
    enableComments: false,
    visitNode: vi.fn(),
    bookmarks: undefined,
    tabOrdinal: 0,
    paragraphAttrs: {},
    nextBlockId: vi.fn(),
    ...overrides,
  } as InlineConverterParams;
}

describe('footnoteReferenceToBlock', () => {
  it('emits plain digit text for a footnote marker', () => {
    const run = footnoteReferenceToBlock(makeParams());

    expect(run.text).toBe('1');
  });

  it('stamps interaction data attributes on the painted marker (SD-3400)', () => {
    const run = footnoteReferenceToBlock(makeParams());

    // Drives the hover/clickability affordance and active-note matching.
    expect(run.dataAttrs?.['data-note-reference']).toBe('footnote');
    expect(run.dataAttrs?.['data-note-id']).toBe('1');
  });

  it('does not emit Unicode superscript glyphs', () => {
    const run = footnoteReferenceToBlock(makeParams());

    expect(run.text).not.toMatch(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/);
  });

  it('resolves the display number from footnoteNumberById', () => {
    const node: PMNode = { type: 'footnoteReference', attrs: { id: '2' } };
    const run = footnoteReferenceToBlock(makeParams({ node }));

    expect(run.text).toBe('2');
  });

  it('resolves multi-digit display numbers', () => {
    const node: PMNode = { type: 'footnoteReference', attrs: { id: '10' } };
    const run = footnoteReferenceToBlock(makeParams({ node }));

    expect(run.text).toBe('10');
  });

  it('falls back to raw id when footnoteNumberById has no mapping', () => {
    const node: PMNode = { type: 'footnoteReference', attrs: { id: '99' } };
    const run = footnoteReferenceToBlock(makeParams({ node }));

    expect(run.text).toBe('99');
  });

  it('falls back to asterisk when id is missing', () => {
    const node: PMNode = { type: 'footnoteReference', attrs: {} };
    const run = footnoteReferenceToBlock(makeParams({ node }));

    expect(run.text).toBe('*');
  });

  it('sets vertAlign to superscript', () => {
    const run = footnoteReferenceToBlock(makeParams());

    expect(run.vertAlign).toBe('superscript');
  });

  it('scales fontSize from the paragraph base', () => {
    const run = footnoteReferenceToBlock(makeParams({ defaultSize: 16 }));

    expect(run.fontSize).toBe(16 * SUBSCRIPT_SUPERSCRIPT_SCALE);
  });

  // SD-2986/B1: numFmt support
  describe('numFmt formatting', () => {
    it('formats with upperRoman when context specifies it', () => {
      const node: PMNode = { type: 'footnoteReference', attrs: { id: '5' } };
      const run = footnoteReferenceToBlock(
        makeParams({
          node,
          converterContext: {
            footnoteNumberById: { '5': 4 },
            footnoteNumberFormat: 'upperRoman',
          } as unknown as InlineConverterParams['converterContext'],
        }),
      );
      expect(run.text).toBe('IV');
    });

    it('formats with lowerLetter when context specifies it', () => {
      const node: PMNode = { type: 'footnoteReference', attrs: { id: '3' } };
      const run = footnoteReferenceToBlock(
        makeParams({
          node,
          converterContext: {
            footnoteNumberById: { '3': 3 },
            footnoteNumberFormat: 'lowerLetter',
          } as unknown as InlineConverterParams['converterContext'],
        }),
      );
      expect(run.text).toBe('c');
    });

    it('falls back to decimal when format is omitted', () => {
      const node: PMNode = { type: 'footnoteReference', attrs: { id: '2' } };
      const run = footnoteReferenceToBlock(
        makeParams({
          node,
          converterContext: {
            footnoteNumberById: { '2': 2 },
          } as unknown as InlineConverterParams['converterContext'],
        }),
      );
      expect(run.text).toBe('2');
    });

    // SD-2658: custom mark follows
    it('emits empty marker text when customMarkFollows is "1"', () => {
      const node: PMNode = {
        type: 'footnoteReference',
        attrs: { id: '1', customMarkFollows: '1' },
      };
      const run = footnoteReferenceToBlock(makeParams({ node }));
      expect(run.text).toBe('');
    });

    it('emits empty marker text when customMarkFollows is true (boolean)', () => {
      const node: PMNode = {
        type: 'footnoteReference',
        attrs: { id: '1', customMarkFollows: true },
      };
      const run = footnoteReferenceToBlock(makeParams({ node }));
      expect(run.text).toBe('');
    });

    it('still emits the numbered marker when customMarkFollows is "0"', () => {
      const node: PMNode = {
        type: 'footnoteReference',
        attrs: { id: '1', customMarkFollows: '0' },
      };
      const run = footnoteReferenceToBlock(makeParams({ node }));
      expect(run.text).toBe('1');
    });

    it('preserves pmStart/pmEnd on the empty marker run (click + selection rely on this)', () => {
      const node: PMNode = {
        type: 'footnoteReference',
        attrs: { id: '1', customMarkFollows: '1' },
      };
      const positions = new WeakMap();
      positions.set(node, { start: 42, end: 43 });
      const run = footnoteReferenceToBlock(makeParams({ node, positions }));
      expect(run.text).toBe('');
      expect(run.pmStart).toBe(42);
      expect(run.pmEnd).toBe(43);
    });

    it('falls back to decimal when format is unrecognized', () => {
      const node: PMNode = { type: 'footnoteReference', attrs: { id: '2' } };
      const run = footnoteReferenceToBlock(
        makeParams({
          node,
          converterContext: {
            footnoteNumberById: { '2': 2 },
            footnoteNumberFormat: 'chickenLetters',
          } as unknown as InlineConverterParams['converterContext'],
        }),
      );
      expect(run.text).toBe('2');
    });
  });
});
