// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { setParagraphDirection, clearParagraphDirection } from './paragraphDirection.js';
import { resolveHypotheticalParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  // Default: style cascade has no RTL, so the resolver returns the inline
  // props unchanged. Individual tests override for style-cascade RTL cases.
  resolveHypotheticalParagraphProperties: vi.fn((_editor, _$pos, inline) => inline),
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

const createState = (paragraphAttrsList) => {
  const paragraphs = paragraphAttrsList.map((attrs, i) => schema.nodes.paragraph.create(attrs, schema.text(`p${i}`)));
  const doc = schema.nodes.doc.create({}, paragraphs);
  const selection = TextSelection.create(doc, 1, doc.content.size - 1);
  return EditorState.create({ doc, selection });
};

const runCommand = (command, state) => {
  /** @type {import('prosemirror-state').Transaction | null} */
  let dispatchedTr = null;
  const dispatched = command({
    editor: {},
    state,
    dispatch: (/** @type {import('prosemirror-state').Transaction} */ tr) => {
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

  it('removes rightToLeft on ltr (does not write false)', () => {
    // Writing `rightToLeft: false` exports as `<w:bidi w:val="0"/>` — direct
    // formatting that overrides any inherited style. LTR should delete the
    // property so the paragraph matches its style cascade default again.
    const state = createState([{ paragraphProperties: { rightToLeft: true } }]);
    const { dispatched, nextState } = runCommand(setParagraphDirection({ direction: 'ltr' }), state);
    expect(dispatched).toBe(true);
    expect('rightToLeft' in nextState.doc.firstChild.attrs.paragraphProperties).toBe(false);
  });

  it('is a no-op when ltr is applied to a paragraph that has no direction set', () => {
    // Before the LTR-deletes-property fix, this would dispatch a transaction
    // that wrote `rightToLeft: false` onto every vanilla paragraph — silently
    // injecting `<w:bidi w:val="0"/>` into the round-tripped DOCX even though
    // nothing semantically changed.
    const state = createState([{ paragraphProperties: {} }]);
    const { dispatched, tr } = runCommand(setParagraphDirection({ direction: 'ltr' }), state);
    expect(dispatched).toBe(false);
    expect(tr).toBeNull();
  });

  it('writes rightToLeft=false on ltr when the style cascade still resolves rtl', () => {
    // Style sets rightToLeft, paragraph has no inline override. Just deleting
    // the (non-existent) inline prop would leave the resolved direction as RTL —
    // clicking LTR would be a silent no-op. Explicit `false` is required to
    // override the inherited style direction.
    resolveHypotheticalParagraphProperties.mockReturnValueOnce({ rightToLeft: true });
    const state = createState([{ paragraphProperties: {} }]);
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
    if (!tr) throw new Error('expected a dispatched transaction');
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

  it('is a no-op when called without a direction (do not silently apply LTR)', () => {
    // Headless callers that route by command name (`execute('setParagraphDirection')`)
    // bottom out at a payload-less invocation. A missing direction must not write
    // `rightToLeft: false` — that would silently apply LTR when the caller asked
    // for nothing. Use the registry's typed direction-ltr / direction-rtl ids
    // (or pass `{ direction }` explicitly).
    const state = createState([{ paragraphProperties: { rightToLeft: true } }]);
    const { dispatched, tr } = runCommand(setParagraphDirection(), state);
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
