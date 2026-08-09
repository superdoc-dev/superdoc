import { describe, expect, it } from 'vitest';
import type { InlineBoxSpan } from '@superdoc/contracts';
import { inlineBoxKey } from '../src/inline-box-key.js';

const box = (): InlineBoxSpan => ({
  id: 'citation',
  from: 0,
  to: 8,
  layout: {
    paddingInlineStart: 4,
    paddingInlineEnd: 4,
    paddingBlockStart: 1,
    paddingBlockEnd: 1,
    gapBefore: 1,
    gapAfter: 1,
    borderWidth: 1,
  },
  appearance: { backgroundColor: '#eef2ff', borderStyle: 'solid' },
  data: { citationId: '1', source: 'references' },
});

describe('inlineBoxKey', () => {
  it('is stable for identical boxes and data insertion order', () => {
    expect(inlineBoxKey(box())).toBe(inlineBoxKey({ ...box(), data: { source: 'references', citationId: '1' } }));
  });

  it('changes for metric and appearance changes', () => {
    const base = box();
    expect(inlineBoxKey({ ...base, layout: { ...base.layout, borderWidth: 2 } })).not.toBe(inlineBoxKey(base));
    expect(inlineBoxKey({ ...base, appearance: { ...base.appearance, backgroundColor: '#ffffff' } })).not.toBe(
      inlineBoxKey(base),
    );
  });
});
