import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./word-statistics.js', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('./word-statistics.js');
  return {
    ...original,
    getWordStatistics: vi.fn(),
    resolveMainBodyEditor: vi.fn((editor) => editor),
  };
});

import { refreshAllStatFields } from './refresh-stat-fields.js';
import { getWordStatistics, resolveMainBodyEditor } from './word-statistics.js';

describe('refreshAllStatFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps NUMCHARS to characters excluding spaces', () => {
    vi.mocked(getWordStatistics).mockReturnValue({
      words: 11,
      characters: 19,
      charactersWithSpaces: 22,
      pages: 3,
    });

    const editor = { state: { doc: {} } } as any;
    const cache = refreshAllStatFields(editor);

    expect(resolveMainBodyEditor).toHaveBeenCalledWith(editor);
    expect(cache.get('NUMWORDS')).toBe('11');
    expect(cache.get('NUMCHARS')).toBe('19');
    expect(cache.get('NUMPAGES')).toBe('3');
  });

  it('omits NUMPAGES when pagination is unavailable', () => {
    vi.mocked(getWordStatistics).mockReturnValue({
      words: 11,
      characters: 19,
      charactersWithSpaces: 22,
      pages: undefined,
    });

    const cache = refreshAllStatFields({ state: { doc: {} } } as any);

    expect(cache.get('NUMPAGES')).toBeUndefined();
  });
});
