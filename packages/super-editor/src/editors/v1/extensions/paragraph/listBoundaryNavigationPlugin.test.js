// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createListBoundaryNavigationPlugin } from './listBoundaryNavigationPlugin.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      attrs: {
        paragraphProperties: { default: null },
        listRendering: { default: null },
      },
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
  },
});

function makeListParagraph(text, rightToLeft = false) {
  return schema.nodes.paragraph.create(
    {
      paragraphProperties: {
        numberingProperties: { numId: '1', ilvl: 0 },
        rightToLeft,
      },
      listRendering: { markerText: '1.', numberingType: 'decimal', path: [1] },
    },
    text ? [schema.text(text)] : [],
  );
}

function findTextStart(doc, text) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.isText && node.text === text) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found == null) throw new Error(`Text "${text}" not found`);
  return found;
}

function findTextEnd(doc, text) {
  const start = findTextStart(doc, text);
  return start + text.length;
}

function createViewWithState(state) {
  return {
    state,
    dispatch(tr) {
      this.state = this.state.apply(tr);
    },
  };
}

function createArrowEvent(key) {
  return {
    key,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
  };
}

describe('listBoundaryNavigationPlugin', () => {
  it('moves backward across list boundary on ArrowLeft in LTR', () => {
    const doc = schema.nodes.doc.create(null, [makeListParagraph('alpha', false), makeListParagraph('beta', false)]);
    const secondStart = findTextStart(doc, 'beta');
    const firstEnd = findTextEnd(doc, 'alpha');
    const plugin = createListBoundaryNavigationPlugin();
    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
      selection: TextSelection.create(doc, secondStart),
    });
    const view = createViewWithState(state);
    const event = createArrowEvent('ArrowLeft');

    const handled = plugin.props.handleKeyDown(view, event);

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(view.state.selection.from).toBe(firstEnd);
  });

  it('moves backward across list boundary on ArrowRight in RTL', () => {
    const doc = schema.nodes.doc.create(null, [makeListParagraph('alpha', true), makeListParagraph('beta', true)]);
    const secondStart = findTextStart(doc, 'beta');
    const firstEnd = findTextEnd(doc, 'alpha');
    const plugin = createListBoundaryNavigationPlugin();
    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
      selection: TextSelection.create(doc, secondStart),
    });
    const view = createViewWithState(state);
    const event = createArrowEvent('ArrowRight');

    const handled = plugin.props.handleKeyDown(view, event);

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(view.state.selection.from).toBe(firstEnd);
  });

  it('moves forward across list boundary on ArrowRight in LTR', () => {
    const doc = schema.nodes.doc.create(null, [makeListParagraph('alpha', false), makeListParagraph('beta', false)]);
    const firstEnd = findTextEnd(doc, 'alpha');
    const secondStart = findTextStart(doc, 'beta');
    const plugin = createListBoundaryNavigationPlugin();
    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
      selection: TextSelection.create(doc, firstEnd),
    });
    const view = createViewWithState(state);
    const event = createArrowEvent('ArrowRight');

    const handled = plugin.props.handleKeyDown(view, event);

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(view.state.selection.from).toBe(secondStart);
  });

  it('moves forward across list boundary on ArrowLeft in RTL', () => {
    const doc = schema.nodes.doc.create(null, [makeListParagraph('alpha', true), makeListParagraph('beta', true)]);
    const firstEnd = findTextEnd(doc, 'alpha');
    const secondStart = findTextStart(doc, 'beta');
    const plugin = createListBoundaryNavigationPlugin();
    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
      selection: TextSelection.create(doc, firstEnd),
    });
    const view = createViewWithState(state);
    const event = createArrowEvent('ArrowLeft');

    const handled = plugin.props.handleKeyDown(view, event);

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(view.state.selection.from).toBe(secondStart);
  });
});
