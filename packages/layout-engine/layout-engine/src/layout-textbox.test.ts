import { describe, expect, it } from 'bun:test';
import type { ParagraphBlock, ParagraphMeasure, TextboxDrawing } from '@superdoc/contracts';
import { layoutTextboxContent } from './layout-textbox.js';

describe('layoutTextboxContent', () => {
  it('remeasures textbox paragraphs with width reduced by horizontal insets', () => {
    const paragraphA: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs: [] };
    const paragraphB: ParagraphBlock = { kind: 'paragraph', id: 'p2', runs: [] };
    const block: TextboxDrawing = {
      kind: 'drawing',
      id: 'drawing-1',
      drawingKind: 'textboxShape',
      geometry: { width: 200, height: 100, rotation: 0, flipH: false, flipV: false },
      contentBlocks: [paragraphA, paragraphB],
      textInsets: { top: 4, right: 12, bottom: 4, left: 8 },
    };

    const calls: Array<{ id: string; maxWidth: number }> = [];
    const remeasureParagraph = (paragraph: ParagraphBlock, maxWidth: number): ParagraphMeasure => {
      calls.push({ id: paragraph.id, maxWidth });
      return { kind: 'paragraph', lines: [], totalHeight: 10 };
    };

    const result = layoutTextboxContent(block, remeasureParagraph);

    expect(result).toHaveLength(2);
    expect(calls).toEqual([
      { id: 'p1', maxWidth: 180 },
      { id: 'p2', maxWidth: 180 },
    ]);
  });

  it('returns an empty array when textbox has no content blocks', () => {
    const block: TextboxDrawing = {
      kind: 'drawing',
      id: 'drawing-1',
      drawingKind: 'textboxShape',
      geometry: { width: 200, height: 100, rotation: 0, flipH: false, flipV: false },
      contentBlocks: [],
    };

    expect(layoutTextboxContent(block, () => ({ kind: 'paragraph', lines: [], totalHeight: 10 }))).toEqual([]);
  });
});
