import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlerMock = vi.fn(({ nodes }) =>
  nodes.map((node) => ({
    type: 'paragraph',
    attrs: { 'w14:paraId': node.fakeParaId ?? 'PARA-DEFAULT' },
    content: [],
  })),
);

let uuidCounter = 0;

vi.mock('@converter/v2/importer/docxImporter.js', () => ({
  defaultNodeListHandler: () => ({
    handler: handlerMock,
    handlerEntities: [],
  }),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter += 1;
    return `00000000-0000-4000-8000-00000000000${uuidCounter}`;
  }),
}));

import { importCommentData } from '@converter/v2/importer/documentCommentsImporter.js';
import { v4 as uuidv4 } from 'uuid';

const buildDocx = ({ comments = [], extended = [], documentRanges = [] } = {}) => {
  const commentsElements = comments.map((comment) => ({
    name: 'w:comment',
    attributes: {
      'w:id': String(comment.id),
      'w:author': comment.author ?? 'Author Name',
      'w:email': comment.email,
      'w:initials': comment.initials,
      'w:date': comment.date ?? '2024-01-01T00:00:00Z',
      'custom:internalId': comment.internalId,
      'custom:trackedChange': comment.trackedChange,
      'custom:trackedChangeText': comment.trackedChangeText,
      'custom:trackedChangeType': comment.trackedChangeType,
      'custom:trackedDeletedText': comment.trackedDeletedText,
    },
    elements: comment.elements ?? [{ fakeParaId: comment.paraId ?? `para-${comment.id}` }],
  }));

  const docx = {
    'word/comments.xml': {
      elements: [
        {
          elements: commentsElements,
        },
      ],
    },
  };

  if (!comments.length) {
    docx['word/comments.xml'] = { elements: [{ elements: [] }] };
  }

  if (extended.length) {
    docx['word/commentsExtended.xml'] = {
      elements: [
        {
          elements: extended.map((item) => ({
            name: 'w15:commentEx',
            attributes: {
              'w15:paraId': item.paraId,
              ...(item.done != null ? { 'w15:done': item.done } : {}),
              ...(item.parent ? { 'w15:paraIdParent': item.parent } : {}),
            },
          })),
        },
      ],
    };
  }

  if (documentRanges.length > 0) {
    docx['word/document.xml'] = {
      elements: [
        {
          name: 'w:body',
          elements: documentRanges,
        },
      ],
    };
  }

  return docx;
};

beforeEach(() => {
  handlerMock.mockClear();
  uuidv4.mockClear();
  uuidCounter = 0;
});

