import { describe, it, expect, afterEach, vi } from 'vitest';
import { urlToFile, validateUrlAccessibility } from './handleUrl.js';

describe('handleUrl helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches a remote image and converts it into a File', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['binary'], { type: 'image/png' }),
      headers: {
        get: (key) => (key === 'content-type' ? 'image/png' : null),
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = await urlToFile('https://example.com/path/photo.png');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/path/photo.png',
      expect.objectContaining({ mode: 'cors', credentials: 'omit' }),
    );
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('photo.png');
    expect(file.type).toBe('image/png');
  });

  it('returns null when a CORS error occurs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('Failed to fetch'), { name: 'TypeError' });
      }),
    );

    const file = await urlToFile('https://blocked.example.com/image');
    expect(file).toBeNull();
  });

  it('validates URL accessibility using HEAD requests', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateUrlAccessibility('https://ok.example.com')).resolves.toBe(true);
    await expect(validateUrlAccessibility('https://error.example.com')).resolves.toBe(false);
  });
});
