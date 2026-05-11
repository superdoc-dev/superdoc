// @ts-check
import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { setParagraphDirection, clearParagraphDirection } from './paragraphDirection.js';

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

const createState = (paragraphAttrsList) => {
  const paragraphs = paragraphAttrsList.map((attrs, i) => schema.nodes.paragraph.create(attrs, schema.text(`p${i}`)));
  const doc = schema.nodes.doc.create({}, paragraphs);
  const selection = TextSelection.create(doc, 1, doc.content.size - 1);
  return EditorState.create({ doc, selection });
};

const runCommand = (command, state) => {
  let dispatchedTr = null;
  const dispatched = command({
    state,
    dispatch: (tr) => {
      dispatchedTr = tr;
    },
  });
  const nextState = dispatchedTr ? state.apply(dispatchedTr) : state;
  return { dispatched, nextState, tr: dispatchedTr };
};

describe('setParagraphDirection', () => {
  it('sets rightToLeft=true on rtl', () => {
    const state = createState([{ paragraphProperties: {} }]);
    const { dispatched, nextState } = runCommand(setParagraphDirection({ direction: 'rtl' }), state);
    expect(dispatched).toBe(true);
    expect(nextState.doc.firstChild.attrs.paragraphProperties.rightToLeft).toBe(true);
  });

  it('sets rightToLeft=false on ltr', () => {
    const state = createState([{ paragraphProperties: { rightToLeft: true } }]);
    const { dispatched, nextState } = runCommand(setParagraphDirection({ direction: 'ltr' }), state);
    expect(dispatched).toBe(true);
    expect(nextState.doc.firstChild.attrs.paragraphProperties.rightToLeft).toBe(false);
  });

  describe('alignmentPolicy: matchDirection', () => {
    it('flips justification "right" → "left" when switching to ltr', () => {
      const state = createState([{ paragraphProperties: { justification: 'right', rightToLeft: true } }]);
      const { nextState } = runCommand(
        setParagraphDirection({ direction: 'ltr', alignmentPolicy: 'matchDirection' }),
        state,
      );
      expect(nextState.doc.firstChild.attrs.paragraphProperties.justification).toBe('left');
    });

    it('flips justification "left" → "right" when switching to rtl', () => {
      const state = createState([{ paragraphProperties: { justification: 'left' } }]);
      const { nextState } = runCommand(
        setParagraphDirection({ direction: 'rtl', alignmentPolicy: 'matchDirection' }),
        state,
      );
      expect(nextState.doc.firstChild.attrs.paragraphProperties.justification).toBe('right');
    });

    it('leaves "center" alone', () => {
      const state = createState([{ paragraphProperties: { justification: 'center' } }]);
      const { nextState } = runCommand(
        setParagraphDirection({ direction: 'rtl', alignmentPolicy: 'matchDirection' }),
        state,
      );
      expect(nextState.doc.firstChild.attrs.paragraphProperties.justification).toBe('center');
    });

    it('leaves "both" (justify) alone', () => {
      const state = createState([{ paragraphProperties: { justification: 'both' } }]);
      const { nextState } = runCommand(
        setParagraphDirection({ direction: 'rtl', alignmentPolicy: 'matchDirection' }),
        state,
      );
      expect(nextState.doc.firstChild.attrs.paragraphProperties.justification).toBe('both');
    });

    it('leaves unset justification alone', () => {
      const state = createState([{ paragraphProperties: {} }]);
      const { nextState } = runCommand(
        setParagraphDirection({ direction: 'rtl', alignmentPolicy: 'matchDirection' }),
        state,
      );
      expect(nextState.doc.firstChild.attrs.paragraphProperties.justification).toBeUndefined();
    });

    it('does nothing when alignmentPolicy is omitted', () => {
      const state = createState([{ paragraphProperties: { justification: 'left' } }]);
      const { nextState } = runCommand(setParagraphDirection({ direction: 'rtl' }), state);
      expect(nextState.doc.firstChild.attrs.paragraphProperties.justification).toBe('left');
    });
  });

  it('touches every paragraph in a multi-paragraph selection with a single transaction', () => {
    const state = createState([{ paragraphProperties: {} }, { paragraphProperties: {} }, { paragraphProperties: {} }]);
    // Selection covers the full doc (see createState).
    const { dispatched, nextState, tr } = runCommand(setParagraphDirection({ direction: 'rtl' }), state);

    expect(dispatched).toBe(true);
    // setNodeMarkup produces one step per paragraph but they all live in the
    // same Transaction — which is what "one undo step" rests on.
    expect(tr.steps).toHaveLength(3);
    nextState.doc.forEach((node) => {
      expect(node.attrs.paragraphProperties.rightToLeft).toBe(true);
    });
  });

  it('returns false and does not dispatch when no paragraph would change', () => {
    const state = createState([{ paragraphProperties: { rightToLeft: true } }]);
    const { dispatched, tr } = runCommand(setParagraphDirection({ direction: 'rtl' }), state);
    expect(dispatched).toBe(false);
    expect(tr).toBeNull();
  });
});

describe('clearParagraphDirection', () => {
  it('removes the rightToLeft property (does not set it to false)', () => {
    const state = createState([{ paragraphProperties: { rightToLeft: true } }]);
    const { dispatched, nextState } = runCommand(clearParagraphDirection(), state);
    expect(dispatched).toBe(true);
    expect('rightToLeft' in nextState.doc.firstChild.attrs.paragraphProperties).toBe(false);
  });

  it('returns false when there is nothing to clear', () => {
    const state = createState([{ paragraphProperties: {} }]);
    const { dispatched } = runCommand(clearParagraphDirection(), state);
    expect(dispatched).toBe(false);
  });
});
