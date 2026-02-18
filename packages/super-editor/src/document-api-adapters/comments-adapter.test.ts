import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { Editor } from '../core/Editor.js';
import { CommentMarkName } from '../extensions/comment/comments-constants.js';
import { createCommentsAdapter } from './comments-adapter.js';

type NodeOptions = {
  attrs?: Record<string, unknown>;
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const attrs = options.attrs ?? {};
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? isBlock;
  const isLeaf = options.isLeaf ?? (isInline && !isText && children.length === 0);

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : options.nodeSize != null ? options.nodeSize : isLeaf ? 1 : contentSize + 2;

  return {
    type: { name: typeName },
    attrs,
    text: isText ? text : undefined,
    nodeSize,
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    isLeaf,
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
    descendants(callback: (node: ProseMirrorNode, pos: number) => void) {
      let offset = 0;
      for (const child of children) {
        callback(child, offset);
        offset += child.nodeSize;
      }
    },
  } as unknown as ProseMirrorNode;
}

function makeEditor(docNode: ProseMirrorNode, commands: Record<string, unknown>): Editor {
  return {
    state: { doc: docNode },
    commands,
  } as unknown as Editor;
}

describe('addCommentAdapter', () => {
  it('adds a comment when commands and range are valid', () => {
    const textNode = createNode('text', [], { text: 'Hello' });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const setTextSelection = vi.fn(() => true);
    const commands: Record<string, unknown> = { setTextSelection };
    const editor = makeEditor(doc, commands);
    const addComment = vi.fn(() => {
      (editor as unknown as { converter?: { comments?: Array<Record<string, unknown>> } }).converter = {
        comments: [
          {
            commentId: 'new-comment-id',
            commentText: 'Review this',
            createdTime: Date.now(),
          },
        ],
      };
      return true;
    });
    commands.addComment = addComment;

    const receipt = createCommentsAdapter(editor).add({
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      text: 'Review this',
    });

    expect(setTextSelection).toHaveBeenCalledWith({ from: 1, to: 6 });
    expect(addComment).toHaveBeenCalledWith(expect.objectContaining({ content: 'Review this', isInternal: false }));
    const passedCommentId = addComment.mock.calls[0]?.[0]?.commentId;
    expect(typeof passedCommentId).toBe('string');
    expect(receipt.success).toBe(true);
    expect(receipt.inserted?.[0]?.entityType).toBe('comment');
    expect(receipt.inserted?.[0]?.entityId).toBe(passedCommentId);
  });

  it('reads addComment from a fresh command snapshot after applying selection', () => {
    const textNode = createNode('text', [], { text: 'Hello' });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const editor = {
      state: { doc },
      converter: {
        comments: [] as Array<Record<string, unknown>>,
      },
      options: {
        documentId: 'doc-1',
        user: {
          name: 'Test User',
          email: 'test.user@example.com',
        },
      },
    } as unknown as Editor & {
      converter: {
        comments: Array<Record<string, unknown>>;
      };
    };

    let activeSelection = { from: 0, to: 0 };
    const setTextSelection = vi.fn(({ from, to }: { from: number; to: number }) => {
      activeSelection = { from, to };
      return true;
    });
    const addCommentWithSnapshot = vi.fn(
      (
        selectionSnapshot: { from: number; to: number },
        options: { content: string; isInternal: boolean; commentId?: string },
      ) => {
        if (selectionSnapshot.from === selectionSnapshot.to) return false;

        editor.converter.comments.push({
          commentId: options.commentId ?? 'fresh-command-id',
          commentText: options.content,
          createdTime: Date.now(),
        });
        return true;
      },
    );

    Object.defineProperty(editor, 'commands', {
      configurable: true,
      get() {
        const selectionSnapshot = { ...activeSelection };
        return {
          setTextSelection,
          addComment: (options: { content: string; isInternal: boolean; commentId?: string }) =>
            addCommentWithSnapshot(selectionSnapshot, options),
        };
      },
    });

    const receipt = createCommentsAdapter(editor).add({
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      text: 'Review this',
    });

    expect(setTextSelection).toHaveBeenCalledWith({ from: 1, to: 6 });
    expect(addCommentWithSnapshot).toHaveBeenCalledWith(
      { from: 1, to: 6 },
      expect.objectContaining({ content: 'Review this', isInternal: false }),
    );
    const passedId = addCommentWithSnapshot.mock.calls[0]?.[1]?.commentId;
    expect(typeof passedId).toBe('string');
    expect(receipt.success).toBe(true);
    expect(receipt.inserted?.[0]).toMatchObject({ entityType: 'comment', entityId: passedId });
  });

  it('returns false when commands are missing', () => {
    const doc = createNode('doc', [], { isBlock: false });
    const editor = makeEditor(doc, {});

    expect(() =>
      createCommentsAdapter(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 1 } },
        text: 'No commands',
      }),
    ).toThrow('command is not available');
  });

  it('returns false when blockId is not found', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const setTextSelection = vi.fn(() => true);
    const addComment = vi.fn(() => true);
    const editor = makeEditor(doc, { setTextSelection, addComment });

    expect(() =>
      createCommentsAdapter(editor).add({
        target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } },
        text: 'Missing',
      }),
    ).toThrow('Comment target could not be resolved.');
  });

  it('returns false for empty ranges', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const setTextSelection = vi.fn(() => true);
    const addComment = vi.fn(() => true);
    const editor = makeEditor(doc, { setTextSelection, addComment });

    const receipt = createCommentsAdapter(editor).add({
      target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } },
      text: 'Empty',
    });

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({
      code: 'INVALID_TARGET',
    });
  });

  it('returns false for out-of-range offsets', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const setTextSelection = vi.fn(() => true);
    const addComment = vi.fn(() => true);
    const editor = makeEditor(doc, { setTextSelection, addComment });

    expect(() =>
      createCommentsAdapter(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'Out of range',
      }),
    ).toThrow('Comment target could not be resolved.');
  });

  it('returns INVALID_TARGET when text selection cannot be applied', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const setTextSelection = vi.fn(() => false);
    const addComment = vi.fn(() => true);
    const editor = makeEditor(doc, { setTextSelection, addComment });

    const receipt = createCommentsAdapter(editor).add({
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } },
      text: 'Selection failure',
    });

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({
      code: 'INVALID_TARGET',
    });
  });

  it('returns NO_OP when addComment does not apply a comment', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const setTextSelection = vi.fn(() => true);
    const addComment = vi.fn(() => false);
    const editor = makeEditor(doc, { setTextSelection, addComment });

    const receipt = createCommentsAdapter(editor).add({
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } },
      text: 'Insert failure',
    });

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({
      code: 'NO_OP',
    });
  });
});

function createCommentSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: {
        attrs: { paraId: { default: null }, sdBlockId: { default: null } },
        content: 'inline*',
        group: 'block',
        toDOM: () => ['p', 0],
        parseDOM: [{ tag: 'p' }],
      },
      text: { group: 'inline' },
      commentRangeStart: {
        inline: true,
        group: 'inline',
        atom: true,
        attrs: { 'w:id': {} },
        toDOM: () => ['commentRangeStart'],
        parseDOM: [{ tag: 'commentRangeStart' }],
      },
      commentRangeEnd: {
        inline: true,
        group: 'inline',
        atom: true,
        attrs: { 'w:id': {} },
        toDOM: () => ['commentRangeEnd'],
        parseDOM: [{ tag: 'commentRangeEnd' }],
      },
    },
    marks: {
      [CommentMarkName]: {
        attrs: { commentId: {}, importedId: { default: null }, internal: { default: false } },
        inclusive: false,
        toDOM: () => [CommentMarkName],
        parseDOM: [{ tag: CommentMarkName }],
      },
    },
  });
}

function createPmEditor(
  doc: ProseMirrorNode,
  commands: Record<string, unknown> = {},
  comments: Array<Record<string, unknown>> = [],
): Editor {
  const state = EditorState.create({
    schema: doc.type.schema,
    doc,
  });

  return {
    state,
    commands,
    converter: {
      comments,
    },
    options: {
      documentId: 'doc-1',
      user: {
        name: 'Test User',
        email: 'test.user@example.com',
      },
    },
  } as unknown as Editor;
}

