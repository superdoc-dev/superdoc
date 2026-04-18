import { describe, it, expect, vi } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
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

import { endnoteReferenceToBlock } from './endnote-reference.js';

function makeParams(overrides: Partial<InlineConverterParams> = {}): InlineConverterParams {
  const node: PMNode = { type: 'endnoteReference', attrs: { id: '1' } };
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
      endnoteNumberById: { '1': 1, '2': 2, '10': 10 },
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

describe('endnoteReferenceToBlock', () => {
  it('emits plain digit text for an endnote marker', () => {
    const run = endnoteReferenceToBlock(makeParams());

    expect(run.text).toBe('1');
  });

  it('does not emit Unicode superscript glyphs', () => {
    const run = endnoteReferenceToBlock(makeParams());

    expect(run.text).not.toMatch(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/);
  });

  it('resolves the display number from endnoteNumberById', () => {
    const node: PMNode = { type: 'endnoteReference', attrs: { id: '2' } };
    const run = endnoteReferenceToBlock(makeParams({ node }));

    expect(run.text).toBe('2');
  });

  it('resolves multi-digit display numbers', () => {
    const node: PMNode = { type: 'endnoteReference', attrs: { id: '10' } };
    const run = endnoteReferenceToBlock(makeParams({ node }));

    expect(run.text).toBe('10');
  });

  it('falls back to raw id when endnoteNumberById has no mapping', () => {
    const node: PMNode = { type: 'endnoteReference', attrs: { id: '99' } };
    const run = endnoteReferenceToBlock(makeParams({ node }));

    expect(run.text).toBe('99');
  });

  it('falls back to asterisk when id is missing', () => {
    const node: PMNode = { type: 'endnoteReference', attrs: {} };
    const run = endnoteReferenceToBlock(makeParams({ node }));

    expect(run.text).toBe('*');
  });

  it('sets vertAlign to superscript', () => {
    const run = endnoteReferenceToBlock(makeParams());

    expect(run.vertAlign).toBe('superscript');
  });

  it('scales fontSize from the paragraph base', () => {
    const run = endnoteReferenceToBlock(makeParams({ defaultSize: 16 }));

    expect(run.fontSize).toBe(16 * SUBSCRIPT_SUPERSCRIPT_SCALE);
  });
});
