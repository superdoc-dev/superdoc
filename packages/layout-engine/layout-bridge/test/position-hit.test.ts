import { describe, expect, it } from 'vitest';
import type { FlowBlock, ParagraphAttrs } from '@superdoc/contracts';
import { isRtlBlock } from '../src/position-hit';

const paragraph = (attrs?: Record<string, unknown>): FlowBlock => ({
  kind: 'paragraph',
  id: 'p1',
  runs: [],
  attrs: attrs as ParagraphAttrs | undefined,
});

describe('isRtlBlock', () => {
  it('uses resolved paragraph direction context for inline direction', () => {
    expect(
      isRtlBlock(
        paragraph({
          directionContext: {
            inlineDirection: 'rtl',
            writingMode: 'horizontal-tb',
          },
        }),
      ),
    ).toBe(true);
  });

  it('does not treat writing mode as inline RTL direction', () => {
    expect(isRtlBlock(paragraph({ textDirection: 'tbRl' }))).toBe(false);
  });

  it('lets resolved direction context override paragraphProperties.rightToLeft', () => {
    expect(
      isRtlBlock(
        paragraph({
          paragraphProperties: { rightToLeft: true },
          directionContext: {
            inlineDirection: 'ltr',
            writingMode: 'horizontal-tb',
          },
        }),
      ),
    ).toBe(false);
  });

  it('falls through to paragraphProperties.rightToLeft when directionContext.inlineDirection is undefined', () => {
    // The resolver may produce inlineDirection: undefined when no paragraph w:bidi is set
    // anywhere in the cascade. In that case the typed context carries no inline-direction
    // signal, and the PM-node paragraphProperties.rightToLeft fallback still applies.
    expect(
      isRtlBlock(
        paragraph({
          paragraphProperties: { rightToLeft: true },
          directionContext: {
            inlineDirection: undefined,
            writingMode: 'horizontal-tb',
          },
        }),
      ),
    ).toBe(true);
  });

  // SD-2778: switching to getParagraphInlineDirection is strictly broader on
  // fallback than the prior inline read. Specifically, the helper picks up
  // paragraphProperties.rightToLeft when neither directionContext nor the legacy
  // scalar field is present. Pin that case so the broader fallback is intentional.
  it('falls back to paragraphProperties.rightToLeft when no other direction signal is present', () => {
    expect(isRtlBlock(paragraph({ paragraphProperties: { rightToLeft: true } }))).toBe(true);
    expect(isRtlBlock(paragraph({ paragraphProperties: { rightToLeft: false } }))).toBe(false);
  });
});
