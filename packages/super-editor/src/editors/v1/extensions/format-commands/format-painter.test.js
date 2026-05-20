import { afterEach, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';

const doc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'run',
          content: [
            {
              type: 'text',
              text: 'Source',
              marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#aa0000', fontSize: '18pt' } }],
            },
            {
              type: 'text',
              text: ' Target Other',
            },
          ],
        },
      ],
    },
  ],
};

const ranges = {
  source: { from: 2, to: 8 },
  partialTarget: { from: 9, to: 11 },
  target: { from: 9, to: 15 },
  other: { from: 16, to: 21 },
};

function selectRange(editor, range) {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from, range.to)));
}

function pressPointer() {
  const eventName = typeof PointerEvent === 'undefined' ? 'mousedown' : 'pointerdown';
  document.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function releasePointer() {
  const eventName = typeof PointerEvent === 'undefined' ? 'mouseup' : 'pointerup';
  document.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function pressSelectionKey() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
}

function releaseSelectionKey() {
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: false, bubbles: true }));
}

function releasePointerFromToolbar() {
  const toolbar = document.createElement('div');
  toolbar.setAttribute('data-editor-ui-surface', '');
  document.body.appendChild(toolbar);

  releasePointerFromElement(toolbar);
  toolbar.remove();
}

function releasePointerFromDropdownMenu(className = 'toolbar-dropdown-menu') {
  const menu = document.createElement('div');
  menu.className = className;
  document.body.appendChild(menu);

  releasePointerFromElement(menu);
  menu.remove();
}

function releasePointerFromElement(element) {
  const eventName = typeof PointerEvent === 'undefined' ? 'mouseup' : 'pointerup';
  element.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function getFirstTextMarks(editor, range) {
  let marks = [];
  editor.state.doc.nodesBetween(range.from, range.to, (node) => {
    if (!node.isText || marks.length) return;
    marks = node.marks;
  });
  return marks;
}

function getMark(editor, range, markName) {
  return getFirstTextMarks(editor, range).find((mark) => mark.type.name === markName);
}

function allTextInRangeHasMark(editor, range, markName) {
  let foundText = false;
  let allHaveMark = true;
  editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!node.isText) return;
    const textFrom = pos;
    const textTo = pos + node.nodeSize;
    if (textTo <= range.from || textFrom >= range.to) return;

    foundText = true;
    if (!node.marks.some((mark) => mark.type.name === markName)) allHaveMark = false;
  });
  return foundText && allHaveMark;
}

describe('format painter', () => {
  let editor = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('applies copied formatting when the next target selection is made', () => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: structuredClone(doc) }));

    selectRange(editor, ranges.source);
    editor.commands.copyFormat();

    pressPointer();
    selectRange(editor, ranges.target);

    expect(getMark(editor, ranges.target, 'bold')).toBeUndefined();

    releasePointer();

    expect(allTextInRangeHasMark(editor, ranges.target, 'bold')).toBe(true);
    expect(getMark(editor, ranges.target, 'textStyle')?.attrs).toMatchObject({
      color: '#AA0000',
      fontSize: '18pt',
    });
    expect(editor.storage.formatCommands.storedStyle).toBeNull();
  });

  it('keeps applying copied formatting after double-clicking format painter', () => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: structuredClone(doc) }));

    selectRange(editor, ranges.source);
    editor.commands.copyFormat();
    editor.commands.copyFormat();

    pressPointer();
    selectRange(editor, ranges.target);
    releasePointer();
    pressPointer();
    selectRange(editor, ranges.other);
    releasePointer();

    expect(allTextInRangeHasMark(editor, ranges.target, 'bold')).toBe(true);
    expect(allTextInRangeHasMark(editor, ranges.other, 'bold')).toBe(true);
    expect(getMark(editor, ranges.other, 'textStyle')?.attrs).toMatchObject({
      color: '#AA0000',
      fontSize: '18pt',
    });
    expect(editor.storage.formatCommands.storedStyle).not.toBeNull();

    editor.commands.copyFormat();

    expect(editor.storage.formatCommands.storedStyle).toBeNull();
  });

  it('deactivates persistent format painter when the toolbar button is clicked again', () => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: structuredClone(doc) }));

    selectRange(editor, ranges.source);
    editor.commands.copyFormat();
    editor.commands.copyFormat();

    selectRange(editor, ranges.target);
    releasePointerFromToolbar();
    editor.commands.copyFormat();

    expect(editor.storage.formatCommands.storedStyle).toBeNull();
  });

  it('does not apply formatting when pointer is released over a teleported toolbar dropdown', () => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: structuredClone(doc) }));

    selectRange(editor, ranges.source);
    editor.commands.copyFormat();

    pressPointer();
    selectRange(editor, ranges.target);
    releasePointerFromDropdownMenu();

    expect(getMark(editor, ranges.target, 'bold')).toBeUndefined();
    expect(editor.storage.formatCommands.storedStyle).not.toBeNull();
    expect(editor.storage.formatCommands.pointerSelecting).toBe(false);
  });

  it('waits for a drag selection to settle before applying copied formatting', () => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: structuredClone(doc) }));

    selectRange(editor, ranges.source);
    editor.commands.copyFormat();

    pressPointer();
    selectRange(editor, ranges.partialTarget);
    expect(getMark(editor, ranges.partialTarget, 'bold')).toBeUndefined();

    selectRange(editor, ranges.target);
    releasePointer();

    expect(allTextInRangeHasMark(editor, ranges.partialTarget, 'bold')).toBe(true);
    expect(allTextInRangeHasMark(editor, ranges.target, 'bold')).toBe(true);
    expect(editor.storage.formatCommands.storedStyle).toBeNull();
  });

  it('applies copied formatting when keyboard target selection completes', () => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: structuredClone(doc) }));

    selectRange(editor, ranges.source);
    editor.commands.copyFormat();

    pressSelectionKey();
    selectRange(editor, ranges.target);

    expect(getMark(editor, ranges.target, 'bold')).toBeUndefined();

    releaseSelectionKey();

    expect(allTextInRangeHasMark(editor, ranges.target, 'bold')).toBe(true);
    expect(editor.storage.formatCommands.storedStyle).toBeNull();
  });
});
