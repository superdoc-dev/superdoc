import { describe, it, expect, mock, beforeEach } from 'bun:test';
// Mock dependencies before importing the module under test
mock.module('../get-text-adapter.js', () => ({
  getTextAdapter: mock(() => ''),
}));

mock.module('./live-document-counts.js', async (importOriginal) => {
  const original = (await importOriginal()) as any;
  return {
    ...original,
    countWordsFromText: original.countWordsFromText,
    countPages: mock(() => undefined),
  };
});

const { getWordStatistics, resolveDocumentStatFieldValue } = await import('./word-statistics.js');
import { getTextAdapter } from '../get-text-adapter.js';
import { countPages } from './live-document-counts.js';

function mockEditor(): any {
  return { state: { doc: {} } };
}

describe('word-statistics', () => {
  beforeEach(() => {});

  it('computes words from the text projection', () => {
    (getTextAdapter as any).mockReturnValue('Hello world test');
    const stats = getWordStatistics(mockEditor());
    expect(stats.words).toBe(3);
  });

  it('computes characters excluding spaces', () => {
    (getTextAdapter as any).mockReturnValue('Hello world');
    const stats = getWordStatistics(mockEditor());
    // "Helloworld" = 10 (no spaces)
    expect(stats.characters).toBe(10);
  });

  it('computes characters with spaces (excluding newlines)', () => {
    (getTextAdapter as any).mockReturnValue('Hello world\nTest');
    const stats = getWordStatistics(mockEditor());
    // "Hello worldTest" = 15 (newline excluded, space included)
    expect(stats.charactersWithSpaces).toBe(15);
  });

  it('returns pages from the layout engine', () => {
    (getTextAdapter as any).mockReturnValue('text');
    (countPages as any).mockReturnValue(5);
    const stats = getWordStatistics(mockEditor());
    expect(stats.pages).toBe(5);
  });

  it('returns undefined pages when pagination is inactive', () => {
    (getTextAdapter as any).mockReturnValue('text');
    (countPages as any).mockReturnValue(undefined);
    const stats = getWordStatistics(mockEditor());
    expect(stats.pages).toBeUndefined();
  });

  it('handles empty documents', () => {
    (getTextAdapter as any).mockReturnValue('');
    const stats = getWordStatistics(mockEditor());
    expect(stats.words).toBe(0);
    expect(stats.characters).toBe(0);
    expect(stats.charactersWithSpaces).toBe(0);
  });

  it('handles multi-paragraph text with block separators', () => {
    // Text projection uses '\n' as block separator
    (getTextAdapter as any).mockReturnValue('First paragraph\nSecond paragraph\nThird');
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
