import { describe, expect, it } from 'vitest';
import { applyNoteStoryFrameAttributes } from './frame.js';

describe('applyNoteStoryFrameAttributes', () => {
  it.each([
    ['footnote-1-abc', 'false'],
    ['endnote-1-abc', null],
    ['__sd_semantic_footnote-1-abc', null],
    ['__sd_semantic_endnote-1-abc', null],
  ] as const)('sets frame contenteditable for %s to %s', (blockId, expected) => {
    const el = document.createElement('div');

    applyNoteStoryFrameAttributes(el, blockId);

    expect(el.getAttribute('contenteditable')).toBe(expected);
  });
});