describe('importCommentData edge cases', () => {
  it('returns undefined when comments.xml is missing', () => {
    const result = importCommentData({ docx: {} });
    expect(result).toBeUndefined();
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it('returns undefined when comments.xml contains no elements', () => {
    const docx = { 'word/comments.xml': { elements: [] } };
    const result = importCommentData({ docx });
    expect(result).toBeUndefined();
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it('returns an empty array when comments.xml has no comment entries', () => {
    const docx = buildDocx({ comments: [] });
    const result = importCommentData({ docx });
    expect(result).toEqual([]);
    expect(handlerMock).not.toHaveBeenCalled();
  });
});

describe('importCommentData metadata parsing', () => {
  it('uses generated UUID when custom internal id is absent', () => {
    const docx = buildDocx({
      comments: [
        {
          id: 1,
          author: 'Casey Commenter',
          date: '2024-02-10T12:30:00Z',
        },
      ],
    });

    const [comment] = importCommentData({ docx });
    expect(comment.commentId).toBe('00000000-0000-4000-8000-000000000001');
    expect(uuidv4).toHaveBeenCalledTimes(1);
    expect(comment.creatorName).toBe('Casey Commenter');
    expect(comment.createdTime).toBe(new Date('2024-02-10T12:30:00Z').getTime());
    expect(comment.initials).toBeUndefined();
    expect(comment.isDone).toBe(false);
  });

  it('respects provided internal metadata and tracked change fields', () => {
    const docx = buildDocx({
      comments: [
        {
          id: 5,
          internalId: 'comment-internal-id',
          author: 'Jordan Editor',
          email: 'jordan@example.com',
          initials: 'JE',
          date: '2024-03-01T08:00:00Z',
          trackedChange: 'true',
          trackedChangeText: 'Added text',
          trackedChangeType: 'insert',
          trackedDeletedText: 'Removed text',
        },
      ],
    });

    const [comment] = importCommentData({ docx });
    expect(comment.commentId).toBe('comment-internal-id');
    expect(comment.creatorEmail).toBe('jordan@example.com');
    expect(comment.initials).toBe('JE');
    expect(comment.trackedChange).toBe(true);
    expect(comment.trackedChangeText).toBe('Added text');
    expect(comment.trackedChangeType).toBe('insert');
    expect(comment.trackedDeletedText).toBe('Removed text');
  });

  it('normalizes tracked change fields when docx provides "null" values', () => {
    const docx = buildDocx({
      comments: [
        {
          id: 4,
          trackedChange: 'false',
          trackedChangeText: 'null',
          trackedChangeType: undefined,
          trackedDeletedText: 'null',
        },
      ],
    });

    const [comment] = importCommentData({ docx });
    expect(comment.trackedChange).toBe(false);
    expect(comment.trackedChangeText).toBeNull();
    expect(comment.trackedChangeType).toBeUndefined();
    expect(comment.trackedDeletedText).toBeNull();
  });
});

describe('importCommentData extended metadata', () => {
  it('merges commentEx data to determine resolved state and threading', () => {
    const docx = buildDocx({
      comments: [
        {
          id: 1,
          paraId: 'para-parent',
          internalId: 'parent-comment-id',
        },
        {
          id: 2,
          paraId: 'para-child',
        },
      ],
      extended: [
        { paraId: 'para-parent', done: '0' },
        { paraId: 'para-child', done: '1', parent: 'para-parent' },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const [parentComment, childComment] = comments;
    expect(parentComment.isDone).toBe(false);
    expect(childComment.isDone).toBe(true);
    expect(childComment.parentCommentId).toBe(parentComment.commentId);
    expect(handlerMock).toHaveBeenCalledTimes(2);
  });

  it('leaves comments unresolved when commentEx is missing', () => {
    const docx = buildDocx({
      comments: [{ id: 7, paraId: 'para-7' }],
      extended: [],
    });

    const [comment] = importCommentData({ docx });
    expect(comment.isDone).toBe(false);
    expect(comment.parentCommentId).toBeUndefined();
  });

  it('keeps default state when commentsExtended.xml exists without entries', () => {
    const docx = buildDocx({
      comments: [{ id: 11, paraId: 'para-11' }],
    });

    docx['word/commentsExtended.xml'] = { elements: [{ elements: [] }] };

    const [comment] = importCommentData({ docx });
    expect(comment.isDone).toBe(false);
    expect(comment.parentCommentId).toBeUndefined();
  });

  it('resolves parent by last paragraph paraId when comment has multiple paragraphs', () => {
    const docx = buildDocx({
      comments: [
        {
          id: 2,
          internalId: 'parent-comment',
          // Parent has TWO paragraphs: first='FIRST-PARA', last='LAST-PARA'
          elements: [{ fakeParaId: 'FIRST-PARA' }, { fakeParaId: 'LAST-PARA' }],
        },
        {
          id: 3,
          internalId: 'child-comment',
          elements: [{ fakeParaId: 'CHILD-PARA' }],
        },
      ],
      extended: [
        { paraId: 'LAST-PARA', done: '0' },
        // Child points to LAST paragraph of parent (per OOXML spec)
        { paraId: 'CHILD-PARA', done: '0', parent: 'LAST-PARA' },
      ],
    });

    const comments = importCommentData({ docx });
    const child = comments.find((c) => c.commentId === 'child-comment');

    expect(child.parentCommentId).toBe('parent-comment');
  });

  it('preserves comment threading parent when comment is inside a tracked change', () => {
    const docx = buildDocx({
      comments: [
        {
          id: 1,
          paraId: 'parent-para',
          internalId: 'parent-comment',
        },
        {
          id: 2,
          paraId: 'tracked-para',
          internalId: 'tracked-comment',
          trackedChange: 'true',
        },
        {
          id: 3,
          paraId: 'child-para',
          internalId: 'child-comment',
        },
      ],
      extended: [
        { paraId: 'parent-para', done: '0' },
        { paraId: 'tracked-para', done: '0' },
        { paraId: 'child-para', done: '0', parent: 'tracked-para' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '1' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Parent' }] }],
            },
            {
              name: 'w:ins',
              attributes: { 'w:id': 'tc-1', 'w:author': 'Author', 'w:date': '2024-01-01T00:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '3' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Child' }] }],
                },
                { name: 'w:commentRangeEnd', attributes: { 'w:id': '3' } },
              ],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '1' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    const child = comments.find((comment) => comment.commentId === 'child-comment');

    // With the new separation of TC and comments:
    // - trackedChangeParentId tracks the TC association
    // - parentCommentId tracks the threading relationship (from range nesting)
    expect(child.trackedChangeParentId).toBe('tc-1');
    expect(child.parentCommentId).toBe('parent-comment');
    expect(child.threadingParentCommentId).toBe('parent-comment');
  });
});

describe('Google Docs threading (missing commentsExtended.xml)', () => {
  it('detects parent-child relationship from nested ranges', () => {
    const docx = buildDocx({
      comments: [{ id: 0, internalId: 'parent-comment-id' }, { id: 1 }],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '0' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Text' }] }],
            },
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '1' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'More text' }] }],
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '1' },
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '0' },
            },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const parentComment = comments.find((c) => c.commentId === 'parent-comment-id');
    const childComment = comments.find((c) => c.commentId !== 'parent-comment-id');

    expect(parentComment).toBeDefined();
    expect(childComment).toBeDefined();
    expect(parentComment.parentCommentId).toBeUndefined();
    expect(childComment.parentCommentId).toBe(parentComment.commentId);
  });

  it('handles multiple levels of nesting', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'parent-id' },
        { id: 1, internalId: 'child-id' },
        { id: 2, internalId: 'grandchild-id' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '0' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Parent' }] }],
            },
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '1' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Child' }] }],
            },
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '2' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Grandchild' }] }],
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '2' },
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '1' },
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '0' },
            },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(3);

    const parent = comments.find((c) => c.commentId === 'parent-id');
    const child = comments.find((c) => c.commentId === 'child-id');
    const grandchild = comments.find((c) => c.commentId === 'grandchild-id');

    expect(parent.parentCommentId).toBeUndefined();
    expect(child.parentCommentId).toBe(parent.commentId);
    expect(grandchild.parentCommentId).toBe(child.commentId);
  });

  it('returns comments unchanged when no ranges exist', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'comment-1' },
        { id: 1, internalId: 'comment-2' },
      ],
      // No documentRanges provided, so no comment ranges in document.xml
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    // Without ranges, no threading should be detected
    comments.forEach((comment) => {
      expect(comment.parentCommentId).toBeUndefined();
    });
  });

  it('generates a resolved comment when comment has at least one sub-element marked as done', () => {
    const docx = buildDocx({
      comments: [
        {
          id: 1,
          paraId: 'para-1',
          elements: [
            {
              type: 'element',
              name: 'w:p',
              fakeParaId: 'para-2',
              attributes: {
                'w14:paraId': 'para-2',
              },
              elements: [
                {
                  type: 'element',
                  name: 'w:r',
                  elements: [
                    {
                      type: 'element',
                      name: 'w:t',
                      attributes: {},
                      elements: [
                        {
                          type: 'text',
                          text: 'Some text',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'element',
              name: 'w:p',
              fakeParaId: 'para-1',
              attributes: {
                'w14:paraId': 'para-1',
              },
              elements: [
                {
                  type: 'element',
                  name: 'w:r',
                  elements: [
                    {
                      type: 'element',
                      name: 'w:t',
                      attributes: {},
                      elements: [
                        {
                          type: 'text',
                          text: 'Some text',
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
    });
    docx['word/commentsExtended.xml'] = {
      elements: [{ elements: [{ name: 'w15:commentEx', attributes: { 'w15:paraId': 'para-1', 'w15:done': '1' } }] }],
    };

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(1);
    expect(comments[0].isDone).toBe(true);
  });
});

describe('Google Docs threading (missing commentsExtended.xml)', () => {
  it('detects parent-child relationship from nested ranges', () => {
    const docx = buildDocx({
      comments: [{ id: 0, internalId: 'parent-comment-id' }, { id: 1 }],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '0' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Text' }] }],
            },
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '1' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'More text' }] }],
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '1' },
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '0' },
            },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const parentComment = comments.find((c) => c.commentId === 'parent-comment-id');
    const childComment = comments.find((c) => c.commentId !== 'parent-comment-id');

    expect(parentComment).toBeDefined();
    expect(childComment).toBeDefined();
    expect(parentComment.parentCommentId).toBeUndefined();
    expect(childComment.parentCommentId).toBe(parentComment.commentId);
  });

  it('handles multiple levels of nesting', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'parent-id' },
        { id: 1, internalId: 'child-id' },
        { id: 2, internalId: 'grandchild-id' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '0' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Parent' }] }],
            },
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '1' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Child' }] }],
            },
            {
              name: 'w:commentRangeStart',
              attributes: { 'w:id': '2' },
            },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Grandchild' }] }],
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '2' },
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '1' },
            },
            {
              name: 'w:commentRangeEnd',
              attributes: { 'w:id': '0' },
            },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(3);

    const parent = comments.find((c) => c.commentId === 'parent-id');
    const child = comments.find((c) => c.commentId === 'child-id');
    const grandchild = comments.find((c) => c.commentId === 'grandchild-id');

    expect(parent.parentCommentId).toBeUndefined();
    expect(child.parentCommentId).toBe(parent.commentId);
    expect(grandchild.parentCommentId).toBe(child.commentId);
  });

  it('returns comments unchanged when no ranges exist', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'comment-1' },
        { id: 1, internalId: 'comment-2' },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    comments.forEach((comment) => {
      expect(comment.parentCommentId).toBeUndefined();
    });
  });

  it('detects threading from comments sharing same range start position (multi-author)', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'parent-id', author: 'Author A', date: '2024-01-01T10:00:00Z' },
        { id: 1, internalId: 'child-id', author: 'Author B', date: '2024-01-01T10:05:00Z' },
        { id: 2, internalId: 'grandchild-id', author: 'Author C', date: '2024-01-01T10:10:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
            { name: 'w:commentRangeStart', attributes: { 'w:id': '1' } },
            { name: 'w:commentRangeStart', attributes: { 'w:id': '2' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Shared text' }] }],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '1' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '2' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(3);

    const parent = comments.find((c) => c.commentId === 'parent-id');
    const child = comments.find((c) => c.commentId === 'child-id');
    const grandchild = comments.find((c) => c.commentId === 'grandchild-id');

    expect(parent.parentCommentId).toBeUndefined();
    expect(child.parentCommentId).toBe(parent.commentId);
    expect(grandchild.parentCommentId).toBe(parent.commentId);
  });

  it('detects threading from sequential ranges at same position (different authors)', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'author-a-comment', author: 'Author A', date: '2024-01-01T10:00:00Z' },
        { id: 1, internalId: 'author-b-reply', author: 'Author B', date: '2024-01-01T10:05:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
            { name: 'w:commentRangeStart', attributes: { 'w:id': '1' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Selected text' }] }],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '1' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const parentComment = comments.find((c) => c.commentId === 'author-a-comment');
    const childComment = comments.find((c) => c.commentId === 'author-b-reply');

    expect(parentComment.parentCommentId).toBeUndefined();
    expect(childComment.parentCommentId).toBe(parentComment.commentId);
  });

  it('detects threading when reply comments have no ranges (only in comments.xml)', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'parent-with-range', author: 'Author A', date: '2024-01-01T10:00:00Z' },
        { id: 1, internalId: 'reply-no-range', author: 'Author B', date: '2024-01-01T10:05:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Commented text' }] }],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const parentComment = comments.find((c) => c.commentId === 'parent-with-range');
    const replyComment = comments.find((c) => c.commentId === 'reply-no-range');

    expect(parentComment.parentCommentId).toBeUndefined();
    expect(replyComment.parentCommentId).toBe(parentComment.commentId);
  });

  it('preserves existing nested range detection while adding shared position detection', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'parent-nested', author: 'Author A', date: '2024-01-01T10:00:00Z' },
        { id: 1, internalId: 'child-nested', author: 'Author B', date: '2024-01-01T10:05:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Outer' }] }],
            },
            { name: 'w:commentRangeStart', attributes: { 'w:id': '1' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Inner' }] }],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '1' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const parent = comments.find((c) => c.commentId === 'parent-nested');
    const child = comments.find((c) => c.commentId === 'child-nested');

    expect(parent.parentCommentId).toBeUndefined();
    expect(child.parentCommentId).toBe(parent.commentId);
  });
});

