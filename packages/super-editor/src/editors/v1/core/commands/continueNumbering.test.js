// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { continueNumbering } from './continueNumbering.js';
import { findParentNode } from '@helpers/index.js';
import { isList } from '@core/commands/list-helpers';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';

vi.mock(import('@helpers/index.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findParentNode: vi.fn(),
  };
});

vi.mock('@core/commands/list-helpers', () => ({
  isList: vi.fn(),
}));

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    removeLvlOverride: vi.fn(),
  },
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => {
    return node?.attrs?.paragraphProperties || { numberingProperties: null };
  }),
}));

describe('continueNumbering', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let resolveParent;
  /** @type {any} */
  let state;
  /** @type {any} */
  let tr;
  /** @type {any} */
  let freshTr;
  /** @type {any} */
  let editor;
  /** @type {ReturnType<typeof vi.fn>} */
  let dispatch;

  const createParagraph = ({ numId, ilvl = 0 }) => ({
    type: { name: 'paragraph' },
    attrs: {
      paragraphProperties: { numberingProperties: { numId, ilvl } },
    },
    nodeSize: 4,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    resolveParent = vi.fn();
    findParentNode.mockReturnValue(resolveParent);

    freshTr = {};
    state = { selection: {} };
    tr = { setMeta: vi.fn() };
    editor = { state: { tr: freshTr } };
    dispatch = vi.fn();

    isList.mockReturnValue(true);
  });

  it('returns false when no list paragraph is found', () => {
    resolveParent.mockReturnValue(null);

    const result = continueNumbering({ editor, tr, state, dispatch });

    expect(result).toBe(false);
    expect(ListHelpers.removeLvlOverride).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when paragraph has no numId', () => {
    const paragraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: { numberingProperties: null } },
    };
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });

    const result = continueNumbering({ editor, tr, state, dispatch });

    expect(result).toBe(false);
    expect(ListHelpers.removeLvlOverride).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('removes lvlOverride for the current numId and ilvl, then dispatches fresh tr', () => {
    const paragraph = createParagraph({ numId: 7, ilvl: 0 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });

    const result = continueNumbering({ editor, tr, state, dispatch });

    expect(result).toBe(true);
    expect(ListHelpers.removeLvlOverride).toHaveBeenCalledWith(editor, 7, 0);
    expect(dispatch).toHaveBeenCalledWith(freshTr);
  });

  it('defaults ilvl to 0 when not specified', () => {
    const paragraph = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { numId: 5 } },
      },
      nodeSize: 4,
    };
    resolveParent.mockReturnValue({ node: paragraph, pos: 3 });

    const result = continueNumbering({ editor, tr, state });

    expect(result).toBe(true);
    expect(ListHelpers.removeLvlOverride).toHaveBeenCalledWith(editor, 5, 0);
  });

  it('does not dispatch when dispatch is not provided', () => {
    const paragraph = createParagraph({ numId: 7, ilvl: 0 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });

    const result = continueNumbering({ editor, tr, state });

    expect(result).toBe(true);
    expect(ListHelpers.removeLvlOverride).toHaveBeenCalledWith(editor, 7, 0);
  });
});
