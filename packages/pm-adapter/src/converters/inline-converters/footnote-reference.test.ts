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
});
