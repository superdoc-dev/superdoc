import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { ref, reactive, nextTick } from 'vue';

vi.mock('./superdoc-store.js', () => {
  const documents = ref([]);
  const user = reactive({ name: 'Alice', email: 'alice@example.com' });
  const activeSelection = reactive({ documentId: 'doc-1', selectionBounds: {} });
  const selectionPosition = reactive({ source: null });
  const getDocument = (id) => documents.value.find((doc) => doc.id === id);

  const useMockStore = defineStore('superdoc', () => ({
    documents,
    user,
    activeSelection,
    selectionPosition,
    getDocument,
  }));

  return {
    useSuperdocStore: useMockStore,
    __mockSuperdoc: {
      documents,
      user,
      activeSelection,
      selectionPosition,
      emit: vi.fn(),
      config: {
        isInternal: false,
      },
    },
  };
});

vi.mock('@superdoc/components/CommentsLayer/use-comment', () => {
  const mock = vi.fn((params = {}) => {
    const selection = params.selection || { source: 'mock', selectionBounds: {} };
    return {
      ...params,
      commentId: params.commentId ?? 'mock-id',
      selection,
      isInternal: params.isInternal ?? true,
      getValues: () => ({ ...params, commentId: params.commentId ?? 'mock-id', selection }),
      setText: vi.fn(),
    };
  });

  return {
    default: mock,
  };
});

vi.mock('../core/collaboration/helpers.js', () => ({
  syncCommentsToClients: vi.fn(),
}));

vi.mock('../helpers/group-changes.js', () => ({
  groupChanges: vi.fn(() => []),
}));

vi.mock('@superdoc/super-editor', () => ({
  Editor: class {
    getJSON() {
      return { content: [{}] };
    }
    getHTML() {
      return '<p></p>';
    }
    get state() {
      return {};
    }
    get view() {
      return { state: { tr: { setMeta: vi.fn() } }, dispatch: vi.fn() };
    }
  },
  trackChangesHelpers: {
    getTrackChanges: vi.fn(() => []),
  },
  TrackChangesBasePluginKey: 'TrackChangesBasePluginKey',
  CommentsPluginKey: 'CommentsPluginKey',
  getRichTextExtensions: vi.fn(() => []),
}));

import { useCommentsStore } from './comments-store.js';
import { __mockSuperdoc } from './superdoc-store.js';
import { comments_module_events } from '@superdoc/common';
import useComment from '@superdoc/components/CommentsLayer/use-comment';
import { syncCommentsToClients } from '../core/collaboration/helpers.js';

const useCommentMock = useComment;
const syncCommentsToClientsMock = syncCommentsToClients;

