import { describe, expect, it } from 'bun:test';
import type { DrawingMeasure, ParagraphBlock, ParagraphMeasure, TextboxDrawing } from '@superdoc/contracts';
import { layoutTextboxContent, resolveTextboxContentMeasures } from './layout-textbox.js';

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

  it('remeasures wrap-none text against an unbounded line width', () => {
    const paragraph: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs: [] };
    const block: TextboxDrawing = {
      kind: 'drawing',
      id: 'drawing-wrap-none',
      drawingKind: 'textboxShape',
      geometry: { width: 120, height: 80, rotation: 0, flipH: false, flipV: false },
      contentBlocks: [paragraph],
      textInsets: { top: 4, right: 8, bottom: 4, left: 8 },
      textLayout: { wrap: 'none', horizontalOverflow: 'overflow' },
    };

    const widths: number[] = [];
    layoutTextboxContent(block, (_paragraph, maxWidth) => {
      widths.push(maxWidth);
      return { kind: 'paragraph', lines: [], totalHeight: 10 };
    });

    expect(widths).toEqual([Number.POSITIVE_INFINITY]);
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

  it('prefers canonical drawing measurements over the synchronous fallback', () => {
    const paragraph: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs: [] };
    const block: TextboxDrawing = {
      kind: 'drawing',
      id: 'drawing-1',
      drawingKind: 'textboxShape',
      geometry: { width: 200, height: 100, rotation: 0, flipH: false, flipV: false },
      contentBlocks: [paragraph],
    };
    const canonical = [{ kind: 'paragraph' as const, lines: [], totalHeight: 17 }];
    const measure: DrawingMeasure = {
      kind: 'drawing',
      drawingKind: 'textboxShape',
      width: 200,
      height: 100,
      scale: 1,
      naturalWidth: 200,
      naturalHeight: 100,
      geometry: block.geometry,
      contentMeasures: canonical,
    };
    let fallbackCalled = false;

    const result = resolveTextboxContentMeasures(block, measure, () => {
      fallbackCalled = true;
      return { kind: 'paragraph', lines: [], totalHeight: 10 };
    });

    expect(result).toBe(canonical);
    expect(fallbackCalled).toBe(false);
  });
});
