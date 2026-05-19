// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Selection, TextSelection } from 'prosemirror-state';

vi.mock('./changeListLevel.js', () => ({
  updateNumberingProperties: vi.fn(),
}));

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    getNewListId: vi.fn(),
    generateNewListDefinition: vi.fn(),
    getListDefinitionDetails: vi.fn(() => null),
    setListLevelStyles: vi.fn(() => true),
    cloneListDefinitionWithLevelStyle: vi.fn(({ sourceNumId }) => ({
      newNumId: 1000 + sourceNumId,
      newAbstractId: 2000 + sourceNumId,
    })),
  },
  markerTextToBulletStyle: vi.fn((m) => ({ '•': 'disc', '◦': 'circle', '▪': 'square' })[m] ?? null),
  numberingInfoToOrderedStyle: vi.fn((numberingType, markerText) => {
    const suffix = markerText?.slice(-1);
    const map = {
      decimal: { '.': 'decimal', ')': 'decimal-paren' },
      upperRoman: { '.': 'upper-roman' },
      lowerRoman: { '.': 'lower-roman' },
      upperLetter: { '.': 'upper-alpha', ')': 'upper-alpha-paren' },
      lowerLetter: { '.': 'lower-alpha', ')': 'lower-alpha-paren' },
    };
    return map[numberingType]?.[suffix] ?? null;
  }),
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => node.attrs.paragraphProperties || {}),
}));

vi.mock('./removeNumberingProperties.js', () => ({
  isVisuallyEmptyParagraph: vi.fn(() => false),
}));

import { toggleList } from './toggleList.js';
import { updateNumberingProperties } from './changeListLevel.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';

const createParagraph = (attrs, pos, { nodeSize = 12, firstChildName = 'run', lastChildName = 'run' } = {}) => ({
  node: {
    type: { name: 'paragraph' },
    attrs,
    nodeSize,
    firstChild: firstChildName ? { type: { name: firstChildName } } : null,
    lastChild: lastChildName ? { type: { name: lastChildName } } : null,
  },
  pos,
});

/**
 * @param {Array<{ node: any, pos: number }>} paragraphs - Paragraphs inside the user's selection range.
 * @param {{ from?: number, to?: number, beforeNode?: any, allDocParagraphs?: Array<{ node: any, pos: number }> }} [opts]
 *   `allDocParagraphs`: full-document set returned by `descendants`. Defaults to `paragraphs`.
 */
const createState = (paragraphs, { from = 1, to = 10, beforeNode = null, allDocParagraphs } = {}) => {
  const docParagraphs = allDocParagraphs ?? paragraphs;
  return {
    doc: {
      nodesBetween: vi.fn((_from, _to, callback) => {
        for (const { node, pos } of paragraphs) {
          callback(node, pos);
        }
      }),
      descendants: vi.fn((callback) => {
        for (const { node, pos } of docParagraphs) {
          callback(node, pos);
        }
      }),
      resolve: vi.fn((pos) => {
        if (paragraphs.length > 0 && pos === paragraphs[0].pos) {
          return { nodeBefore: beforeNode };
        }
        return { nodeBefore: null };
      }),
    },
    selection: { from, to, empty: from === to },
  };
};

const mockParagraphNodes = (trDoc, paragraphs) => {
  const paragraphsByPos = new Map(paragraphs.map(({ pos, node }) => [pos, node]));
  trDoc.nodeAt.mockImplementation((pos) => paragraphsByPos.get(pos) ?? null);
};

