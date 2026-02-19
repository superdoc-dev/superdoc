import { Schema } from 'prosemirror-model';
import { prepareCommentsForImport } from './comments-helpers.js';

vi.mock('./comment-import-helpers.js', () => {
  return {
    resolveCommentMeta: vi.fn().mockReturnValue({
      importedId: 'import-1',
      resolvedCommentId: 'comment-1',
      internal: false,
      matchingImportedComment: { isDone: true },
    }),
    ensureFallbackComment: vi.fn(),
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

    const addMarkFn = vi.fn();
    const deleteFn = vi.fn();
    const setNodeMarkupFn = vi.fn();
    const tr = {
      addMark: addMarkFn,
      delete: deleteFn,
      setNodeMarkup: setNodeMarkupFn,
    };

    prepareCommentsForImport(doc, tr, schema, {});

    expect(addMarkFn).not.toHaveBeenCalled();
  });
});
