import { describe, it, expect } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { buildSelectionClipboardHtml } from './ProseMirrorRenderer.ts';

describe('buildSelectionClipboardHtml — structured content drag handle', () => {
  /** Read the visible text a paste target would see, ignoring attributes/markup. */
  function visibleText(html: string): string {
    const container = document.createElement('div');
    container.innerHTML = html;
    return container.textContent ?? '';
  }

  function selectFirstParagraph(view: import('prosemirror-view').EditorView): void {
    const paragraph = view.dom.querySelector('.sd-structured-content')?.closest('p');
    if (!paragraph) throw new Error('structured content paragraph not rendered');
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = (view.root as Document).getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  it('omits the SDT alias label from copied content', () => {
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

    const { editor } = initTestEditor({ content, loadFromSchema: true });
    selectFirstParagraph(editor.view);

    const html = buildSelectionClipboardHtml(editor.view, editor);

    // The control's real content survives, but the drag-handle chrome does not:
    // a paste target sees only "text", never the "Anchored metadata" label.
    expect(html).not.toBeNull();
    expect(html).not.toContain('sd-structured-content-draggable');
    expect(visibleText(html as string)).toBe('text');
  });

  it('preserves the alias as node data so a paste back into SuperDoc keeps the control', () => {
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

    const { editor } = initTestEditor({ content, loadFromSchema: true });
    selectFirstParagraph(editor.view);

    const html = buildSelectionClipboardHtml(editor.view, editor) as string;

    // The alias is stripped as *visible text* but retained as the `data-alias`
    // attribute, which `StructuredContent.parseDOM` reads to restore the control.
    expect(html).toContain('data-alias="Anchored metadata"');
  });
});
