import { describe, it, expect } from 'vitest';
import { getUnderlineCssString } from './underline-css.js';

const normalize = (str) =>
  str
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort()
    .join('; ');

describe('getUnderlineCssString', () => {
  it('returns underline line by default', () => {
    const css = getUnderlineCssString();
    expect(normalize(css)).toBe('text-decoration-line: underline');
  });

  it('returns text-decoration: none for type none', () => {
    const css = getUnderlineCssString({ type: 'none' });
    expect(css).toBe('text-decoration: none');
  });

  it('handles double, dotted, dashed, and wavy styles', () => {
    expect(normalize(getUnderlineCssString({ type: 'double' }))).toBe(
      'text-decoration-line: underline; text-decoration-style: double',
    );
    expect(normalize(getUnderlineCssString({ type: 'dotted' }))).toBe(
      'text-decoration-line: underline; text-decoration-style: dotted',
    );
    expect(normalize(getUnderlineCssString({ type: 'dash' }))).toBe(
      'text-decoration-line: underline; text-decoration-style: dashed',
    );
    expect(normalize(getUnderlineCssString({ type: 'wavy' }))).toBe(
      'text-decoration-line: underline; text-decoration-style: wavy',
    );
  });

  it('applies thickness hints for heavy variants and custom thickness', () => {
    expect(normalize(getUnderlineCssString({ type: 'dashedHeavy' }))).toBe(
      'text-decoration-line: underline; text-decoration-style: dashed; text-decoration-thickness: 0.2em',
    );

    expect(
      normalize(
        getUnderlineCssString({
          type: 'thick',
          thickness: '3px',
        }),
      ),
    ).toBe('text-decoration-line: underline; text-decoration-thickness: 3px');
  });

  it('approximates unsupported styles when approximate=true', () => {
    expect(normalize(getUnderlineCssString({ type: 'dotDash' }))).toBe(
      'text-decoration-line: underline; text-decoration-style: dashed',
    );

    expect(normalize(getUnderlineCssString({ type: 'wavyDouble' }))).toBe(
      'text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 0.2em',
    );
  });

  it('skips approximations when approximate=false', () => {
    const css = getUnderlineCssString({ type: 'dotDash', approximate: false });
    expect(normalize(css)).toBe('text-decoration-line: underline');
  });

  it('injects color when provided', () => {
    const css = getUnderlineCssString({ color: '#FF00FF' });
    expect(normalize(css)).toBe('text-decoration-color: #FF00FF; text-decoration-line: underline');
  });

  it('treats falsy type as single underline', () => {
    const css = getUnderlineCssString({ type: '' });
    expect(normalize(css)).toBe('text-decoration-line: underline');
  });
});