describe('commentsAdapter additional operations', () => {
  it('edits a comment text and returns updated receipt', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: false });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const editComment = vi.fn(() => true);
    const editor = createPmEditor(doc, { editComment }, [{ commentId: 'c1', commentText: 'Before' }]);

    const receipt = createCommentsAdapter(editor).edit({ commentId: 'c1', text: 'After' });

    expect(editComment).toHaveBeenCalledWith({ commentId: 'c1', importedId: undefined, content: 'After' });
    expect(receipt.success).toBe(true);
    expect(receipt.updated?.[0]).toMatchObject({ entityType: 'comment', entityId: 'c1' });
    expect(
      (editor as unknown as { converter: { comments: Array<{ commentText?: string }> } }).converter.comments[0]
        ?.commentText,
    ).toBe('After');
  });

  it('replies to a comment and returns inserted receipt', () => {
    const schema = createCommentSchema();
    const parentMark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: false });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [parentMark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const addCommentReply = vi.fn(() => true);
    const editor = createPmEditor(doc, { addCommentReply }, [{ commentId: 'c1', commentText: 'Root comment' }]);

    const receipt = createCommentsAdapter(editor).reply({ parentCommentId: 'c1', text: 'Reply body' });

    expect(addCommentReply).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'c1',
        content: 'Reply body',
      }),
    );
    expect(receipt.success).toBe(true);
    expect(receipt.inserted?.[0]).toMatchObject({ entityType: 'comment' });
  });

  it('throws TARGET_NOT_FOUND when replying to a missing parent comment', () => {
    const schema = createCommentSchema();
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello')]);
    const doc = schema.node('doc', null, [paragraph]);
    const addCommentReply = vi.fn(() => true);
    const editor = createPmEditor(doc, { addCommentReply }, []);

    expect(() =>
      createCommentsAdapter(editor).reply({
        parentCommentId: 'missing-parent',
        text: 'Reply body',
      }),
    ).toThrow('Comment target could not be resolved.');
    expect(addCommentReply).not.toHaveBeenCalled();
  });

  it('moves a comment to a new target range', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: false });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const moveComment = vi.fn(() => true);
    const editor = createPmEditor(doc, { moveComment }, [{ commentId: 'c1', commentText: 'Move me' }]);

    const receipt = createCommentsAdapter(editor).move({
      commentId: 'c1',
      target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 4 } },
    });

    expect(moveComment).toHaveBeenCalledWith({ commentId: 'c1', from: 2, to: 5 });
    expect(receipt.success).toBe(true);
    expect(receipt.updated?.[0]).toMatchObject({ entityType: 'comment', entityId: 'c1' });
  });

  it('returns NO_OP when move command resolves but does not apply changes', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: false });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const moveComment = vi.fn(() => false);
    const editor = createPmEditor(doc, { moveComment }, [{ commentId: 'c1', commentText: 'Move me' }]);

    const receipt = createCommentsAdapter(editor).move({
      commentId: 'c1',
      target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 4 } },
    });

    expect(moveComment).toHaveBeenCalledWith({ commentId: 'c1', from: 2, to: 5 });
    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({ code: 'NO_OP' });
  });

  it('resolves and removes comments, including replies', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: false });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const resolveComment = vi.fn(() => true);
    const removeComment = vi.fn(() => true);
    const editor = createPmEditor(doc, { resolveComment, removeComment }, [
      { commentId: 'c1', commentText: 'Root', isDone: false },
      { commentId: 'c2', parentCommentId: 'c1', commentText: 'Child' },
    ]);

    const api = createCommentsAdapter(editor);
    const resolveReceipt = api.resolve({ commentId: 'c1' });
    const removeReceipt = api.remove({ commentId: 'c1' });

    expect(resolveComment).toHaveBeenCalledWith({ commentId: 'c1', importedId: undefined });
    expect(resolveReceipt.success).toBe(true);
    expect(resolveReceipt.updated?.[0]).toMatchObject({ entityId: 'c1' });

    expect(removeComment).toHaveBeenCalledWith({ commentId: 'c1', importedId: undefined });
    expect(removeReceipt.success).toBe(true);
    const removedIds = (removeReceipt.removed ?? []).map((entry) => entry.entityId).sort();
    expect(removedIds).toEqual(['c1', 'c2']);
  });

  it('returns NO_OP when resolve command resolves but does not apply changes', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: false });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const resolveComment = vi.fn(() => false);
    const editor = createPmEditor(doc, { resolveComment }, [{ commentId: 'c1', commentText: 'Root', isDone: false }]);

    const receipt = createCommentsAdapter(editor).resolve({ commentId: 'c1' });

    expect(resolveComment).toHaveBeenCalledWith({ commentId: 'c1', importedId: undefined });
    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({ code: 'NO_OP' });
  });

  it('returns NO_OP when remove command does not apply and no records are removed', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: false });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const removeComment = vi.fn(() => false);
    const editor = createPmEditor(doc, { removeComment }, []);

    const receipt = createCommentsAdapter(editor).remove({ commentId: 'c1' });

    expect(removeComment).toHaveBeenCalledWith({ commentId: 'c1', importedId: undefined });
    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({ code: 'NO_OP' });
  });

  it('removes anchorless reply records even when remove command is not applied', () => {
    const schema = createCommentSchema();
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello')]);
    const doc = schema.node('doc', null, [paragraph]);
    const removeComment = vi.fn(() => false);
    const editor = createPmEditor(doc, { removeComment }, [
      { commentId: 'reply-1', parentCommentId: 'c1', commentText: 'Reply' },
    ]);

    const receipt = createCommentsAdapter(editor).remove({ commentId: 'reply-1' });

    expect(removeComment).toHaveBeenCalledWith({ commentId: 'reply-1', importedId: undefined });
    expect(receipt.success).toBe(true);
    expect((receipt.removed ?? []).map((entry) => entry.entityId)).toEqual(['reply-1']);
  });

  it('updates internal metadata for anchorless comments via entity store mutation', () => {
    const schema = createCommentSchema();
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello')]);
    const doc = schema.node('doc', null, [paragraph]);
    const setCommentInternal = vi.fn(() => false);
    const editor = createPmEditor(doc, { setCommentInternal }, [
      { commentId: 'c1', commentText: 'Root', isInternal: false },
    ]);

    const receipt = createCommentsAdapter(editor).setInternal({ commentId: 'c1', isInternal: true });

    expect(setCommentInternal).not.toHaveBeenCalled();
    expect(receipt.success).toBe(true);
    const updated = (
      editor as unknown as { converter: { comments: Array<{ commentId: string; isInternal?: boolean }> } }
    ).converter.comments.find((comment) => comment.commentId === 'c1');
    expect(updated?.isInternal).toBe(true);
  });

  it('sets internal, active, and cursor target comment operations', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: false });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const setCommentInternal = vi.fn(() => true);
    const setActiveComment = vi.fn(() => true);
    const setCursorById = vi.fn(() => true);
    const editor = createPmEditor(
      doc,
      {
        setCommentInternal,
        setActiveComment,
        setCursorById,
      },
      [{ commentId: 'c1', commentText: 'Root', isInternal: false }],
    );

    const api = createCommentsAdapter(editor);

    const internalReceipt = api.setInternal({ commentId: 'c1', isInternal: true });
    const activeReceipt = api.setActive({ commentId: 'c1' });
    const clearActiveReceipt = api.setActive({ commentId: null });
    const goToReceipt = api.goTo({ commentId: 'c1' });

    expect(setCommentInternal).toHaveBeenCalledWith({ commentId: 'c1', importedId: undefined, isInternal: true });
    expect(internalReceipt.success).toBe(true);
    expect(activeReceipt.success).toBe(true);
    expect(clearActiveReceipt.success).toBe(true);
    expect(goToReceipt.success).toBe(true);
    expect(setActiveComment).toHaveBeenNthCalledWith(1, { commentId: 'c1' });
    expect(setActiveComment).toHaveBeenNthCalledWith(2, { commentId: null });
    expect(setCursorById).toHaveBeenCalledWith('c1');
  });

  it('gets and lists comments across open and resolved anchors', () => {
    const schema = createCommentSchema();
    const openMark = schema.marks[CommentMarkName].create({ commentId: 'c1', internal: true });
    const openParagraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Open comment', [openMark])]);
    const resolvedParagraph = schema.node('paragraph', { paraId: 'p2' }, [
      schema.nodes.commentRangeStart.create({ 'w:id': 'c2' }),
      schema.text('Resolved comment'),
      schema.nodes.commentRangeEnd.create({ 'w:id': 'c2' }),
    ]);
    const doc = schema.node('doc', null, [openParagraph, resolvedParagraph]);

    const editor = createPmEditor(doc, {}, [
      { commentId: 'c1', commentText: 'Open body', isDone: false, isInternal: true },
      { commentId: 'c2', commentText: 'Resolved body', isDone: true },
    ]);
    const api = createCommentsAdapter(editor);

    const open = api.get({ commentId: 'c1' });
    const resolved = api.get({ commentId: 'c2' });
    const openOnly = api.list({ includeResolved: false });
    const all = api.list();

    expect(open.status).toBe('open');
    expect(open.commentId).toBe('c1');
    expect(resolved.status).toBe('resolved');
    expect(resolved.commentId).toBe('c2');
    expect(openOnly.matches.map((comment) => comment.commentId)).toEqual(['c1']);
    expect(all.total).toBeGreaterThanOrEqual(2);
  });
});

