import { describe, it, expect } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';

/**
 * The structured-content drag handle renders the SDT alias as a label. That
 * label is editor chrome, not document text, so it must never end up in a text
 * selection or on the clipboard.
 */
describe('StructuredContentViewBase drag handle', () => {
  function editorWithInlineSdt() {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'structuredContent',
              attrs: { alias: 'Anchored metadata', tag: 'meta-1', appearance: 'hidden' },
              content: [{ type: 'text', text: 'text' }],
            },
          ],
        },
      ],
    };
    return initTestEditor({ content, loadFromSchema: true }).editor;
  }

  it('marks the drag handle non-selectable so its label is excluded from a plain-text copy', () => {
    const editor = editorWithInlineSdt();
    const handle = editor.view.dom.querySelector('.sd-structured-content-draggable');

    expect(handle).not.toBeNull();
    // The label text still lives in the handle (drag affordance / a11y)...
    expect(handle.textContent).toBe('Anchored metadata');
    // ...but the handle opts out of text selection, so Selection.toString()
    // (the plain-text clipboard path) never captures it.
    expect(handle.style.userSelect).toBe('none');
    expect(handle.style.getPropertyValue('-webkit-user-select')).toBe('none');
  });
});
