// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restartNumbering } from './restartNumbering.js';
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
    setLvlOverride: vi.fn(),
  },
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => {
    return node?.attrs?.paragraphProperties || { numberingProperties: null };
  }),
}));

describe('restartNumbering', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let resolveParent;
  /** @type {any} */
  let state;
  /** @type {any} */
  let tr;
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

    state = { selection: {} };
    tr = {};
    editor = {};
    dispatch = vi.fn();

    isList.mockReturnValue(true);
  });

  it('returns false when no list paragraph is found', () => {
    resolveParent.mockReturnValue(null);

    const result = restartNumbering({ editor, tr, state, dispatch });

    expect(result).toBe(false);
    expect(ListHelpers.setLvlOverride).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when paragraph has no numId', () => {
    const paragraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: { numberingProperties: null } },
    };
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });

    const result = restartNumbering({ editor, tr, state, dispatch });

    expect(result).toBe(false);
    expect(ListHelpers.setLvlOverride).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('sets startOverride on the existing numId and dispatches', () => {
    const paragraph = createParagraph({ numId: 7, ilvl: 0 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });

    const result = restartNumbering({ editor, tr, state, dispatch });

    expect(result).toBe(true);
    expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 7, 0, { startOverride: 1 });
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('uses the correct ilvl from paragraph properties', () => {
    const paragraph = createParagraph({ numId: 3, ilvl: 2 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 10 });

    const result = restartNumbering({ editor, tr, state, dispatch });

    expect(result).toBe(true);
    expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 3, 2, { startOverride: 1 });
    expect(dispatch).toHaveBeenCalledWith(tr);
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

    const result = restartNumbering({ editor, tr, state, dispatch });

    expect(result).toBe(true);
    expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 5, 0, { startOverride: 1 });
  });

  it('does not dispatch when dispatch is not provided', () => {
    const paragraph = createParagraph({ numId: 7, ilvl: 0 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });

    const result = restartNumbering({ editor, tr, state });

    expect(result).toBe(true);
    expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 7, 0, { startOverride: 1 });
  });
});