describe('invariant: imported comment ID normalization', () => {
  // These tests verify that comments with both a canonical commentId and an
  // importedId (the w:id from DOCX) are treated as a single identity throughout
  // the adapter. The import pipeline (prepareCommentsForImport) guarantees this
  // today; these tests guard against regressions if a new code path creates
  // marks or store entries with inconsistent IDs.

  it('invariant: list() returns one record when mark carries both commentId and importedId', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({
      commentId: 'canonical-uuid',
      importedId: 'imported-5',
      internal: false,
    });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);

    const editor = createPmEditor(doc, {}, [
      { commentId: 'canonical-uuid', importedId: 'imported-5', commentText: 'Body' },
    ]);
    const api = createCommentsAdapter(editor);
    const result = api.list();

    const matchingRecords = result.matches.filter(
      (c) => c.commentId === 'canonical-uuid' || c.importedId === 'imported-5',
    );
    expect(matchingRecords).toHaveLength(1);
    expect(matchingRecords[0]!.commentId).toBe('canonical-uuid');
  });

  it('invariant: get() by importedId returns the canonical record', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({
      commentId: 'canonical-uuid',
      importedId: 'imported-5',
      internal: false,
    });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);

    const editor = createPmEditor(doc, {}, [
      { commentId: 'canonical-uuid', importedId: 'imported-5', commentText: 'Body' },
    ]);
    const api = createCommentsAdapter(editor);
    const info = api.get({ commentId: 'imported-5' });

    expect(info.commentId).toBe('canonical-uuid');
    expect(info.target).toBeTruthy();
  });

  it('invariant: move() passes canonical commentId to moveComment command for imported comments', () => {
    const schema = createCommentSchema();
    const mark = schema.marks[CommentMarkName].create({
      commentId: 'canonical-uuid',
      importedId: 'imported-5',
      internal: false,
    });
    const paragraph = schema.node('paragraph', { paraId: 'p1' }, [schema.text('Hello', [mark])]);
    const doc = schema.node('doc', null, [paragraph]);
    const moveComment = vi.fn(() => true);
    const editor = createPmEditor(doc, { moveComment }, [
      { commentId: 'canonical-uuid', importedId: 'imported-5', commentText: 'Move me' },
    ]);

    const receipt = createCommentsAdapter(editor).move({
      commentId: 'imported-5',
      target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 4 } },
    });

    expect(receipt.success).toBe(true);
    expect(moveComment).toHaveBeenCalledWith(expect.objectContaining({ commentId: 'canonical-uuid' }));
  });
});
