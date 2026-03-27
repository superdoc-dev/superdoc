import { describe, it, expect } from 'vitest';
import { extractMathText } from './extract-math-text.js';

describe('extractMathText', () => {
  it('returns empty string for null/undefined', () => {
    expect(extractMathText(null)).toBe('');
    expect(extractMathText(undefined)).toBe('');
  });

  it('extracts text from a simple m:t element', () => {
    const node = {
      name: 'm:t',
      elements: [{ type: 'text', text: 'x' }],
    };
    expect(extractMathText(node)).toBe('x');
  });

  it('extracts text from nested m:r/m:t structure', () => {
    const node = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:r',
          elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'E' }] }],
        },
        {
          name: 'm:r',
          elements: [{ name: 'm:t', elements: [{ type: 'text', text: '=' }] }],
        },
        {
          name: 'm:r',
          elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'mc' }] }],
        },
      ],
    };
    expect(extractMathText(node)).toBe('E=mc');
  });

  it('extracts text from deeply nested math objects', () => {
    // Simulates m:f (fraction) with m:num and m:den
    const node = {
      name: 'm:f',
      elements: [
        { name: 'm:fPr', elements: [] },
        {
          name: 'm:num',
          elements: [
            {
              name: 'm:r',
              elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'a' }] }],
            },
          ],
        },
        {
          name: 'm:den',
          elements: [
            {
              name: 'm:r',
              elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'b' }] }],
            },
          ],
        },
      ],
    };
    expect(extractMathText(node)).toBe('ab');
  });

  it('handles elements with no text children', () => {
    const node = {
      name: 'm:oMath',
      elements: [{ name: 'm:rPr', elements: [] }],
    };
    expect(extractMathText(node)).toBe('');
  });

  it('handles bare text nodes', () => {
    const node = { type: 'text', text: 'hello' };
    expect(extractMathText(node)).toBe('hello');
  });
});
