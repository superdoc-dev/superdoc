import { describe, it, expect, mock, beforeEach } from 'bun:test';
// @ts-check
const { restartNumbering } = await import('./restartNumbering.js');
const { findParentNode } = await import('@helpers/index.js');
import { isList } from '@core/commands/list-helpers';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';

mock.module('@helpers/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findParentNode: mock(),
  };
});

mock.module('@core/commands/list-helpers', () => ({
  isList: mock(),
}));

mock.module('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    setLvlOverride: mock(),
  },
}));

mock.module('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: mock((node) => {
    return node?.attrs?.paragraphProperties || { numberingProperties: null };
  }),
}));

describe('restartNumbering', () => {
  /** @type {ReturnType<typeof mock>} */
  let resolveParent;
  /** @type {any} */
  let state;
  /** @type {any} */
  let tr;
  /** @type {any} */
  let editor;
  /** @type {ReturnType<typeof mock>} */
  let dispatch;

  const createParagraph = ({ numId, ilvl = 0 }) => ({
    type: { name: 'paragraph' },
    attrs: {
      paragraphProperties: { numberingProperties: { numId, ilvl } },
    },
    nodeSize: 4,
  });

  beforeEach(() => {
    resolveParent = mock();
    findParentNode.mockReturnValue(resolveParent);

    state = { selection: {} };
    tr = {};
    editor = {};
    dispatch = mock();

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
