// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    getNewListId: vi.fn(() => '42'),
    generateNewListDefinition: vi.fn(),
  },
}));

vi.mock('./changeListLevel.js', () => ({
  updateNumberingProperties: vi.fn(),
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => node.attrs?.paragraphProperties ?? {}),
}));

import { setListTypeAt } from './setListTypeAt.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { updateNumberingProperties } from './changeListLevel.js';

function createListParagraph(numId = 1, ilvl = 0) {
  return {
    type: { name: 'paragraph' },
    attrs: {
      paragraphProperties: {
        numberingProperties: { numId, ilvl },
      },
    },
    nodeSize: 7,
  };
}

function createMockProps(nodeAtResult = createListParagraph()) {
  return {
    state: {
      doc: {
        content: { size: 100 },
        nodeAt: vi.fn(() => nodeAtResult),
      },
    },
    tr: {},
    editor: {},
    dispatch: vi.fn(),
  };
}

describe('setListTypeAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ListHelpers.getNewListId.mockReturnValue('42');
    ListHelpers.generateNewListDefinition.mockReturnValue(undefined);
  });

  it('returns false when pos is negative', () => {
    const props = createMockProps();
    const result = setListTypeAt({ pos: -1, kind: 'bullet' })(props);
    expect(result).toBe(false);
  });

  it('returns false when pos exceeds document size', () => {
    const props = createMockProps();
    props.state.doc.content.size = 10;
    const result = setListTypeAt({ pos: 11, kind: 'bullet' })(props);
    expect(result).toBe(false);
  });

  it('returns false when kind is invalid', () => {
    const props = createMockProps();
    // @ts-expect-error - testing invalid input
    const result = setListTypeAt({ pos: 0, kind: 'numbered' })(props);
    expect(result).toBe(false);
  });

  it('returns false when node at pos is not a paragraph', () => {
    const props = createMockProps({ type: { name: 'table' }, attrs: {} });
    const result = setListTypeAt({ pos: 0, kind: 'bullet' })(props);
    expect(result).toBe(false);
  });

  it('returns false when paragraph has no numbering properties', () => {
    const plainParagraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: {} },
    };
    const props = createMockProps(plainParagraph);
    const result = setListTypeAt({ pos: 0, kind: 'bullet' })(props);
    expect(result).toBe(false);
  });

  it('generates a bulletList definition for bullet kind', () => {
    const props = createMockProps();

    setListTypeAt({ pos: 0, kind: 'bullet' })(props);

    expect(ListHelpers.generateNewListDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ listType: 'bulletList' }),
    );
  });

  it('generates an orderedList definition for ordered kind', () => {
    const props = createMockProps();

    setListTypeAt({ pos: 0, kind: 'ordered' })(props);

    expect(ListHelpers.generateNewListDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ listType: 'orderedList' }),
    );
  });

  it('calls updateNumberingProperties with the new numId and existing level', () => {
    const node = createListParagraph(1, 2);
    const props = createMockProps(node);

    setListTypeAt({ pos: 5, kind: 'bullet' })(props);

    expect(updateNumberingProperties).toHaveBeenCalledWith(
      expect.objectContaining({ numId: 42, ilvl: 2 }),
      node,
      5,
      props.editor,
      props.tr,
    );
  });

  it('dispatches the transaction on success', () => {
    const props = createMockProps();

    const result = setListTypeAt({ pos: 0, kind: 'bullet' })(props);

    expect(result).toBe(true);
    expect(props.dispatch).toHaveBeenCalledWith(props.tr);
  });

  it('returns false when getNewListId returns a non-finite number', () => {
    ListHelpers.getNewListId.mockReturnValue('NaN');
    const props = createMockProps();

    const result = setListTypeAt({ pos: 0, kind: 'bullet' })(props);
    expect(result).toBe(false);
  });

  it('is side-effect-free when dispatch is not provided', () => {
    const props = createMockProps();
    props.dispatch = undefined;

    const result = setListTypeAt({ pos: 0, kind: 'bullet' })(props);

    expect(result).toBe(true);
    expect(ListHelpers.getNewListId).not.toHaveBeenCalled();
    expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
    expect(updateNumberingProperties).not.toHaveBeenCalled();
  });
});
