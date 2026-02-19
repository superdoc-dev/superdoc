import { describe, it, expect, vi, afterEach } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';

import { CommentRangeStart, CommentRangeEnd, CommentReference } from './comment.js';
import { CommentsMark } from './comments-marks.js';
import { CommentMarkName } from './comments-constants.js';
import * as CommentHelpers from './comments-helpers.js';
import { CommentsPlugin, CommentsPluginKey } from './comments-plugin.js';
import { comments_module_events } from '@superdoc/common';

const {
  removeCommentsById,
  getCommentPositionsById,
  prepareCommentsForExport,
  getPreparedComment,
  prepareCommentsForImport,
  translateFormatChangesToEnglish,
  getHighlightColor,
  clampOpacity,
  applyAlphaToHex,
} = CommentHelpers;

afterEach(() => {
  vi.restoreAllMocks();
});

const createCommentSchema = () => {
  const nodes = {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    commentRangeStart: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { 'w:id': {}, internal: { default: true } },
      toDOM: (node) => ['commentRangeStart', node.attrs],
      parseDOM: [{ tag: 'commentRangeStart' }],
    },
    commentRangeEnd: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { 'w:id': {}, internal: { default: true } },
      toDOM: (node) => ['commentRangeEnd', node.attrs],
      parseDOM: [{ tag: 'commentRangeEnd' }],
    },
    commentReference: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { attributes: { default: null } },
      toDOM: (node) => ['commentReference', node.attrs],
      parseDOM: [{ tag: 'commentReference' }],
    },
  };

  const marks = {
    [CommentMarkName]: {
      attrs: { commentId: {}, importedId: { default: null }, internal: { default: true } },
      inclusive: false,
      toDOM: (mark) => [CommentMarkName, mark.attrs],
      parseDOM: [{ tag: CommentMarkName }],
    },
  };

  return new Schema({ nodes, marks });
};

const createStateWithComment = (schema, commentId = 'c-1') => {
  const mark = schema.marks[CommentMarkName].create({ commentId, internal: true });
  const paragraph = schema.nodes.paragraph.create(null, schema.text('Hello', [mark]));
  const doc = schema.nodes.doc.create(null, [paragraph]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1, 6),
  });
};

describe('comment nodes and mark', () => {
  it('merges attributes when rendering comment nodes', () => {
    const result = CommentRangeStart.config.renderDOM.call(CommentRangeStart, {
      htmlAttributes: { 'data-test': 'value' },
    });
    expect(result[0]).toBe('commentRangeStart');
    expect(result[1]).toMatchObject({ 'aria-label': 'Comment range start node', 'data-test': 'value' });

    const endResult = CommentRangeEnd.config.renderDOM.call(CommentRangeEnd, {
      htmlAttributes: { 'data-id': 'end' },
    });
    expect(endResult[0]).toBe('commentRangeEnd');
    expect(endResult[1]).toMatchObject({ 'aria-label': 'Comment range end node', 'data-id': 'end' });

    const referenceDom = CommentReference.config.renderDOM.call(CommentReference, {
      htmlAttributes: { 'data-ref': '1' },
    });
    expect(referenceDom[0]).toBe('commentReference');
    expect(referenceDom[1]).toMatchObject({ 'aria-label': 'Comment reference node', 'data-ref': '1' });

    const markDom = CommentsMark.config.renderDOM.call(CommentsMark, {
      htmlAttributes: { 'data-id': 'comment-1' },
    });
    expect(markDom[0]).toBe(CommentMarkName);
    expect(markDom[1]).toMatchObject({ class: 'sd-editor-comment', 'data-id': 'comment-1' });
  });
});

