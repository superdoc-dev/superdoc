import { describe, it, expect, vi } from 'vitest';
const { Schema } = await import('prosemirror-model');
const { prepareCommentsForImport } = await import('./comments-helpers.js');

vi.mock('./comment-import-helpers.js', () => {
  return {
    resolveCommentMeta: mock().mockReturnValue({
      importedId: 'import-1',
      resolvedCommentId: 'comment-1',
      internal: false,
      matchingImportedComment: { isDone: true },
    }),
    ensureFallbackComment: mock(),
  };
});

describe('prepareCommentsForImport', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'inline*' },
      commentRangeStart: { group: 'inline', inline: true, attrs: { 'w:id': {}, internal: { default: true } } },
      commentRangeEnd: { group: 'inline', inline: true, attrs: { 'w:id': {} } },
      text: { group: 'inline' },
    },
  });

  it('should not add marks if the comment is done', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.commentRangeStart.create({
        'w:id': 'import-1',
        internal: false,
      }),
      schema.nodes.commentRangeEnd.create({
        'w:id': 'import-1',
        internal: false,
      }),
    ]);

    const addMarkFn = mock();
    const deleteFn = mock();
    const setNodeMarkupFn = mock();
    const tr = {
      addMark: addMarkFn,
      delete: deleteFn,
      setNodeMarkup: setNodeMarkupFn,
    };

    prepareCommentsForImport(doc, tr, schema, {});

    expect(addMarkFn).not.toHaveBeenCalled();
  });
});
