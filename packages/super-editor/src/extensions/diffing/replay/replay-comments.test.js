import { describe, it, expect, vi } from 'vitest';

import { replayComments } from './replay-comments.ts';

/**
 * Verifies added comment diffs insert the comment payload.
 * @returns {void}
 */
const testAddsComment = () => {
  const comments = [];
  const diff = {
    action: 'added',
    nodeType: 'comment',
    commentId: 'c-1',
    commentJSON: { commentId: 'c-1', commentText: 'New comment' },
    text: 'New comment',
  };

  const result = replayComments({ comments, commentDiffs: [diff] });

  expect(result).toEqual({ applied: 1, skipped: 0, warnings: [] });
  expect(comments).toEqual([{ commentId: 'c-1', commentText: 'New comment' }]);
};

/**
 * Verifies modified comment diffs replace the existing payload.
 * @returns {void}
 */
const testModifiesComment = () => {
  const comments = [{ commentId: 'c-1', commentText: 'Old comment', isDone: false }];
  const diff = {
    action: 'modified',
    nodeType: 'comment',
    commentId: 'c-1',
    oldCommentJSON: { commentId: 'c-1', commentText: 'Old comment', isDone: false },
    newCommentJSON: { commentId: 'c-1', commentText: 'Updated comment', isDone: true },
    oldText: 'Old comment',
    newText: 'Updated comment',
    contentDiff: [],
    attrsDiff: {
      added: {},
      deleted: {},
      modified: { isDone: { from: false, to: true } },
    },
  };

  const result = replayComments({ comments, commentDiffs: [diff] });

  expect(result).toEqual({ applied: 1, skipped: 0, warnings: [] });
  expect(comments).toEqual([{ commentId: 'c-1', commentText: 'Updated comment', isDone: true }]);
};

/**
 * Verifies deleted comment diffs remove by resolved comment id.
 * @returns {void}
 */
const testDeletesCommentByResolvedId = () => {
  const comments = [
    { importedId: 'import-1', commentText: 'Imported' },
    { commentId: 'c-2', commentText: 'Keep me' },
  ];
  const diff = {
    action: 'deleted',
    nodeType: 'comment',
    commentId: 'import-1',
    commentJSON: { importedId: 'import-1', commentText: 'Imported' },
    oldText: 'Imported',
  };

  const result = replayComments({ comments, commentDiffs: [diff] });

  expect(result).toEqual({ applied: 1, skipped: 0, warnings: [] });
  expect(comments).toEqual([{ commentId: 'c-2', commentText: 'Keep me' }]);
};

/**
 * Verifies missing modified comment diffs are skipped with warnings.
 * @returns {void}
 */
const testSkipsMissingModifiedComment = () => {
  const comments = [];
  const diff = {
    action: 'modified',
    nodeType: 'comment',
    commentId: 'missing',
    oldCommentJSON: { commentId: 'missing', commentText: 'Old' },
    newCommentJSON: { commentId: 'missing', commentText: 'New' },
    oldText: 'Old',
    newText: 'New',
    contentDiff: [],
    attrsDiff: null,
  };

  const result = replayComments({ comments, commentDiffs: [diff] });

  expect(result.applied).toBe(0);
  expect(result.skipped).toBe(1);
  expect(result.warnings[0]).toContain('not found');
  expect(comments).toEqual([]);
};

/**
 * Verifies replayComments aggregates multi-diff results.
 * @returns {void}
 */
const testAggregatesMultipleDiffs = () => {
  const comments = [{ commentId: 'c-1', commentText: 'Old 1' }];
  const diffs = [
    {
      action: 'modified',
      nodeType: 'comment',
      commentId: 'c-1',
      oldCommentJSON: { commentId: 'c-1', commentText: 'Old 1' },
      newCommentJSON: { commentId: 'c-1', commentText: 'New 1' },
      oldText: 'Old 1',
      newText: 'New 1',
      contentDiff: [],
      attrsDiff: null,
    },
    {
      action: 'added',
      nodeType: 'comment',
      commentId: 'c-2',
      commentJSON: { commentId: 'c-2', commentText: 'New 2' },
      text: 'New 2',
    },
  ];

  const result = replayComments({ comments, commentDiffs: diffs });

  expect(result).toEqual({ applied: 2, skipped: 0, warnings: [] });
  expect(comments).toEqual([
    { commentId: 'c-1', commentText: 'New 1' },
    { commentId: 'c-2', commentText: 'New 2' },
  ]);
};

/**
 * Verifies replayComments emits UI update events through the editor.
 * @returns {void}
 */
