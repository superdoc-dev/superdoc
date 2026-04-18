import { describe, it, expect, vi, afterEach } from 'vitest';

import { ensureClipboardPermission, readClipboardRaw, readFromClipboard } from '../clipboardUtils.js';

// Helper to restore globals after each test
const originalNavigator = global.navigator;
const originalWindowClipboardItem = globalThis.ClipboardItem;

function restoreGlobals() {
  if (typeof originalNavigator !== 'undefined') {
    global.navigator = originalNavigator;
  } else {
    delete global.navigator;
  }

  if (typeof originalWindowClipboardItem !== 'undefined') {
    globalThis.ClipboardItem = originalWindowClipboardItem;
  } else {
    delete globalThis.ClipboardItem;
  }
}

afterEach(() => {
  restoreGlobals();
  vi.restoreAllMocks();
});

describe('clipboardUtils', () => {
  describe('ensureClipboardPermission', () => {
    it('navigator undefined returns false', async () => {
      // Remove navigator entirely
      delete global.navigator;
      const result = await ensureClipboardPermission();
      expect(result).toBe(false);
    });
    it('permissions absent but clipboard present returns true', async () => {
      global.navigator = {
        clipboard: {},
      };
      const result = await ensureClipboardPermission();
      expect(result).toBe(true);
    });
  });

  describe('readFromClipboard', () => {
    it('navigator.clipboard undefined returns null (no throw)', async () => {
      global.navigator = {};
      const mockState = { schema: { text: (t) => t } };
      const res = await readFromClipboard(mockState);
      expect(res).toBeNull();
    });

    it('read() fails so fallback readText() is used', async () => {
      const readTextMock = vi.fn().mockResolvedValue('plain');
      global.navigator = {
        clipboard: {
          read: vi.fn().mockRejectedValue(new Error('fail')),
          readText: readTextMock,
        },
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'granted' }),
        },
      };

      const mockState = { schema: { text: (t) => t } };
      const res = await readFromClipboard(mockState);

      expect(readTextMock).toHaveBeenCalled();
      expect(res).toBe('plain');
    });
  });

  describe('readClipboardRaw', () => {
    it('returns HTML and text when clipboard.read() succeeds', async () => {
      const htmlBlob = new Blob(['<p>rich</p>'], { type: 'text/html' });
      const textBlob = new Blob(['rich'], { type: 'text/plain' });

      const clipboardItem = {
        types: ['text/html', 'text/plain'],
        getType: vi.fn((type) => {
          if (type === 'text/html') return Promise.resolve(htmlBlob);
          if (type === 'text/plain') return Promise.resolve(textBlob);
          return Promise.reject(new Error('unsupported type'));
        }),
      };

      global.navigator = {
        clipboard: {
          read: vi.fn().mockResolvedValue([clipboardItem]),
          readText: vi.fn().mockResolvedValue('rich'),
        },
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'granted' }),
        },
      };

      const result = await readClipboardRaw();

      expect(result).toEqual({ html: '<p>rich</p>', text: 'rich' });
    });

    it('falls back to readText when permission query throws', async () => {
      const readTextMock = vi.fn().mockResolvedValue('plain fallback text');
      global.navigator = {
        clipboard: {
          readText: readTextMock,
        },
        permissions: {
          query: vi.fn().mockRejectedValue(new Error('unsupported permission name')),
        },
      };

      const result = await readClipboardRaw();

      expect(readTextMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ html: '', text: 'plain fallback text' });
    });
  });
});
