// @ts-check
import { describe, it, expect, vi } from 'vitest';

vi.mock('./changeListLevel.js', () => ({
  updateNumberingProperties: vi.fn(),
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => node.attrs?.paragraphProperties ?? {}),
}));

import { exitListItemAt } from './exitListItemAt.js';
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

function createMockState(nodeAtResult = createListParagraph()) {
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

describe('exitListItemAt', () => {
  it('returns false when pos is negative', () => {
    const props = createMockState();
    const result = exitListItemAt({ pos: -1 })(props);
    expect(result).toBe(false);
  });

  it('returns false when pos exceeds document size', () => {
    const props = createMockState();
    props.state.doc.content.size = 10;
    const result = exitListItemAt({ pos: 11 })(props);
    expect(result).toBe(false);
  });

  it('returns false when pos is not an integer', () => {
    const props = createMockState();
    const result = exitListItemAt({ pos: 2.5 })(props);
    expect(result).toBe(false);
  });

  it('returns false when node at pos is null', () => {
    const props = createMockState();
    props.state.doc.nodeAt.mockReturnValue(null);
    const result = exitListItemAt({ pos: 0 })(props);
    expect(result).toBe(false);
  });

  it('returns false when node at pos is not a paragraph', () => {
    const props = createMockState({ type: { name: 'table' }, attrs: {} });
    const result = exitListItemAt({ pos: 0 })(props);
    expect(result).toBe(false);
  });

  it('returns false when paragraph has no numbering properties', () => {
    const plainParagraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: {} },
    };
    const props = createMockState(plainParagraph);
    const result = exitListItemAt({ pos: 0 })(props);
    expect(result).toBe(false);
  });

  it('calls updateNumberingProperties with null and dispatches on success', () => {
    const node = createListParagraph();
    const props = createMockState(node);

    const result = exitListItemAt({ pos: 5 })(props);

    expect(result).toBe(true);
    expect(updateNumberingProperties).toHaveBeenCalledWith(null, node, 5, props.editor, props.tr);
    expect(props.dispatch).toHaveBeenCalledWith(props.tr);
  });

  it('does not dispatch when dispatch is not provided', () => {
    const node = createListParagraph();
    const props = createMockState(node);
    props.dispatch = undefined;

    const result = exitListItemAt({ pos: 5 })(props);

    expect(result).toBe(true);
    expect(updateNumberingProperties).toHaveBeenCalled();
  });
});
