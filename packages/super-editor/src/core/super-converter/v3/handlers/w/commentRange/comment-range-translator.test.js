import { commentRangeStartTranslator, commentRangeEndTranslator } from './comment-range-translator';

describe('w:commentRangeStart and w:commentRangeEnd', () => {
  // The `decode` describe block uses commentRangeStartTranslator only, but it could as well be the commentRangeEndTranslator
  // They share the same behavior, except for one specific case, and hence we have two separate describe blocks for that.
  describe('decode', () => {
    test('returns if node is not given', () => {
      expect(commentRangeStartTranslator.decode({ node: undefined })).toBe(undefined);
    });

    test('returns if comments are not given', () => {
      expect(commentRangeStartTranslator.decode({ node: {}, comments: undefined })).toBe(undefined);
    });

    test('returns if exportedCommentDefs is empty', () => {
      expect(commentRangeStartTranslator.decode({ node: {}, comments: [{}], exportedCommentDefs: [] })).toBe(undefined);
    });

    test('returns if commentsExportType is "clean"', () => {
      expect(
        commentRangeStartTranslator.decode({
          node: {},
          comments: [],
          exportedCommentDefs: [{}],
          commentsExportType: 'clean',
        }),
      ).toBe(undefined);
    });

    test('returns if the original comment is not found', () => {
      expect(
        commentRangeStartTranslator.decode({
          node: { attrs: { 'w:id': 'id1' } },
          comments: [{ commentId: 'id2' }],
          exportedCommentDefs: [{}],
          commentsExportType: 'external',
        }),
      ).toBe(undefined);
    });

    test('returns if commentsExportType is external and comment is internal', () => {
      expect(
        commentRangeStartTranslator.decode({
          node: { attrs: { 'w:id': 'id1' } },
          comments: [{ commentId: 'id1', isInternal: true }],
          exportedCommentDefs: [{}],
          commentsExportType: 'external',
        }),
      ).toBe(undefined);
    });

    test('returns if commentsExportType is external and parent comment is internal', () => {
      expect(
        commentRangeStartTranslator.decode({
          node: { attrs: { 'w:id': 'id2' } },
          comments: [
            { commentId: 'id1', isInternal: true },
            { commentId: 'id2', parentCommentId: 'id1' },
          ],
          exportedCommentDefs: [{}],
          commentsExportType: 'external',
        }),
      ).toBe(undefined);
    });

    test('does not skip resolved comments', () => {
      expect(
        commentRangeStartTranslator.decode({
          node: { type: 'commentRangeStart', attrs: { 'w:id': 'id1' } },
          comments: [{ commentId: 'id1', resolvedTime: Date.now() }],
          exportedCommentDefs: [{}],
          commentsExportType: 'external',
        }),
      ).toStrictEqual({ attributes: { 'w:id': '0' }, name: 'w:commentRangeStart' });
    });

    test('returns if node type is not commentRangeStart or commentRangeEnd', () => {
      expect(
        commentRangeStartTranslator.decode({
          node: { attrs: { 'w:id': 'id1', type: 'randomNode' } },
          comments: [{ commentId: 'id1' }],
          exportedCommentDefs: [{}],
          commentsExportType: 'external',
        }),
      ).toBe(undefined);
    });
  });

  describe('decode:commentRangeStartTranslator', () => {
    test('returns comment schema', () => {
      expect(
        commentRangeStartTranslator.decode({
          node: { type: 'commentRangeStart', attrs: { 'w:id': 'id1' } },
          comments: [{ commentId: 'id1' }],
          exportedCommentDefs: [{}],
          commentsExportType: 'external',
        }),
      ).toStrictEqual({ attributes: { 'w:id': '0' }, name: 'w:commentRangeStart' });
    });
  });

  describe('decode:commentRangeEndTranslator', () => {
    test('returns comment schema', () => {
      expect(
        commentRangeEndTranslator.decode({
          node: { type: 'commentRangeEnd', attrs: { 'w:id': 'id1' } },
          comments: [{ commentId: 'id1' }],
          exportedCommentDefs: [{}],
          commentsExportType: 'external',
        }),
      ).toStrictEqual([
        { attributes: { 'w:id': '0' }, name: 'w:commentRangeEnd' },
        {
          elements: [
            {
              attributes: {
                'w:id': '0',
              },
              name: 'w:commentReference',
            },
          ],
          name: 'w:r',
        },
      ]);
    });
  });

  describe('decode:range-based tracked change wrappers', () => {
    test('wraps range markers with w:ins when trackInsert mark is present', () => {
      const result = commentRangeStartTranslator.decode({
        node: {
          type: 'commentRangeStart',
          attrs: { 'w:id': 'id1' },
          marks: [
            {
              type: 'trackInsert',
              attrs: {
                id: 'tc-1',
                author: 'Author A',
                authorEmail: 'author@example.com',
                date: '2025-01-01T00:00:00Z',
              },
            },
          ],
        },
        comments: [{ commentId: 'id1', threadingMethod: 'range-based' }],
        exportedCommentDefs: [{}],
        commentsExportType: 'external',
      });

      expect(result).toStrictEqual({
        name: 'w:ins',
        attributes: {
          'w:id': 'tc-1',
          'w:author': 'Author A',
          'w:authorEmail': 'author@example.com',
          'w:date': '2025-01-01T00:00:00Z',
        },
        elements: [{ attributes: { 'w:id': '0' }, name: 'w:commentRangeStart' }],
      });
    });

    test('wraps range markers with w:del when trackDelete mark is present', () => {
      const result = commentRangeEndTranslator.decode({
        node: {
          type: 'commentRangeEnd',
          attrs: { 'w:id': 'id1' },
          marks: [
            {
              type: 'trackDelete',
              attrs: {
                id: 'tc-2',
                author: 'Author B',
                authorEmail: 'authorb@example.com',
                date: '2025-01-02T00:00:00Z',
              },
            },
          ],
        },
        comments: [{ commentId: 'id1', threadingMethod: 'range-based' }],
        exportedCommentDefs: [{}],
        commentsExportType: 'external',
      });

      expect(result.name).toBe('w:del');
      expect(result.attributes).toStrictEqual({
        'w:id': 'tc-2',
        'w:author': 'Author B',
        'w:authorEmail': 'authorb@example.com',
        'w:date': '2025-01-02T00:00:00Z',
      });
      expect(result.elements[0]).toStrictEqual({ attributes: { 'w:id': '0' }, name: 'w:commentRangeEnd' });
      expect(result.elements[1].name).toBe('w:r');
      expect(result.elements[1].elements[0]).toStrictEqual({
        attributes: { 'w:id': '0' },
        name: 'w:commentReference',
      });
    });

    test('wraps replace threading with w:ins for start and w:del for end', () => {
      const createdTime = Date.UTC(2025, 0, 1);
      const comments = [
        { commentId: 'child', parentCommentId: 'parent', threadingMethod: 'range-based' },
        {
          commentId: 'parent',
          trackedChange: true,
          trackedChangeType: 'both',
          creatorName: 'Parent Author',
          creatorEmail: 'parent@example.com',
          createdTime,
        },
      ];

      const startResult = commentRangeStartTranslator.decode({
        node: { type: 'commentRangeStart', attrs: { 'w:id': 'child' } },
        comments,
        exportedCommentDefs: [{}],
        commentsExportType: 'external',
      });

      const endResult = commentRangeEndTranslator.decode({
        node: { type: 'commentRangeEnd', attrs: { 'w:id': 'child' } },
        comments,
        exportedCommentDefs: [{}],
        commentsExportType: 'external',
      });

      expect(startResult.name).toBe('w:ins');
      expect(startResult.attributes).toStrictEqual({
        'w:id': 'parent',
        'w:author': 'Parent Author',
        'w:authorEmail': 'parent@example.com',
        'w:date': '2025-01-01T00:00:00Z',
      });

      expect(endResult.name).toBe('w:del');
      expect(endResult.attributes).toStrictEqual({
        'w:id': 'parent',
        'w:author': 'Parent Author',
        'w:authorEmail': 'parent@example.com',
        'w:date': '2025-01-01T00:00:00Z',
      });
    });
  });
});