describe('Google Docs tracked change comment threading', () => {
  it('detects comment inside tracked change deletion as child of tracked change', () => {
    const docx = buildDocx({
      comments: [{ id: 4, internalId: 'comment-on-deletion', author: 'Missy Fox', date: '2024-01-01T10:00:00Z' }],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:del',
              attributes: { 'w:id': '0', 'w:author': 'Missy Fox', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '4' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:delText', elements: [{ type: 'text', text: 'Tracked changes' }] }],
                },
              ],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '4' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(1);

    const comment = comments[0];
    // The tracked change ID ('0') should be in trackedChangeParentId (not parentCommentId)
    expect(comment.trackedChangeParentId).toBe('0');
  });

  it('detects comment inside tracked change insertion as child of tracked change', () => {
    const docx = buildDocx({
      comments: [{ id: 7, internalId: 'comment-on-insertion', author: 'Missy Fox', date: '2024-01-01T10:00:00Z' }],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:ins',
              attributes: { 'w:id': '2', 'w:author': 'Missy Fox', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '7' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:t', elements: [{ type: 'text', text: ' more more ' }] }],
                },
              ],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '7' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(1);

    const comment = comments[0];
    expect(comment.trackedChangeParentId).toBe('2');
  });

  it('detects multiple comments inside same tracked change', () => {
    const docx = buildDocx({
      comments: [
        { id: 5, internalId: 'first-comment', author: 'Author A', date: '2024-01-01T10:00:00Z' },
        { id: 6, internalId: 'second-comment', author: 'Author B', date: '2024-01-01T10:05:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:ins',
              attributes: { 'w:id': '1', 'w:author': 'Author A', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '5' } },
                { name: 'w:commentRangeStart', attributes: { 'w:id': '6' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Inserted text' }] }],
                },
              ],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '5' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '6' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const firstComment = comments.find((c) => c.commentId === 'first-comment');
    const secondComment = comments.find((c) => c.commentId === 'second-comment');

    // Both should have the tracked change as trackedChangeParentId (not parentCommentId)
    expect(firstComment.trackedChangeParentId).toBe('1');
    expect(secondComment.trackedChangeParentId).toBe('1');
  });

  it('threads nested range replies inside a tracked change', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'root-comment', author: 'Author A', date: '2024-01-01T10:00:00Z' },
        { id: 1, internalId: 'reply-comment', author: 'Author B', date: '2024-01-01T10:05:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:ins',
              attributes: { 'w:id': '55', 'w:author': 'Author A', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
                { name: 'w:commentRangeStart', attributes: { 'w:id': '1' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Inserted text' }] }],
                },
                { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
                { name: 'w:commentRangeEnd', attributes: { 'w:id': '1' } },
              ],
            },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const root = comments.find((c) => c.commentId === 'root-comment');
    const reply = comments.find((c) => c.commentId === 'reply-comment');

    expect(root.trackedChangeParentId).toBe('55');
    expect(root.parentCommentId).toBeUndefined();
    expect(reply.trackedChangeParentId).toBe('55');
    expect(reply.parentCommentId).toBe('root-comment');
  });

  it('detects comments inside replacement tracked change (ins + del)', () => {
    const docx = buildDocx({
      comments: [
        { id: 8, internalId: 'replacement-comment-1', author: 'Missy Fox', date: '2024-01-01T10:00:00Z' },
        { id: 9, internalId: 'replacement-comment-2', author: 'Priya', date: '2024-01-01T10:05:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:ins',
              attributes: { 'w:id': '3', 'w:author': 'Missy Fox', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '8' } },
                { name: 'w:commentRangeStart', attributes: { 'w:id': '9' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'So much more! ' }] }],
                },
              ],
            },
            {
              name: 'w:del',
              attributes: { 'w:id': '3', 'w:author': 'Missy Fox', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeEnd', attributes: { 'w:id': '8' } },
                { name: 'w:commentRangeEnd', attributes: { 'w:id': '9' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:delText', elements: [{ type: 'text', text: 'And more and more' }] }],
                },
              ],
            },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const comment1 = comments.find((c) => c.commentId === 'replacement-comment-1');
    const comment2 = comments.find((c) => c.commentId === 'replacement-comment-2');

    // Both should have the tracked change (ins) as trackedChangeParentId since their range starts in the ins element
    // (parentCommentId is reserved for actual comment replies, not TC associations)
    expect(comment1.trackedChangeParentId).toBe('3');
    expect(comment2.trackedChangeParentId).toBe('3');
  });

  it('does not affect comments outside tracked changes', () => {
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'regular-comment', author: 'Author A', date: '2024-01-01T10:00:00Z' },
        { id: 4, internalId: 'tc-comment', author: 'Author B', date: '2024-01-01T10:05:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Regular text' }] }],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
          ],
        },
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:del',
              attributes: { 'w:id': '1', 'w:author': 'Author B', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '4' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:delText', elements: [{ type: 'text', text: 'Deleted text' }] }],
                },
              ],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '4' } },
          ],
        },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const regularComment = comments.find((c) => c.commentId === 'regular-comment');
    const tcComment = comments.find((c) => c.commentId === 'tc-comment');

    // Regular comment should have no parent
    expect(regularComment.parentCommentId).toBeUndefined();
    // TC comment should have the tracked change as trackedChangeParentId (not parentCommentId)
    expect(tcComment.trackedChangeParentId).toBe('1');
  });
});