describe('comment helpers', () => {
  it('gets comment positions by id', () => {
    const schema = createCommentSchema();
    const state = createStateWithComment(schema, 'comment-123');

    const positions = getCommentPositionsById('comment-123', state.doc);

    expect(positions).toEqual([expect.objectContaining({ from: 1, to: 6 })]);
    expect(positions[0].mark).toBeDefined();
    expect(positions[0].mark.type.name).toBe(CommentMarkName);
  });

  it('removes comments by id and dispatches transaction', () => {
    const schema = createCommentSchema();
    const state = createStateWithComment(schema, 'comment-123');
    const tr = state.tr;
    const dispatch = vi.fn();
    const removeSpy = vi.spyOn(tr, 'removeMark');

    removeCommentsById({ commentId: 'comment-123', state, tr, dispatch });

    expect(removeSpy).toHaveBeenCalledWith(
      1,
      6,
      expect.objectContaining({ type: expect.objectContaining({ name: CommentMarkName }) }),
    );
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  describe('prepares comments for export including child comments', () => {
    it('prepares comments for export including child comments', () => {
      const schema = createCommentSchema();
      const state = createStateWithComment(schema, 'root');
      const tr = state.tr;

      const childComments = [
        { commentId: 'child-1', parentCommentId: 'root', createdTime: 2 },
        { commentId: 'child-0', parentCommentId: 'root', createdTime: 1 },
      ];

      prepareCommentsForExport(state.doc, tr, schema, childComments);

      const applied = state.apply(tr);
      const insertedStarts = [];
      const insertedEnds = [];

      applied.doc.descendants((node) => {
        if (node.type.name === 'commentRangeStart') insertedStarts.push(node.attrs['w:id']);
        if (node.type.name === 'commentRangeEnd') insertedEnds.push(node.attrs['w:id']);
      });

      expect(insertedStarts).toEqual(['root', 'child-0', 'child-1']);
      expect(insertedEnds).toEqual(['root', 'child-0', 'child-1']);
    });

    it('verifies nested range ordering for Google Docs format', () => {
      const schema = createCommentSchema();
      const mark = schema.marks[CommentMarkName].create({ commentId: 'parent', internal: true });
      const paragraph = schema.nodes.paragraph.create(null, schema.text('Text', [mark]));
      const doc = schema.nodes.doc.create(null, [paragraph]);
      const state = EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, 1, 5),
      });
      const tr = state.tr;

      const comments = [
        { commentId: 'parent', createdTime: 1 },
        { commentId: 'child', parentCommentId: 'parent', createdTime: 2 },
      ];

      prepareCommentsForExport(state.doc, tr, schema, comments);

      const applied = state.apply(tr);
      const nodes = [];
      applied.doc.descendants((node, pos) => {
        if (node.type.name === 'commentRangeStart' || node.type.name === 'commentRangeEnd') {
          nodes.push({ type: node.type.name, id: node.attrs['w:id'], pos });
        }
      });

      // Parent Start → Child Start → Content → Parent End → Child End
      const startNodes = nodes.filter((n) => n.type === 'commentRangeStart');
      const endNodes = nodes.filter((n) => n.type === 'commentRangeEnd');

      expect(startNodes[0].id).toBe('parent');
      expect(startNodes[1].id).toBe('child');
      expect(endNodes[0].id).toBe('parent');
      expect(endNodes[1].id).toBe('child');
    });

    it('verifies ordering when parent has multiple children', () => {
      const schema = createCommentSchema();
      const mark = schema.marks[CommentMarkName].create({ commentId: 'parent', internal: true });
      const paragraph = schema.nodes.paragraph.create(null, schema.text('Text', [mark]));
      const doc = schema.nodes.doc.create(null, [paragraph]);
      const state = EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, 1, 5),
      });
      const tr = state.tr;

      const comments = [
        { commentId: 'parent', createdTime: 1 },
        { commentId: 'child-2', parentCommentId: 'parent', createdTime: 3 },
        { commentId: 'child-1', parentCommentId: 'parent', createdTime: 2 },
        { commentId: 'child-0', parentCommentId: 'parent', createdTime: 1 },
      ];

      prepareCommentsForExport(state.doc, tr, schema, comments);

      const applied = state.apply(tr);
      const startNodes = [];
      const endNodes = [];

      applied.doc.descendants((node) => {
        if (node.type.name === 'commentRangeStart') {
          startNodes.push(node.attrs['w:id']);
        }
        if (node.type.name === 'commentRangeEnd') {
          endNodes.push(node.attrs['w:id']);
        }
      });

      // children ordered by creation time
      expect(startNodes).toEqual(['parent', 'child-0', 'child-1', 'child-2']);
      expect(endNodes).toEqual(['parent', 'child-0', 'child-1', 'child-2']);
    });
  });

  it('prepares comments for import by converting nodes into marks', () => {
    const schema = createCommentSchema();
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.commentRangeStart.create({ 'w:id': 'import-1', internal: false }),
        schema.text('Hello'),
        schema.nodes.commentRangeEnd.create({ 'w:id': 'import-1', internal: false }),
      ]),
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    prepareCommentsForImport(state.doc, tr, schema, {
      comments: [{ importedId: 'import-1', commentId: 'comment-1' }],
    });

    const applied = state.apply(tr);

    const marks = [];
    applied.doc.descendants((node) => {
      node.marks.forEach((mark) => {
        if (mark.type === schema.marks[CommentMarkName]) {
          marks.push(mark.attrs.commentId);
        }
      });
    });

    expect(marks).toEqual(['comment-1']);
    const remainingCommentNodes = [];
    applied.doc.descendants((node) => {
      if (['commentRangeStart', 'commentRangeEnd'].includes(node.type.name)) {
        remainingCommentNodes.push(node.type.name);
      }
    });
    expect(remainingCommentNodes).toHaveLength(0);
  });

  it('keeps comment range nodes for done comments (no mark)', () => {
    const schema = createCommentSchema();
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.commentRangeStart.create({ 'w:id': 'import-1', internal: false }),
        schema.text('Hello'),
        schema.nodes.commentRangeEnd.create({ 'w:id': 'import-1', internal: false }),
      ]),
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    prepareCommentsForImport(state.doc, tr, schema, {
      comments: [{ importedId: 'import-1', commentId: 'comment-1', isDone: true, isInternal: false }],
    });

    const applied = state.apply(tr);

    const marks = [];
    const commentNodes = [];

    applied.doc.descendants((node) => {
      node.marks.forEach((mark) => {
        if (mark.type === schema.marks[CommentMarkName]) {
          marks.push(mark.attrs.commentId);
        }
      });
      if (node.type.name === 'commentRangeStart' || node.type.name === 'commentRangeEnd') {
        commentNodes.push({ type: node.type.name, id: node.attrs['w:id'] });
      }
    });

    expect(marks).toEqual([]);
    expect(commentNodes).toEqual([
      { type: 'commentRangeStart', id: 'comment-1' },
      { type: 'commentRangeEnd', id: 'comment-1' },
    ]);
  });

  it('returns prepared comment attrs', () => {
    expect(getPreparedComment({ commentId: '123', internal: true })).toEqual({ 'w:id': '123', internal: true });
  });

  it('translates formatting changes into readable text', () => {
    const message = translateFormatChangesToEnglish({
      before: [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '12px', color: '#111' } }],
      after: [{ type: 'italic' }, { type: 'textStyle', attrs: { fontSize: '14px', color: '#222' } }],
    });

    expect(message).toContain('Removed formatting: bold');
    expect(message).toContain('Added formatting: italic');
    expect(message).toContain('Modified text style');
    expect(message).toContain('Changed font size from 12px to 14px');
    expect(message).toContain('Changed color');
  });

  it('returns default message when no formatting changes', () => {
    expect(translateFormatChangesToEnglish()).toBe('No formatting changes.');
  });

  it('computes highlight color from plugin state', () => {
    const editor = {
      options: { isInternal: false },
      state: {},
    };
    vi.spyOn(CommentsPluginKey, 'getState').mockReturnValue({
      internalColor: '#123456',
      externalColor: '#abcdef',
    });

    // Active comment gets brighter highlight (27% = 44 hex)
    const color = getHighlightColor({ activeThreadId: 'thread-1', threadId: 'thread-1', isInternal: false, editor });
    expect(color).toBe('#abcdef44');

    // Other comments get lighter highlight (13% = 22 hex) when another is active
    const external = getHighlightColor({ activeThreadId: 'thread-2', threadId: 'thread-1', isInternal: false, editor });
    expect(external).toBe('#abcdef22');

    // No active comment - shows lighter highlight (13% = 22 hex)
    const inactive = getHighlightColor({ activeThreadId: null, threadId: 'thread-3', isInternal: false, editor });
    expect(inactive).toBe('#abcdef22');

    // Internal comment when not in internal mode is hidden
    const hidden = getHighlightColor({ activeThreadId: null, threadId: 'thread-3', isInternal: true, editor });
    expect(hidden).toBe('transparent');
  });

  it('uses configured highlight colors and opacity for inactive comments', () => {
    const editor = {
      options: {
        isInternal: false,
        comments: {
          highlightColors: { external: '#112233' },
          highlightOpacity: { inactive: 0.25 },
        },
      },
      state: {},
    };
    vi.spyOn(CommentsPluginKey, 'getState').mockReturnValue({
      internalColor: '#123456',
      externalColor: '#abcdef',
    });

    const color = getHighlightColor({ activeThreadId: 'thread-2', threadId: 'thread-1', isInternal: false, editor });
    expect(color).toBe('#11223340');
  });

  it('uses active highlight override color when provided', () => {
    const editor = {
      options: {
        isInternal: false,
        comments: {
          highlightColors: { external: '#112233', activeExternal: '#ff0000' },
        },
      },
      state: {},
    };
    vi.spyOn(CommentsPluginKey, 'getState').mockReturnValue({
      internalColor: '#123456',
      externalColor: '#abcdef',
    });

    const color = getHighlightColor({ activeThreadId: 'thread-1', threadId: 'thread-1', isInternal: false, editor });
    expect(color).toBe('#ff0000');
  });

  it('falls back to plugin colors with custom opacity', () => {
    const editor = {
      options: {
        isInternal: false,
        comments: {
          highlightOpacity: { active: 0.2 },
        },
      },
      state: {},
    };
    vi.spyOn(CommentsPluginKey, 'getState').mockReturnValue({
      internalColor: '#123456',
      externalColor: '#abcdef',
    });

    const color = getHighlightColor({ activeThreadId: 'thread-1', threadId: 'thread-1', isInternal: false, editor });
    expect(color).toBe('#abcdef33');
  });
});

