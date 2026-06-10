import { describe, it, expect } from 'vitest';
import { preProcessTcInstruction } from './tc-preprocessor.js';

describe('preProcessTcInstruction', () => {
  it('creates a single sd:tableOfContentsEntry when no bookmarks are embedded', () => {
    const instrText = 'TC "Section 1.1 Certain Basic Terms" \\f C \\l "2"';

    const result = preProcessTcInstruction([], instrText);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'sd:tableOfContentsEntry',
      type: 'element',
      attributes: { instruction: instrText },
      elements: [],
    });
    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('includes instructionTokens when provided', () => {
    const tokens = [{ type: 'text', text: 'TC "x" \\l "2"' }];

    const result = preProcessTcInstruction([], 'TC "x" \\l "2"', { instructionTokens: tokens });

    expect(result[0].attributes.instructionTokens).toEqual(tokens);
  });

  it('hoists embedded bookmarkStart/bookmarkEnd out of the TC entry (SD-3227)', () => {
    const bookmarkStart = {
      name: 'w:bookmarkStart',
      type: 'element',
      attributes: { 'w:id': '7', 'w:name': '_Toc230123327' },
      elements: [],
    };
    const bookmarkEnd = {
      name: 'w:bookmarkEnd',
      type: 'element',
      attributes: { 'w:id': '7' },
      elements: [],
    };
    const filler = { name: 'w:something-else', type: 'element', elements: [] };
    const instrText = 'TC "Section 1.1 Certain Basic Terms" \\f C \\l "2"';

    const result = preProcessTcInstruction([bookmarkStart, filler, bookmarkEnd], instrText);

    expect(result).toEqual([
      bookmarkStart,
      {
        name: 'sd:tableOfContentsEntry',
        type: 'element',
        attributes: { instruction: instrText },
        elements: [filler],
      },
      bookmarkEnd,
    ]);
  });

  it('keeps adjacent bookmark pairs in their original order (no crossed ranges)', () => {
    // Bucketing all starts before and all ends after the entry would turn
    // [start1, end1, start2, end2] into [start1, start2, entry, end1, end2],
    // making bookmark 1's range cover bookmark 2 and vice versa.
    const start1 = { name: 'w:bookmarkStart', type: 'element', attributes: { 'w:id': '1', 'w:name': '_Toc1' } };
    const end1 = { name: 'w:bookmarkEnd', type: 'element', attributes: { 'w:id': '1' } };
    const start2 = { name: 'w:bookmarkStart', type: 'element', attributes: { 'w:id': '2', 'w:name': '_Toc2' } };
    const end2 = { name: 'w:bookmarkEnd', type: 'element', attributes: { 'w:id': '2' } };

    const result = preProcessTcInstruction([start1, end1, start2, end2], 'TC "x"');

    expect(result).toEqual([
      start1,
      end1,
      start2,
      end2,
      {
        name: 'sd:tableOfContentsEntry',
        type: 'element',
        attributes: { instruction: 'TC "x"' },
        elements: [],
      },
    ]);
  });

  it('keeps post-content bookmark markers after the entry in their original order', () => {
    const start = { name: 'w:bookmarkStart', type: 'element', attributes: { 'w:id': '1', 'w:name': '_Toc1' } };
    const filler = { name: 'w:something-else', type: 'element', elements: [] };
    const end1 = { name: 'w:bookmarkEnd', type: 'element', attributes: { 'w:id': '1' } };
    const trailingStart = { name: 'w:bookmarkStart', type: 'element', attributes: { 'w:id': '2', 'w:name': '_Toc2' } };
    const trailingEnd = { name: 'w:bookmarkEnd', type: 'element', attributes: { 'w:id': '2' } };

    const result = preProcessTcInstruction([start, filler, end1, trailingStart, trailingEnd], 'TC "x"');

    expect(result.map((n) => n.name)).toEqual([
      'w:bookmarkStart',
      'sd:tableOfContentsEntry',
      'w:bookmarkEnd',
      'w:bookmarkStart',
      'w:bookmarkEnd',
    ]);
    expect(result[1].elements).toEqual([filler]);
  });
});
