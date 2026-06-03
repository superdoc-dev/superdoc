import { describe, expect, it, vi } from 'vitest';
import { __TEST_ONLY__, mixedBidiBackspace } from './mixed-bidi-backspace.js';

const makeRect = (left, top = 10, width = 8, height = 12) => ({
  left,
  top,
  width,
  height,
});

const setupContext = ({ text, charLefts, caretRect, selectionFrom, pmBase = 10 }) => {
  const doc = document.implementation.createHTMLDocument('mixed-bidi-backspace');
  Object.defineProperty(doc, 'defaultView', {
    value: { NodeFilter: { SHOW_TEXT: 4 } },
    configurable: true,
  });
  const lineEl = doc.createElement('div');
  lineEl.className = 'superdoc-line';
  const textNode = doc.createTextNode(text);
  lineEl.appendChild(textNode);
  doc.body.appendChild(lineEl);

  doc.elementsFromPoint = vi.fn(() => [lineEl]);

  doc.createRange = vi.fn(() => {
    const range = {
      _node: null,
      _start: 0,
      _end: 0,
      setStart(node, offset) {
        this._node = node;
        this._start = offset;
      },
      setEnd(node, offset) {
        this._node = node;
        this._end = offset;
      },
      getBoundingClientRect() {
        if (this._node !== textNode) return makeRect(0, 0, 0, 0);
        const chIndex = this._start;
        const left = charLefts[chIndex];
        if (typeof left !== 'number') return makeRect(0, 0, 0, 0);
        return makeRect(left);
      },
    };
    return range;
  });

  const nativeRange = {
    collapsed: true,
    getBoundingClientRect: () => caretRect,
    startContainer: textNode,
  };

  doc.getSelection = vi.fn(() => ({
    rangeCount: 1,
    getRangeAt: () => nativeRange,
  }));

  const dispatch = vi.fn();
  const tr = {
    delete: vi.fn(() => tr),
    scrollIntoView: vi.fn(() => tr),
  };
  const view = {
    dom: { ownerDocument: doc },
    posAtDOM: vi.fn((node, offset) => {
      if (node !== textNode) throw new Error('unexpected node');
      return pmBase + offset;
    }),
  };
  const state = {
    selection: { empty: true, from: selectionFrom },
  };

  return { state, view, tr, dispatch };
};