describe('clampOpacity', () => {
  it('returns the value when within valid range', () => {
    expect(clampOpacity(0.5)).toBe(0.5);
    expect(clampOpacity(0)).toBe(0);
    expect(clampOpacity(1)).toBe(1);
  });

  it('clamps values below 0 to 0', () => {
    expect(clampOpacity(-0.5)).toBe(0);
    expect(clampOpacity(-100)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(clampOpacity(1.5)).toBe(1);
    expect(clampOpacity(100)).toBe(1);
  });

  it('returns null for non-finite values', () => {
    expect(clampOpacity(NaN)).toBeNull();
    expect(clampOpacity(Infinity)).toBeNull();
    expect(clampOpacity(-Infinity)).toBeNull();
    expect(clampOpacity(undefined)).toBeNull();
    expect(clampOpacity(null)).toBeNull();
  });
});

describe('applyAlphaToHex', () => {
  it('applies alpha to 6-digit hex colors', () => {
    expect(applyAlphaToHex('#aabbcc', 0.5)).toBe('#aabbcc80');
    expect(applyAlphaToHex('#000000', 1)).toBe('#000000ff');
    expect(applyAlphaToHex('#ffffff', 0)).toBe('#ffffff00');
  });

  it('expands and applies alpha to 3-digit hex colors', () => {
    expect(applyAlphaToHex('#abc', 0.5)).toBe('#aabbcc80');
    expect(applyAlphaToHex('#000', 1)).toBe('#000000ff');
    expect(applyAlphaToHex('#fff', 0.25)).toBe('#ffffff40');
  });

  it('returns original color for invalid hex formats', () => {
    expect(applyAlphaToHex('rgb(255,0,0)', 0.5)).toBe('rgb(255,0,0)');
    expect(applyAlphaToHex('#gg0000', 0.5)).toBe('#gg0000');
    expect(applyAlphaToHex('red', 0.5)).toBe('red');
    expect(applyAlphaToHex('#aabbccdd', 0.5)).toBe('#aabbccdd');
  });

  it('returns original value for non-string input', () => {
    expect(applyAlphaToHex(null, 0.5)).toBeNull();
    expect(applyAlphaToHex(undefined, 0.5)).toBeUndefined();
    expect(applyAlphaToHex(123, 0.5)).toBe(123);
  });

  it('handles case-insensitive hex colors', () => {
    expect(applyAlphaToHex('#AABBCC', 0.5)).toBe('#AABBCC80');
    expect(applyAlphaToHex('#AbCdEf', 0.5)).toBe('#AbCdEf80');
  });
});

describe('comments plugin commands', () => {
  const setup = () => {
    const schema = createCommentSchema();
    const state = createStateWithComment(schema, 'comment-1');
    const view = { state, dispatch: vi.fn(), focus: vi.fn() };
    const editor = {
      schema,
      view,
      options: {
        isHeadless: false,
        isInternal: false,
        user: { name: 'Another User', email: 'another.user@example.com' },
        documentId: 'doc-1',
      },
      storage: { image: { media: {} } },
      emit: vi.fn(),
    };

    const context = { editor, options: {} };
    const commands = CommentsPlugin.config.addCommands.call(context);

    return { schema, state, editor, commands };
  };

  it('inserts a comment mark across selection', () => {
    const { schema, state, commands, editor } = setup();
    const tr = state.tr;
    const dispatch = vi.fn();

    const result = commands.insertComment({ commentId: 'c-10', isInternal: true, text: '<p>Hey</p>' })({
      tr,
      dispatch,
    });

    expect(result).toBe(true);
    expect(tr.getMeta(CommentsPluginKey)).toEqual({ event: 'add' });
    expect(dispatch).toHaveBeenCalledWith(tr);
    expect(editor.emit).toHaveBeenCalledWith(
      'commentsUpdate',
      expect.objectContaining({
        type: comments_module_events.ADD,
        comment: expect.objectContaining({
          commentId: 'c-10',
          isInternal: true,
          commentText: '<p>Hey</p>',
          creatorName: 'Another User',
          creatorEmail: 'another.user@example.com',
          fileId: 'doc-1',
        }),
        activeCommentId: 'c-10',
      }),
    );

    const applied = state.apply(tr);
    const mark = applied.doc.nodeAt(1).marks[0];
    expect(mark.attrs.commentId).toBe('c-10');
  });

  it('removes comments via helper function', () => {
    const { commands, state } = setup();
    const tr = state.tr;
    const dispatch = vi.fn();

    commands.removeComment({ commentId: 'comment-1' })({ tr, dispatch, state });

    expect(tr.getMeta(CommentsPluginKey)).toEqual({ event: 'deleted' });
    expect(dispatch).toHaveBeenCalledWith(tr);

    const applied = state.apply(tr);
    const marks = applied.doc.nodeAt(1).marks;
    expect(marks).toHaveLength(0);
  });

  it('resolves a comment by replacing the mark with range nodes', () => {
    const { commands, state, schema } = setup();
    const tr = state.tr;
    const dispatch = vi.fn();

    const result = commands.resolveComment({ commentId: 'comment-1' })({ tr, dispatch, state });

    expect(result).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(tr);

    const applied = state.apply(tr);
    const remainingMarks = [];
    const commentNodes = [];

    applied.doc.descendants((node) => {
      node.marks.forEach((mark) => {
        if (mark.type === schema.marks[CommentMarkName]) remainingMarks.push(mark.attrs.commentId);
      });
      if (node.type.name === 'commentRangeStart' || node.type.name === 'commentRangeEnd') {
        commentNodes.push({ type: node.type.name, id: node.attrs['w:id'] });
      }
    });

    expect(remainingMarks).toEqual([]);
    expect(commentNodes).toEqual([
      { type: 'commentRangeStart', id: 'comment-1' },
      { type: 'commentRangeEnd', id: 'comment-1' },
    ]);
  });

  it('sets active comment meta', () => {
    const { commands } = setup();
    const tr = { setMeta: vi.fn() };
    const result = commands.setActiveComment({ commentId: 'focus' })({ tr });
    expect(result).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith(CommentsPluginKey, {
      type: 'setActiveComment',
      activeThreadId: 'focus',
      forceUpdate: true,
    });
  });

  it('updates comment internal flag across the range', () => {
    const { state, commands, schema } = setup();
    const tr = state.tr;
    const dispatch = vi.fn();

    const result = commands.setCommentInternal({ commentId: 'comment-1', isInternal: false })({ tr, dispatch, state });

    expect(result).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(tr);
    const applied = state.apply(tr);
    const mark = applied.doc.nodeAt(1).marks.find((m) => m.type === schema.marks[CommentMarkName]);
    expect(mark.attrs.internal).toBe(false);
  });

  it('sets cursor by comment id when range exists', () => {
    const { commands, state, editor } = setup();
    const result = commands.setCursorById('comment-1')({ state, editor });

    expect(result).toBe(true);
    expect(editor.view.focus).toHaveBeenCalled();
    expect(state.tr.selection.from).toBe(1);
  });

  it('returns false when cursor range cannot be found', () => {
    const { commands, state, editor } = setup();
    const emptyDoc = EditorState.create({ schema: state.schema }).doc;
    const nextState = EditorState.create({ schema: state.schema, doc: emptyDoc });
    const result = commands.setCursorById('missing')({ state: nextState, editor });
    expect(result).toBe(false);
  });

  describe('addComment', () => {
    it('adds a comment with string content', () => {
      const { schema, state, commands, editor } = setup();
      const tr = state.tr;
      const dispatch = vi.fn();

      const result = commands.addComment('This needs review')({ tr, dispatch, editor });

      expect(result).toBe(true);
      expect(dispatch).toHaveBeenCalledWith(tr);
      expect(editor.emit).toHaveBeenCalledWith(
        'commentsUpdate',
        expect.objectContaining({
          type: comments_module_events.ADD,
          comment: expect.objectContaining({
            commentText: 'This needs review',
            creatorName: 'Another User',
            creatorEmail: 'another.user@example.com',
          }),
        }),
      );

      // Get the commentId from the emitted event
      const emitCall = editor.emit.mock.calls.find((call) => call[0] === 'commentsUpdate');
      const commentId = emitCall[1].activeCommentId;
      expect(commentId).toBeTypeOf('string');
      expect(commentId).toHaveLength(36); // UUID format

      const applied = state.apply(tr);
      const mark = applied.doc.nodeAt(1).marks.find((m) => m.type === schema.marks[CommentMarkName]);
      expect(mark.attrs.commentId).toBe(commentId);
      expect(mark.attrs.internal).toBe(false);
    });

    it('adds a comment with options object', () => {
      const { schema, state, commands, editor } = setup();
      const tr = state.tr;
      const dispatch = vi.fn();

      const result = commands.addComment({
        content: 'Please clarify this section',
        author: 'Jane Doe',
        authorEmail: 'jane@example.com',
        authorImage: 'https://example.com/jane.png',
        isInternal: true,
      })({ tr, dispatch, editor });

      expect(result).toBe(true);
      expect(dispatch).toHaveBeenCalledWith(tr);
      expect(editor.emit).toHaveBeenCalledWith(
        'commentsUpdate',
        expect.objectContaining({
          type: comments_module_events.ADD,
          comment: expect.objectContaining({
            commentText: 'Please clarify this section',
            creatorName: 'Jane Doe',
            creatorEmail: 'jane@example.com',
            creatorImage: 'https://example.com/jane.png',
            isInternal: true,
          }),
        }),
      );

      // Get the commentId from the emitted event
      const emitCall = editor.emit.mock.calls.find((call) => call[0] === 'commentsUpdate');
      const commentId = emitCall[1].activeCommentId;

      const applied = state.apply(tr);
      const mark = applied.doc.nodeAt(1).marks.find((m) => m.type === schema.marks[CommentMarkName]);
      expect(mark.attrs.commentId).toBe(commentId);
      expect(mark.attrs.internal).toBe(true);
    });

    it('returns false and warns when there is no text selection', () => {
      const { schema, commands, editor } = setup();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create state with cursor (no selection)
      const paragraph = schema.nodes.paragraph.create(null, schema.text('Hello'));
      const doc = schema.nodes.doc.create(null, [paragraph]);
      const cursorState = EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, 3, 3), // cursor at position 3
      });

      const tr = cursorState.tr;
      const dispatch = vi.fn();

      const result = commands.addComment('Test comment')({ tr, dispatch, editor });

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        'addComment requires a text selection. Please select text before adding a comment.',
      );
      expect(dispatch).not.toHaveBeenCalled();
      expect(editor.emit).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('uses config user as default when author not provided', () => {
      const { state, commands, editor } = setup();
      const tr = state.tr;
      const dispatch = vi.fn();

      commands.addComment({ content: 'Comment without author' })({ tr, dispatch, editor });

      expect(editor.emit).toHaveBeenCalledWith(
        'commentsUpdate',
        expect.objectContaining({
          comment: expect.objectContaining({
            creatorName: 'Another User',
            creatorEmail: 'another.user@example.com',
          }),
        }),
      );
    });

    it('overrides config user when author is provided', () => {
      const { state, commands, editor } = setup();
      const tr = state.tr;
      const dispatch = vi.fn();

      commands.addComment({
        content: 'Comment with custom author',
        author: 'Custom Author',
        authorEmail: 'custom@example.com',
      })({ tr, dispatch, editor });

      expect(editor.emit).toHaveBeenCalledWith(
        'commentsUpdate',
        expect.objectContaining({
          comment: expect.objectContaining({
            creatorName: 'Custom Author',
            creatorEmail: 'custom@example.com',
          }),
        }),
      );
    });

    it('sets isInternal to false by default', () => {
      const { schema, state, commands, editor } = setup();
      const tr = state.tr;
      const dispatch = vi.fn();

      commands.addComment('Comment without isInternal')({ tr, dispatch, editor });

      expect(editor.emit).toHaveBeenCalledWith(
        'commentsUpdate',
        expect.objectContaining({
          comment: expect.objectContaining({
            isInternal: false,
          }),
        }),
      );

      const applied = state.apply(tr);
      const mark = applied.doc.nodeAt(1).marks.find((m) => m.type === schema.marks[CommentMarkName]);
      expect(mark.attrs.internal).toBe(false);
    });

    it('adds comment with empty content', () => {
      const { state, commands, editor } = setup();
      const tr = state.tr;
      const dispatch = vi.fn();

      const result = commands.addComment('')({ tr, dispatch, editor });

      expect(result).toBe(true);
      expect(dispatch).toHaveBeenCalled();
      expect(editor.emit).toHaveBeenCalledWith(
        'commentsUpdate',
        expect.objectContaining({
          comment: expect.objectContaining({
            commentText: '',
          }),
        }),
      );
    });

    it('adds comment with no arguments', () => {
      const { state, commands, editor } = setup();
      const tr = state.tr;
      const dispatch = vi.fn();

      const result = commands.addComment()({ tr, dispatch, editor });

      expect(result).toBe(true);
      expect(dispatch).toHaveBeenCalled();
      expect(editor.emit).toHaveBeenCalledWith(
        'commentsUpdate',
        expect.objectContaining({
          comment: expect.objectContaining({
            commentText: undefined,
          }),
        }),
      );
    });

    it('includes createdTime in the comment payload', () => {
      const { state, commands, editor } = setup();
      const tr = state.tr;
      const dispatch = vi.fn();
      const beforeTime = Date.now();

      commands.addComment('Timed comment')({ tr, dispatch, editor });

      const afterTime = Date.now();
      const emitCall = editor.emit.mock.calls.find((call) => call[0] === 'commentsUpdate');
      const createdTime = emitCall[1].comment.createdTime;

      expect(createdTime).toBeGreaterThanOrEqual(beforeTime);
      expect(createdTime).toBeLessThanOrEqual(afterTime);
    });
  });
});

