import { describe, expect, it } from 'bun:test';
import { computeListIndent, formatListLabel } from '../lists.js';

describe('engines-lists formatListLabel', () => {
  it('formats decimal numbering with template', () => {
    const result = formatListLabel(
      {
        format: 'decimal',
        text: '%1.',
        start: 1,
        indent: { left: 36, hanging: 18 },
      },
      [3],
    );
    expect(result.text).toBe('3.');
  });

  it('formats upperRoman numbering', () => {
    const result = formatListLabel(
      {
        format: 'upperRoman',
        text: '%1)',
        start: 1,
        indent: { left: 36, hanging: 18 },
      },
      [4],
    );
    expect(result.text).toBe('IV)');
  });
});

describe('engines-lists computeListIndent', () => {
  it('calculates hanging and first-line indents', () => {
    const result = computeListIndent({
      format: 'decimal',
      text: '%1.',
      start: 1,
      indent: { left: 48, hanging: 24 },
    });
    expect(result.hangingIndent).toBe(24);
    expect(result.firstLineIndent).toBe(24);
  });
});
