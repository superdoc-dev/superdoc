import { describe, it, expect, vi, afterEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';

vi.mock('./findWordBounds.js', () => ({
  findWordBounds: vi.fn(),
}));

import { findWordBounds } from './findWordBounds.js';
import { setWordSelection } from './setWordSelection.js';

describe('setWordSelection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets a text selection when findWordBounds returns a range', () => {
    const doc = {};
    const tr = { setSelection: vi.fn(() => 'next-tr') };
    const state = { doc, tr };
    const dispatch = vi.fn();
    const view = { state, dispatch };

    findWordBounds.mockReturnValue({ from: 2, to: 6 });
    const selectionSpy = vi.spyOn(TextSelection, 'create').mockReturnValue('word-selection');

    setWordSelection(view, 4);

    expect(findWordBounds).toHaveBeenCalledWith(doc, 4);
    expect(selectionSpy).toHaveBeenCalledWith(doc, 2, 6);
    expect(tr.setSelection).toHaveBeenCalledWith('word-selection');
    expect(dispatch).toHaveBeenCalledWith('next-tr');
  });

  it('does nothing when no word boundaries are found', () => {
    const view = {
      state: {
        doc: {},
        tr: { setSelection: vi.fn(() => 'noop') },
      },
      dispatch: vi.fn(),
    };

    findWordBounds.mockReturnValue(undefined);

    setWordSelection(view, 10);

    expect(view.state.tr.setSelection).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
