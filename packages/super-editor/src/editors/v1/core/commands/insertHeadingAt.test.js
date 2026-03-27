// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { insertHeadingAt } from './insertHeadingAt.js';

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

describe('insertHeadingAt', () => {
  // --- position validation ---

  it('returns false when pos is negative', () => {
    const { state, dispatch } = createMockState();
    const result = insertHeadingAt({ pos: -1, level: 1 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when pos exceeds document size', () => {
    const { state, dispatch } = createMockState({ size: 10 });
    const result = insertHeadingAt({ pos: 11, level: 1 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when pos is not an integer', () => {
    const { state, dispatch } = createMockState();
    const result = insertHeadingAt({ pos: 1.5, level: 1 })({ state, dispatch });
    expect(result).toBe(false);
  });

  // --- level validation ---

  it('returns false when level is less than 1', () => {
    const { state, dispatch } = createMockState();
    const result = insertHeadingAt({ pos: 0, level: 0 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when level is greater than 6', () => {
    const { state, dispatch } = createMockState();
    const result = insertHeadingAt({ pos: 0, level: 7 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when level is not an integer', () => {
    const { state, dispatch } = createMockState();
    const result = insertHeadingAt({ pos: 0, level: 1.5 })({ state, dispatch });
    expect(result).toBe(false);
  });

  // --- schema guard ---

  it('returns false when paragraph type is not in schema', () => {
    const { state, dispatch } = createMockState();
    state.schema.nodes.paragraph = undefined;
    const result = insertHeadingAt({ pos: 0, level: 1 })({ state, dispatch });
    expect(result).toBe(false);
  });

  // --- dry run ---

  it('returns true without dispatching when dispatch is not provided (dry run)', () => {
    const { state, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    const result = insertHeadingAt({ pos: 0, level: 1 })({ state, dispatch: undefined });
    expect(result).toBe(true);
  });

  // --- successful insertion ---

  it('inserts a heading at the given position', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    const result = insertHeadingAt({ pos: 5, level: 2 })({ state, dispatch });

    expect(result).toBe(true);
    expect(tr.insert).toHaveBeenCalledWith(5, mockNode);
    expect(tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('sets paragraphProperties.styleId based on level', () => {
    const { state, dispatch, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    for (let level = 1; level <= 6; level++) {
      paragraphType.createAndFill.mockClear();
      insertHeadingAt({ pos: 0, level })({ state, dispatch });

      const attrs = paragraphType.createAndFill.mock.calls[0]?.[0];
      expect(attrs.paragraphProperties).toEqual({ styleId: `Heading${level}` });
    }
  });

  it('passes sdBlockId as attrs when provided', () => {
    const { state, dispatch, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertHeadingAt({ pos: 0, level: 1, sdBlockId: 'block-1' })({ state, dispatch });

    const attrs = paragraphType.createAndFill.mock.calls[0]?.[0];
    expect(attrs.sdBlockId).toBe('block-1');
    expect(attrs.paragraphProperties).toEqual({ styleId: 'Heading1' });
  });

  it('creates a text node when text is provided', () => {
    const { state, dispatch, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertHeadingAt({ pos: 0, level: 1, text: 'Hello' })({ state, dispatch });

    expect(state.schema.text).toHaveBeenCalledWith('Hello');
  });

  // --- tracked mode ---

  it('sets forceTrackChanges meta when tracked is true', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertHeadingAt({ pos: 0, level: 1, tracked: true })({ state, dispatch });

    expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });

  it('does not set forceTrackChanges when tracked is false', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertHeadingAt({ pos: 0, level: 1, tracked: false })({ state, dispatch });

    const metaCalls = tr.setMeta.mock.calls.map((call) => call[0]);
    expect(metaCalls).not.toContain('forceTrackChanges');
  });

  it('sets skipTrackChanges meta when tracked is false to preserve direct mode semantics', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);

    insertHeadingAt({ pos: 0, level: 1, tracked: false })({ state, dispatch });

    expect(tr.setMeta).toHaveBeenCalledWith('skipTrackChanges', true);
  });

  // --- error resilience ---

  it('falls back to paragraphType.create when createAndFill returns null', () => {
    const { state, dispatch, paragraphType } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(null);
    paragraphType.create.mockReturnValue(mockNode);

    const result = insertHeadingAt({ pos: 0, level: 1 })({ state, dispatch });
    expect(result).toBe(true);
    expect(paragraphType.create).toHaveBeenCalled();
  });

  it('returns false when both createAndFill and create throw', () => {
    const { state, dispatch, paragraphType } = createMockState();
    paragraphType.createAndFill.mockImplementation(() => {
      throw new Error('invalid');
    });

    const result = insertHeadingAt({ pos: 0, level: 1 })({ state, dispatch });
    expect(result).toBe(false);
  });

  it('returns false when tr.insert throws', () => {
    const { state, dispatch, paragraphType, tr } = createMockState();
    const mockNode = { type: { name: 'paragraph' } };
    paragraphType.createAndFill.mockReturnValue(mockNode);
    tr.insert.mockImplementation(() => {
      throw new Error('Position out of range');
    });

    const result = insertHeadingAt({ pos: 0, level: 1 })({ state, dispatch });
    expect(result).toBe(false);
  });
});
