import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../get-text-adapter.js', () => ({
  getTextAdapter: vi.fn(() => ''),
}));

vi.mock('./live-document-counts.js', async (importOriginal) => {
  const original = (await importOriginal()) as any;
  return {
    ...original,
    countWordsFromText: original.countWordsFromText,
    countPages: vi.fn(() => undefined),
  };
});

import { getWordStatistics, resolveDocumentStatFieldValue } from './word-statistics.js';
import { getTextAdapter } from '../get-text-adapter.js';
import { countPages } from './live-document-counts.js';

function mockEditor(): any {
  return { state: { doc: {} } };
}

describe('word-statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes words from the text projection', () => {
    vi.mocked(getTextAdapter).mockReturnValue('Hello world test');
    const stats = getWordStatistics(mockEditor());
    expect(stats.words).toBe(3);
  });

  it('computes characters excluding spaces', () => {
    vi.mocked(getTextAdapter).mockReturnValue('Hello world');
    const stats = getWordStatistics(mockEditor());
    // "Helloworld" = 10 (no spaces)
    expect(stats.characters).toBe(10);
  });

  it('computes characters with spaces (excluding newlines)', () => {
    vi.mocked(getTextAdapter).mockReturnValue('Hello world\nTest');
    const stats = getWordStatistics(mockEditor());
    // "Hello worldTest" = 15 (newline excluded, space included)
    expect(stats.charactersWithSpaces).toBe(15);
  });

  it('returns pages from the layout engine', () => {
    vi.mocked(getTextAdapter).mockReturnValue('text');
    vi.mocked(countPages).mockReturnValue(5);
    const stats = getWordStatistics(mockEditor());
    expect(stats.pages).toBe(5);
  });

  it('returns undefined pages when pagination is inactive', () => {
    vi.mocked(getTextAdapter).mockReturnValue('text');
    vi.mocked(countPages).mockReturnValue(undefined);
    const stats = getWordStatistics(mockEditor());
    expect(stats.pages).toBeUndefined();
  });

  it('handles empty documents', () => {
    vi.mocked(getTextAdapter).mockReturnValue('');
    const stats = getWordStatistics(mockEditor());
    expect(stats.words).toBe(0);
    expect(stats.characters).toBe(0);
    expect(stats.charactersWithSpaces).toBe(0);
  });

  it('handles multi-paragraph text with block separators', () => {
    // Text projection uses '\n' as block separator
    vi.mocked(getTextAdapter).mockReturnValue('First paragraph\nSecond paragraph\nThird');
    const stats = getWordStatistics(mockEditor());
    expect(stats.words).toBe(5);
    // Characters excluding all whitespace
    expect(stats.characters).toBe('Firstparagraph'.length + 'Secondparagraph'.length + 'Third'.length);
    // Characters with spaces but not newlines
    expect(stats.charactersWithSpaces).toBe('First paragraph'.length + 'Second paragraph'.length + 'Third'.length);
  });

  it('maps NUMCHARS to the characters metric', () => {
    const stats = {
      words: 12,
      characters: 34,
      charactersWithSpaces: 40,
      pages: 2,
    };

    expect(resolveDocumentStatFieldValue('NUMWORDS', stats)).toBe('12');
    expect(resolveDocumentStatFieldValue('NUMCHARS', stats)).toBe('34');
    expect(resolveDocumentStatFieldValue('NUMPAGES', stats)).toBe('2');
  });

  it('returns null for unknown field types and unavailable NUMPAGES', () => {
    const stats = {
      words: 12,
      characters: 34,
      charactersWithSpaces: 40,
      pages: undefined,
    };

    expect(resolveDocumentStatFieldValue('NUMPAGES', stats)).toBeNull();
    expect(resolveDocumentStatFieldValue('AUTHOR', stats)).toBeNull();
  });
});
