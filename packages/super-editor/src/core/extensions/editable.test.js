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
