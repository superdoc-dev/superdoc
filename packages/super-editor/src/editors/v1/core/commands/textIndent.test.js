// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { increaseTextIndent, decreaseTextIndent, setTextIndentation, unsetTextIndentation } from './textIndent.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { ptToTwips } from '@converter/helpers';

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => node.attrs.paragraphProperties || {}),
}));

vi.mock('@converter/helpers', () => ({
  ptToTwips: vi.fn((pt) => pt * 20),
}));

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      attrs: {
        paragraphProperties: { default: {} },
      },
      toDOM: (node) => ['p', node.attrs, 0],
      parseDOM: [{ tag: 'p' }],
    },
  },
  marks: {},
});

const createState = (paragraphAttrs) => {
  const paragraph = schema.nodes.paragraph.create(paragraphAttrs, schema.text('Hello'));
  const doc = schema.nodes.doc.create({}, paragraph);
  const selection = TextSelection.create(doc, 1, doc.content.size - 1);
  return EditorState.create({ doc, selection });
};

const runCommand = (command, state) => {
  let nextState = state;
  const dispatched = command({
    state,
    dispatch: (tr) => {
      nextState = state.apply(tr);
    },
  });
  return { dispatched, nextState };
};

describe('text indent commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increaseTextIndent adds a default increment when indent is missing', () => {
    const state = createState({ paragraphProperties: {} });
    getResolvedParagraphProperties.mockReturnValueOnce({ indent: {} });

    const { dispatched, nextState } = runCommand(increaseTextIndent(), state);

    expect(dispatched).toBe(true);
    const updated = nextState.doc.firstChild;
    expect(updated.attrs.paragraphProperties.indent.left).toBe(ptToTwips(36));
  });

  it('decreaseTextIndent clears indent when it drops to zero or below', () => {
    const initialLeft = ptToTwips(20);
    const state = createState({ paragraphProperties: { indent: { left: initialLeft } } });
    getResolvedParagraphProperties.mockReturnValueOnce({ indent: { left: initialLeft } });

    const { dispatched, nextState } = runCommand(decreaseTextIndent(), state);

    expect(dispatched).toBe(true);
    const updated = nextState.doc.firstChild;
    expect(updated.attrs.paragraphProperties.indent).toBeUndefined();
  });

  it('setTextIndentation and unsetTextIndentation set and remove left indent', () => {
    const state = createState({ paragraphProperties: {} });
    getResolvedParagraphProperties.mockReturnValue({ indent: {} });

    const { nextState: afterSet } = runCommand(setTextIndentation(10), state);
    const updated = afterSet.doc.firstChild;
    expect(updated.attrs.paragraphProperties.indent.left).toBe(ptToTwips(10));

    const { nextState: afterUnset, dispatched } = runCommand(unsetTextIndentation(), afterSet);
    expect(dispatched).toBe(true);
    const finalNode = afterUnset.doc.firstChild;
    expect(finalNode.attrs.paragraphProperties.indent).toBeUndefined();
  });
});
