import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@core/index.js';
import { getStarterExtensions } from '@extensions/index.js';

describe('Run node', () => {
  it('is present in the starter schema', () => {
    const originalMatchMedia = window.matchMedia;
    if (!originalMatchMedia) {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    }

    let editor;

    try {
      editor = new Editor({
        extensions: getStarterExtensions(),
      });
      expect(editor.schema.nodes.run).toBeDefined();
    } finally {
      editor?.destroy();
      if (originalMatchMedia === undefined) {
        delete window.matchMedia;
      } else {
        window.matchMedia = originalMatchMedia;
      }
    }
  });
});
