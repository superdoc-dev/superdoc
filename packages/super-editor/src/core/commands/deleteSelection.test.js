import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteSelection as pmDeleteSelection } from 'prosemirror-commands';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { deleteSelection } from './deleteSelection.js';

vi.mock('prosemirror-commands', () => ({
  deleteSelection: vi.fn(),
}));

function makeSchema() {
  const nodes = {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: { group: 'inline' },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      renderDOM: () => ['ol', 0],
      parseDOM: () => [{ tag: 'ol' }],
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
      renderDOM: () => ['ul', 0],
      parseDOM: () => [{ tag: 'ul' }],
    },
    listItem: {
      group: 'block',
      content: 'paragraph block*',
      defining: true,
      renderDOM: () => ['li', 0],
      parseDOM: () => [{ tag: 'li' }],
    },
  };
  return new Schema({ nodes });
}

function findTextPos(doc, text) {
  let result = null;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      result = pos;
      return false;
    }
    return true;
  });
  return result;
}

describe('deleteSelection', () => {
  let schema;

  beforeEach(() => {
    vi.clearAllMocks();
    schema = makeSchema();
  });

  it('delegates to original deleteSelection when selection is empty', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('hello world'))]);
    const sel = TextSelection.create(doc, 2, 2);
    const state = EditorState.create({ schema, doc, selection: sel });

    pmDeleteSelection.mockReturnValueOnce('delegated');

    const cmd = deleteSelection();
    const dispatch = vi.fn();
    const res = cmd({ state, tr: state.tr, dispatch });

    expect(pmDeleteSelection).toHaveBeenCalledTimes(1);
    expect(pmDeleteSelection).toHaveBeenCalledWith(state, dispatch);
    expect(res).toBe('delegated');
  });

  it('hard-deletes when selection contains list content (orderedList)', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('before')),
      schema.node('orderedList', null, [
        schema.node('listItem', null, [schema.node('paragraph', null, schema.text('one'))]),
        schema.node('listItem', null, [schema.node('paragraph', null, schema.text('two'))]),
      ]),
      schema.node('paragraph', null, schema.text('after')),
    ]);

    // select from inside "one" into "after"
    const from = findTextPos(doc, 'one');
    const afterPos = findTextPos(doc, 'after');
    expect(from).not.toBeNull();
    expect(afterPos).not.toBeNull();
    const to = afterPos + 'after'.length;
    const sel = TextSelection.create(doc, from, to);
    const state = EditorState.create({ schema, doc, selection: sel });

    const tr = state.tr;
    const deleteSpy = vi.spyOn(tr, 'deleteRange');

    const cmd = deleteSelection();
    let dispatched = null;
    const dispatch = (t) => (dispatched = t);

    const ok = cmd({ state, tr, dispatch });
    expect(ok).toBe(true);
    expect(pmDeleteSelection).not.toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith(from, to);
    expect(dispatched).toBeTruthy();
  });

  it('delegates when non-empty selection has no list content', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('abc def ghi'))]);
    const sel = TextSelection.create(doc, 2, 6); // "c de"
    const state = EditorState.create({ schema, doc, selection: sel });

    pmDeleteSelection.mockReturnValueOnce('delegated-non-empty');

    const cmd = deleteSelection();
    const dispatch = vi.fn();
    const res = cmd({ state, tr: state.tr, dispatch });

    expect(pmDeleteSelection).toHaveBeenCalledTimes(1);
    expect(res).toBe('delegated-non-empty');
  });

  it('returns true when dispatch is omitted (list content case)', () => {
    // Ensure DOM selection is empty so the single-char guard does not short-circuit
    vi.spyOn(document, 'getSelection').mockReturnValue({
      toString: () => '',
      isCollapsed: true,
    });

    const doc = schema.node('doc', null, [
      schema.node('bulletList', null, [
        schema.node('listItem', null, [schema.node('paragraph', null, schema.text('foo bar'))]),
      ]),
    ]);
    const start = findTextPos(doc, 'foo bar');
    expect(start).not.toBeNull();
    const end = start + 'foo bar'.length;
    const sel = TextSelection.create(doc, start, end);
    const state = EditorState.create({ schema, doc, selection: sel });

    const cmd = deleteSelection();
    const ok = cmd({ state, tr: state.tr }); // no dispatch

    expect(ok).toBe(true);
    expect(pmDeleteSelection).not.toHaveBeenCalled();
  });

  // This is a workaround. It was a fix for SD-1013.
  // When user selects text from right to left and replace it with a single char,
  // Prosemirror will interpret this as a backspace operation, which will delete the character.
  // This is a workaround to prevent this from happening, by checking if the current DOM selection is a single character.
  it('returns false when current dom selection is a single character', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('abc def ghi'))]);
    const sel = TextSelection.create(doc, 2, 5);
    const state = EditorState.create({ schema, doc, selection: sel });

    vi.spyOn(document, 'getSelection').mockReturnValue({
      baseNode: {
        data: 'a',
      },
    });

    const cmd = deleteSelection();
    const ok = cmd({ state, tr: state.tr });
    expect(ok).toBe(false);
  });

  it('handles SSR environment when document is undefined', () => {
    // Save original document reference
    const originalDocument = globalThis.document;

    // Simulate SSR by removing document
    delete globalThis.document;

    try {
      const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('abc def ghi'))]);
      const sel = TextSelection.create(doc, 2, 6); // non-empty selection
      const state = EditorState.create({ schema, doc, selection: sel });

      pmDeleteSelection.mockReturnValueOnce('delegated-ssr');

      const cmd = deleteSelection();
      const dispatch = vi.fn();
      const res = cmd({ state, tr: state.tr, dispatch });

      // Should delegate to original deleteSelection without error
      expect(pmDeleteSelection).toHaveBeenCalledTimes(1);
      expect(res).toBe('delegated-ssr');
    } finally {
      // Restore document
      globalThis.document = originalDocument;
    }
  });

  it('handles null getSelection result', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('abc def ghi'))]);
    const sel = TextSelection.create(doc, 2, 6); // non-empty selection
    const state = EditorState.create({ schema, doc, selection: sel });

    // Mock getSelection to return null (can happen in some browsers/contexts)
    vi.spyOn(document, 'getSelection').mockReturnValue(null);

    pmDeleteSelection.mockReturnValueOnce('delegated-null-selection');

    const cmd = deleteSelection();
    const dispatch = vi.fn();
    const res = cmd({ state, tr: state.tr, dispatch });

    // Should delegate to original deleteSelection without error
    expect(pmDeleteSelection).toHaveBeenCalledTimes(1);
    expect(res).toBe('delegated-null-selection');
  });

  it('allows deletion when baseNode has multiple characters even if selection is single char', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('abc def ghi'))]);
    const sel = TextSelection.create(doc, 2, 3); // single character selection "b"
    const state = EditorState.create({ schema, doc, selection: sel });

    // Mock getSelection with a multi-character baseNode
    vi.spyOn(document, 'getSelection').mockReturnValue({
      baseNode: {
        data: 'abc def ghi', // Multi-character node
      },
    });

    pmDeleteSelection.mockReturnValueOnce('delegated-multi-char-node');

    const cmd = deleteSelection();
    const dispatch = vi.fn();
    const res = cmd({ state, tr: state.tr, dispatch });

    // Should delegate to original deleteSelection (not trigger SD-1013 workaround)
    expect(pmDeleteSelection).toHaveBeenCalledTimes(1);
    expect(res).toBe('delegated-multi-char-node');
  });
});
