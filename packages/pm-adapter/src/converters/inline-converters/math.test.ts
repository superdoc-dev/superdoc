import { describe, it, expect } from 'vitest';
import { mathInlineNodeToRun } from './math.js';
import type { InlineConverterParams } from './common.js';

function makeParams(attrs: Record<string, unknown>, posStart = 5, posEnd = 6): InlineConverterParams {
  const node = { type: 'mathInline', attrs, marks: [] };
  const positions = new WeakMap();
  positions.set(node, { start: posStart, end: posEnd });
  return {
    node,
    positions,
    inheritedMarks: [],
    defaultFont: 'Times New Roman',
    defaultSize: 13.33,
    sdtMetadata: undefined,
    hyperlinkConfig: { enableRichHyperlinks: false },
    themeColors: undefined,
    runProperties: undefined,
    paragraphProperties: undefined,
    converterContext: {} as any,
    enableComments: false,
    visitNode: () => {},
    bookmarks: undefined,
    tabOrdinal: 0,
    paragraphAttrs: {},
    nextBlockId: ((kind: string) => `block-${kind}-1`) as any,
  };
}

describe('mathInlineNodeToRun', () => {
  it('produces a MathRun with correct shape', () => {
    const params = makeParams({ originalXml: { name: 'm:oMath' }, textContent: 'x+1' });
    const run = mathInlineNodeToRun(params);

    expect(run).not.toBeNull();
    expect(run!.kind).toBe('math');
    expect(run!.textContent).toBe('x+1');
    expect(run!.ommlJson).toEqual({ name: 'm:oMath' });
    expect(run!.pmStart).toBe(5);
    expect(run!.pmEnd).toBe(6);
  });

  it('estimates width from text content length', () => {
    const short = mathInlineNodeToRun(makeParams({ textContent: 'x' }));
    const long = mathInlineNodeToRun(makeParams({ textContent: 'E=mc^2+abc' }));

    // Minimum width is 20px
    expect(short!.width).toBe(20);
    // 10 chars * 10px/char = 100px
    expect(long!.width).toBe(100);
  });

  it('enforces minimum width of 20px', () => {
    const empty = mathInlineNodeToRun(makeParams({ textContent: '' }));
    expect(empty!.width).toBe(20);
  });

  it('returns run without pmStart/pmEnd when position is missing', () => {
    const node = { type: 'mathInline', attrs: { textContent: 'x' }, marks: [] };
    const positions = new WeakMap(); // no entry for node
    const params = { ...makeParams({}), node, positions };
    const run = mathInlineNodeToRun(params);
    expect(run).not.toBeNull();
    expect(run!.kind).toBe('math');
    expect(run!.pmStart).toBeUndefined();
    expect(run!.pmEnd).toBeUndefined();
  });

  it('passes through SDT metadata', () => {
    const sdt = { tag: 'test', alias: 'Test' };
    const params = makeParams({ textContent: 'y' });
    params.sdtMetadata = sdt as any;
    const run = mathInlineNodeToRun(params);
    expect(run!.sdt).toBe(sdt);
  });

  it('defaults textContent to empty string when missing', () => {
    const run = mathInlineNodeToRun(makeParams({}));
    expect(run!.textContent).toBe('');
  });
});
