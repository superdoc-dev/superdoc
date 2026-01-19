import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { ref, reactive } from 'vue';

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
          textJson: {
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
  });
});