describe('comments-store', () => {
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setActivePinia(createPinia());
    store = useCommentsStore();
    __mockSuperdoc.documents.value = [{ id: 'doc-1', type: 'docx' }];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes config and maps initial comments', () => {
    const initialComment = { commentId: 'c-1', text: 'Hello' };

    store.init({
      readOnly: true,
      allowResolve: false,
      comments: [initialComment],
    });

    expect(store.getConfig.readOnly).toBe(true);
    expect(store.getConfig.allowResolve).toBe(false);
    expect(store.commentsList.length).toBe(1);
    expect(useCommentMock).toHaveBeenCalledWith(initialComment);
  });

  it('returns comments by id or imported id', () => {
    const comment = { commentId: 'c-2', importedId: 'import-2' };
    store.commentsList = [comment];

    expect(store.getComment('c-2')).toEqual(comment);
    expect(store.getComment('import-2')).toEqual(comment);
    expect(store.getComment(null)).toBeNull();
    expect(store.getComment(undefined)).toBeNull();
  });

  it('sets active comment and updates the editor', () => {
    const setActiveCommentSpy = vi.fn();
    const superdoc = {
      activeEditor: {
        commands: {
          setActiveComment: setActiveCommentSpy,
        },
      },
    };

    const comment = { commentId: 'comment-1' };
    store.commentsList = [comment];

    store.setActiveComment(superdoc, 'comment-1');
    expect(store.activeComment).toBe('comment-1');
    expect(setActiveCommentSpy).toHaveBeenCalledWith({ commentId: 'comment-1' });

    store.setActiveComment(superdoc, null);
    expect(store.activeComment).toBeNull();
    expect(setActiveCommentSpy).toHaveBeenCalledWith({ commentId: null });
  });

  it('does not throw when superdoc is unavailable during active comment updates', () => {
    const comment = { commentId: 'comment-2' };
    store.commentsList = [comment];

    expect(() => store.setActiveComment(undefined, 'comment-2')).not.toThrow();
    expect(store.activeComment).toBe('comment-2');

    expect(() => store.setActiveComment(undefined, null)).not.toThrow();
    expect(store.activeComment).toBeNull();
  });

  it('updates tracked change comments and emits events', () => {
    const superdoc = {
      emit: vi.fn(),
    };

    const existingComment = {
      commentId: 'change-1',
      trackedChangeText: 'old',
      getValues: vi.fn(() => ({ commentId: 'change-1' })),
    };

    store.commentsList = [existingComment];

    store.handleTrackedChangeUpdate({
      superdoc,
      params: {
        event: 'update',
        changeId: 'change-1',
        trackedChangeText: 'new text',
        trackedChangeType: 'insert',
        deletedText: 'removed',
        authorEmail: 'user@example.com',
        author: 'User',
        date: 123,
        importedAuthor: null,
        documentId: 'doc-1',
        coords: {},
      },
    });

    expect(existingComment.trackedChangeText).toBe('new text');
    expect(existingComment.deletedText).toBe('removed');
    expect(syncCommentsToClientsMock).toHaveBeenCalledWith(
      superdoc,
      expect.objectContaining({
        type: comments_module_events.UPDATE,
        comment: { commentId: 'change-1' },
      }),
    );

    expect(superdoc.emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(superdoc.emit).toHaveBeenCalledWith(
      'comments-update',
      expect.objectContaining({
        type: comments_module_events.UPDATE,
        comment: { commentId: 'change-1' },
      }),
    );
  });

  it('should load comments with correct created time', () => {
    store.init({
      readOnly: true,
      allowResolve: false,
      comments: [],
    });

    const now = Date.now();
    store.processLoadedDocxComments({
      superdoc: __mockSuperdoc,
      editor: null,
      comments: [
        {
          commentId: 'c-1',
          createdTime: now,
          creatorName: 'Gabriel',
          elements: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'run',
                  content: [],
                  attrs: {
                    runProperties: [
                      {
                        xmlName: 'w:rStyle',
                        attributes: {
                          'w:val': 'CommentReference',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'run',
                  content: [
                    {
                      type: 'text',
                      text: 'I am a comment~!',
                      attrs: {
                        type: 'element',
                        attributes: {},
                      },
                      marks: [
                        {
                          type: 'textStyle',
                          attrs: {
                            fontSize: '10pt',
                            fontSizeCs: '10pt',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      documentId: 'doc-1',
    });

    expect(store.commentsList[0].createdTime).toBe(now);
  });

  describe('clearEditorCommentPositions', () => {
    it('clears all editor comment positions', () => {
      // Setup editorCommentPositions with data
      store.editorCommentPositions = {
        'comment-1': { from: 10, to: 20 },
        'comment-2': { from: 30, to: 40 },
        'comment-3': { from: 50, to: 60 },
      };

      // Verify positions are set
      expect(Object.keys(store.editorCommentPositions).length).toBe(3);
      expect(store.editorCommentPositions['comment-1']).toEqual({ from: 10, to: 20 });
      expect(store.editorCommentPositions['comment-2']).toEqual({ from: 30, to: 40 });
      expect(store.editorCommentPositions['comment-3']).toEqual({ from: 50, to: 60 });

      // Clear all positions
      store.clearEditorCommentPositions();

      // Verify all positions are cleared (object should be empty)
      expect(Object.keys(store.editorCommentPositions).length).toBe(0);
      expect(store.editorCommentPositions).toEqual({});
    });

    it('handles already empty editorCommentPositions gracefully', () => {
      store.editorCommentPositions = {};

      // Should not throw
      expect(() => store.clearEditorCommentPositions()).not.toThrow();

      // Should still be empty
      expect(store.editorCommentPositions).toEqual({});
    });

    it('clears positions even with many entries', () => {
      // Setup many comment positions
      const positions = {};
      for (let i = 0; i < 100; i++) {
        positions[`comment-${i}`] = { from: i * 10, to: i * 10 + 5 };
      }
      store.editorCommentPositions = positions;

      // Verify we have 100 entries
      expect(Object.keys(store.editorCommentPositions).length).toBe(100);

      // Clear all
      store.clearEditorCommentPositions();

      // Verify all cleared
      expect(Object.keys(store.editorCommentPositions).length).toBe(0);
    });

    it('resets editorCommentPositions to empty object, not null', () => {
      store.editorCommentPositions = {
        'comment-1': { from: 10, to: 20 },
      };

      store.clearEditorCommentPositions();

      // Should be an empty object, not null or undefined
      expect(store.editorCommentPositions).toEqual({});
      expect(store.editorCommentPositions).not.toBeNull();
      expect(store.editorCommentPositions).not.toBeUndefined();
    });

    it('can be called multiple times safely', () => {
      store.editorCommentPositions = {
        'comment-1': { from: 10, to: 20 },
      };

      // Clear once
      store.clearEditorCommentPositions();
      expect(store.editorCommentPositions).toEqual({});

      // Clear again - should not throw
      expect(() => store.clearEditorCommentPositions()).not.toThrow();
      expect(store.editorCommentPositions).toEqual({});
    });
  });

  describe('viewing visibility filters', () => {
    it('hides tracked change threads when viewing mode hides tracked changes', () => {
      store.commentsList = [
        { commentId: 'tc-parent', trackedChange: true, createdTime: 1 },
        { commentId: 'tc-child', parentCommentId: 'tc-parent', createdTime: 2 },
      ];

      store.setViewingVisibility({
        documentMode: 'viewing',
        commentsVisible: true,
        trackChangesVisible: false,
      });

      expect(store.getGroupedComments.parentComments).toEqual([]);
      expect(store.getGroupedComments.resolvedComments).toEqual([]);
    });

    it('shows standard comment threads when viewing mode shows comments', () => {
      store.commentsList = [
        { commentId: 'c-parent', trackedChange: false, createdTime: 1 },
        { commentId: 'c-child', parentCommentId: 'c-parent', createdTime: 2 },
      ];

      store.setViewingVisibility({
        documentMode: 'viewing',
        commentsVisible: true,
        trackChangesVisible: false,
      });

      expect(store.getGroupedComments.parentComments).toHaveLength(1);
      expect(store.getGroupedComments.parentComments[0].commentId).toBe('c-parent');
    });

    it('hides tracked change threads when children reference importedId', () => {
      store.commentsList = [
        { commentId: 'tc-parent', importedId: 'imp-1', trackedChange: true, createdTime: 1 },
        { commentId: 'tc-child', parentCommentId: 'imp-1', createdTime: 2 },
      ];

      store.setViewingVisibility({
        documentMode: 'viewing',
        commentsVisible: true,
        trackChangesVisible: false,
      });

      expect(store.getGroupedComments.parentComments).toEqual([]);
    });
  });

  describe('getCommentsByPosition', () => {
    it('orders parent comments by document position when available', () => {
      store.commentsList = [
        { commentId: 'c-1', createdTime: 2 },
        { commentId: 'c-2', createdTime: 1 },
        { commentId: 'c-3', createdTime: 3 },
      ];

      store.editorCommentPositions = {
        'c-1': { start: 40, end: 50 },
        'c-2': { start: 10, end: 20 },
      };

      const ordered = store.getCommentsByPosition.parentComments.map((c) => c.commentId);
      expect(ordered).toEqual(['c-2', 'c-1', 'c-3']);
    });

    it('falls back to createdTime for comments without positions', () => {
      store.commentsList = [
        { commentId: 'c-1', createdTime: 3 },
        { commentId: 'c-2', createdTime: 1 },
        { commentId: 'c-3', createdTime: 2 },
      ];

      store.editorCommentPositions = {};

      const ordered = store.getCommentsByPosition.parentComments.map((c) => c.commentId);
      expect(ordered).toEqual(['c-2', 'c-3', 'c-1']);
    });

    it('uses importedId over commentId when looking up positions', () => {
      store.commentsList = [
        { commentId: 'uuid-1', importedId: 'imported-1', createdTime: 3 },
        { commentId: 'uuid-2', importedId: 'imported-2', createdTime: 1 },
        { commentId: 'uuid-3', createdTime: 2 },
      ];

      store.editorCommentPositions = {
        'imported-1': { start: 50, end: 60 },
        'imported-2': { start: 10, end: 20 },
        'uuid-3': { start: 30, end: 40 },
      };

      const ordered = store.getCommentsByPosition.parentComments.map((c) => c.commentId);
      expect(ordered).toEqual(['uuid-2', 'uuid-3', 'uuid-1']);
    });

    it('orders resolved comments by document position', () => {
      store.commentsList = [
        { commentId: 'c-1', createdTime: 1, resolvedTime: 100 },
        { commentId: 'c-2', createdTime: 2, resolvedTime: 200 },
        { commentId: 'c-3', createdTime: 3, resolvedTime: 300 },
      ];

      store.editorCommentPositions = {
        'c-1': { start: 50 },
        'c-2': { start: 10 },
        'c-3': { start: 30 },
      };

      const ordered = store.getCommentsByPosition.resolvedComments.map((c) => c.commentId);
      expect(ordered).toEqual(['c-2', 'c-3', 'c-1']);
    });

    it('supports pos property for position lookup', () => {
      store.commentsList = [
        { commentId: 'c-1', createdTime: 1 },
        { commentId: 'c-2', createdTime: 2 },
      ];

      store.editorCommentPositions = {
        'c-1': { pos: 50 },
        'c-2': { pos: 10 },
      };

      const ordered = store.getCommentsByPosition.parentComments.map((c) => c.commentId);
      expect(ordered).toEqual(['c-2', 'c-1']);
    });

    it('supports from property for position lookup', () => {
      store.commentsList = [
        { commentId: 'c-1', createdTime: 1 },
        { commentId: 'c-2', createdTime: 2 },
      ];

      store.editorCommentPositions = {
        'c-1': { from: 50, to: 60 },
        'c-2': { from: 10, to: 20 },
      };

      const ordered = store.getCommentsByPosition.parentComments.map((c) => c.commentId);
      expect(ordered).toEqual(['c-2', 'c-1']);
    });

    it('supports to property as fallback for position lookup', () => {
      store.commentsList = [
        { commentId: 'c-1', createdTime: 1 },
        { commentId: 'c-2', createdTime: 2 },
      ];

      store.editorCommentPositions = {
        'c-1': { to: 50 },
        'c-2': { to: 10 },
      };

      const ordered = store.getCommentsByPosition.parentComments.map((c) => c.commentId);
      expect(ordered).toEqual(['c-2', 'c-1']);
    });

    it('falls back to createdTime when positions are equal', () => {
      store.commentsList = [
        { commentId: 'c-1', createdTime: 3 },
        { commentId: 'c-2', createdTime: 1 },
        { commentId: 'c-3', createdTime: 2 },
      ];

      store.editorCommentPositions = {
        'c-1': { start: 10 },
        'c-2': { start: 10 },
        'c-3': { start: 10 },
      };

      const ordered = store.getCommentsByPosition.parentComments.map((c) => c.commentId);
      expect(ordered).toEqual(['c-2', 'c-3', 'c-1']);
    });

    it('handles comments with null or undefined ids gracefully', () => {
      store.commentsList = [
        { commentId: 'c-1', createdTime: 2 },
        { commentId: null, createdTime: 1 },
        { createdTime: 3 },
      ];

      store.editorCommentPositions = {
        'c-1': { start: 10 },
      };

      const ordered = store.getCommentsByPosition.parentComments.map((c) => c.commentId);
      expect(ordered).toEqual(['c-1', null, undefined]);
    });
  });

  describe('comment anchor helpers', () => {
    it('returns comment position by id or comment object', () => {
      const comment = { commentId: 'c-1', fileId: 'doc-1' };
      store.commentsList = [comment];
      store.editorCommentPositions = {
        'c-1': { start: 12, end: 18 },
      };

      expect(store.getCommentPosition('c-1')).toEqual({ start: 12, end: 18 });
      expect(store.getCommentPosition(comment)).toEqual({ start: 12, end: 18 });
    });

    it('returns comment position using importedId fallback', () => {
      const comment = { importedId: 'imported-1', fileId: 'doc-1' };
      store.commentsList = [comment];
      store.editorCommentPositions = {
        'imported-1': { start: 20, end: 30 },
      };

      expect(store.getCommentPosition('imported-1')).toEqual({ start: 20, end: 30 });
      expect(store.getCommentPosition(comment)).toEqual({ start: 20, end: 30 });
    });

    it('returns anchored text when editor and positions are available', () => {
      const textBetween = vi.fn(() => 'Anchored text');
      const editorStub = { state: { doc: { textBetween } } };
      __mockSuperdoc.documents.value = [{ id: 'doc-1', type: 'docx', getEditor: () => editorStub }];

      store.commentsList = [{ commentId: 'c-1', fileId: 'doc-1' }];
      store.editorCommentPositions = {
        'c-1': { start: 5, end: 12 },
      };

      expect(store.getCommentAnchoredText('c-1')).toBe('Anchored text');
      expect(textBetween).toHaveBeenCalledWith(5, 12, ' ', ' ');
    });

    it('returns anchored text with custom separator option', () => {
      const textBetween = vi.fn(() => 'Line1\nLine2');
      const editorStub = { state: { doc: { textBetween } } };
      __mockSuperdoc.documents.value = [{ id: 'doc-1', type: 'docx', getEditor: () => editorStub }];

      store.commentsList = [{ commentId: 'c-1', fileId: 'doc-1' }];
      store.editorCommentPositions = {
        'c-1': { start: 0, end: 20 },
      };

      expect(store.getCommentAnchoredText('c-1', { separator: '\n' })).toBe('Line1\nLine2');
      expect(textBetween).toHaveBeenCalledWith(0, 20, '\n', '\n');
    });

    it('returns anchored text without trimming when trim is false', () => {
      const textBetween = vi.fn(() => '  spaced text  ');
      const editorStub = { state: { doc: { textBetween } } };
      __mockSuperdoc.documents.value = [{ id: 'doc-1', type: 'docx', getEditor: () => editorStub }];

      store.commentsList = [{ commentId: 'c-1', fileId: 'doc-1' }];
      store.editorCommentPositions = {
        'c-1': { start: 0, end: 15 },
      };

      expect(store.getCommentAnchoredText('c-1', { trim: false })).toBe('  spaced text  ');
      expect(store.getCommentAnchoredText('c-1')).toBe('spaced text');
    });

    it('returns null when position or editor is missing', () => {
      store.commentsList = [{ commentId: 'c-1', fileId: 'doc-1' }];
      store.editorCommentPositions = {};

      expect(store.getCommentAnchoredText('c-1')).toBeNull();
      expect(store.getCommentAnchorData('c-1')).toBeNull();
    });

    it('returns anchor data with position and text when available', () => {
      const textBetween = vi.fn(() => 'Selected text');
      const editorStub = { state: { doc: { textBetween } } };
      __mockSuperdoc.documents.value = [{ id: 'doc-1', type: 'docx', getEditor: () => editorStub }];

      store.commentsList = [{ commentId: 'c-1', fileId: 'doc-1' }];
      store.editorCommentPositions = {
        'c-1': { start: 10, end: 25 },
      };

      const result = store.getCommentAnchorData('c-1');
      expect(result).toEqual({
        position: { start: 10, end: 25 },
        anchoredText: 'Selected text',
      });
    });

    it('handles empty anchored text', () => {
      const textBetween = vi.fn(() => '');
      const editorStub = { state: { doc: { textBetween } } };
      __mockSuperdoc.documents.value = [{ id: 'doc-1', type: 'docx', getEditor: () => editorStub }];

      store.commentsList = [{ commentId: 'c-1', fileId: 'doc-1' }];
      store.editorCommentPositions = {
        'c-1': { start: 5, end: 5 },
      };

      expect(store.getCommentAnchoredText('c-1')).toBe('');
    });
  });

  describe('document-driven resolution state', () => {
    it('clears resolved metadata when document anchors reappear', async () => {
      const comment = {
        commentId: 'reopen-1',
        resolvedTime: 123,
        resolvedByEmail: 'user@example.com',
        resolvedByName: 'User',
      };

      store.commentsList = [comment];

      store.handleEditorLocationsUpdate({
        'reopen-1': { start: 1, end: 5, bounds: { top: 0, left: 0 } },
      });
      await nextTick();

      expect(comment.resolvedTime).toBeNull();
      expect(comment.resolvedByEmail).toBeNull();
      expect(comment.resolvedByName).toBeNull();
    });

    it('preserves resolved metadata for non-editor comments', async () => {
      const comment = useCommentMock({
        commentId: 'pdf-1',
        fileType: 'pdf',
        selection: { source: 'pdf', selectionBounds: {} },
        resolvedTime: 555,
        resolvedByEmail: 'user@example.com',
        resolvedByName: 'User',
      });

      store.commentsList = [comment];

      store.handleEditorLocationsUpdate({
        'pdf-1': { start: 1, end: 2, bounds: { top: 0, left: 0 } },
      });
      await nextTick();

      expect(comment.resolvedTime).toBe(555);
      expect(comment.resolvedByEmail).toBe('user@example.com');
      expect(comment.resolvedByName).toBe('User');
    });

    it('preserves resolved metadata for tracked-change comments', async () => {
      const comment = {
        commentId: 'tc-1',
        trackedChange: true,
        resolvedTime: 999,
        resolvedByEmail: 'user@example.com',
        resolvedByName: 'User',
      };

      store.commentsList = [comment];

      store.handleEditorLocationsUpdate({
        'tc-1': { start: 3, end: 6, bounds: { top: 0, left: 0 } },
      });
      await nextTick();

      expect(comment.resolvedTime).toBe(999);
      expect(comment.resolvedByEmail).toBe('user@example.com');
      expect(comment.resolvedByName).toBe('User');
    });

    it('preserves resolved metadata for replies to tracked-change comments', async () => {
      const comment = {
        commentId: 'tc-reply-1',
        trackedChangeParentId: 'tc-parent',
        resolvedTime: 888,
        resolvedByEmail: 'user@example.com',
        resolvedByName: 'User',
      };

      store.commentsList = [comment];

      store.handleEditorLocationsUpdate({
        'tc-reply-1': { start: 10, end: 15, bounds: { top: 0, left: 0 } },
      });
      await nextTick();

      expect(comment.resolvedTime).toBe(888);
      expect(comment.resolvedByEmail).toBe('user@example.com');
      expect(comment.resolvedByName).toBe('User');
    });
  });
});
