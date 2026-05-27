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

vi.mock('../../sdt/index.js', () => ({
  getNodeInstruction: vi.fn((node: PMNode) => {
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    return typeof attrs.instruction === 'string' ? attrs.instruction : '';
  }),
}));

vi.mock('@superdoc/style-engine/ooxml', () => ({
  resolveRunProperties: vi.fn(() => ({})),
}));

import { pageReferenceNodeToBlock } from './page-reference.js';

function makeParams(
  attrs: Record<string, unknown>,
  overrides: Partial<InlineConverterParams> = {},
): InlineConverterParams {
  const node: PMNode = {
    type: 'pageReference',
    attrs,
    content: [{ type: 'text', text: '15' } as PMNode],
  };
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

describe('pageReferenceNodeToBlock', () => {
  it('emits a pageReference token run with the resolved fallback text and bookmarkId', () => {
    const run = pageReferenceNodeToBlock(makeParams({ instruction: 'PAGEREF _Toc123 \\h' })) as TextRun | undefined;
    expect(run).toBeDefined();
    expect(run!.token).toBe('pageReference');
    expect(run!.pageRefMetadata?.bookmarkId).toBe('_Toc123');
  });

  it('synthesizes an internal link when the instruction has the \\h switch', () => {
    const run = pageReferenceNodeToBlock(makeParams({ instruction: 'PAGEREF _Toc123 \\h' })) as TextRun | undefined;
    expect(run!.link).toBeDefined();
    expect(run!.link?.anchor).toBe('_Toc123');
  });

  it('does not attach a link when the \\h switch is absent', () => {
    const run = pageReferenceNodeToBlock(makeParams({ instruction: 'PAGEREF _Toc123' })) as TextRun | undefined;
    expect(run!.link).toBeUndefined();
  });

  it('does not match a literal `h` character as the \\h switch', () => {
    // Guards against naive substring check — instruction like `PAGEREF bh-target`
    // must not produce a hyperlink just because `h` appears somewhere.
    const run = pageReferenceNodeToBlock(makeParams({ instruction: 'PAGEREF bh-target' })) as TextRun | undefined;
    expect(run!.link).toBeUndefined();
  });

  it('handles bookmark ids wrapped in quotes in the instruction', () => {
    const run = pageReferenceNodeToBlock(makeParams({ instruction: 'PAGEREF "_Toc123" \\h' })) as TextRun | undefined;
    expect(run!.pageRefMetadata?.bookmarkId).toBe('_Toc123');
    expect(run!.link?.anchor).toBe('_Toc123');
  });

  it('matches the \\h switch case-insensitively', () => {
    // Word field switches are case-insensitive — `\H` should produce a link
    // just like `\h`.
    const run = pageReferenceNodeToBlock(makeParams({ instruction: 'PAGEREF _Toc123 \\H' })) as TextRun | undefined;
    expect(run!.link?.anchor).toBe('_Toc123');
  });
});
