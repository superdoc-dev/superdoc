import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';

import { buildHeadlessCommentBridge, __test__ } from '../headless-comment-bridge';

const { normalizeTrackedChangeToComment, addYComment, updateYComment, deleteYComment, getCommentIndex } = __test__;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createYEnv() {
  const ydoc = new Y.Doc();
  const yArray = ydoc.getArray<Y.Map<unknown>>('comments');
  return { ydoc, yArray };
}

function yArrayToJSON(yArray: Y.Array<Y.Map<unknown>>): Record<string, unknown>[] {
  return yArray.toJSON() as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Yjs write helpers
// ---------------------------------------------------------------------------

describe('Yjs write helpers', () => {
  it('addYComment pushes a YMap to the array', () => {
    const { ydoc, yArray } = createYEnv();
    const comment = { commentId: 'c1', text: 'hello' };
    addYComment(yArray, ydoc, comment, { name: 'Bot' });
    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].commentId).toBe('c1');
  });

  it('updateYComment replaces existing comment by id', () => {
    const { ydoc, yArray } = createYEnv();
    addYComment(yArray, ydoc, { commentId: 'c1', text: 'v1' });
    updateYComment(yArray, ydoc, { commentId: 'c1', text: 'v2' });
    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('v2');
  });

  it('updateYComment is a no-op for unknown id', () => {
    const { ydoc, yArray } = createYEnv();
    addYComment(yArray, ydoc, { commentId: 'c1', text: 'v1' });
    updateYComment(yArray, ydoc, { commentId: 'c999', text: 'v2' });
    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('v1');
  });

  it('deleteYComment removes comment from array', () => {
    const { ydoc, yArray } = createYEnv();
    addYComment(yArray, ydoc, { commentId: 'c1', text: 'bye' });
    expect(yArrayToJSON(yArray)).toHaveLength(1);
    deleteYComment(yArray, ydoc, { commentId: 'c1' });
    expect(yArrayToJSON(yArray)).toHaveLength(0);
  });

  it('deleteYComment is a no-op for unknown id', () => {
    const { ydoc, yArray } = createYEnv();
    addYComment(yArray, ydoc, { commentId: 'c1' });
    deleteYComment(yArray, ydoc, { commentId: 'c999' });
    expect(yArrayToJSON(yArray)).toHaveLength(1);
  });

  it('getCommentIndex returns correct index', () => {
    const { ydoc, yArray } = createYEnv();
    addYComment(yArray, ydoc, { commentId: 'a' });
    addYComment(yArray, ydoc, { commentId: 'b' });
    expect(getCommentIndex(yArray, 'a')).toBe(0);
    expect(getCommentIndex(yArray, 'b')).toBe(1);
    expect(getCommentIndex(yArray, 'z')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Tracked-change normalization
// ---------------------------------------------------------------------------

describe('normalizeTrackedChangeToComment', () => {
  it('maps tracked-change fields to comment shape', () => {
    const result = normalizeTrackedChangeToComment({
      changeId: 'tc-1',
      author: 'Alice',
      authorEmail: 'alice@test.com',
      authorImage: 'img.png',
      date: '2025-01-01',
      trackedChangeText: 'added text',
      trackedChangeType: 'trackInsert',
      deletedText: null,
      documentId: 'doc-1',
      importedAuthor: { name: 'Bob' },
    });

    expect(result.commentId).toBe('tc-1');
    expect(result.trackedChange).toBe(true);
    expect(result.creatorName).toBe('Alice');
    expect(result.creatorEmail).toBe('alice@test.com');
    expect(result.creatorImage).toBe('img.png');
    expect(result.trackedChangeText).toBe('added text');
    expect(result.trackedChangeType).toBe('trackInsert');
    expect(result.documentId).toBe('doc-1');
    expect(result.isInternal).toBe(false);
    expect(result.importedAuthor).toEqual({ name: 'Bob' });
  });

  it('defaults missing fields to null', () => {
    const result = normalizeTrackedChangeToComment({ changeId: 'tc-2' });
    expect(result.creatorName).toBeNull();
    expect(result.creatorEmail).toBeNull();
    expect(result.trackedChangeText).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Event routing via buildHeadlessCommentBridge
// ---------------------------------------------------------------------------

describe('buildHeadlessCommentBridge', () => {
  let ydoc: Y.Doc;
  let yArray: Y.Array<Y.Map<unknown>>;
  let bridge: ReturnType<typeof buildHeadlessCommentBridge>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    yArray = ydoc.getArray('comments');
    bridge = buildHeadlessCommentBridge(ydoc, { name: 'Agent', email: 'agent@test.com' }, 'doc-1');
  });

  it('returns correct editorOptions shape', () => {
    expect(bridge.editorOptions.isCommentsEnabled).toBe(true);
    expect(bridge.editorOptions.documentMode).toBe('editing');
    expect(typeof bridge.editorOptions.onCommentsUpdate).toBe('function');
    expect(typeof bridge.editorOptions.onCommentsLoaded).toBe('function');
  });

  // --- Tracked change events ---

  it('adds tracked-change comment to yArray on add event', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'add',
      changeId: 'tc-1',
      author: 'Agent',
      authorEmail: 'agent@test.com',
      trackedChangeText: 'inserted',
      trackedChangeType: 'trackInsert',
      documentId: 'doc-1',
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].commentId).toBe('tc-1');
    expect(arr[0].trackedChange).toBe(true);
    expect(arr[0].trackedChangeText).toBe('inserted');
  });

  it('updates tracked-change in yArray on update event', () => {
    // First add
    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'add',
      changeId: 'tc-1',
      trackedChangeText: 'v1',
    });

    // Then update
    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'update',
      changeId: 'tc-1',
      trackedChangeText: 'v2',
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].trackedChangeText).toBe('v2');
  });

  it('falls back to Yjs for tracked-change updates when registry misses the id', () => {
    // Simulate a tracked change written by another collaborator after bridge init.
    yArray.push([
      new Y.Map(
        Object.entries({
          commentId: 'tc-late',
          trackedChange: true,
          trackedChangeText: 'v1',
          trackedChangeType: 'trackInsert',
          creatorName: 'Remote Author',
        }),
      ),
    ]);

    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'update',
      changeId: 'tc-late',
      trackedChangeText: 'v2',
      trackedChangeType: 'trackInsert',
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].trackedChangeText).toBe('v2');
    // Sparse updates should not clobber existing metadata.
    expect(arr[0].creatorName).toBe('Remote Author');
  });

  it('falls back to Yjs for tracked-change resolve when registry misses the id', () => {
    // Simulate a tracked change written by another collaborator after bridge init.
    yArray.push([
      new Y.Map(
        Object.entries({
          commentId: 'tc-late-resolve',
          trackedChange: true,
          trackedChangeText: 'pending',
          trackedChangeType: 'trackInsert',
        }),
      ),
    ]);

    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'resolve',
      changeId: 'tc-late-resolve',
      resolvedByEmail: 'resolver@test.com',
      resolvedByName: 'Resolver',
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(typeof arr[0].resolvedTime).toBe('string');
    expect(arr[0].resolvedByEmail).toBe('resolver@test.com');
    expect(arr[0].resolvedByName).toBe('Resolver');
    expect(arr[0].trackedChangeText).toBe('pending');
  });

  it('deduplicates tracked-change add events', () => {
    const params = {
      type: 'trackedChange',
      event: 'add',
      changeId: 'tc-dup',
      trackedChangeText: 'first',
    };

    bridge.editorOptions.onCommentsUpdate(params);
    bridge.editorOptions.onCommentsUpdate({ ...params, trackedChangeText: 'second' });

    const arr = yArrayToJSON(yArray);
    // Should still be 1 entry (updated, not duplicated)
    expect(arr).toHaveLength(1);
    expect(arr[0].trackedChangeText).toBe('second');
  });

  it('resolves tracked-change preserving metadata and writing resolver identity', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'add',
      changeId: 'tc-resolve',
      author: 'Original Author',
      authorEmail: 'author@test.com',
      trackedChangeText: 'some text',
      trackedChangeType: 'trackInsert',
      deletedText: 'old text',
      date: '2025-01-01',
      documentId: 'doc-1',
    });

    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'resolve',
      changeId: 'tc-resolve',
      resolvedByEmail: 'resolver@test.com',
      resolvedByName: 'Resolver',
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    const resolved = arr[0];

    // Resolution fields written
    expect(typeof resolved.resolvedTime).toBe('string');
    expect(resolved.resolvedByEmail).toBe('resolver@test.com');
    expect(resolved.resolvedByName).toBe('Resolver');

    // Original metadata preserved (not overwritten with null)
    expect(resolved.creatorName).toBe('Original Author');
    expect(resolved.creatorEmail).toBe('author@test.com');
    expect(resolved.trackedChangeText).toBe('some text');
    expect(resolved.trackedChangeType).toBe('trackInsert');
    expect(resolved.deletedText).toBe('old text');
    expect(resolved.createdTime).toBe('2025-01-01');
    expect(resolved.documentId).toBe('doc-1');
  });

  it('resolve defaults resolver identity to bridge user when not in payload', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'add',
      changeId: 'tc-resolve-default',
      trackedChangeText: 'text',
    });

    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'resolve',
      changeId: 'tc-resolve-default',
    });

    const arr = yArrayToJSON(yArray);
    expect(arr[0].resolvedByEmail).toBe('agent@test.com');
    expect(arr[0].resolvedByName).toBe('Agent');
  });

  it('resolve is a no-op for unknown tracked-change id', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'resolve',
      changeId: 'tc-unknown',
    });

    expect(yArrayToJSON(yArray)).toHaveLength(0);
  });

  // --- Standard comment events ---

  it('adds standard comment to yArray', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'c-1', text: 'Hello' },
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].commentId).toBe('c-1');
  });

  it('deduplicates add events against late Yjs writes', () => {
    // Simulate a standard comment written by another collaborator after bridge init.
    yArray.push([new Y.Map(Object.entries({ commentId: 'c-late', text: 'from peer' }))]);

    bridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'c-late', text: 'duplicate attempt' },
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('from peer');
  });

  it('updates standard comment in yArray', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'c-1', text: 'v1' },
    });
    bridge.editorOptions.onCommentsUpdate({
      type: 'update',
      comment: { commentId: 'c-1', text: 'v2' },
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('v2');
  });

  it('deletes standard comment from yArray', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'c-1', text: 'bye' },
    });
    bridge.editorOptions.onCommentsUpdate({
      type: 'deleted',
      comment: { commentId: 'c-1' },
    });

    expect(yArrayToJSON(yArray)).toHaveLength(0);
  });

  it('handles resolved event as an update', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'c-1', resolved: false },
    });
    bridge.editorOptions.onCommentsUpdate({
      type: 'resolved',
      comment: { commentId: 'c-1', resolved: true },
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(1);
    expect(arr[0].resolved).toBe(true);
  });

  // --- onCommentsLoaded ---

  it('writes initial comments array to yArray in a single transaction', () => {
    const transactSpy = vi.spyOn(ydoc, 'transact');

    bridge.editorOptions.onCommentsLoaded({
      editor: {},
      comments: [
        { commentId: 'c-1', text: 'a' },
        { commentId: 'c-2', text: 'b' },
      ],
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(2);
    expect(arr[0].commentId).toBe('c-1');
    expect(arr[1].commentId).toBe('c-2');
    // All written in a single transact call
    expect(transactSpy).toHaveBeenCalledTimes(1);
    transactSpy.mockRestore();
  });

  it('onCommentsLoaded deduplicates against registry', () => {
    // Pre-add via event
    bridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'c-1', text: 'existing' },
    });

    bridge.editorOptions.onCommentsLoaded({
      editor: {},
      comments: [
        { commentId: 'c-1', text: 'duplicate' },
        { commentId: 'c-2', text: 'new' },
      ],
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(2);
    // c-1 should be the original, not overwritten
    expect(arr[0].text).toBe('existing');
    expect(arr[1].commentId).toBe('c-2');
  });

  // --- dispose ---

  it('dispose keeps Yjs as dedup source-of-truth', () => {
    bridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'c-1', text: 'test' },
    });

    bridge.dispose();

    // After dispose, Yjs still contains the existing comment id.
    bridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'c-1', text: 'after-dispose' },
    });

    const arr = yArrayToJSON(yArray);
    // Even after dispose, Yjs still holds the canonical comment and prevents duplicates.
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('test');
  });

  // --- Dedup against existing Yjs contents ---

  it('seeds registry from pre-existing Yjs array contents to prevent duplicates', () => {
    // Simulate a room that already has a comment in Yjs (e.g. from another client)
    const preYdoc = new Y.Doc();
    const preArray = preYdoc.getArray('comments');
    const existing = new Y.Map(Object.entries({ commentId: 'pre-existing', text: 'from peer' }));
    preArray.push([existing]);

    const lateBridge = buildHeadlessCommentBridge(preYdoc, { name: 'Late', email: 'late@test.com' });

    // Attempting to add the same commentId should be a no-op (already known)
    lateBridge.editorOptions.onCommentsUpdate({
      type: 'add',
      comment: { commentId: 'pre-existing', text: 'duplicate attempt' },
    });

    const arr = preArray.toJSON() as Record<string, unknown>[];
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('from peer');

    lateBridge.dispose();
  });

  // --- Full integration flow ---

  it('full flow: commentsLoaded then tracked-change events', () => {
    // Simulate initial DOCX load
    bridge.editorOptions.onCommentsLoaded({
      editor: {},
      comments: [{ commentId: 'imported-1', text: 'from docx', trackedChange: false }],
    });

    // Simulate tracked-change edit
    bridge.editorOptions.onCommentsUpdate({
      type: 'trackedChange',
      event: 'add',
      changeId: 'tc-edit-1',
      author: 'Agent',
      trackedChangeText: 'new text',
      trackedChangeType: 'trackInsert',
      documentId: 'doc-1',
    });

    const arr = yArrayToJSON(yArray);
    expect(arr).toHaveLength(2);
    expect(arr[0].commentId).toBe('imported-1');
    expect(arr[1].commentId).toBe('tc-edit-1');
    expect(arr[1].trackedChange).toBe(true);
  });
});