describe('comments plugin pm plugin', () => {
  it('skips plugin creation when editor is headless', () => {
    const result = CommentsPlugin.config.addPmPlugins.call({ editor: { options: { isHeadless: true } } });
    expect(result).toEqual([]);
  });

  it('initialises state with default values', () => {
    const schema = createCommentSchema();
    const state = createStateWithComment(schema, 'comment-1');
    const context = {
      editor: {
        options: { isHeadless: false, isInternal: false },
        view: { state, dispatch: vi.fn() },
        emit: vi.fn(),
        storage: { image: { media: {} } },
      },
      options: {},
    };

    const [plugin] = CommentsPlugin.config.addPmPlugins.call(context);

    expect(plugin.key).toBe(CommentsPluginKey.key);

    const pluginState = plugin.spec.state.init();
    expect(pluginState.activeThreadId).toBeNull();
    expect(pluginState.decorations).toBeInstanceOf(DecorationSet);

    const meta = { type: 'setActiveComment', activeThreadId: 'comment-5' };
    const tr = {
      getMeta: (key) => (key === CommentsPluginKey ? meta : null),
      docChanged: false,
      selectionSet: false,
    };
    const nextState = plugin.spec.state.apply(tr, pluginState, state, state);
    expect(nextState.activeThreadId).toBe('comment-5');
    expect(nextState.changedActiveThread).toBe(true);
    const stateWithPlugin = EditorState.create({ schema, doc: state.doc, plugins: [plugin] });
    expect(plugin.props.decorations(stateWithPlugin)).toBeInstanceOf(DecorationSet);
  });
});