describe('toggleList', () => {
  let editor;
  let tr;
  let dispatch;

  beforeEach(() => {
    vi.clearAllMocks();
    ListHelpers.getListDefinitionDetails.mockReturnValue(null);
    editor = { converter: {} };
    tr = {
      docChanged: false,
      mapping: {
        map: vi.fn((pos) => pos),
      },
      doc: {
        content: { size: 1000 },
        nodeAt: vi.fn(() => null),
        resolve: vi.fn((pos) => ({ pos })),
      },
      setSelection: vi.fn(),
      setMeta: vi.fn(),
    };
    dispatch = vi.fn();
  });

  it('returns false for unsupported list type', () => {
    const handler = toggleList('fancyList');
    const state = createState([]);

    const result = handler({ editor, state, tr, dispatch });

    expect(result).toBe(false);
    expect(updateNumberingProperties).not.toHaveBeenCalled();
    expect(ListHelpers.getNewListId).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('removes numbering when every paragraph already uses the requested bullet list', () => {
    const sharedNumbering = { numId: 5, ilvl: 2 };
    const paragraphs = [
      createParagraph(
        {
          paragraphProperties: { numberingProperties: sharedNumbering },
          listRendering: { numberingType: 'bullet' },
        },
        1,
      ),
      createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 5, ilvl: 3 } },
          listRendering: { numberingType: 'bullet' },
        },
        5,
      ),
    ];
    const state = createState(paragraphs);
    const handler = toggleList('bulletList');

    const result = handler({ editor, state, tr, dispatch });

    expect(result).toBe(true);
    expect(updateNumberingProperties).toHaveBeenCalledTimes(paragraphs.length);
    for (const [index, { node, pos }] of paragraphs.entries()) {
      expect(updateNumberingProperties).toHaveBeenNthCalledWith(index + 1, null, node, pos, editor, tr);
    }
    expect(ListHelpers.getNewListId).not.toHaveBeenCalled();
    expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('converts only non-list paragraphs when selection already contains matching list items', () => {
    const existingNumbering = { numId: 12, ilvl: 4, start: 7 };
    const paragraphs = [
      createParagraph(
        {
          paragraphProperties: { numberingProperties: existingNumbering },
          listRendering: { numberingType: 'decimal' },
        },
        2,
      ),
      createParagraph(
        {
          paragraphProperties: {},
        },
        6,
      ),
    ];
    const state = createState(paragraphs);
    const handler = toggleList('orderedList');

    const result = handler({ editor, state, tr, dispatch });

    expect(result).toBe(true);
    expect(updateNumberingProperties).toHaveBeenCalledTimes(1);
    const expectedNumbering = { numId: 12, ilvl: 4, start: 7 };
    expect(updateNumberingProperties).toHaveBeenNthCalledWith(
      1,
      expectedNumbering,
      paragraphs[1].node,
      paragraphs[1].pos,
      editor,
      tr,
    );
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('creates a new list definition when no matching list exists in or before the selection', () => {
    ListHelpers.getNewListId.mockReturnValue('42');
    const paragraphs = [
      createParagraph({ paragraphProperties: {} }, 3),
      createParagraph({ paragraphProperties: {} }, 9),
    ];
    const state = createState(paragraphs);
    const handler = toggleList('orderedList');

    const result = handler({ editor, state, tr, dispatch });

    expect(result).toBe(true);
    expect(ListHelpers.getNewListId).toHaveBeenCalledWith(editor);
    expect(ListHelpers.generateNewListDefinition).toHaveBeenCalledWith({
      numId: 42,
      listType: 'orderedList',
      editor,
      bulletStyle: undefined,
      bulletStyleLevel: 0,
      orderedStyleLevel: 0,
    });
    const expectedNumbering = { numId: 42, ilvl: 0 };
    for (const [index, { node, pos }] of paragraphs.entries()) {
      expect(updateNumberingProperties).toHaveBeenNthCalledWith(index + 1, expectedNumbering, node, pos, editor, tr);
    }
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('does not borrow bullet numbering when applying ordered list to plain paragraphs below', () => {
    ListHelpers.getNewListId.mockReturnValue(99);
    const beforeNumbering = { numId: 7, ilvl: 0 };
    const beforeNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: beforeNumbering },
        // Missing numberingType used to be misread as "ordered" via `!== 'bullet'`
        listRendering: { markerText: '•' },
      },
    };
    ListHelpers.getListDefinitionDetails.mockReturnValue({ listNumberingType: 'bullet' });
    const paragraphs = [createParagraph({ paragraphProperties: {} }, 4)];
    const state = createState(paragraphs, { beforeNode, from: 4, to: 8 });
    const handler = toggleList('orderedList');

    const result = handler({ editor, state, tr, dispatch });

    expect(result).toBe(true);
    expect(ListHelpers.generateNewListDefinition).toHaveBeenCalledWith({
      numId: 99,
      listType: 'orderedList',
      editor,
      bulletStyle: undefined,
      bulletStyleLevel: 0,
      orderedStyleLevel: 0,
    });
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('borrows numbering from the previous list paragraph when selection lacks one', () => {
    const beforeNumbering = { numId: 88, ilvl: 3, restart: true };
    const beforeNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: beforeNumbering },
        listRendering: { numberingType: 'decimal' },
      },
    };
    const paragraphs = [
      createParagraph({ paragraphProperties: {} }, 4),
      createParagraph({ paragraphProperties: {} }, 8),
    ];
    const state = createState(paragraphs, { beforeNode });
    const handler = toggleList('orderedList');

    const result = handler({ editor, state, tr, dispatch });

    expect(result).toBe(true);
    expect(ListHelpers.getNewListId).not.toHaveBeenCalled();
    expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
    const expectedNumbering = { numId: 88, ilvl: 3, restart: true };
    for (const [index, { node, pos }] of paragraphs.entries()) {
      expect(updateNumberingProperties).toHaveBeenNthCalledWith(index + 1, expectedNumbering, node, pos, editor, tr);
    }
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('restores a collapsed caret at the end of a single toggled paragraph', () => {
    const createSelectionNear = vi.spyOn(Selection, 'near').mockImplementation(() => ({ from: 13, to: 13 }));
    ListHelpers.getNewListId.mockReturnValue('42');
    const paragraphs = [createParagraph({ paragraphProperties: {} }, 3)];
    const state = createState(paragraphs, { from: 5, to: 5 });
    mockParagraphNodes(tr.doc, paragraphs);
    const handler = toggleList('orderedList');

    const result = handler({ editor, state, tr, dispatch });

    expect(result).toBe(true);
    expect(tr.doc.resolve).toHaveBeenCalledWith(13);
    expect(createSelectionNear).toHaveBeenCalledTimes(1);
    expect(tr.setSelection).toHaveBeenCalledTimes(1);
    const restoredSelection = tr.setSelection.mock.calls[0][0];
    expect(restoredSelection.from).toBe(13);
    expect(restoredSelection.to).toBe(13);
    createSelectionNear.mockRestore();
  });

  it('preserves a ranged selection across multiple toggled paragraphs', () => {
    const createTextSelection = vi
      .spyOn(TextSelection, 'create')
      .mockImplementation((_doc, from, to) => ({ from, to }));
    ListHelpers.getNewListId.mockReturnValue('77');
    const paragraphs = [
      createParagraph({ paragraphProperties: {} }, 2),
      createParagraph({ paragraphProperties: {} }, 20, { nodeSize: 14 }),
    ];
    const state = createState(paragraphs, { from: 4, to: 30 });
    mockParagraphNodes(tr.doc, paragraphs);
    const handler = toggleList('orderedList');

    const result = handler({ editor, state, tr, dispatch });

    expect(result).toBe(true);
    expect(createTextSelection).toHaveBeenCalledWith(tr.doc, 4, 32);
    expect(tr.setSelection).toHaveBeenCalledTimes(1);
    const restoredSelection = tr.setSelection.mock.calls[0][0];
    expect(restoredSelection.from).toBe(4);
    expect(restoredSelection.to).toBe(32);
    createTextSelection.mockRestore();
  });

  it('is side-effect-free when dispatch is not provided (create mode)', () => {
    ListHelpers.getNewListId.mockReturnValue('42');
    const paragraphs = [createParagraph({ paragraphProperties: {} }, 3)];
    const state = createState(paragraphs);
    const handler = toggleList('orderedList');

    const result = handler({ editor, state, tr, dispatch: undefined });

    expect(result).toBe(true);
    expect(ListHelpers.getNewListId).not.toHaveBeenCalled();
    expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
    expect(updateNumberingProperties).not.toHaveBeenCalled();
  });

  it('is side-effect-free when dispatch is not provided (remove mode)', () => {
    const paragraphs = [
      createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
          listRendering: { numberingType: 'bullet' },
        },
        1,
      ),
    ];
    const state = createState(paragraphs);
    const handler = toggleList('bulletList');

    const result = handler({ editor, state, tr, dispatch: undefined });

    expect(result).toBe(true);
    expect(updateNumberingProperties).not.toHaveBeenCalled();
    expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
  });

  it('is side-effect-free when dispatch is not provided (reuse mode)', () => {
    const paragraphs = [
      createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 12, ilvl: 0 } },
          listRendering: { numberingType: 'decimal' },
        },
        2,
      ),
      createParagraph({ paragraphProperties: {} }, 6),
    ];
    const state = createState(paragraphs);
    const handler = toggleList('orderedList');

    const result = handler({ editor, state, tr, dispatch: undefined });

    expect(result).toBe(true);
    expect(updateNumberingProperties).not.toHaveBeenCalled();
    expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // SD-2526 + SD-2527: style param threading
  //
  // toggleList accepts (listType, bulletStyle, orderedStyle) and passes them
  // through to ListHelpers.generateNewListDefinition. These tests verify that
  // thread-through for every style the toolbar exposes.
  // -------------------------------------------------------------------------
  describe('style parameter threading', () => {
    it.each(['disc', 'circle', 'square'])(
      'passes bulletStyle="%s" through to generateNewListDefinition',
      (bulletStyle) => {
        ListHelpers.getNewListId.mockReturnValue(7);
        const paragraphs = [createParagraph({ paragraphProperties: {} }, 3)];
        const state = createState(paragraphs);
        const handler = toggleList('bulletList', bulletStyle);

        const result = handler({ editor, state, tr, dispatch });

        expect(result).toBe(true);
        expect(ListHelpers.generateNewListDefinition).toHaveBeenCalledWith({
          numId: 7,
          listType: 'bulletList',
          editor,
          bulletStyle,
          bulletStyleLevel: 0,
          orderedStyle: undefined,
          orderedStyleLevel: 0,
        });
      },
    );

    it.each([
      'decimal',
      'decimal-paren',
      'upper-roman',
      'lower-roman',
      'upper-alpha',
      'upper-alpha-paren',
      'lower-alpha',
      'lower-alpha-paren',
    ])('passes orderedStyle="%s" through to generateNewListDefinition', (orderedStyle) => {
      ListHelpers.getNewListId.mockReturnValue(11);
      const paragraphs = [createParagraph({ paragraphProperties: {} }, 3)];
      const state = createState(paragraphs);
      const handler = toggleList('orderedList', null, orderedStyle);

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      expect(ListHelpers.generateNewListDefinition).toHaveBeenCalledWith({
        numId: 11,
        listType: 'orderedList',
        editor,
        bulletStyle: null,
        bulletStyleLevel: 0,
        orderedStyle,
        orderedStyleLevel: 0,
      });
    });

    it('matches existing same-style paragraphs and skips creating a new list', () => {
      // Cursor is in a paragraph already using 'disc'. Toggling with bulletStyle='disc'
      // should remove the list (toggle off), not allocate a new numId.
      const sharedNumbering = { numId: 3, ilvl: 0 };
      const paragraphs = [
        createParagraph(
          {
            paragraphProperties: { numberingProperties: sharedNumbering },
            listRendering: { numberingType: 'bullet', markerText: '•' },
          },
          1,
        ),
      ];
      const state = createState(paragraphs);
      const handler = toggleList('bulletList', 'disc');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      // Predicate matched (kind=bullet, style=disc) → mode is 'remove', not 'create'
      expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
    });

    it('falls back to type-only matching when no bulletStyle is requested', () => {
      // No style argument: any bullet marker should be treated as "already a bullet list",
      // so toggling with no style toggles off regardless of which marker the list uses.
      ListHelpers.getListDefinitionDetails.mockReturnValue({ listNumberingType: 'bullet' });
      const paragraphs = [
        createParagraph(
          {
            paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
            listRendering: { numberingType: 'bullet', markerText: '▪' },
          },
          1,
        ),
      ];
      const state = createState(paragraphs);
      const handler = toggleList('bulletList');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      expect(updateNumberingProperties).toHaveBeenCalledWith(null, paragraphs[0].node, paragraphs[0].pos, editor, tr);
      expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
    });

    it('clones the abstract and migrates the paragraph when bullet style differs', () => {
      // Bare caret in a 'disc' bullet list and the caller asks for 'square'. The abstract
      // is cloned (with the new style applied at lvl0) and the paragraph is migrated to
      // the new numId via PM-tracked setNodeMarkup so undo can revert the change.
      const paragraphs = [
        createParagraph(
          {
            paragraphProperties: { numberingProperties: { numId: 3, ilvl: 0 } },
            listRendering: { numberingType: 'bullet', markerText: '•' },
          },
          1,
        ),
      ];
      const state = createState(paragraphs, { from: 2, to: 2 });
      const handler = toggleList('bulletList', 'square');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenCalledTimes(1);
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenCalledWith({
        editor,
        sourceNumId: 3,
        ilvl: 0,
        bulletStyle: 'square',
        orderedStyle: null,
      });
      // The mock returns newNumId = 1000 + sourceNumId = 1003.
      expect(updateNumberingProperties).toHaveBeenCalledTimes(1);
      expect(updateNumberingProperties).toHaveBeenCalledWith(
        { numId: 1003, ilvl: 0 },
        paragraphs[0].node,
        paragraphs[0].pos,
        editor,
        tr,
      );
      expect(ListHelpers.setListLevelStyles).not.toHaveBeenCalled();
      expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
      expect(tr.setMeta).not.toHaveBeenCalledWith('preventDispatch', true);
    });

    it('clones the abstract and migrates the paragraph when ordered style differs', () => {
      // Bare caret on a 'decimal' paragraph and the caller asks for 'upper-roman'. The
      // cloned abstract carries the new ordered style at the paragraph's existing ilvl.
      const paragraphs = [
        createParagraph(
          {
            paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
            listRendering: { numberingType: 'decimal', markerText: '1.' },
          },
          1,
        ),
      ];
      const state = createState(paragraphs, { from: 2, to: 2 });
      const handler = toggleList('orderedList', null, 'upper-roman');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenCalledWith({
        editor,
        sourceNumId: 5,
        ilvl: 0,
        bulletStyle: null,
        orderedStyle: 'upper-roman',
      });
      expect(updateNumberingProperties).toHaveBeenCalledWith(
        { numId: 1005, ilvl: 0 },
        paragraphs[0].node,
        paragraphs[0].pos,
        editor,
        tr,
      );
    });

    it('clones once per unique (numId, ilvl) when the list spans multiple levels', () => {
      // Bare caret in a list with sublevels. Each unique (numId, ilvl) gets its own clone
      // so the new numIds for level 0 and level 1 are different.
      const paragraphs = [
        createParagraph(
          {
            paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
            listRendering: { numberingType: 'decimal', markerText: '1.' },
          },
          1,
        ),
        createParagraph(
          {
            paragraphProperties: { numberingProperties: { numId: 5, ilvl: 1 } },
            listRendering: { numberingType: 'decimal', markerText: '1.' },
          },
          5,
        ),
        createParagraph(
          {
            paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
            listRendering: { numberingType: 'decimal', markerText: '2.' },
          },
          9,
        ),
      ];
      const state = createState(paragraphs, { from: 2, to: 2 });
      const handler = toggleList('orderedList', null, 'upper-roman');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenCalledTimes(2);
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenNthCalledWith(1, {
        editor,
        sourceNumId: 5,
        ilvl: 0,
        bulletStyle: null,
        orderedStyle: 'upper-roman',
      });
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenNthCalledWith(2, {
        editor,
        sourceNumId: 5,
        ilvl: 1,
        bulletStyle: null,
        orderedStyle: 'upper-roman',
      });
      // Three paragraphs migrate; both lvl-0 paragraphs share the lvl-0 clone's newNumId.
      expect(updateNumberingProperties).toHaveBeenCalledTimes(3);
    });

    it('switches the whole list kind when caret is in one item (bullet → ordered)', () => {
      // Two-item bullet list (numId=5, ilvl=0). Caret in item 1 only.
      // Kind switch clones the abstract with `orderedStyle: 'decimal'` at lvl 0, then
      // migrates BOTH siblings (the cursor's paragraph + its expansion-discovered sibling)
      // to the new numId.
      const item1 = createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
          listRendering: { numberingType: 'bullet', markerText: '•' },
        },
        1,
      );
      const item2 = createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
          listRendering: { numberingType: 'bullet', markerText: '•' },
        },
        5,
      );
      const state = createState([item1], { from: 2, to: 2, allDocParagraphs: [item1, item2] });
      const handler = toggleList('orderedList');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenCalledWith({
        editor,
        sourceNumId: 5,
        ilvl: 0,
        bulletStyle: null,
        orderedStyle: 'decimal',
      });
      const expectedNumbering = { numId: 1005, ilvl: 0 };
      expect(updateNumberingProperties).toHaveBeenCalledTimes(2);
      expect(updateNumberingProperties).toHaveBeenNthCalledWith(
        1,
        expectedNumbering,
        item1.node,
        item1.pos,
        editor,
        tr,
      );
      expect(updateNumberingProperties).toHaveBeenNthCalledWith(
        2,
        expectedNumbering,
        item2.node,
        item2.pos,
        editor,
        tr,
      );
    });

    it('switches the whole list kind when caret is in one item (ordered → bullet)', () => {
      const item1 = createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 9, ilvl: 0 } },
          listRendering: { numberingType: 'decimal', markerText: '1.' },
        },
        1,
      );
      const item2 = createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 9, ilvl: 0 } },
          listRendering: { numberingType: 'decimal', markerText: '2.' },
        },
        5,
      );
      const state = createState([item1], { from: 2, to: 2, allDocParagraphs: [item1, item2] });
      const handler = toggleList('bulletList');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenCalledWith({
        editor,
        sourceNumId: 9,
        ilvl: 0,
        bulletStyle: 'disc',
        orderedStyle: null,
      });
      const expectedNumbering = { numId: 1009, ilvl: 0 };
      expect(updateNumberingProperties).toHaveBeenCalledTimes(2);
      expect(updateNumberingProperties).toHaveBeenNthCalledWith(
        1,
        expectedNumbering,
        item1.node,
        item1.pos,
        editor,
        tr,
      );
      expect(updateNumberingProperties).toHaveBeenNthCalledWith(
        2,
        expectedNumbering,
        item2.node,
        item2.pos,
        editor,
        tr,
      );
    });

    it('expands across siblings when caret is in one item of a multi-item list', () => {
      // Two disc bullets at the same level. Caret in item 1; expansion picks up item 2.
      // One clone is minted for (numId=5, ilvl=0) and BOTH paragraphs migrate to it.
      const item1 = createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
          listRendering: { numberingType: 'bullet', markerText: '•' },
        },
        1,
      );
      const item2 = createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
          listRendering: { numberingType: 'bullet', markerText: '•' },
        },
        5,
      );
      const state = createState([item1], { from: 2, to: 2, allDocParagraphs: [item1, item2] });
      const handler = toggleList('bulletList', 'square');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      expect(ListHelpers.cloneListDefinitionWithLevelStyle).toHaveBeenCalledTimes(1);
      expect(updateNumberingProperties).toHaveBeenCalledTimes(2);
    });

    it('with a non-empty selection, scopes the change to the selected paragraphs only (no abstract mutation)', () => {
      // A non-empty selection bypasses the whole-list-restyle gate: the abstract is NOT
      // mutated, and a fresh numId is minted via the create path so only the selected
      // paragraphs migrate. Siblings outside the selection keep their original numId/style.
      ListHelpers.getNewListId.mockReturnValue('77');
      const item1 = createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
          listRendering: { numberingType: 'bullet', markerText: '•' },
        },
        1,
      );
      const item2 = createParagraph(
        {
          paragraphProperties: { numberingProperties: { numId: 5, ilvl: 0 } },
          listRendering: { numberingType: 'bullet', markerText: '•' },
        },
        5,
      );
      const state = createState([item1], { from: 2, to: 3, allDocParagraphs: [item1, item2] });
      const handler = toggleList('bulletList', 'square');

      const result = handler({ editor, state, tr, dispatch });

      expect(result).toBe(true);
      // Abstract gate did NOT fire — sibling items are not touched.
      expect(ListHelpers.setListLevelStyles).not.toHaveBeenCalled();
      // A fresh numId is minted for just the selected paragraph.
      expect(ListHelpers.generateNewListDefinition).toHaveBeenCalledTimes(1);
      expect(updateNumberingProperties).toHaveBeenCalledTimes(1);
      expect(updateNumberingProperties).toHaveBeenCalledWith({ numId: 77, ilvl: 0 }, item1.node, item1.pos, editor, tr);
    });

    it('does not mutate when the requested style change has no dispatch', () => {
      const paragraphs = [
        createParagraph(
          {
            paragraphProperties: { numberingProperties: { numId: 3, ilvl: 0 } },
            listRendering: { numberingType: 'bullet', markerText: '•' },
          },
          1,
        ),
      ];
      const state = createState(paragraphs);
      const handler = toggleList('bulletList', 'square');

      const result = handler({ editor, state, tr, dispatch: undefined });

      expect(result).toBe(true);
      expect(ListHelpers.setListLevelStyles).not.toHaveBeenCalled();
      expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
    });
  });
});
