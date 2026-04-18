// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { insertParagraphAt } from './insertParagraphAt.js';

/**
 * @param {{ size?: number }} [options]
 */
function createMockState(options = {}) {
  const { size = 100 } = options;

  const paragraphType = {
    createAndFill: vi.fn(),
    create: vi.fn(),
  };

  const schema = {
    nodes: { paragraph: paragraphType },
    text: vi.fn((text) => ({ type: { name: 'text' }, text, nodeSize: text.length })),
  };

  const mockTr = {
    insert: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
  };

  return {
    state: {
      doc: { content: { size } },
      schema,
      tr: mockTr,
    },
    tr: mockTr,
    paragraphType,
    dispatch: vi.fn(),
  };
}

describe('insertParagraphAt', () => {
  it('returns false when pos is negative', () => {
    const { state, dispatch } = createMockState();
    const result = insertParagraphAt({ pos: -1 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when pos exceeds document size', () => {
    const { state, dispatch } = createMockState({ size: 10 });
    const result = insertParagraphAt({ pos: 11 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when pos is not an integer', () => {
    const { state, dispatch } = createMockState();
    const result = insertParagraphAt({ pos: 1.5 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when paragraph type is not in schema', () => {
    const { state, dispatch } = createMockState();
    state.schema.nodes.paragraph = undefined;
    const result = insertParagraphAt({ pos: 0 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns true without dispatching when dispatch is not provided (dry run)', () => {
    const { state, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    const result = insertParagraphAt({ pos: 0 })({ state, dispatch: undefined });
    expect(result).toBe(true);
  });

  it('inserts a paragraph at the given position', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    const result = insertParagraphAt({ pos: 5 })({ state, dispatch });

    expect(result).toBe(true);
    expect(tr.insert).toHaveBeenCalledWith(5, mockNode);
    expect(tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('passes sdBlockId as attrs when provided', () => {
    const { state, dispatch, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertParagraphAt({ pos: 0, sdBlockId: 'block-1' })({ state, dispatch });

    expect(paragraphType.createAndFill).toHaveBeenCalledWith({ sdBlockId: 'block-1' }, undefined);
  });

  it('creates a text node when text is provided', () => {
    const { state, dispatch, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertParagraphAt({ pos: 0, text: 'Hello' })({ state, dispatch });

    expect(state.schema.text).toHaveBeenCalledWith('Hello');
  });

  it('sets forceTrackChanges meta when tracked is true', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertParagraphAt({ pos: 0, tracked: true })({ state, dispatch });

    expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });

  it('does not set forceTrackChanges when tracked is false', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertParagraphAt({ pos: 0, tracked: false })({ state, dispatch });

    const metaCalls = tr.setMeta.mock.calls.map((call) => call[0]);
    expect(metaCalls).not.toContain('forceTrackChanges');
  });

  it('sets skipTrackChanges meta when tracked is false to preserve direct mode semantics', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertParagraphAt({ pos: 0, tracked: false })({ state, dispatch });

    expect(tr.setMeta).toHaveBeenCalledWith('skipTrackChanges', true);
  });

  it('falls back to paragraphType.create when createAndFill returns null', () => {
    const { state, dispatch, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(null);
    paragraphType.create.mockReturnValue(mockNode);

    const result = insertParagraphAt({ pos: 0 })({ state, dispatch });
    expect(result).toBe(true);
    expect(paragraphType.create).toHaveBeenCalled();
  });

  it('returns false when both createAndFill and create throw', () => {
    const { state, dispatch, paragraphType } = createMockState();
    paragraphType.createAndFill.mockImplementation(() => {
      throw new Error('invalid');
    });

    const result = insertParagraphAt({ pos: 0 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when tr.insert throws', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);
    tr.insert.mockImplementation(() => {
      throw new Error('Position out of range');
    });

    const result = insertParagraphAt({ pos: 0 })({ state, dispatch });
    expect(result).toBe(false);
  });
});
