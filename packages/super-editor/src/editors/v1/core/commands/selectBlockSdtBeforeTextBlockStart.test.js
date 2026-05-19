import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { selectBlockSdtBeforeTextBlockStart } from './selectBlockSdtBeforeTextBlockStart.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      structuredContentBlock: {
        group: 'block',
        content: 'block*',
        isolating: true,
        attrs: {
          lockMode: { default: 'unlocked' },
        },
      },
      listItem: { group: 'block', content: 'block+' },
      run: { group: 'inline', content: 'text*', inline: true },
      text: { group: 'inline' },
    },
    marks: {},
  });

const runParagraph = (schema, text) => schema.node('paragraph', null, schema.node('run', null, schema.text(text)));

const makeDoc = (schema, lockMode = 'unlocked') =>
  schema.node('doc', null, [
    runParagraph(schema, 'Before'),
    schema.node('structuredContentBlock', { lockMode }, [runParagraph(schema, 'Inner')]),
    runParagraph(schema, 'After'),
  ]);

const findNode = (doc, predicate) => {
  let result = null;
  doc.descendants((node, pos) => {
    if (predicate(node)) {
      result = { node, pos, end: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return result;
};

const findTextStart = (doc, text) => {
  const found = findNode(doc, (node) => node.isText && node.text === text);
  expect(found).not.toBeNull();
  return found.pos;
};

describe('selectBlockSdtBeforeTextBlockStart', () => {
  it('moves the caret into the preceding block SDT when the caret is at the start of the first run', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const afterStart = findTextStart(doc, 'After');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart) });

    let dispatched;
    const ok = selectBlockSdtBeforeTextBlockStart()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection).toBeInstanceOf(TextSelection);
    expect(dispatched.selection.$from.parent.type.name).toBe('paragraph');
    expect(dispatched.selection.$from.node(dispatched.selection.$from.depth - 1).type.name).toBe(
      'structuredContentBlock',
    );
    expect(dispatched.doc.textContent).toBe('BeforeInnerAfter');
  });

  it('returns false when there is text before the caret in the paragraph', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const afterStart = findTextStart(doc, 'After');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart + 1) });
    const dispatch = vi.fn();

    const ok = selectBlockSdtBeforeTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('climbs ancestor starts when the following paragraph is nested in a block wrapper', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      runParagraph(schema, 'Before'),
      schema.node('structuredContentBlock', { lockMode: 'unlocked' }, [runParagraph(schema, 'Inner')]),
      schema.node('listItem', null, [runParagraph(schema, 'After')]),
    ]);
    const afterStart = findTextStart(doc, 'After');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart) });

    let dispatched;
    const ok = selectBlockSdtBeforeTextBlockStart()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection).toBeInstanceOf(TextSelection);
    expect(dispatched.selection.$from.parent.type.name).toBe('paragraph');
    expect(dispatched.selection.$from.node(dispatched.selection.$from.depth - 1).type.name).toBe(
      'structuredContentBlock',
    );
    expect(dispatched.doc.textContent).toBe('BeforeInnerAfter');
  });

  it('consumes Backspace without dispatching when the preceding block SDT wrapper is locked', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema, 'sdtLocked');
    const afterStart = findTextStart(doc, 'After');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart) });
    const dispatch = vi.fn();

    const ok = selectBlockSdtBeforeTextBlockStart()({ state, dispatch });

    expect(ok).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
