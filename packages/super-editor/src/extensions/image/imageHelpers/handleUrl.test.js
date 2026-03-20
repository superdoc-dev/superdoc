import { describe, it, expect, vi, afterEach } from 'vitest';
import { urlToFile, validateUrlAccessibility } from './handleUrl.js';

describe('handleUrl helpers', () => {
  afterEach(() => {});

  it('fetches a remote image and converts it into a File', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      blob: async () => new Blob(['binary'], { type: 'image/png' }),
      headers: {
        get: (key) => (key === 'content-type' ? 'image/png' : null),
      },
    }));
    globalThis.fetch = fetchMock;

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
    globalThis.fetch = mock(async () => {
      throw Object.assign(new Error('Failed to fetch'), { name: 'TypeError' });
    });

    const file = await urlToFile('https://blocked.example.com/image');
    expect(file).toBeNull();
  });

  it('validates URL accessibility using HEAD requests', async () => {
    const fetchMock = mock().mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('Network error'));
    globalThis.fetch = fetchMock;

    await expect(validateUrlAccessibility('https://ok.example.com')).resolves.toBe(true);
    await expect(validateUrlAccessibility('https://error.example.com')).resolves.toBe(false);
  });
});
