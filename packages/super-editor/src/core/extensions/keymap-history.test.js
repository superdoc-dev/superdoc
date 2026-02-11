import { describe, it, expect, afterEach } from 'vitest';
import { closeHistory, undoDepth } from 'prosemirror-history';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { handleEnter, handleBackspace, handleDelete } from './keymap.js';

describe('keymap history grouping', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const insertText = (ed, text) => {
    const { from } = ed.state.selection;
    ed.view.dispatch(ed.state.tr.insertText(text, from));
  };

  /** Simulate closeHistoryOnly (space / Opt+Backspace handler). */
  const closeHistoryGroup = (ed) => {
    ed.view.dispatch(closeHistory(ed.view.state.tr));
  };

  it('Enter creates a new undo group boundary', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));

    insertText(editor, 'hello');
    const depthAfterFirstText = undoDepth(editor.state);

    handleEnter(editor);

    insertText(editor, 'world');
    const depthAfterSecondText = undoDepth(editor.state);

    expect(depthAfterSecondText).toBeGreaterThan(depthAfterFirstText);
  });

  it('undo after Enter restores text before Enter', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));

    insertText(editor, 'hello');
    handleEnter(editor);
    insertText(editor, 'world');

    const textBefore = editor.state.doc.textContent;
    expect(textBefore).toContain('hello');
    expect(textBefore).toContain('world');

    editor.commands.undo();
    const textAfterUndo = editor.state.doc.textContent;
    expect(textAfterUndo).toContain('hello');
  });

  it('Enter creates boundary in suggesting mode', () => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<p></p>',
      user: { name: 'Tester', email: 'test@test.com' },
    }));

    editor.commands.enableTrackChanges?.();

    insertText(editor, 'hello');
    const depthAfterFirstText = undoDepth(editor.state);

    handleEnter(editor);

    insertText(editor, 'world');
    const depthAfterSecondText = undoDepth(editor.state);

    expect(depthAfterSecondText).toBeGreaterThan(depthAfterFirstText);
  });

  it('space creates a word-level undo boundary', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));

    insertText(editor, 'hello');
    const depthAfterFirstWord = undoDepth(editor.state);

    // Simulate space handler: closeHistory then type space
    closeHistoryGroup(editor);
    insertText(editor, ' ');

    insertText(editor, 'world');
    const depthAfterSecondWord = undoDepth(editor.state);

    expect(depthAfterSecondWord).toBeGreaterThan(depthAfterFirstWord);
  });

  it('undo after space removes only the last word', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));

    insertText(editor, 'hello');
    closeHistoryGroup(editor);
    insertText(editor, ' world');

    expect(editor.state.doc.textContent).toBe('hello world');

    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('hello');
  });

  it('closeHistory before deletion creates its own undo step', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));

    insertText(editor, 'hello world');
    const depthAfterTyping = undoDepth(editor.state);

    // Simulate Opt+Backspace: closeHistory then delete last word
    closeHistoryGroup(editor);
    const { from } = editor.state.selection;
    editor.view.dispatch(editor.state.tr.delete(from - 5, from));
    const depthAfterDelete = undoDepth(editor.state);

    expect(depthAfterDelete).toBeGreaterThan(depthAfterTyping);

    // Undo should restore the deleted word
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('hello world');
  });

  it('Backspace creates a new undo group boundary', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));

    // Create two paragraphs: type, Enter, type
    insertText(editor, 'hello');
    handleEnter(editor);
    insertText(editor, 'world');
    const depthBeforeBackspace = undoDepth(editor.state);

    // Move cursor to start of second paragraph so joinBackward succeeds
    let secondParaStart = null;
    editor.state.doc.forEach((_node, offset, index) => {
      if (index === 1) secondParaStart = offset + 1;
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(editor.state.selection.constructor.create(editor.state.doc, secondParaStart)),
    );

    // Backspace at start of second paragraph → joins paragraphs
    handleBackspace(editor);

    insertText(editor, ' after');
    const depthAfterBackspace = undoDepth(editor.state);

    expect(depthAfterBackspace).toBeGreaterThan(depthBeforeBackspace);
  });

  it('undo after Backspace join restores paragraph break', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));

    insertText(editor, 'hello');
    handleEnter(editor);
    insertText(editor, 'world');

    expect(editor.state.doc.childCount).toBe(2);

    // Move cursor to start of second paragraph
    let secondParaStart = null;
    editor.state.doc.forEach((_node, offset, index) => {
      if (index === 1) secondParaStart = offset + 1;
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(editor.state.selection.constructor.create(editor.state.doc, secondParaStart)),
    );

    // Backspace joins paragraphs
    handleBackspace(editor);
    expect(editor.state.doc.childCount).toBe(1);

    // Undo should restore the paragraph break
    editor.commands.undo();
    expect(editor.state.doc.childCount).toBe(2);
  });

  it('Delete creates a new undo group boundary', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));

    // Create two paragraphs
    insertText(editor, 'hello');
    handleEnter(editor);
    insertText(editor, 'world');
    const depthBeforeDelete = undoDepth(editor.state);

    // Move cursor to end of first paragraph so joinForward succeeds
    let firstParaEnd = null;
    editor.state.doc.forEach((node, offset, index) => {
      if (index === 0) firstParaEnd = offset + node.nodeSize - 1;
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(editor.state.selection.constructor.create(editor.state.doc, firstParaEnd)),
    );

    // Delete at end of first paragraph → joins paragraphs
    handleDelete(editor);

    insertText(editor, ' after');
    const depthAfterDelete = undoDepth(editor.state);

    expect(depthAfterDelete).toBeGreaterThan(depthBeforeDelete);
  });
});
