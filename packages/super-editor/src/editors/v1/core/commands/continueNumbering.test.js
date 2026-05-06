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
  let editor;

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
    tr = { setMeta: vi.fn() };
    editor = {};

    isList.mockReturnValue(true);
  });

  it('returns false when no list paragraph is found', () => {
    resolveParent.mockReturnValue(null);

    const result = continueNumbering({ editor, tr, state });

    expect(result).toBe(false);
    expect(ListHelpers.removeLvlOverride).not.toHaveBeenCalled();
  });

  it('returns false when paragraph has no numId', () => {
    const paragraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: { numberingProperties: null } },
    };
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });

    const result = continueNumbering({ editor, tr, state });

    expect(result).toBe(false);
    expect(ListHelpers.removeLvlOverride).not.toHaveBeenCalled();
  });

  it('removes lvlOverride and flags the captured tr with preventDispatch (view present)', () => {
    const paragraph = createParagraph({ numId: 7, ilvl: 0 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });
    editor.view = { dispatch: vi.fn() };

    const result = continueNumbering({ editor, tr, state });

    expect(result).toBe(true);
    expect(ListHelpers.removeLvlOverride).toHaveBeenCalledWith(editor, 7, 0);
    expect(tr.setMeta).toHaveBeenCalledWith('preventDispatch', true);
  });

  it('does NOT set preventDispatch in headless mode (no view) so CommandService can dispatch the captured tr', () => {
    const paragraph = createParagraph({ numId: 7, ilvl: 0 });
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });
    // editor.view intentionally undefined

    const result = continueNumbering({ editor, tr, state });

    expect(result).toBe(true);
    expect(ListHelpers.removeLvlOverride).toHaveBeenCalledWith(editor, 7, 0);
    expect(tr.setMeta).not.toHaveBeenCalledWith('preventDispatch', true);
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
});
