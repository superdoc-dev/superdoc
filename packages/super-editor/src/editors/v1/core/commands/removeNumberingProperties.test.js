// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findParentNode } from '../helpers/findParentNode.js';
import { removeNumberingProperties } from './removeNumberingProperties.js';
import { decreaseListIndent } from './decreaseListIndent.js';
import { updateNumberingProperties } from './changeListLevel.js';

vi.mock(import('../helpers/findParentNode.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findParentNode: vi.fn(),
  };
});

vi.mock('@core/commands/list-helpers', () => ({
  isList: vi.fn(),
}));

vi.mock('./decreaseListIndent.js', () => ({
  decreaseListIndent: vi.fn(),
}));

vi.mock('./changeListLevel.js', () => ({
  updateNumberingProperties: vi.fn(),
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => node.attrs.paragraphProperties || {}),
}));

describe('removeNumberingProperties', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let resolveParent;
  /** @type {{ scrollIntoView: ReturnType<typeof vi.fn> }} */
  let tr;
  /** @type {{ selection: { empty: boolean, $from: { parentOffset: number } } }} */
  let state;
  /** @type {ReturnType<typeof vi.fn>} */
  let dispatch;
  /** @type {Record<string, unknown>} */
  let editor;

  /**
   * Minimal paragraph node stub that satisfies the checks inside
   * removeNumberingProperties and its helper.
   * @param {{ text?: string, ilvl?: number, nodes?: Array<any> }} [opts]
   */
  const createParagraph = (opts = {}) => {
    const { text = '', ilvl = 0, nodes = [] } = opts;
    const numberingProperties = { ilvl };
    return {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties },
      },
      textContent: text,
      descendants: (cb) => {
        for (const node of nodes) {
          const shouldContinue = cb(node);
          if (shouldContinue === false) break;
        }
      },
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resolveParent = vi.fn();
    findParentNode.mockReturnValue(resolveParent);
    tr = { scrollIntoView: vi.fn() };
    editor = {};
    state = { selection: { empty: true, $from: { parentOffset: 0 } } };
    dispatch = vi.fn();
  });

  it('returns false when the selection is not inside a list', () => {
    resolveParent.mockReturnValue(null);

    const result = removeNumberingProperties()({ tr, state, editor, dispatch });

    expect(result).toBe(false);
    expect(decreaseListIndent).not.toHaveBeenCalled();
    expect(updateNumberingProperties).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('aborts when checkType is "empty" but the paragraph has visible content', () => {
    const paragraph = createParagraph({ text: 'Some content' });
    resolveParent.mockReturnValue({ node: paragraph, pos: 10 });

    const result = removeNumberingProperties({ checkType: 'empty' })({ tr, state, editor, dispatch });

    expect(result).toBe(false);
    expect(decreaseListIndent).not.toHaveBeenCalled();
    expect(updateNumberingProperties).not.toHaveBeenCalled();
  });

  it('aborts for non-empty paragraphs when the cursor is not at the start', () => {
    const paragraph = createParagraph({ text: 'Content' });
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });
    state.selection = { empty: false, $from: { parentOffset: 3 } };

    const result = removeNumberingProperties()({ tr, state, editor, dispatch });

    expect(result).toBe(false);
    expect(decreaseListIndent).not.toHaveBeenCalled();
    expect(updateNumberingProperties).not.toHaveBeenCalled();
  });

  it('decreases indent when the paragraph is nested (ilvl > 0)', () => {
    const paragraph = createParagraph({ text: '', ilvl: 2 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 7 });

    const decreaseHandler = vi.fn().mockReturnValue(true);
    decreaseListIndent.mockReturnValue(decreaseHandler);

    const result = removeNumberingProperties()({ tr, state, editor, dispatch });

    expect(result).toBe(true);
    expect(decreaseListIndent).toHaveBeenCalledTimes(1);
    expect(decreaseHandler).toHaveBeenCalledWith({ tr, state, editor, dispatch });
    expect(tr.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(updateNumberingProperties).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('exits the list when the paragraph is at level 0', () => {
    const paragraph = createParagraph({ text: '', ilvl: 0 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 12 });

    const result = removeNumberingProperties()({ tr, state, editor, dispatch });

    expect(result).toBe(true);
    expect(decreaseListIndent).not.toHaveBeenCalled();
    expect(updateNumberingProperties).toHaveBeenCalledTimes(1);
    expect(updateNumberingProperties).toHaveBeenCalledWith(null, paragraph, 12, editor, tr);
    expect(dispatch).toHaveBeenCalledWith(tr);
  });
});
