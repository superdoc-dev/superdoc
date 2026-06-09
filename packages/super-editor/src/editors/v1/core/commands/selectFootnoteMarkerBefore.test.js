import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { selectFootnoteMarkerBefore, selectFootnoteMarkerAfter } from './selectFootnoteMarkerBefore.js';

// Mirrors the real document shape: each footnote/endnote reference is an inline
// atom wrapped in its own run (verified against live docs — parentType 'run',
// parentOffset 0).
const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      run: { inline: true, group: 'inline', content: 'inline*' },
      footnoteReference: {
        inline: true,
        group: 'inline',
        atom: true,
        selectable: false,
        attrs: { id: { default: null } },
      },
      endnoteReference: {
        inline: true,
        group: 'inline',
        atom: true,
        selectable: false,
        attrs: { id: { default: null } },
      },
      text: { group: 'inline' },
    },
    marks: {},
  });

const makeDoc = (schema, refType = 'footnoteReference') => {
  const beforeRun = schema.nodes.run.create(null, schema.text('Before'));
  const markerRun = schema.nodes.run.create(null, schema.nodes[refType].create({ id: '1' }));
  const afterRun = schema.nodes.run.create(null, schema.text('After'));
  return schema.node('doc', null, [schema.node('paragraph', null, [beforeRun, markerRun, afterRun])]);
};

const findNode = (doc, typeName, predicate = () => true) => {
  let result = null;
  doc.descendants((node, pos) => {
    if (!result && node.type.name === typeName && predicate(node)) {
      result = { node, pos, end: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return result;
};

describe('selectFootnoteMarkerBefore', () => {
  it.each(['footnoteReference', 'endnoteReference'])('selects a %s marker immediately before the caret', (refType) => {
    const schema = makeSchema();
    const doc = makeDoc(schema, refType);
    const marker = findNode(doc, refType);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, marker.end) });

    let dispatched;
    const ok = selectFootnoteMarkerBefore()({ state, dispatch: (tr) => (dispatched = tr) });

    expect(ok).toBe(true);
    // TextSelection (not NodeSelection — the marker is selectable:false) spanning the atom.
    expect(dispatched.selection).toBeInstanceOf(TextSelection);
    expect(dispatched.selection).not.toBeInstanceOf(NodeSelection);
    expect(dispatched.selection.from).toBe(marker.pos);
    expect(dispatched.selection.to).toBe(marker.end);
  });

  it('selects the marker when the caret is at the start of the FOLLOWING run (marker wrapped in its own run)', () => {
    // Real documents wrap each reference in its own run. Clicking just after the
    // superscript places the caret at the start of the next text run, where
    // nodeBefore is the marker's run wrapper — not the marker itself. The command
    // must look inside the wrapper. (Manual-testing regression: first Backspace
    // deleted the letter before the marker instead of selecting the marker.)
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const marker = findNode(doc, 'footnoteReference');
    const afterRun = findNode(doc, 'run', (n) => n.textContent === 'After');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterRun.pos + 1) });

    let dispatched;
    const ok = selectFootnoteMarkerBefore()({ state, dispatch: (tr) => (dispatched = tr) });

    expect(ok).toBe(true);
    expect(dispatched.selection.from).toBe(marker.pos);
    expect(dispatched.selection.to).toBe(marker.end);
  });

  it('returns true without dispatching when no dispatch is provided (first-press select is allowed)', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const marker = findNode(doc, 'footnoteReference');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, marker.end) });

    expect(selectFootnoteMarkerBefore()({ state })).toBe(true);
  });

  it('returns false on the second press (selection already spans the marker) so deleteSelection runs', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const marker = findNode(doc, 'footnoteReference');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, marker.pos, marker.end) });
    const dispatch = vi.fn();

    expect(selectFootnoteMarkerBefore()({ state, dispatch })).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the node before the caret is not a note marker', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const beforeRun = findNode(doc, 'run');
    // Caret in the middle of the leading "Before" run — nothing to stage.
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeRun.pos + 3) });
    const dispatch = vi.fn();

    expect(selectFootnoteMarkerBefore()({ state, dispatch })).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('selectFootnoteMarkerAfter', () => {
  it.each(['footnoteReference', 'endnoteReference'])('selects a %s marker immediately after the caret', (refType) => {
    const schema = makeSchema();
    const doc = makeDoc(schema, refType);
    const marker = findNode(doc, refType);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, marker.pos) });

    let dispatched;
    const ok = selectFootnoteMarkerAfter()({ state, dispatch: (tr) => (dispatched = tr) });

    expect(ok).toBe(true);
    expect(dispatched.selection).toBeInstanceOf(TextSelection);
    expect(dispatched.selection.from).toBe(marker.pos);
    expect(dispatched.selection.to).toBe(marker.end);
  });

  it('selects the marker when the caret is at the end of the PRECEDING run (marker wrapped in its own run)', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const marker = findNode(doc, 'footnoteReference');
    const beforeRun = findNode(doc, 'run', (n) => n.textContent === 'Before');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeRun.end - 1) });

    let dispatched;
    const ok = selectFootnoteMarkerAfter()({ state, dispatch: (tr) => (dispatched = tr) });

    expect(ok).toBe(true);
    expect(dispatched.selection.from).toBe(marker.pos);
    expect(dispatched.selection.to).toBe(marker.end);
  });

  it('returns false when the node after the caret is not a note marker', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const afterRun = findNode(doc, 'run');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterRun.pos + 1) });
    const dispatch = vi.fn();

    expect(selectFootnoteMarkerAfter()({ state, dispatch })).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
