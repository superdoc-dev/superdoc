import { afterEach, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';

const findTextRange = (doc, text) => {
  let range = null;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      range = {
        from: pos,
        to: pos + node.text.length,
      };
      return false;
    }
    return true;
  });
  return range;
};

/**
 * Test the handleKeyDown plugin handler directly via someProp.
 * Returns true if the handler blocked the key, false if allowed.
 */
const isKeyBlocked = (editor, key, opts = {}) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  // someProp iterates through plugin props and returns the first truthy result.
  // The Editable plugin's handleKeyDown returns true to block, false to allow.
  const blocked = editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));
  return blocked === true;
};

describe('Editable extension backward replace handling', () => {
  let editor = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('replaces backward non-empty selection on beforeinput insertText', () => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<p>PREAMBLE</p>',
    }));

    const range = findTextRange(editor.state.doc, 'PREAMBLE');
    expect(range).not.toBeNull();

    const backwardSelection = TextSelection.create(editor.state.doc, range.to, range.from);
    editor.view.dispatch(editor.state.tr.setSelection(backwardSelection));

    const beforeInputEvent = new InputEvent('beforeinput', {
      data: 'Z',
      inputType: 'insertText',
      bubbles: true,
      cancelable: true,
    });
    editor.view.dom.dispatchEvent(beforeInputEvent);

    expect(editor.state.doc.textContent).toBe('Z');
  });
});

describe('Editable extension – allowSelectionInViewMode', () => {
  let editor = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  // Mirrors PresentationEditor behavior: editor.options.editable is false (set by
  // setDocumentMode), but editorProps.editable returns true (set by PresentationEditor
  // when #isViewLocked() returns false due to allowSelectionInViewMode). This allows
  // PM to process events so the plugin's handleKeyDown fires.
  const createViewModeEditor = () => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<p>Hello world</p>',
      editable: false,
      allowSelectionInViewMode: true,
      editorProps: { editable: () => true },
    }));
    return editor;
  };

  describe('keyboard allowlist', () => {
    it.each([
      ['ArrowLeft', {}],
      ['ArrowRight', {}],
      ['ArrowUp', {}],
      ['ArrowDown', {}],
      ['Home', {}],
      ['End', {}],
      ['PageUp', {}],
      ['PageDown', {}],
    ])('allows navigation key %s', (key, opts) => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, key, opts);
      expect(blocked).toBe(false);
    });

    it('allows Cmd+C (copy)', () => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, 'c', { metaKey: true });
      expect(blocked).toBe(false);
    });

    it('allows Ctrl+C (copy)', () => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, 'c', { ctrlKey: true });
      expect(blocked).toBe(false);
    });

    it('allows Cmd+A (select all)', () => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, 'a', { metaKey: true });
      expect(blocked).toBe(false);
    });

    it('allows Shift+Arrow for selection extending', () => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, 'ArrowRight', { shiftKey: true });
      expect(blocked).toBe(false);
    });

    it.each([
      ['a', {}],
      ['b', {}],
      ['Enter', {}],
      ['Backspace', {}],
      ['Delete', {}],
      ['Tab', {}],
    ])('blocks non-allowed key %s', (key, opts) => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, key, opts);
      expect(blocked).toBe(true);
    });

    it('blocks Cmd+V (paste shortcut)', () => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, 'v', { metaKey: true });
      expect(blocked).toBe(true);
    });

    it('blocks Cmd+X (cut shortcut)', () => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, 'x', { metaKey: true });
      expect(blocked).toBe(true);
    });

    it('blocks Cmd+B (bold shortcut)', () => {
      createViewModeEditor();
      const blocked = isKeyBlocked(editor, 'b', { metaKey: true });
      expect(blocked).toBe(true);
    });
  });

  describe('composition event blocking', () => {
    it.each([
      ['compositionstart', ''],
      ['compositionupdate', 'あ'],
      ['compositionend', '亜'],
    ])('blocks %s when not editable', (type, data) => {
      createViewModeEditor();
      const event = new CompositionEvent(type, {
        data,
        bubbles: true,
        cancelable: true,
      });
      editor.view.dom.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('beforeinput blocking', () => {
    it('blocks text input via beforeinput', () => {
      createViewModeEditor();
      const event = new InputEvent('beforeinput', {
        data: 'Z',
        inputType: 'insertText',
        bubbles: true,
        cancelable: true,
      });
      editor.view.dom.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(editor.state.doc.textContent).toBe('Hello world');
    });
  });
});
