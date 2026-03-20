import { describe, it, expect, mock, spyOn, afterEach } from 'bun:test';
const { TextSelection } = await import('prosemirror-state');

mock.module('./findWordBounds.js', () => ({
  findWordBounds: mock(),
}));

import { findWordBounds } from './findWordBounds.js';
const { setWordSelection } = await import('./setWordSelection.js');

describe('setWordSelection', () => {
  afterEach(() => {});

  it('sets a text selection when findWordBounds returns a range', () => {
    const doc = {};
    const tr = { setSelection: mock(() => 'next-tr') };
    const state = { doc, tr };
    const dispatch = mock();
    const view = { state, dispatch };

    findWordBounds.mockReturnValue({ from: 2, to: 6 });
    const selectionSpy = spyOn(TextSelection, 'create').mockReturnValue('word-selection');

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
        tr: { setSelection: mock(() => 'noop') },
      },
      dispatch: mock(),
    };

    findWordBounds.mockReturnValue(undefined);

    setWordSelection(view, 10);

    expect(view.state.tr.setSelection).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
