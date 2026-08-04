// @ts-nocheck
/**
 * Tracked whole-block deletion authoring, against a REAL ProseMirror
 * schema and state.
 *
 * The sibling blocks-wrappers.test.ts drives a stub transaction, which is fine
 * for target resolution and receipt shape but cannot exercise mark authoring
 * (no live doc). This file covers what actually changed: a tracked
 * `blocks.delete` on a paragraph-shaped block must mark every run AND stamp the
 * paragraph mark, both under ONE revision id. Marking only the runs is the
 * reported bug — accepting that leaves an empty numbered list item behind.
 */

import { describe, expect, it, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import { blocksDeleteWrapper } from './blocks-wrappers.js';
import { registerBuiltInExecutors } from './register-executors.js';
import {
  TrackDeleteMarkName,
  TrackInsertMarkName,
  TrackFormatMarkName,
} from '../../extensions/track-changes/constants.js';

registerBuiltInExecutors();

const USER = { name: 'Alice Reviewer', email: 'alice@example.com' };

const MARK_ATTRS = {
  id: { default: '' },
  author: { default: '' },
  authorId: { default: '' },
  authorEmail: { default: '' },
  authorImage: { default: '' },
  date: { default: '' },
  sourceId: { default: '' },
  importedAuthor: { default: '' },
  revisionGroupId: { default: '' },
  splitFromId: { default: '' },
  changeType: { default: '' },
  before: { default: null },
  after: { default: null },
};

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      attrs: {
        paraId: { default: null },
        sdBlockId: { default: null },
        paragraphProperties: { default: null },
        markTrackChange: { default: null },
      },
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
    // Mirrors the real image node: an inline LEAF, which is what decides
    // whether markDeletion reaches it.
    image: { group: 'inline', inline: true, atom: true, attrs: { src: { default: '' } }, toDOM: () => ['img'] },
  },
  marks: {
    [TrackInsertMarkName]: { attrs: MARK_ATTRS },
    [TrackDeleteMarkName]: { attrs: MARK_ATTRS },
    [TrackFormatMarkName]: { attrs: MARK_ATTRS },
  },
});

function makeEditor() {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', { paraId: 'p1', sdBlockId: 'p1' }, [schema.text('First item')]),
    schema.node('paragraph', { paraId: 'p2', sdBlockId: 'p2' }, [schema.text('Second item')]),
  ]);
  let state = EditorState.create({ doc, schema });

  const editor = {
    schema,
    options: { user: USER },
    commands: { insertTrackedChange: vi.fn(() => true) },
    helpers: {
      blockNode: {
        getBlockNodeById: (id: string) => {
          const matches: Array<{ node: unknown; pos: number }> = [];
          state.doc.descendants((node, pos) => {
            if (node.attrs?.sdBlockId === id) matches.push({ node, pos });
          });
          return matches;
        },
      },
    },
    get state() {
      return state;
    },
    dispatch: (tr: unknown) => {
      state = state.apply(tr as never);
    },
  };

  return {
    editor: editor as never,
    getState: () => state,
  };
}

const deleteMarksIn = (node) => {
  let count = 0;
  node.descendants((child) => {
    count += child.marks.filter((mark) => mark.type.name === TrackDeleteMarkName).length;
  });
  return count;
};

describe('tracked blocks.delete authoring', () => {
  it('marks the runs AND the paragraph mark under one revision id', () => {
    const { editor, getState } = makeEditor();

    const result = blocksDeleteWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
      { changeMode: 'tracked' },
    );
    expect(result.success).toBe(true);

    const next = getState();
    // The block survives until the revision is decided — this is a suggestion.
    expect(next.doc.childCount).toBe(2);

    const target = next.doc.child(0);
    const markTrackChange = target.attrs.markTrackChange;
    expect(markTrackChange, 'paragraph mark must be recorded as deleted').toBeTruthy();
    expect(markTrackChange.type).toBe('paragraphMarkDelete');
    expect(markTrackChange.author).toBe(USER.name);

    // Every run is struck, and shares the paragraph mark's revision id — one
    // decidable change, not two.
    expect(deleteMarksIn(target)).toBeGreaterThan(0);
    target.descendants((child) => {
      for (const mark of child.marks.filter((m) => m.type.name === TrackDeleteMarkName)) {
        expect(mark.attrs.id).toBe(markTrackChange.id);
      }
    });

    // The untouched sibling stays clean.
    expect(next.doc.child(1).attrs.markTrackChange).toBeFalsy();
    expect(deleteMarksIn(next.doc.child(1))).toBe(0);
  });

  // The V2 kernel strikes a TEXT SPAN, so a drawing (no visible length) slipped
  // through unstruck and survived acceptance. V1 marks inline LEAVES, which
  // includes images — this pins that difference so it stays true.
  it('strikes a picture in the block, not just its text', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', { paraId: 'p1', sdBlockId: 'p1' }, [
        schema.node('image', { src: 'rId50' }),
        schema.text('Caption'),
      ]),
      schema.node('paragraph', { paraId: 'p2', sdBlockId: 'p2' }, [schema.text('Second item')]),
    ]);
    let state = EditorState.create({ doc, schema });
    const editor = {
      schema,
      options: { user: USER },
      commands: { insertTrackedChange: vi.fn(() => true) },
      helpers: {
        blockNode: {
          getBlockNodeById: (id: string) => {
            const matches: Array<{ node: unknown; pos: number }> = [];
            state.doc.descendants((node, pos) => {
              if (node.attrs?.sdBlockId === id) matches.push({ node, pos });
            });
            return matches;
          },
        },
      },
      get state() {
        return state;
      },
      dispatch: (tr: unknown) => {
        state = state.apply(tr as never);
      },
    };

    const result = blocksDeleteWrapper(
      editor as never,
      { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
      { changeMode: 'tracked' },
    );
    expect(result.success).toBe(true);

    const target = state.doc.child(0);
    const changeId = target.attrs.markTrackChange.id;
    let imageMarked = false;
    target.descendants((child) => {
      if (child.type.name !== 'image') return;
      imageMarked = child.marks.some((mark) => mark.type.name === TrackDeleteMarkName && mark.attrs.id === changeId);
    });
    expect(imageMarked, 'the picture must be struck under the same revision').toBe(true);
  });

  it('direct mode still removes the block outright', () => {
    const { editor, getState } = makeEditor();

    const result = blocksDeleteWrapper(editor, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
    });
    expect(result.success).toBe(true);

    const next = getState();
    expect(next.doc.childCount).toBe(1);
    expect(next.doc.child(0).textContent).toBe('Second item');
  });
});