describe('mixedBidiBackspace (chain command)', () => {
  it('returns true and mutates the chain tr on RTL+LTR boundary', () => {
    const { state, view, tr, dispatch } = setupContext({
      text: 'אA',
      charLefts: [10, 20],
      caretRect: makeRect(20, 10, 1, 12),
      selectionFrom: 11,
      pmBase: 10,
    });

    const handled = mixedBidiBackspace()({ state, view, tr, dispatch });
    expect(handled).toBe(true);
    expect(tr.delete).toHaveBeenCalledWith(10, 11);
    expect(tr.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled(); // chain owns dispatch
  });

  it('returns true and mutates the chain tr on LTR+RTL boundary', () => {
    const { state, view, tr } = setupContext({
      text: 'Aא',
      charLefts: [10, 20],
      caretRect: makeRect(20, 10, 1, 12),
      selectionFrom: 11,
      pmBase: 10,
    });

    const handled = mixedBidiBackspace()({ state, view, tr, dispatch: vi.fn() });
    expect(handled).toBe(true);
    expect(tr.delete).toHaveBeenCalledWith(10, 11);
  });

  it('returns false without mutating tr on pure LTR (chain falls through)', () => {
    const { state, view, tr, dispatch } = setupContext({
      text: 'AB',
      charLefts: [10, 20],
      caretRect: makeRect(20, 10, 1, 12),
      selectionFrom: 11,
      pmBase: 10,
    });

    const handled = mixedBidiBackspace()({ state, view, tr, dispatch });
    expect(handled).toBe(false);
    expect(tr.delete).not.toHaveBeenCalled();
    expect(tr.scrollIntoView).not.toHaveBeenCalled();
    expect(view.posAtDOM).not.toHaveBeenCalled(); // early-out skips DOM scan
  });

  it('returns false on non-empty selection (chain falls through)', () => {
    const { state, view, tr } = setupContext({
      text: 'אA',
      charLefts: [10, 20],
      caretRect: makeRect(20, 10, 1, 12),
      selectionFrom: 11,
      pmBase: 10,
    });
    state.selection.empty = false;

    const handled = mixedBidiBackspace()({ state, view, tr, dispatch: vi.fn() });
    expect(handled).toBe(false);
    expect(tr.delete).not.toHaveBeenCalled();
  });

  // SD-2933 / SD-2767: the chain's `dispatch` parameter is undefined during dry-run
  // probing. The command must still return true without mutating tr in that mode.
  // chain.first uses this to detect whether a command CAN handle the operation.
  it('does not mutate tr when dispatch is undefined (chain dry-run probe)', () => {
    const { state, view, tr } = setupContext({
      text: 'אA',
      charLefts: [10, 20],
      caretRect: makeRect(20, 10, 1, 12),
      selectionFrom: 11,
      pmBase: 10,
    });

    const handled = mixedBidiBackspace()({ state, view, tr, dispatch: undefined });
    expect(handled).toBe(true);
    expect(tr.delete).not.toHaveBeenCalled();
    expect(tr.scrollIntoView).not.toHaveBeenCalled();
  });

  it('returns false when caret is not at the boundary (e.g. mid-word)', () => {
    const { state, view, tr } = setupContext({
      text: 'אAB',
      charLefts: [10, 20, 30],
      caretRect: makeRect(30, 10, 1, 12),
      selectionFrom: 12, // past the boundary
      pmBase: 10,
    });

    const handled = mixedBidiBackspace()({ state, view, tr, dispatch: vi.fn() });
    expect(handled).toBe(false);
  });

  it('exposes hasMixedDirectionBoundary helper for direct testing', () => {
    expect(__TEST_ONLY__.hasMixedDirectionBoundary('א', 'A')).toBe(true);
    expect(__TEST_ONLY__.hasMixedDirectionBoundary('A', 'א')).toBe(true);
    expect(__TEST_ONLY__.hasMixedDirectionBoundary('A', 'B')).toBe(false);
    expect(__TEST_ONLY__.hasMixedDirectionBoundary('א', 'ש')).toBe(false);
  });

  // SD-3169: Hebrew/Arabic presentation forms (legacy ligature codepoints used
  // by older fonts and some legacy systems) live outside the Hebrew/Arabic
  // core blocks. The Phase 6 STRONG_RTL_CHAR_RE = /[\u0590-\u08FF]/ missed
  // them, so a paragraph mixing presentation-form Hebrew/Arabic with Latin
  // would not have its boundary detected and mixed-bidi Backspace would not
  // fire. Pin via the helper and the end-to-end command path.
  describe('SD-3169 Hebrew/Arabic presentation forms', () => {
    it('hasMixedDirectionBoundary recognizes Hebrew presentation forms (FB1D-FB4F)', () => {
      // \uFB21 = Hebrew Letter Wide Alef. Boundary against Latin must register.
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('\uFB21', 'A')).toBe(true);
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('A', '\uFB21')).toBe(true);
      // \uFB4F = Hebrew Ligature Alef Lamed (last code point in the range).
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('\uFB4F', 'B')).toBe(true);
    });

    it('hasMixedDirectionBoundary recognizes Arabic Presentation Forms-A (FB50-FDFF)', () => {
      // \uFB50 = Arabic Letter Alef Wasla Isolated Form (first code point).
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('\uFB50', 'A')).toBe(true);
      // \uFDF2 = Arabic Ligature Allah Isolated Form.
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('\uFDF2', 'A')).toBe(true);
    });

    it('hasMixedDirectionBoundary recognizes Arabic Presentation Forms-B (FE70-FEFF)', () => {
      // \uFE70 = Arabic Fathatan Isolated Form (first code point).
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('\uFE70', 'A')).toBe(true);
      // \uFEFC = Arabic Ligature Lam With Alef Final Form (last letter form).
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('\uFEFC', 'A')).toBe(true);
    });

    it('hasMixedDirectionBoundary excludes noncharacters in the Arabic A range', () => {
      // FDD0-FDEF are Unicode noncharacters, not strong-RTL.
      // FEFF is ZERO WIDTH NO-BREAK SPACE (BOM), not strong-RTL.
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('\uFDD0', 'A')).toBe(false);
      expect(__TEST_ONLY__.hasMixedDirectionBoundary('\uFEFF', 'A')).toBe(false);
    });

    it('returns true and mutates tr on presentation-form-Hebrew + Latin boundary', () => {
      const { state, view, tr } = setupContext({
        text: '\uFB21A',
        charLefts: [10, 20],
        caretRect: makeRect(20, 10, 1, 12),
        selectionFrom: 11,
        pmBase: 10,
      });

      const handled = mixedBidiBackspace()({ state, view, tr, dispatch: vi.fn() });
      expect(handled).toBe(true);
      expect(tr.delete).toHaveBeenCalledWith(10, 11);
    });
  });
});
