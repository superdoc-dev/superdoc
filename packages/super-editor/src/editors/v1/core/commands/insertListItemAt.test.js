// @ts-check
import { describe, it, expect, vi } from 'vitest';

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => node.attrs?.paragraphProperties ?? {}),
}));

import { insertListItemAt } from './insertListItemAt.js';

const numberingProperties = { numId: 1, ilvl: 0 };

function createListParagraph(text = 'Hello') {
  return {
    type: { name: 'paragraph' },
    attrs: {
      paragraphProperties: { numberingProperties },
      numberingProperties,
    },
    nodeSize: text.length + 2,
  };
}

function createMockState(targetNode = createListParagraph()) {
  const paragraphType = {
    createAndFill: vi.fn(() => ({ type: { name: 'paragraph' }, nodeSize: 2 })),
    create: vi.fn(() => ({ type: { name: 'paragraph' }, nodeSize: 2 })),
  };

  const mockTr = {
    insert: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
  };

  return {
    state: {
      doc: {
        content: { size: 100 },
        nodeAt: vi.fn((pos) => (pos === 0 ? targetNode : null)),
      },
      schema: {
        nodes: { paragraph: paragraphType },
        text: vi.fn((text) => ({ type: { name: 'text' }, text, nodeSize: text.length })),
      },
      tr: mockTr,
    },
    paragraphType,
    dispatch: vi.fn(),
  };
}

describe('insertListItemAt', () => {
  it('returns false when pos is negative', () => {
    const { state, dispatch } = createMockState();
    const result = insertListItemAt({ pos: -1, position: 'after' })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when pos is not an integer', () => {
    const { state, dispatch } = createMockState();
    const result = insertListItemAt({ pos: 1.5, position: 'after' })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when position is invalid', () => {
    const { state, dispatch } = createMockState();
    // @ts-expect-error - testing invalid input
    const result = insertListItemAt({ pos: 0, position: 'middle' })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when target node is not a paragraph', () => {
    const nonParagraph = { type: { name: 'table' }, attrs: {}, nodeSize: 10 };
    const { state, dispatch } = createMockState();
    state.doc.nodeAt.mockReturnValue(nonParagraph);
    const result = insertListItemAt({ pos: 0, position: 'after' })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when target has no numbering properties', () => {
    const plainParagraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: {} },
      nodeSize: 7,
    };
    const { state, dispatch } = createMockState();
    state.doc.nodeAt.mockReturnValue(plainParagraph);
    const result = insertListItemAt({ pos: 0, position: 'after' })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns true without dispatching when dispatch is not provided', () => {
    const { state } = createMockState();
    const result = insertListItemAt({ pos: 0, position: 'after' })({ state, dispatch: undefined });
    expect(result).toBe(true);
  });

  it('inserts after target when position is after', () => {
    const target = createListParagraph('Hello');
    const { state, dispatch } = createMockState(target);
    state.doc.nodeAt.mockReturnValue(target);

    const result = insertListItemAt({ pos: 0, position: 'after' })({ state, dispatch });

    expect(result).toBe(true);
    expect(state.tr.insert).toHaveBeenCalledWith(
      target.nodeSize, // pos + nodeSize for 'after'
      expect.any(Object),
    );
    expect(dispatch).toHaveBeenCalled();
  });

  it('inserts before target when position is before', () => {
    const { state, dispatch } = createMockState();

    const result = insertListItemAt({ pos: 0, position: 'before' })({ state, dispatch });

    expect(result).toBe(true);
    expect(state.tr.insert).toHaveBeenCalledWith(0, expect.any(Object));
  });

  it('sets forceTrackChanges meta when tracked is true', () => {
    const { state, dispatch } = createMockState();

    insertListItemAt({ pos: 0, position: 'after', tracked: true })({ state, dispatch });

    expect(state.tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });

  it('sets skipTrackChanges meta when tracked is false to preserve direct mode semantics', () => {
    const { state, dispatch } = createMockState();

    insertListItemAt({ pos: 0, position: 'after', tracked: false })({ state, dispatch });

    expect(state.tr.setMeta).toHaveBeenCalledWith('skipTrackChanges', true);
  });

  it('sets inputType programmatic meta', () => {
    const { state, dispatch } = createMockState();

    insertListItemAt({ pos: 0, position: 'after' })({ state, dispatch });

    expect(state.tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
  });

  it('passes sdBlockId into the created node attrs', () => {
    const { state, dispatch, paragraphType } = createMockState();

    insertListItemAt({ pos: 0, position: 'after', sdBlockId: 'custom-id' })({
      state,
      dispatch,
    });

    const callArgs = paragraphType.createAndFill.mock.calls[0];
    expect(callArgs?.[0]).toMatchObject({ sdBlockId: 'custom-id' });
  });

  it('preserves numbering properties from the target node', () => {
    const { state, dispatch, paragraphType } = createMockState();

    insertListItemAt({ pos: 0, position: 'after' })({ state, dispatch });

    const callArgs = paragraphType.createAndFill.mock.calls[0];
    expect(callArgs?.[0]).toMatchObject({
      paragraphProperties: {
        numberingProperties: { numId: 1, ilvl: 0 },
      },
    });
  });

  it('creates text content when text is provided', () => {
    const { state, dispatch } = createMockState();

    insertListItemAt({ pos: 0, position: 'after', text: 'New item' })({
      state,
      dispatch,
    });

    expect(state.schema.text).toHaveBeenCalledWith('New item');
  });

  it('does not inherit sdBlockId from the target node when omitted', () => {
    const targetWithBlockId = {
      type: { name: 'paragraph' },
      attrs: {
        sdBlockId: 'source-block-id',
        paragraphProperties: { numberingProperties },
        numberingProperties,
      },
      nodeSize: 7,
    };
    const { state, dispatch, paragraphType } = createMockState(targetWithBlockId);
    state.doc.nodeAt.mockReturnValue(targetWithBlockId);

    insertListItemAt({ pos: 0, position: 'after' })({ state, dispatch });

    const callArgs = paragraphType.createAndFill.mock.calls[0];
    expect(callArgs?.[0]?.sdBlockId).toBeNull();
  });

  it('returns false when createAndFill throws', () => {
    const { state, dispatch, paragraphType } = createMockState();
    paragraphType.createAndFill.mockImplementation(() => {
      throw new Error('schema error');
    });

    const result = insertListItemAt({ pos: 0, position: 'after' })({ state, dispatch });
    expect(result).toBe(false);
  });
});
