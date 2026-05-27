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

import { crossReferenceNodeToRun } from './cross-reference.js';

function makeParams(
  attrs: Record<string, unknown>,
  overrides: Partial<InlineConverterParams> = {},
): InlineConverterParams {
  const node: PMNode = { type: 'crossReference', attrs };
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

describe('crossReferenceNodeToRun (SD-2495)', () => {
  it('emits a TextRun carrying the resolved display text', () => {
    const run = crossReferenceNodeToRun(
      makeParams({ resolvedText: '15', target: '_Ref506192326', instruction: 'REF _Ref506192326 \\w \\h' }),
    );
    expect(run).not.toBeNull();
    expect(run!.text).toBe('15');
  });

  it('synthesizes an internal link when the instruction has the \\h switch', () => {
    const run = crossReferenceNodeToRun(
      makeParams({ resolvedText: '15', target: '_Ref506192326', instruction: 'REF _Ref506192326 \\w \\h' }),
    );
    expect(run!.link).toBeDefined();
    expect(run!.link?.anchor).toBe('_Ref506192326');
  });

  it('does not attach a link when the \\h switch is absent', () => {
    const run = crossReferenceNodeToRun(
      makeParams({ resolvedText: '15', target: '_Ref506192326', instruction: 'REF _Ref506192326 \\w' }),
    );
    expect(run!.link).toBeUndefined();
  });

  it('still emits a TextRun (not null) when the cached text is empty', () => {
    const run = crossReferenceNodeToRun(
      makeParams({ resolvedText: '', target: '_Ref_missing', instruction: 'REF _Ref_missing \\h' }),
    );
    expect(run).not.toBeNull();
    expect(run!.text).toBe('');
    // Still links to target so surrounding layout isn't broken and the click target
    // is preserved if the text later becomes non-empty via a re-import.
    expect(run!.link?.anchor).toBe('_Ref_missing');
  });

  it('does not match a literal `h` character as the \\h switch', () => {
    // Guards against naive substring check — instruction like `REF bh-target`
    // must not produce a hyperlink just because `h` appears somewhere.
    const run = crossReferenceNodeToRun(
      makeParams({ resolvedText: 'label', target: 'bh-target', instruction: 'REF bh-target' }),
    );
    expect(run!.link).toBeUndefined();
  });

  it('matches the \\H switch case-insensitively per ECMA-376 §17.16.1', () => {
    const run = crossReferenceNodeToRun(
      makeParams({ resolvedText: '15', target: '_Ref506192326', instruction: 'REF _Ref506192326 \\H' }),
    );
    expect(run!.link?.anchor).toBe('_Ref506192326');
  });

  it('forwards node.marks to textNodeToRun so surrounding styles (italic, textStyle) survive', async () => {
    // Guards against SD-2537's "preserve surrounding run styling" AC —
    // a refactor that dropped node.marks from the synthesized text node
    // would silently strip italic/color from every cross-reference.
    const { textNodeToRun } = await import('./text-run.js');
    vi.mocked(textNodeToRun).mockClear();
    const marks = [
      { type: 'italic', attrs: {} },
      { type: 'textStyle', attrs: { color: '#ff0000' } },
    ];
    const node: PMNode = {
      type: 'crossReference',
      attrs: { resolvedText: '15', target: '_Ref1', instruction: 'REF _Ref1 \\h' },
      marks,
    };
    crossReferenceNodeToRun(makeParams(node.attrs as Record<string, unknown>, { node }));

    const call = vi.mocked(textNodeToRun).mock.calls.at(-1)?.[0];
    expect(call?.node?.marks).toEqual(marks);
  });
});
