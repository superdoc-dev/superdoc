/**
 * SD-3400: paragraphs inside a note story session must NEVER lose their
 * paragraph style (FootnoteText), no matter which Enter/Backspace path
 * created or merged them. The user-reported corruption appeared after bursts
 * of Enter/typing/Backspace once the linked-styles cache populated.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { initTestEditor } from '../../tests/helpers/helpers.js';
import { handleEnter, handleBackspace } from '../extensions/keymap.js';

const NOTE_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { paragraphProperties: { styleId: 'FootnoteText' } },
      content: [{ type: 'run', content: [{ type: 'text', text: 'First note line' }] }],
    },
  ],
};

function makeNoteSessionEditor() {
  const { editor } = initTestEditor({ loadFromSchema: true, content: NOTE_DOC });
  // Mark as a note story session (what createStoryEditor sets up).
  editor.options.parentEditor = {};
  editor.options.isHeaderOrFooter = false;
  // Arm the linked-styles cache: FootnoteText IS a linked style in real
  // documents (w:link FootnoteTextChar), which is what made the clearing
  // heuristic fire once the cache populated mid-session.
  editor.converter = {
    ...(editor.converter ?? {}),
    translatedLinkedStyles: {
      styles: {
        FootnoteText: { styleId: 'FootnoteText', type: 'paragraph', link: 'FootnoteTextChar' },
      },
    },
  };
  return editor;
}

function paragraphStyleIds(editor) {
  const ids = [];
  editor.state.doc.forEach((node) => {
    ids.push(node.attrs?.paragraphProperties?.styleId ?? null);
  });
  return ids;
}

function typeText(editor, text) {
  editor.dispatch(editor.state.tr.insertText(text));
}

describe('note session paragraph style preservation (SD-3400)', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('keeps FootnoteText through a burst of Enters, typing, and Backspaces', () => {
    editor = makeNoteSessionEditor();
    // caret to end of content
    const endPos = editor.state.doc.content.size - 2;
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, endPos)));

    // Burst through the REAL keymap chains: Enter x3, type, Enter x2, type,
    // Backspace x4, type.
    handleEnter(editor);
    handleEnter(editor);
    handleEnter(editor);
    typeText(editor, 'first words');
    handleEnter(editor);
    handleEnter(editor);
    typeText(editor, 'second words');
    handleBackspace(editor);
    handleBackspace(editor);
    handleBackspace(editor);
    handleBackspace(editor);
    typeText(editor, 'tail');

    const ids = paragraphStyleIds(editor);
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.every((id) => id === 'FootnoteText')).toBe(true);
  });

  it('keeps FootnoteText when clearNodes normalizes a note paragraph', () => {
    editor = makeNoteSessionEditor();

    editor.commands.clearNodes();

    expect(paragraphStyleIds(editor)).toEqual(['FootnoteText']);
  });
});
