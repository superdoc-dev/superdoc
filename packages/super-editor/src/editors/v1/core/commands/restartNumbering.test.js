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
    getAllListDefinitions: vi.fn(),
    createNumDefinition: vi.fn(),
  },
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => {
    return node?.attrs?.paragraphProperties || { numberingProperties: null };
  }),
}));

vi.mock('@core/commands/changeListLevel.js', () => ({
  updateNumberingProperties: vi.fn(),
}));

import { updateNumberingProperties } from '@core/commands/changeListLevel.js';

describe('restartNumbering', () => {
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

    const sharedDoc = {
      content: { size: 100 },
      nodesBetween: vi.fn(),
    };
    state = { selection: {}, doc: sharedDoc };
    tr = { setMeta: vi.fn() };
    editor = {};

    isList.mockReturnValue(true);
    ListHelpers.getAllListDefinitions.mockReturnValue({});
    ListHelpers.createNumDefinition.mockReturnValue({ numId: 99 });
  });

  it('returns false when no list paragraph is found', () => {
    resolveParent.mockReturnValue(null);

    const result = restartNumbering({ editor, tr, state });

    expect(result).toBe(false);
    expect(ListHelpers.setLvlOverride).not.toHaveBeenCalled();
  });

  it('returns false when paragraph has no numId', () => {
    const paragraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: { numberingProperties: null } },
    };
    resolveParent.mockReturnValue({ node: paragraph, pos: 5 });

    const result = restartNumbering({ editor, tr, state });

    expect(result).toBe(false);
    expect(ListHelpers.setLvlOverride).not.toHaveBeenCalled();
  });

  describe('first item in list (no preceding items)', () => {
    beforeEach(() => {
      // nodesBetween finds no preceding items
      state.doc.nodesBetween.mockImplementation((from, to) => {
        if (to === 5) return; // searching for preceding items — none found
      });
    });

    it('sets startOverride on the existing numId and flags the captured tr with preventDispatch (view present)', () => {
      const paragraph = createParagraph({ numId: 7, ilvl: 0 });
      resolveParent.mockReturnValue({ node: paragraph, pos: 5 });
      editor.view = { dispatch: vi.fn() };

      const result = restartNumbering({ editor, tr, state });

      expect(result).toBe(true);
      expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 7, 0, { startOverride: 1 });
      expect(ListHelpers.createNumDefinition).not.toHaveBeenCalled();
      expect(tr.setMeta).toHaveBeenCalledWith('preventDispatch', true);
    });

    it('does NOT set preventDispatch in headless mode (no view) so CommandService can dispatch the captured tr', () => {
      const paragraph = createParagraph({ numId: 7, ilvl: 0 });
      resolveParent.mockReturnValue({ node: paragraph, pos: 5 });
      // editor.view intentionally undefined

      const result = restartNumbering({ editor, tr, state });

      expect(result).toBe(true);
      expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 7, 0, { startOverride: 1 });
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

      const result = restartNumbering({ editor, tr, state });

      expect(result).toBe(true);
      expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 5, 0, { startOverride: 1 });
    });
  });

  describe('mid-list restart (preceding items exist)', () => {
    const precedingParagraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: { numberingProperties: { numId: 7, ilvl: 0 } } },
      nodeSize: 4,
    };

    beforeEach(() => {
      // nodesBetween[0..paragraphPos] finds a preceding item with numId=7
      state.doc.nodesBetween.mockImplementation((from, to, cb) => {
        if (to === 20) {
          // preceding search range
          cb(precedingParagraph, 5);
        }
        // forward range (paragraphPos..end): no further items to remap in this stub
      });

      ListHelpers.getAllListDefinitions.mockReturnValue({
        7: { 0: { abstractId: '42' } },
      });
      ListHelpers.createNumDefinition.mockReturnValue({ numId: 99 });
    });

    it('creates a new numId and sets startOverride on it', () => {
      const paragraph = createParagraph({ numId: 7, ilvl: 0 });
      resolveParent.mockReturnValue({ node: paragraph, pos: 20 });

      const result = restartNumbering({ editor, tr, state });

      expect(result).toBe(true);
      expect(ListHelpers.createNumDefinition).toHaveBeenCalledWith(editor, 42);
      expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 99, 0, { startOverride: 1 });
    });

    it('remaps paragraphs from current position to the new numId', () => {
      const paragraph = createParagraph({ numId: 7, ilvl: 0 });
      const followingParagraph = createParagraph({ numId: 7, ilvl: 0 });
      resolveParent.mockReturnValue({ node: paragraph, pos: 20 });

      state.doc.nodesBetween.mockImplementation((from, to, cb) => {
        if (to === 20) {
          cb(precedingParagraph, 5); // preceding item
        } else {
          // forward range: current and following item
          cb(paragraph, 20);
          cb(followingParagraph, 30);
        }
      });

      restartNumbering({ editor, tr, state });

      expect(updateNumberingProperties).toHaveBeenCalledWith({ numId: 99, ilvl: 0 }, paragraph, 20, editor, tr);
      expect(updateNumberingProperties).toHaveBeenCalledWith(
        { numId: 99, ilvl: 0 },
        followingParagraph,
        30,
        editor,
        tr,
      );
    });

    it('returns false when abstractId cannot be resolved', () => {
      const paragraph = createParagraph({ numId: 7, ilvl: 0 });
      resolveParent.mockReturnValue({ node: paragraph, pos: 20 });
      ListHelpers.getAllListDefinitions.mockReturnValue({}); // no definition

      const result = restartNumbering({ editor, tr, state });

      expect(result).toBe(false);
      expect(ListHelpers.createNumDefinition).not.toHaveBeenCalled();
    });
  });
});
