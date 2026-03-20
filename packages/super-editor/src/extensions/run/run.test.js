import { describe, it, expect, mock } from 'bun:test';
import { Editor } from '@core/index.js';
import { getStarterExtensions } from '@extensions/index.js';

describe('Run node', () => {
  it('is present in the starter schema', () => {
    const originalMatchMedia = window.matchMedia;
    if (!originalMatchMedia) {
      window.matchMedia = mock().mockReturnValue({
        matches: false,
        addEventListener: mock(),
        removeEventListener: mock(),
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
