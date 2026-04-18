import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../helpers/createNodeFromContent', () => ({
  createNodeFromContent: vi.fn(),
}));

vi.mock('../helpers/selectionToInsertionEnd', () => ({
  selectionToInsertionEnd: vi.fn(),
}));

import { createNodeFromContent } from '../helpers/createNodeFromContent';
import { selectionToInsertionEnd } from '../helpers/selectionToInsertionEnd';
import { insertContentAt } from './insertContentAt';

const makeTr = (overrides = {}) => ({
  insertText: vi.fn(),
  replaceWith: vi.fn(),
  setMeta: vi.fn(),
  steps: [1],
  doc: {
    resolve: vi.fn().mockReturnValue({
      parent: {
        isTextblock: true,
        type: { spec: {} },
        childCount: 0,
      },
    }),
  },
  ...overrides,
});

const makeEditor = (overrides = {}) => ({
  schema: {},
  options: { enableContentCheck: true },
  emit: vi.fn(),
  ...overrides,
});

describe('insertContentAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts plain text via tr.insertText when given a simple string (fast path, no DOM)', () => {
    const value = 'Hello world';

    const tr = makeTr();
    const editor = makeEditor();

    const cmd = insertContentAt(5, value, { updateSelection: true });
    const result = cmd({ tr, dispatch: true, editor });

    expect(result).toBe(true);
    // Plain text uses fast path - no HTML parsing needed
    expect(createNodeFromContent).not.toHaveBeenCalled();
    expect(tr.insertText).toHaveBeenCalledWith('Hello world', 5, 5);
    expect(tr.replaceWith).not.toHaveBeenCalled();
    expect(selectionToInsertionEnd).toHaveBeenCalledWith(tr, tr.steps.length - 1, -1);
  });

  it('inserts a styled paragraph node when given an html heading string', () => {
    const value = '<h1>Hello world</h1>';

    const tr = makeTr();
    const editor = makeEditor();
    const node = {
      type: { name: 'paragraph' },
      isText: false,
      isBlock: true,
      marks: [],
      check: vi.fn(),
    };

    createNodeFromContent.mockImplementation(() => node);

    const cmd = insertContentAt(5, value, { updateSelection: true });
    const result = cmd({ tr, dispatch: true, editor });

    expect(result).toBe(true);
    expect(createNodeFromContent).toHaveBeenCalled();
    expect(tr.replaceWith).toHaveBeenCalledWith(4, 6, node);
    expect(tr.insertText).not.toHaveBeenCalled();
    expect(selectionToInsertionEnd).toHaveBeenCalledWith(tr, tr.steps.length - 1, -1);
  });

  it('applies input rules meta when applyInputRules=true (text case)', () => {
    const value = 'abc';
    createNodeFromContent.mockImplementation(() => ({
      type: { name: 'text' },
      isText: true,
      isBlock: false,
      marks: [],
      check: vi.fn(),
    }));

    const tr = makeTr();
    const editor = makeEditor();

    const cmd = insertContentAt({ from: 2, to: 4 }, value, {
      updateSelection: false,
      applyInputRules: true,
    });
    const result = cmd({ tr, dispatch: true, editor });

    expect(result).toBe(true);
    expect(tr.insertText).toHaveBeenCalledWith('abc', 2, 4);
    expect(tr.setMeta).toHaveBeenCalledWith('applyInputRules', { from: 2, text: 'abc' });
  });

  it('replaces an empty paragraph when only block content is inserted', () => {
    const blockNode = {
      type: { name: 'paragraph' }, // still a Node
      isText: false,
      isBlock: true,
      marks: [],
      check: vi.fn(),
    };
    createNodeFromContent.mockImplementation(() => blockNode);

    const tr = makeTr({
      doc: {
        resolve: vi.fn().mockReturnValue({
          parent: {
            isTextblock: true,
            type: { spec: {} },
            childCount: 0,
          },
        }),
      },
    });

    const editor = makeEditor();
    const cmd = insertContentAt(10, { type: 'paragraph' }, { updateSelection: true });
    const result = cmd({ tr, dispatch: true, editor });

    expect(result).toBe(true);
    expect(tr.replaceWith).toHaveBeenCalledWith(9, 11, blockNode);
  });

  // https://github.com/superdoc-dev/superdoc/issues/842
  it('when value has newlines, still inserts text using tr.insertText', () => {
    const value = 'Line 1\nLine 2';

    // Simulate a Fragment (array, no `type` on container) so isFragment(...) === true
    const fragment = [
      { isText: true, isBlock: false, marks: [], check: vi.fn() }, // "Line 1"
      { isText: false, isBlock: false, marks: [], check: vi.fn() }, // <hardBreak>
      { isText: true, isBlock: false, marks: [], check: vi.fn() }, // "Line 2"
    ];
    createNodeFromContent.mockImplementation(() => fragment);

    const tr = makeTr();
    const editor = makeEditor();

    const cmd = insertContentAt(3, value, { updateSelection: true });
    const result = cmd({ tr, dispatch: true, editor });

    expect(result).toBe(true);

    // Desired behavior (will currently fail): insertText used for raw strings with '\n'
    expect(tr.insertText).toHaveBeenCalledWith('Line 1\nLine 2', 3, 3);
    expect(tr.replaceWith).not.toHaveBeenCalled();
  });

  it('bare string with \\n\\n forces insertText (keeps literal newlines)', () => {
    const value = 'Line 1\n\nLine 2';

    // Parser would normally produce a Fragment with a hard break, but since we
    // force text for newline strings, the parsed result is irrelevant.
    createNodeFromContent.mockImplementation(() => [
      // simulate what parser might return; won't be used due to forceTextInsert
      { isText: true, isBlock: false, marks: [], check: vi.fn() },
      { isText: false, isBlock: false, marks: [], check: vi.fn() }, // <hardBreak>
      { isText: true, isBlock: false, marks: [], check: vi.fn() },
    ]);

    const tr = makeTr();
    const editor = makeEditor();

    const cmd = insertContentAt(7, value, { updateSelection: true });
    const result = cmd({ tr, dispatch: true, editor });

    expect(result).toBe(true);
    // With newline heuristic, we insert text literally:
    expect(tr.insertText).toHaveBeenCalledWith('Line 1\n\nLine 2', 7, 7);
    expect(tr.replaceWith).not.toHaveBeenCalled();
  });

  it('bare string with single \\n also forces insertText', () => {
    const value = 'A\nB';

    createNodeFromContent.mockImplementation(() => [
      { isText: true, isBlock: false, marks: [], check: vi.fn() },
      { isText: false, isBlock: false, marks: [], check: vi.fn() },
      { isText: true, isBlock: false, marks: [], check: vi.fn() },
    ]);

    const tr = makeTr();
    const editor = makeEditor();

    const cmd = insertContentAt(3, value, { updateSelection: true });
    const result = cmd({ tr, dispatch: true, editor });

    expect(result).toBe(true);
    expect(tr.insertText).toHaveBeenCalledWith('A\nB', 3, 3);
    expect(tr.replaceWith).not.toHaveBeenCalled();
  });

  // HTML still parses to nodes and uses replaceWith
  it('HTML string parses and inserts via replaceWith (not insertText)', () => {
    const value = '<p>Hello HTML</p>';

    const blockNode = {
      type: { name: 'paragraph' },
      isText: false,
      isBlock: true,
      marks: [],
      check: vi.fn(),
    };
    createNodeFromContent.mockImplementation(() => blockNode);

    const tr = makeTr({
      doc: {
        resolve: vi.fn().mockReturnValue({
          parent: { isTextblock: true, type: { spec: {} }, childCount: 0 },
        }),
      },
    });
    const editor = makeEditor();

    const cmd = insertContentAt(10, value, { updateSelection: true });
    const result = cmd({ tr, dispatch: true, editor });

    expect(result).toBe(true);
    expect(tr.insertText).not.toHaveBeenCalled();
    // empty textblock wrapper replacement [from-1, to+1]
    expect(tr.replaceWith).toHaveBeenCalledWith(9, 11, blockNode);
  });
});