const testEmitsCommentsUpdateEvents = () => {
  const comments = [];
  const editor = { emit: vi.fn() };
  const diffs = [
    {
      action: 'added',
      nodeType: 'comment',
      commentId: 'external-1',
      commentJSON: { id: 'external-1' },
      text: 'Added text',
    },
    {
      action: 'modified',
      nodeType: 'comment',
      commentId: 'external-1',
      oldCommentJSON: { id: 'external-1', commentText: 'Old' },
      newCommentJSON: { id: 'external-1' },
      oldText: 'Old',
      newText: 'New text',
      contentDiff: [],
      attrsDiff: null,
    },
    {
      action: 'deleted',
      nodeType: 'comment',
      commentId: 'external-1',
      commentJSON: { id: 'external-1' },
      oldText: 'Old',
    },
  ];

  replayComments({ comments, commentDiffs: diffs, editor });

  expect(editor.emit).toHaveBeenCalledTimes(3);
  expect(editor.emit).toHaveBeenNthCalledWith(
    1,
    'commentsUpdate',
    expect.objectContaining({
      type: 'add',
      comment: expect.objectContaining({ commentId: 'external-1', commentText: 'Added text' }),
    }),
  );
  expect(editor.emit).toHaveBeenNthCalledWith(
    2,
    'commentsUpdate',
    expect.objectContaining({
      type: 'update',
      comment: expect.objectContaining({ commentId: 'external-1', commentText: 'New text' }),
    }),
  );
  expect(editor.emit).toHaveBeenNthCalledWith(
    3,
    'commentsUpdate',
    expect.objectContaining({
      type: 'deleted',
      comment: expect.objectContaining({ commentId: 'external-1' }),
    }),
  );
};

/**
 * Verifies added comments derive commentText from structured `elements` when diff text is empty.
 * @returns {void}
 */
const testDerivesCommentTextFromElements = () => {
  const comments = [];
  const editor = { emit: vi.fn() };
  const diffs = [
    {
      action: 'added',
      nodeType: 'comment',
      commentId: 'external-2',
      commentJSON: {
        id: 'external-2',
        elements: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [{ type: 'text', text: 'New comment' }],
              },
            ],
          },
        ],
      },
      text: '',
    },
  ];

  replayComments({ comments, commentDiffs: diffs, editor });

  expect(editor.emit).toHaveBeenCalledTimes(1);
  expect(editor.emit).toHaveBeenNthCalledWith(
    1,
    'commentsUpdate',
    expect.objectContaining({
      type: 'add',
      comment: expect.objectContaining({ commentId: 'external-2', commentText: 'New comment' }),
    }),
  );
};

/**
 * Verifies replay events include file/document ownership derived from editor context.
 * @returns {void}
 */
const testIncludesDocumentIdentityFromEditor = () => {
  const comments = [];
  const editor = {
    emit: vi.fn(),
    options: { documentId: 'doc-2' },
  };
  const diffs = [
    {
      action: 'added',
      nodeType: 'comment',
      commentId: 'external-doc',
      commentJSON: { id: 'external-doc' },
      text: 'Doc comment',
    },
  ];

  replayComments({ comments, commentDiffs: diffs, editor });

  expect(editor.emit).toHaveBeenCalledWith(
    'commentsUpdate',
    expect.objectContaining({
      type: 'add',
      comment: expect.objectContaining({
        commentId: 'external-doc',
        documentId: 'doc-2',
        fileId: 'doc-2',
      }),
    }),
  );
};

/**
 * Verifies replay keeps existing payload file/document ownership fields.
 * @returns {void}
 */
const testPreservesExistingDocumentIdentity = () => {
  const comments = [];
  const editor = {
    emit: vi.fn(),
    options: { documentId: 'doc-2' },
  };
  const diffs = [
    {
      action: 'added',
      nodeType: 'comment',
      commentId: 'external-owned',
      commentJSON: {
        id: 'external-owned',
        fileId: 'doc-9',
        documentId: 'doc-9',
      },
      text: 'Owned comment',
    },
  ];

  replayComments({ comments, commentDiffs: diffs, editor });

  expect(editor.emit).toHaveBeenCalledWith(
    'commentsUpdate',
    expect.objectContaining({
      type: 'add',
      comment: expect.objectContaining({
        commentId: 'external-owned',
        documentId: 'doc-9',
        fileId: 'doc-9',
      }),
    }),
  );
};

/**
 * Runs the replayComments suite.
 * @returns {void}
 */
const runReplayCommentsSuite = () => {
  it('adds comments from added diffs', testAddsComment);
  it('replaces comments from modified diffs', testModifiesComment);
  it('deletes comments by resolved id', testDeletesCommentByResolvedId);
  it('skips missing modified comments with warnings', testSkipsMissingModifiedComment);
  it('aggregates results across multiple diffs', testAggregatesMultipleDiffs);
  it('emits commentsUpdate events for replayed diffs', testEmitsCommentsUpdateEvents);
  it('derives comment text from elements for replayed additions', testDerivesCommentTextFromElements);
  it('includes replay comment ownership metadata from editor document', testIncludesDocumentIdentityFromEditor);
  it('preserves replay comment ownership metadata when already present', testPreservesExistingDocumentIdentity);
};

describe('replayComments', runReplayCommentsSuite);
