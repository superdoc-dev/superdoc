import { describe, it, expect } from 'vitest';
import { normalizeDocPath } from './utils.js';

describe('normalizeDocPath', () => {
  it('returns a simple relative path unchanged', () => {
    expect(normalizeDocPath('comments-tcs/basic-comments.docx')).toBe('comments-tcs/basic-comments.docx');
  });

  it('strips the test-docs/ prefix (case-insensitive)', () => {
    expect(normalizeDocPath('test-docs/basic/simple.docx')).toBe('basic/simple.docx');
    expect(normalizeDocPath('Test-Docs/basic/simple.docx')).toBe('basic/simple.docx');
  });

  it('strips leading ./', () => {
    expect(normalizeDocPath('./basic/simple.docx')).toBe('basic/simple.docx');
  });

  it('strips leading slashes', () => {
    expect(normalizeDocPath('/basic/simple.docx')).toBe('basic/simple.docx');
    expect(normalizeDocPath('///basic/simple.docx')).toBe('basic/simple.docx');
  });

  it('converts backslashes to forward slashes', () => {
    expect(normalizeDocPath('comments-tcs\\basic-comments.docx')).toBe('comments-tcs/basic-comments.docx');
  });

  it('handles combined prefixes', () => {
    expect(normalizeDocPath('./test-docs/nested/doc.docx')).toBe('nested/doc.docx');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeDocPath('')).toBe('');
  });

  it('handles a bare filename', () => {
    expect(normalizeDocPath('simple.docx')).toBe('simple.docx');
  });
});
