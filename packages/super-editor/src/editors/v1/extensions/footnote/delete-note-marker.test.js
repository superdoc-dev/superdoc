import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';

// SD-3400: mock the removal boundary — the wrapper's delete/prune internals
// are covered by footnote-wrappers.test.ts. This suite verifies detection of
// a staged-selected marker and the handoff to the wrapper.
const mockRemoveNoteReferenceAt = vi.fn(() => true);
vi.mock('../../document-api-adapters/plan-engine/footnote-wrappers.js', () => ({
  removeNoteReferenceAt: (...args) => mockRemoveNoteReferenceAt(...args),
}));

import { getSelectedNoteMarker, deleteSelectedNoteMarker } from './delete-note-marker.js';

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
  const markerRun = schema.nodes.run.create(null, schema.nodes[refType].create({ id: '7' }));
  const afterRun = schema.nodes.run.create(null, schema.text('After'));
  return schema.node('doc', null, [schema.node('paragraph', null, [beforeRun, markerRun, afterRun])]);
};

const findNode = (doc, typeName) => {
  let result = null;
  doc.descendants((node, pos) => {
    if (!result && node.type.name === typeName) {
      result = { node, pos, end: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return result;
};

const makeState = (schema, doc, from, to) =>
  EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) });

beforeEach(() => mockRemoveNoteReferenceAt.mockClear());

describe('getSelectedNoteMarker', () => {
  it.each([
    ['footnoteReference', 'footnote'],
    ['endnoteReference', 'endnote'],
  ])('detects a selection spanning exactly one %s atom', (refType, noteType) => {
    const schema = makeSchema();
    const doc = makeDoc(schema, refType);
    const marker = findNode(doc, refType);
    const state = makeState(schema, doc, marker.pos, marker.end);

    expect(getSelectedNoteMarker(state)).toEqual({ pos: marker.pos, noteId: '7', type: noteType });
  });

  it('returns null for a collapsed selection', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const marker = findNode(doc, 'footnoteReference');
    const state = makeState(schema, doc, marker.end, marker.end);

    expect(getSelectedNoteMarker(state)).toBeNull();
  });

  it('returns null when the selection spans regular text', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const state = makeState(schema, doc, 2, 5);

    expect(getSelectedNoteMarker(state)).toBeNull();
  });

  it('returns null when the selection extends beyond the marker', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const marker = findNode(doc, 'footnoteReference');
    const state = makeState(schema, doc, marker.pos, marker.end + 2);

    expect(getSelectedNoteMarker(state)).toBeNull();
  });
});

describe('deleteSelectedNoteMarker', () => {
  it('removes the selected marker through the wrapper (element pruned when last reference)', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const marker = findNode(doc, 'footnoteReference');
    const editor = { state: makeState(schema, doc, marker.pos, marker.end) };

    const handled = deleteSelectedNoteMarker(editor);

    expect(handled).toBe(true);
    expect(mockRemoveNoteReferenceAt).toHaveBeenCalledWith(editor, {
      pos: marker.pos,
      noteId: '7',
      type: 'footnote',
    });
  });

  it('does nothing when the selection is not a staged marker selection', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const editor = { state: makeState(schema, doc, 2, 5) };

    expect(deleteSelectedNoteMarker(editor)).toBe(false);
    expect(mockRemoveNoteReferenceAt).not.toHaveBeenCalled();
  });
});
