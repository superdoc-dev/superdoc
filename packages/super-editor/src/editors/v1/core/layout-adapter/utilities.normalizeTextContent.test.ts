import { describe, expect, it } from 'vitest';
import { normalizeTextContent } from './utilities.js';

describe('normalizeTextContent', () => {
  it('preserves valid paragraph spacing and paragraph-boundary parts', () => {
    const result = normalizeTextContent({
      parts: [{ text: 'A' }, { text: '\n', isLineBreak: true, isParagraphBoundary: true }, { text: 'B' }],
      paragraphs: [{ spacing: { before: 24, after: 5.333 } }, { spacing: { before: 12 } }],
    });

    expect(result?.parts[1].isParagraphBoundary).toBe(true);
    expect(result?.paragraphs).toEqual([{ spacing: { before: 24, after: 5.333 } }, { spacing: { before: 12 } }]);
  });

  it('reduces invalid paragraph spacing entries to empty objects while preserving indexes', () => {
    const result = normalizeTextContent({
      parts: [{ text: 'A' }],
      paragraphs: [
        { spacing: { before: 24 } },
        null,
        { spacing: { before: Infinity, after: '5' } },
        { spacing: { after: 8 } },
      ],
    });

    expect(result?.paragraphs).toEqual([{ spacing: { before: 24 } }, {}, {}, { spacing: { after: 8 } }]);
  });

  it('omits paragraphs when no entry has valid spacing', () => {
    const result = normalizeTextContent({
      parts: [{ text: 'A' }],
      paragraphs: [{ spacing: { before: NaN } }, {}, 'invalid'],
    });

    expect(result?.paragraphs).toBeUndefined();
  });
});
