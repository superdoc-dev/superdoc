import { describe, it, expect, mock, spyOn, afterEach } from 'bun:test';
import { NodeSelection } from 'prosemirror-state';
import { setImageNodeSelection } from './setImageNodeSelection.js';

describe('setImageNodeSelection', () => {
  afterEach(() => {});

  it('selects the image node at the target position', () => {
    const doc = { nodeAt: mock(() => ({ type: { name: 'image' } })) };
    const tr = { setSelection: mock(() => 'updated-tr') };
    const state = { doc, tr };
    const dispatch = mock();
    const view = { state, dispatch };

    const createSpy = spyOn(NodeSelection, 'create').mockReturnValue('node-selection');

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
        doc: { nodeAt: mock(() => node) },
        tr: { setSelection: mock(() => 'noop') },
      },
      dispatch: mock(),
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
