import { describe, it, expect, vi } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import type { InlineConverterParams } from './common.js';

vi.mock('./text-run.js', () => ({
  textNodeToRun: vi.fn(
    (params: InlineConverterParams): TextRun => ({
      text: params.node.text || '',
      fontFamily: params.defaultFont,
      fontSize: params.defaultSize,
    }),
  ),
}));

import { citationNodeToRun } from './citation.js';
import { textNodeToRun } from './text-run.js';

function makeParams(node: PMNode, overrides: Partial<InlineConverterParams> = {}): InlineConverterParams {
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
    converterContext: {} as unknown as InlineConverterParams['converterContext'],
    enableComments: false,
    visitNode: vi.fn(),
    bookmarks: undefined,
    tabOrdinal: 0,
    paragraphAttrs: {},
    nextBlockId: vi.fn(),
    ...overrides,
  } as InlineConverterParams;
}

describe('citationNodeToRun', () => {
  it('emits a TextRun carrying the resolved citation text', () => {
    const node: PMNode = { type: 'citation', attrs: { resolvedText: '(Austen, 1868)' } };

    const run = citationNodeToRun(makeParams(node));

    expect(run).not.toBeNull();
    expect(run!.text).toBe('(Austen, 1868)');
  });

  it('uses the citation placeholder when resolved text is missing', () => {
    const node: PMNode = { type: 'citation', attrs: {} };

    const run = citationNodeToRun(makeParams(node));

    expect(run).not.toBeNull();
    expect(run!.text).toBe('[Citation]');
  });

  it('copies PM positions from the citation atom', () => {
    const node: PMNode = { type: 'citation', attrs: { resolvedText: '(Austen, 1868)' } };
    const positions = new WeakMap<PMNode, { start: number; end: number }>();
    positions.set(node, { start: 5, end: 6 });

    const run = citationNodeToRun(makeParams(node, { positions }));

    expect(run!.pmStart).toBe(5);
    expect(run!.pmEnd).toBe(6);
  });

  it('forwards citation marks to textNodeToRun', () => {
    vi.mocked(textNodeToRun).mockClear();
    const marks = [{ type: 'italic', attrs: {} }];
    const node: PMNode = { type: 'citation', attrs: { resolvedText: '(Austen, 1868)' }, marks };

    citationNodeToRun(makeParams(node));

    const call = vi.mocked(textNodeToRun).mock.calls.at(-1)?.[0];
    expect(call?.node?.marks).toEqual(marks);
  });

  it('attaches active SDT metadata to the run', () => {
    const node: PMNode = { type: 'citation', attrs: { resolvedText: '(Austen, 1868)' } };
    const sdtMetadata = { id: 'citation-sdt', tag: 'citation-tag', alias: 'Citation' };

    const run = citationNodeToRun(makeParams(node, { sdtMetadata }));

    expect(run!.sdt).toBe(sdtMetadata);
  });
});
