import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import {
  collectTrackedChanges,
  collectTrackedChangesForContext,
  isTrackedChangeActionAllowed,
} from './permission-helpers.js';
import { TrackInsertMarkName, TrackDeleteMarkName } from './constants.js';

describe('permission-helpers', () => {
  let editor;
  let schema;

  const createDoc = (content) => schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, content));

  const createState = (doc) =>
    EditorState.create({
      schema,
      doc,
    });

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
    editor.options.permissionResolver = undefined;
    editor.options.user = { email: 'owner@example.com' };
  });

  it('collectTrackedChanges merges contiguous segments for the same change id', () => {
    const attrs = { id: 'change-1', authorEmail: 'author@example.com' };
    const mark = schema.marks[TrackInsertMarkName].create(attrs);
    const hardBreak = schema.nodes.hardBreak?.create();
    const content = hardBreak
      ? [schema.text('A', [mark]), hardBreak, schema.text('B', [mark])]
      : [schema.text('A', [mark]), schema.text('B', [mark])];
    const doc = createDoc(content);
    const state = createState(doc);

    const changes = collectTrackedChanges({ state, from: 1, to: doc.content.size });

    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe('change-1');
    expect(changes[0].segments).toHaveLength(2);
    expect(changes[0].attrs.authorEmail).toBe('author@example.com');
  });

  it('collectTrackedChanges returns entries when selection is collapsed inside a change', () => {
    const attrs = { id: 'change-collapsed', authorEmail: 'author@example.com' };
    const mark = schema.marks[TrackInsertMarkName].create(attrs);
    const doc = createDoc([schema.text('Hello', [mark])]);
    const state = createState(doc);

    const changes = collectTrackedChanges({ state, from: 3, to: 3 });

    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe('change-collapsed');
  });

  it('collectTrackedChangesForContext filters by tracked change id when provided', () => {
    const insert = schema.marks[TrackInsertMarkName].create({ id: 'ins-1', authorEmail: 'author@example.com' });
    const deletion = schema.marks[TrackDeleteMarkName].create({ id: 'del-1', authorEmail: 'author@example.com' });
    const doc = createDoc([schema.text('A', [insert]), schema.text('B', [deletion])]);
    const state = createState(doc);

    const matchesInsert = collectTrackedChangesForContext({ state, pos: 1, trackedChangeId: 'ins-1' });
    const matchesDelete = collectTrackedChangesForContext({ state, pos: 3, trackedChangeId: 'del-1' });

    expect(matchesInsert).toHaveLength(1);
    expect(matchesInsert[0].id).toBe('ins-1');
    expect(matchesDelete).toHaveLength(1);
    expect(matchesDelete[0].id).toBe('del-1');
  });

  it('isTrackedChangeActionAllowed returns true when no resolver is configured', () => {
    const result = isTrackedChangeActionAllowed({
      editor,
      action: 'accept',
      trackedChanges: [{ id: 'change-1', attrs: { authorEmail: 'author@example.com' } }],
    });
    expect(result).toBe(true);
  });

  it('isTrackedChangeActionAllowed maps permissions for own vs other changes', () => {
    const mockResolver = vi.fn(({ permission }) => permission === 'RESOLVE_OWN');
    editor.options.permissionResolver = mockResolver;

    const ownResult = isTrackedChangeActionAllowed({
      editor,
      action: 'accept',
      trackedChanges: [{ id: 'own', attrs: { authorEmail: 'owner@example.com' } }],
    });
    const otherResult = isTrackedChangeActionAllowed({
      editor,
      action: 'accept',
      trackedChanges: [{ id: 'other', attrs: { authorEmail: 'colleague@example.com' } }],
    });

    expect(ownResult).toBe(true);
    expect(otherResult).toBe(false);
    expect(mockResolver).toHaveBeenCalledTimes(2);
  });

  it('isTrackedChangeActionAllowed treats missing user email as own change', () => {
    const mockResolver = vi.fn(({ permission }) => permission === 'RESOLVE_OWN');
    editor.options.permissionResolver = mockResolver;
    editor.options.user = null;

    const result = isTrackedChangeActionAllowed({
      editor,
      action: 'accept',
      trackedChanges: [{ id: 'unknown-owner', attrs: { authorEmail: 'author@example.com' } }],
    });

    expect(result).toBe(true);
    expect(mockResolver).toHaveBeenCalledWith(
      expect.objectContaining({ permission: 'RESOLVE_OWN', trackedChange: expect.any(Object) }),
    );
  });

  it('isTrackedChangeActionAllowed treats missing author email as own change', () => {
    const mockResolver = vi.fn(({ permission }) => permission === 'RESOLVE_OWN');
    editor.options.permissionResolver = mockResolver;

    const result = isTrackedChangeActionAllowed({
      editor,
      action: 'accept',
      trackedChanges: [{ id: 'no-author', attrs: {} }],
    });

    expect(result).toBe(true);
    expect(mockResolver).toHaveBeenCalledWith(
      expect.objectContaining({ permission: 'RESOLVE_OWN', trackedChange: expect.any(Object) }),
    );
  });

  it('normalizes email casing and whitespace before comparing ownership', () => {
    const mockResolver = vi.fn(() => true);
    editor.options.permissionResolver = mockResolver;
    editor.options.user = { email: ' Owner@Example.com ' };

    const result = isTrackedChangeActionAllowed({
      editor,
      action: 'accept',
      trackedChanges: [{ id: 'case-match', attrs: { authorEmail: 'owner@example.com' } }],
    });

    expect(result).toBe(true);
    expect(mockResolver).toHaveBeenCalledWith(
      expect.objectContaining({ permission: 'RESOLVE_OWN', trackedChange: expect.any(Object) }),
    );
  });

  it('isTrackedChangeActionAllowed short-circuits when any resolver call denies access', () => {
    const mockResolver = vi.fn(({ permission }) => permission !== 'REJECT_OTHER');
    editor.options.permissionResolver = mockResolver;

    const result = isTrackedChangeActionAllowed({
      editor,
      action: 'reject',
      trackedChanges: [
        { id: 'allowed', attrs: { authorEmail: 'owner@example.com' } },
        { id: 'blocked', attrs: { authorEmail: 'colleague@example.com' } },
      ],
    });

    expect(result).toBe(false);
    expect(mockResolver).toHaveBeenCalledTimes(2);
  });
});
