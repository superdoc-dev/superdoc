import { describe, expect, it } from 'bun:test';
import { breakParagraphAdjacency, type PageState } from './paginator.js';

describe('breakParagraphAdjacency', () => {
  it('clears paragraph-only state without moving the flow cursor', () => {
    const state = {
      cursorY: 128,
      maxCursorY: 128,
      trailingSpacing: 12,
      lastParagraphStyleId: 'ListParagraph',
      lastParagraphContextualSpacing: true,
      lastParagraphBorderHash: 'top|right|bottom|left|between',
    } as PageState;

    breakParagraphAdjacency(state);

    expect(state.cursorY).toBe(128);
    expect(state.maxCursorY).toBe(128);
    expect(state.trailingSpacing).toBe(0);
    expect(state.lastParagraphStyleId).toBeUndefined();
    expect(state.lastParagraphContextualSpacing).toBe(false);
    expect(state.lastParagraphBorderHash).toBeUndefined();
  });
});
