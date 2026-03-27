import { describe, it, expect, vi, afterEach } from 'vitest';
import { NodeSelection } from 'prosemirror-state';
import { setImageNodeSelection } from './setImageNodeSelection.js';

describe('setImageNodeSelection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the image node at the target position', () => {
    const doc = { nodeAt: vi.fn(() => ({ type: { name: 'image' } })) };
    const tr = { setSelection: vi.fn(() => 'updated-tr') };
    const state = { doc, tr };
    const dispatch = vi.fn();
    const view = { state, dispatch };

    const createSpy = vi.spyOn(NodeSelection, 'create').mockReturnValue('node-selection');

    const result = setImageNodeSelection(view, 5);

    expect(result).toBe(true);
    expect(doc.nodeAt).toHaveBeenCalledWith(5);
    expect(createSpy).toHaveBeenCalledWith(doc, 5);
    expect(tr.setSelection).toHaveBeenCalledWith('node-selection');
    expect(dispatch).toHaveBeenCalledWith('updated-tr');
  });

  it('returns false when the node is missing or not an image', () => {
    const makeView = (node) => ({
      state: {
        doc: { nodeAt: vi.fn(() => node) },
        tr: { setSelection: vi.fn(() => 'noop') },
      },
      dispatch: vi.fn(),
    });

    // Non-image node
    const nonImageView = makeView({ type: { name: 'paragraph' } });
    expect(setImageNodeSelection(nonImageView, 3)).toBe(false);
    expect(nonImageView.state.tr.setSelection).not.toHaveBeenCalled();
    expect(nonImageView.dispatch).not.toHaveBeenCalled();

    // No node found
    const missingNodeView = makeView(null);
    expect(setImageNodeSelection(missingNodeView, 2)).toBe(false);
    expect(missingNodeView.state.tr.setSelection).not.toHaveBeenCalled();
    expect(missingNodeView.dispatch).not.toHaveBeenCalled();
  });
});