it('removes comment range nodes even when converter metadata is missing', () => {
  const schema = createCommentSchema();
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, [
      schema.nodes.commentRangeStart.create({ 'w:id': 'import-1', internal: false }),
      schema.text('Text with comment'),
      schema.nodes.commentRangeEnd.create({ 'w:id': 'import-1', internal: false }),
    ]),
  ]);

  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  prepareCommentsForImport(state.doc, tr, schema, {
    comments: [],
  });

  const applied = state.apply(tr);

  const remainingCommentNodes = [];
  applied.doc.descendants((node) => {
    if (['commentRangeStart', 'commentRangeEnd'].includes(node.type.name)) {
      remainingCommentNodes.push(node.type.name);
    }
  });

  expect(remainingCommentNodes).toHaveLength(0);
});

describe('tracked change + comment threading export', () => {
  // Schema with track change marks for testing export behavior
  const createSchemaWithTrackChanges = () => {
    const nodes = {
      doc: { content: 'block+' },
      paragraph: { content: 'inline*', group: 'block' },
      text: { group: 'inline' },
      commentRangeStart: {
        inline: true,
        group: 'inline',
        atom: true,
        attrs: { 'w:id': {}, internal: { default: true } },
        toDOM: (node) => ['commentRangeStart', node.attrs],
        parseDOM: [{ tag: 'commentRangeStart' }],
      },
      commentRangeEnd: {
        inline: true,
        group: 'inline',
        atom: true,
        attrs: { 'w:id': {}, internal: { default: true } },
        toDOM: (node) => ['commentRangeEnd', node.attrs],
        parseDOM: [{ tag: 'commentRangeEnd' }],
      },
    };

    const marks = {
      [CommentMarkName]: {
        attrs: { commentId: {}, importedId: { default: null }, internal: { default: true } },
        inclusive: false,
        toDOM: (mark) => [CommentMarkName, mark.attrs],
        parseDOM: [{ tag: CommentMarkName }],
      },
      trackInsert: {
        attrs: { id: {}, author: { default: null }, date: { default: null } },
        inclusive: false,
        toDOM: (mark) => ['trackInsert', mark.attrs],
        parseDOM: [{ tag: 'trackInsert' }],
      },
      trackDelete: {
        attrs: { id: {}, author: { default: null }, date: { default: null } },
        inclusive: false,
        toDOM: (mark) => ['trackDelete', mark.attrs],
        parseDOM: [{ tag: 'trackDelete' }],
      },
    };

    return new Schema({ nodes, marks });
  };

  it('creates comment ranges for comments that are children of tracked changes', () => {
    const schema = createSchemaWithTrackChanges();
    const trackMark = schema.marks.trackInsert.create({ id: 'tracked-change-1', author: 'Test' });
    const paragraph = schema.nodes.paragraph.create(null, schema.text('Inserted text', [trackMark]));
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    // Comment that is a child of the tracked change (parentCommentId = tracked change id)
    const comments = [
      { commentId: 'child-comment-1', parentCommentId: 'tracked-change-1', createdTime: 1, isInternal: false },
    ];

    prepareCommentsForExport(state.doc, tr, schema, comments);

    const applied = state.apply(tr);
    const insertedStarts = [];
    const insertedEnds = [];

    applied.doc.descendants((node) => {
      if (node.type.name === 'commentRangeStart') insertedStarts.push(node.attrs['w:id']);
      if (node.type.name === 'commentRangeEnd') insertedEnds.push(node.attrs['w:id']);
    });

    // The child comment should have ranges created at the tracked change position
    expect(insertedStarts).toContain('child-comment-1');
    expect(insertedEnds).toContain('child-comment-1');
  });

  it('handles multiple comments on the same tracked change', () => {
    const schema = createSchemaWithTrackChanges();
    const trackMark = schema.marks.trackDelete.create({ id: 'deletion-1', author: 'Test' });
    const paragraph = schema.nodes.paragraph.create(null, schema.text('Deleted text', [trackMark]));
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    // Multiple comments on the same tracked change
    const comments = [
      { commentId: 'reply-2', parentCommentId: 'deletion-1', createdTime: 3, isInternal: false },
      { commentId: 'reply-1', parentCommentId: 'deletion-1', createdTime: 2, isInternal: false },
    ];

    prepareCommentsForExport(state.doc, tr, schema, comments);

    const applied = state.apply(tr);
    const insertedStarts = [];

    applied.doc.descendants((node) => {
      if (node.type.name === 'commentRangeStart') insertedStarts.push(node.attrs['w:id']);
    });

    // Both comments should have ranges, ordered by creation time
    expect(insertedStarts).toEqual(['reply-1', 'reply-2']);
  });

  it('attaches trackInsert/trackDelete marks when exporting replace comment ranges', () => {
    const schema = createSchemaWithTrackChanges();
    const insertMark = schema.marks.trackInsert.create({ id: 'replace-1', author: 'Test' });
    const deleteMark = schema.marks.trackDelete.create({ id: 'replace-1', author: 'Test' });
    const commentMark = schema.marks[CommentMarkName].create({ commentId: 'replace-comment', internal: false });

    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('Inserted text', [insertMark, commentMark]),
      schema.text('Deleted text', [deleteMark]),
    ]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    const comments = [{ commentId: 'replace-comment', createdTime: 1, isInternal: false }];

    prepareCommentsForExport(state.doc, tr, schema, comments);

    const applied = state.apply(tr);
    let startMarks = [];
    let endMarks = [];

    applied.doc.descendants((node) => {
      if (node.type.name === 'commentRangeStart' && node.attrs['w:id'] === 'replace-comment') {
        startMarks = node.marks.map((mark) => mark.type.name);
      }
      if (node.type.name === 'commentRangeEnd' && node.attrs['w:id'] === 'replace-comment') {
        endMarks = node.marks.map((mark) => mark.type.name);
      }
    });

    expect(startMarks).toContain('trackInsert');
    expect(endMarks).toContain('trackDelete');
  });

  it('does not duplicate ranges for comments already processed via comment marks', () => {
    const schema = createSchemaWithTrackChanges();
    const commentMark = schema.marks[CommentMarkName].create({ commentId: 'comment-1', internal: false });
    const paragraph = schema.nodes.paragraph.create(null, schema.text('Commented text', [commentMark]));
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    // Comment that exists as a mark (normal comment, not on tracked change)
    const comments = [{ commentId: 'comment-1', createdTime: 1, isInternal: false }];

    prepareCommentsForExport(state.doc, tr, schema, comments);

    const applied = state.apply(tr);
    const insertedStarts = [];

    applied.doc.descendants((node) => {
      if (node.type.name === 'commentRangeStart') insertedStarts.push(node.attrs['w:id']);
    });

    // Comment should appear exactly once (from the comment mark processing)
    expect(insertedStarts.filter((id) => id === 'comment-1')).toHaveLength(1);
  });
});