describe('Word comment threading (with commentsExtended.xml)', () => {
  it('treats nested ranges as separate comments when both have commentsExtended.xml entries without paraIdParent', () => {
    // This tests the case where Word has nested ranges (like a comment on "world" inside
    // a larger comment on "Hello world") but commentsExtended.xml explicitly defines
    // them as separate top-level comments (no paraIdParent).
    // Range-based nesting should NOT override the explicit commentsExtended.xml structure.
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'outer-comment', paraId: 'para-outer' },
        { id: 1, internalId: 'nested-comment', paraId: 'para-nested' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Hello ' }] }],
            },
            { name: 'w:commentRangeStart', attributes: { 'w:id': '1' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'world' }] }],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '1' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
          ],
        },
      ],
      extended: [
        // Both comments have entries in commentsExtended.xml WITHOUT paraIdParent
        // meaning they are explicitly defined as separate top-level comments
        { paraId: 'para-outer', done: '0' },
        { paraId: 'para-nested', done: '0' },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const outerComment = comments.find((c) => c.commentId === 'outer-comment');
    const nestedComment = comments.find((c) => c.commentId === 'nested-comment');

    // Both should be top-level comments (no parentCommentId)
    // because commentsExtended.xml explicitly defines them without paraIdParent
    expect(outerComment.parentCommentId).toBeUndefined();
    expect(nestedComment.parentCommentId).toBeUndefined();
  });

  it('still respects explicit paraIdParent threading in commentsExtended.xml for nested ranges', () => {
    // When commentsExtended.xml explicitly defines a parent relationship via paraIdParent,
    // that should be respected even with nested ranges
    const docx = buildDocx({
      comments: [
        { id: 0, internalId: 'parent-comment', paraId: 'para-parent' },
        { id: 1, internalId: 'reply-comment', paraId: 'para-reply' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Some text' }] }],
            },
            { name: 'w:commentRangeStart', attributes: { 'w:id': '1' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: ' with reply' }] }],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '1' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
          ],
        },
      ],
      extended: [
        { paraId: 'para-parent', done: '0' },
        // Explicit parent relationship via paraIdParent
        { paraId: 'para-reply', done: '0', parent: 'para-parent' },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const parentComment = comments.find((c) => c.commentId === 'parent-comment');
    const replyComment = comments.find((c) => c.commentId === 'reply-comment');

    expect(parentComment.parentCommentId).toBeUndefined();
    // Reply should have parent from commentsExtended.xml
    expect(replyComment.parentCommentId).toBe('parent-comment');
  });

  it('detects comment inside tracked change insertion as child of tracked change even when commentsExtended.xml exists', () => {
    const docx = buildDocx({
      comments: [{ id: 7, internalId: 'comment-on-insertion', author: 'Missy Fox', date: '2024-01-01T10:00:00Z' }],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:ins',
              attributes: { 'w:id': '2', 'w:author': 'Missy Fox', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '7' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:t', elements: [{ type: 'text', text: ' more more ' }] }],
                },
              ],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '7' } },
          ],
        },
      ],
      extended: [{ paraId: 'para-7', done: '0' }],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(1);

    const comment = comments[0];
    // Comment is on TC text, so trackedChangeParentId should be set instead of parentCommentId
    expect(comment.trackedChangeParentId).toBe('2');
    expect(comment.parentCommentId).toBeUndefined();
  });

  it('detects root comment of a thread as child of tracked change, and replies as child of root', () => {
    const docx = buildDocx({
      comments: [
        { id: 10, internalId: 'root-comment', paraId: 'para-10' },
        { id: 11, internalId: 'reply-comment', paraId: 'para-11' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:ins',
              attributes: { 'w:id': '99', 'w:author': 'Author', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '10' } },
                { name: 'w:commentRangeStart', attributes: { 'w:id': '11' } },
                {
                  name: 'w:r',
                  elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Threaded text' }] }],
                },
              ],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '10' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '11' } },
          ],
        },
      ],
      extended: [
        { paraId: 'para-10', done: '0' },
        { paraId: 'para-11', done: '0', parent: 'para-10' },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const root = comments.find((c) => c.commentId === 'root-comment');
    const reply = comments.find((c) => c.commentId === 'reply-comment');

    // Root should have trackedChangeParentId pointing to tracked change (not parentCommentId)
    expect(root.trackedChangeParentId).toBe('99');
    expect(root.parentCommentId).toBeUndefined();
    // Reply should have trackedChangeParentId pointing to tracked change, but parentCommentId pointing to root
    expect(reply.trackedChangeParentId).toBe('99');
    expect(reply.parentCommentId).toBe('root-comment');
  });

  it('detects comments that end before a deletion in the same paragraph as children of the deletion', () => {
    const docx = buildDocx({
      comments: [
        { id: 7, internalId: 'comment-on-delete', author: 'Author', date: '2024-01-01T10:00:00Z' },
        { id: 8, internalId: 'thread-on-delete', author: 'Author', date: '2024-01-01T10:01:00Z' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '7' } },
            { name: 'w:commentRangeStart', attributes: { 'w:id': '8' } },
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'an' }] }],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '7' } },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '8' } },
            {
              name: 'w:del',
              attributes: { 'w:id': '9', 'w:author': 'Author', 'w:date': '2024-01-01T09:00:00Z' },
              elements: [
                {
                  name: 'w:r',
                  elements: [{ name: 'w:delText', elements: [{ type: 'text', text: 'deletion' }] }],
                },
              ],
            },
          ],
        },
      ],
      extended: [
        { paraId: 'para-7', done: '0' },
        { paraId: 'para-8', done: '0', parent: 'para-7' },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const comment1 = comments.find((c) => c.commentId === 'comment-on-delete');
    const comment2 = comments.find((c) => c.commentId === 'thread-on-delete');

    // Both comments should have trackedChangeParentId pointing to the deletion
    // Comment1 is the root, so parentCommentId is undefined
    expect(comment1.trackedChangeParentId).toBe('9');
    expect(comment1.parentCommentId).toBeUndefined();
    // Comment2 is a reply to comment1 (via commentsExtended parent relationship)
    expect(comment2.trackedChangeParentId).toBe('9');
    expect(comment2.parentCommentId).toBe('comment-on-delete');
  });

  it('imports comment on TC text with trackedChangeParentId but no parentCommentId', () => {
    // Regression test: A single comment placed entirely on tracked change text
    // should have trackedChangeParentId set (for bubble association) but
    // should NOT have parentCommentId (since it's not a reply to another comment)
    const docx = buildDocx({
      comments: [{ id: 0, internalId: 'comment-on-tc', paraId: 'para-0' }],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            {
              name: 'w:ins',
              attributes: { 'w:id': 'tc-1', 'w:author': 'Author', 'w:date': '2024-01-01T00:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } },
                { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'TC text' }] }] },
                { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } },
              ],
            },
          ],
        },
      ],
      extended: [{ paraId: 'para-0', done: '0' }],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(1);
    expect(comments[0].trackedChangeParentId).toBe('tc-1');
    expect(comments[0].parentCommentId).toBeUndefined();
  });

  it('separates trackedChangeParentId from parentCommentId for threaded comment in TC', () => {
    // Regression test: When a comment thread exists on tracked change text,
    // the child comment should have:
    // - trackedChangeParentId: pointing to the TC (for bubble association)
    // - parentCommentId: pointing to the parent comment (for threading)
    const docx = buildDocx({
      comments: [
        { id: 1, internalId: 'parent-comment', paraId: 'para-1' },
        { id: 2, internalId: 'child-comment', paraId: 'para-2' },
      ],
      documentRanges: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:commentRangeStart', attributes: { 'w:id': '1' } },
            {
              name: 'w:ins',
              attributes: { 'w:id': 'tc-1', 'w:author': 'Author', 'w:date': '2024-01-01T00:00:00Z' },
              elements: [
                { name: 'w:commentRangeStart', attributes: { 'w:id': '2' } },
                { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'TC' }] }] },
                { name: 'w:commentRangeEnd', attributes: { 'w:id': '2' } },
              ],
            },
            { name: 'w:commentRangeEnd', attributes: { 'w:id': '1' } },
          ],
        },
      ],
      extended: [
        { paraId: 'para-1', done: '0' },
        { paraId: 'para-2', done: '0', parent: 'para-1' },
      ],
    });

    const comments = importCommentData({ docx });
    expect(comments).toHaveLength(2);

    const parent = comments.find((c) => c.commentId === 'parent-comment');
    const child = comments.find((c) => c.commentId === 'child-comment');

    // Parent comment spans outside TC, so it should NOT have trackedChangeParentId
    expect(parent.trackedChangeParentId).toBeUndefined();
    expect(parent.parentCommentId).toBeUndefined();

    // Child comment is inside TC and is a reply to parent
    expect(child.trackedChangeParentId).toBe('tc-1');
    expect(child.parentCommentId).toBe('parent-comment');
  });
});
