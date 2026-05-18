import { describe, expect, it } from 'vitest';
import { getNoteStoryKind, isNonBodyStoryBlockId, shouldApplyPainterReadOnly } from './story.js';

describe('note story block ids', () => {
  it.each([
    ['footnote-1-abc', 'footnote'],
    ['endnote-1-abc', 'endnote'],
    ['__sd_semantic_footnote-1-abc', 'semantic-footnote'],
    ['__sd_semantic_endnote-1-abc', 'semantic-endnote'],
  ] as const)('detects %s as a non-body %s story block', (blockId, kind) => {
    expect(getNoteStoryKind(blockId)).toBe(kind);
    expect(isNonBodyStoryBlockId(blockId)).toBe(true);
  });

  it.each(['body-paragraph-1', 'footnotes-heading', '__sd_semantic_footnotes_heading', undefined])(
    'does not treat %s as a note body fragment',
    (blockId) => {
      expect(getNoteStoryKind(blockId)).toBeUndefined();
      expect(isNonBodyStoryBlockId(blockId)).toBe(false);
    },
  );

  it.each([
    ['footnote-1-abc', true],
    ['endnote-1-abc', false],
    ['__sd_semantic_footnote-1-abc', false],
    ['__sd_semantic_endnote-1-abc', false],
  ] as const)('applies painter read-only for %s: %s', (blockId, expected) => {
    expect(shouldApplyPainterReadOnly(blockId)).toBe(expected);
  });
});
