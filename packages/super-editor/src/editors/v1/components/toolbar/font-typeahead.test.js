import { describe, it, expect } from 'vitest';
import { findPrefixMatchIndex, computeTypeahead, normalizeCustomFontFamily } from './font-typeahead.js';

const LABELS = ['Arial', 'Calibri', 'Cambria', 'Times New Roman'];

describe('findPrefixMatchIndex', () => {
  it('matches case-insensitively on a prefix', () => {
    expect(findPrefixMatchIndex('ari', LABELS)).toBe(0);
    expect(findPrefixMatchIndex('CAL', LABELS)).toBe(1);
  });

  it('returns the first matching label when several share a prefix', () => {
    expect(findPrefixMatchIndex('ca', LABELS)).toBe(1);
  });

  it('keeps spaces as part of the query', () => {
    expect(findPrefixMatchIndex('times new', LABELS)).toBe(3);
  });

  it('returns -1 for empty or whitespace queries', () => {
    expect(findPrefixMatchIndex('', LABELS)).toBe(-1);
    expect(findPrefixMatchIndex('   ', LABELS)).toBe(-1);
  });

  it('returns -1 when nothing matches', () => {
    expect(findPrefixMatchIndex('zzz', LABELS)).toBe(-1);
  });
});

describe('computeTypeahead', () => {
  it('completes a prefix and selects the suffix', () => {
    const result = computeTypeahead('ari', LABELS, { autocomplete: true });
    expect(result.matchIndex).toBe(0);
    expect(result.display).toBe('Arial');
    expect(result.selectionStart).toBe(3);
    expect(result.selectionEnd).toBe(5);
  });

  it('does not autocomplete on deletion, but still reports the highlight', () => {
    const result = computeTypeahead('cal', LABELS, { autocomplete: false });
    expect(result.matchIndex).toBe(1);
    expect(result.display).toBe('cal');
    expect(result.selectionStart).toBe(3);
    expect(result.selectionEnd).toBe(3);
  });

  it('leaves a custom typed value untouched when nothing matches', () => {
    const result = computeTypeahead('Wingdings', LABELS, { autocomplete: true });
    expect(result.matchIndex).toBe(-1);
    expect(result.display).toBe('Wingdings');
    expect(result.selectionStart).toBe(9);
    expect(result.selectionEnd).toBe(9);
  });

  it('does not re-select when the query already equals the label', () => {
    const result = computeTypeahead('Arial', LABELS, { autocomplete: true });
    expect(result.display).toBe('Arial');
    expect(result.selectionStart).toBe(5);
    expect(result.selectionEnd).toBe(5);
  });
});

describe('normalizeCustomFontFamily', () => {
  it('keeps a bare logical font name', () => {
    expect(normalizeCustomFontFamily('Brand Sans')).toBe('Brand Sans');
  });

  it('uses only the first family from a CSS-style stack', () => {
    expect(normalizeCustomFontFamily('Arial,sans-serif')).toBe('Arial');
    expect(normalizeCustomFontFamily('Arial, sans-serif')).toBe('Arial');
  });

  it('strips wrapping quotes and collapses whitespace', () => {
    expect(normalizeCustomFontFamily(' "Brand   Sans" , serif')).toBe('Brand Sans');
  });

  it('rejects empty or control-only custom names', () => {
    expect(normalizeCustomFontFamily(', serif')).toBe('');
    expect(normalizeCustomFontFamily('\u0000\u0007')).toBe('');
  });
});
