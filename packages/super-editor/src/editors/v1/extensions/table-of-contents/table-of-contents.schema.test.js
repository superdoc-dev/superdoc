import { describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('tableOfContents schema', () => {
  it('accepts a tableOfContents node with no paragraph children', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'tableOfContents',
          attrs: {
            instruction: 'TOC \\o "1-3" \\h \\z \\u',
          },
          content: [],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc, isHeadless: true });

    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild.type.name).toBe('tableOfContents');
    expect(editor.state.doc.firstChild.childCount).toBe(0);

    editor.destroy();
  });
});
