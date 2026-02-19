/**
 * Tests for hanging indent + tabs alignment in DomPainter
 *
 * Tests the special handling of paragraphs that have both:
 * 1. Hanging indents (w:ind w:left="X" w:hanging="Y")
 * 2. Tab characters (which create segments with explicit X positioning)
 *
 * The core issue: When segments have explicit X positions (from tabs), they use
 * absolute positioning and are NOT affected by CSS textIndent. Therefore, we must
 * adjust paddingLeft instead of using textIndent for proper alignment.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Measure, Layout, Line } from '@superdoc/contracts';

describe('DomPainter hanging indent with tabs', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  /**
   * Helper to create a block with specified indent values
   *
   * @param blockId - Unique block identifier
   * @param text - Text content for the paragraph
   * @param indent - Indent configuration
   * @returns FlowBlock with indent attributes
   */
  function createBlockWithIndent(
    blockId: string,
    text: string,
    indent: { left?: number; right?: number; firstLine?: number; hanging?: number },
  ): FlowBlock {
    return {
      kind: 'paragraph',
      id: blockId,
      runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: text.length }],
      attrs: {
        indent,
      },
    };
  }

  /**
   * Helper to create a measure with optional explicit segment positioning
   *
   * @param textLength - Length of text
   * @param hasExplicitPositioning - Whether segments should have explicit X positions (simulating tabs)
   * @returns Measure with appropriate line configuration
   */
  function createMeasure(textLength: number, hasExplicitPositioning: boolean): Measure {
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: textLength,
      width: 200,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    };

    if (hasExplicitPositioning) {
      // Simulate tab segments with explicit X positioning
      line.segments = [
        { runIndex: 0, fromChar: 0, toChar: 5, width: 50, x: 0 },
        { runIndex: 0, fromChar: 5, toChar: textLength, width: 150, x: 144 },
      ];
    }

    return {
      kind: 'paragraph',
      lines: [line],
      totalHeight: 20,
    };
  }

  /**
   * Helper to create a multi-line measure
   *
   * @param firstLineHasSegments - Whether first line has explicit positioning
   * @returns Measure with two lines
   */
  function createMultiLineMeasure(firstLineHasSegments: boolean): Measure {
    const firstLine: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 10,
      width: 200,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    };

    if (firstLineHasSegments) {
      firstLine.segments = [
        { runIndex: 0, fromChar: 0, toChar: 5, width: 50, x: 0 },
        { runIndex: 0, fromChar: 5, toChar: 10, width: 150, x: 144 },
      ];
    }

    const secondLine: Line = {
      fromRun: 0,
      fromChar: 10,
      toRun: 0,
      toChar: 20,
      width: 200,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    };

    return {
      kind: 'paragraph',
      lines: [firstLine, secondLine],
      totalHeight: 40,
    };
  }

  /**
   * Helper to create layout for a paragraph
   *
   * @param blockId - Block identifier
   * @param pmEnd - End position in paragraph model
   * @param continuesFromPrev - Whether fragment continues from previous page
   * @returns Layout configuration
   */
  function createLayout(blockId: string, pmEnd: number, continuesFromPrev = false): Layout {
    return {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId,
              fromLine: 0,
              toLine: 1,
              x: 30,
              y: 40,
              width: 300,
              pmStart: 0,
              pmEnd,
              continuesFromPrev,
            },
          ],
        },
      ],
    };
  }

  describe('First line with hanging indent AND tabs', () => {
    it('should adjust paddingLeft and skip textIndent when segments have explicit X positions', () => {
      const blockId = 'hanging-with-tabs';
      const block = createBlockWithIndent(blockId, 'Text\twith tab', {
        left: 360,
        hanging: 360,
      });
      const measure = createMeasure(13, true); // true = has explicit positioning
      const layout = createLayout(blockId, 13);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft should be adjusted: left - hanging = 360 - 360 = 0
      expect(lineEl.style.paddingLeft).toBe('');

      // textIndent should NOT be applied (segments are absolutely positioned)
      expect(lineEl.style.textIndent).toBe('');
    });

    it('should handle non-zero adjusted padding (left > hanging)', () => {
      const blockId = 'partial-hanging-tabs';
      const block = createBlockWithIndent(blockId, 'Text\twith tab', {
        left: 720,
        hanging: 360,
      });
      const measure = createMeasure(13, true);
      const layout = createLayout(blockId, 13);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft should be: 720 - 360 = 360
      expect(lineEl.style.paddingLeft).toBe('360px');

      // textIndent should NOT be applied
      expect(lineEl.style.textIndent).toBe('');
    });

    it('should handle edge case where hanging equals left indent', () => {
      const blockId = 'equal-hanging-tabs';
      const block = createBlockWithIndent(blockId, 'Tab\there', {
        left: 144,
        hanging: 144,
      });
      const measure = createMeasure(8, true);
      const layout = createLayout(blockId, 8);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft should be 0 when left equals hanging
      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.textIndent).toBe('');
    });
  });

  describe('Hanging indent WITHOUT tabs (normal behavior)', () => {
    it('should use normal paddingLeft and textIndent when no explicit positioning', () => {
      const blockId = 'hanging-no-tabs';
      const block = createBlockWithIndent(blockId, 'Text without tabs', {
        left: 360,
        hanging: 360,
      });
      const measure = createMeasure(17, false); // false = no explicit positioning
      const layout = createLayout(blockId, 17);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // Normal behavior: full paddingLeft
      expect(lineEl.style.paddingLeft).toBe('360px');

      // textIndent should be negative hanging: firstLine(0) - hanging(360) = -360
      expect(lineEl.style.textIndent).toBe('-360px');
    });

    it('should handle partial hanging indent without tabs', () => {
      const blockId = 'partial-hanging-no-tabs';
      const block = createBlockWithIndent(blockId, 'Regular text', {
        left: 720,
        hanging: 360,
      });
      const measure = createMeasure(12, false);
      const layout = createLayout(blockId, 12);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      expect(lineEl.style.paddingLeft).toBe('720px');
      // textIndent = firstLine(0) - hanging(360) = -360
      expect(lineEl.style.textIndent).toBe('-360px');
    });
  });

  describe('Tabs WITHOUT hanging indent', () => {
    it('should use normal paddingLeft with tabs but no hanging', () => {
      const blockId = 'tabs-no-hanging';
      const block = createBlockWithIndent(blockId, 'Tab\there', {
        left: 360,
      });
      const measure = createMeasure(8, true); // Has tabs
      const layout = createLayout(blockId, 8);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // No hanging, so normal paddingLeft
      expect(lineEl.style.paddingLeft).toBe('');

      // No textIndent because explicit positioning
      expect(lineEl.style.textIndent).toBe('');
    });

    it('should handle firstLine indent with tabs', () => {
      const blockId = 'tabs-with-firstline';
      const block = createBlockWithIndent(blockId, 'Tab\there', {
        left: 360,
        firstLine: 720,
      });
      const measure = createMeasure(8, true);
      const layout = createLayout(blockId, 8);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // With explicit positioning, paddingLeft includes firstLine offset: 360 + 720 = 1080
      // This is because absolutely positioned segments are not affected by textIndent,
      // so we must incorporate the firstLine offset into paddingLeft instead.
      expect(lineEl.style.paddingLeft).toBe('1080px');

      // With explicit positioning, textIndent is skipped (it doesn't affect absolute positioning)
      expect(lineEl.style.textIndent).toBe('');
    });
  });

  describe('Continuation lines', () => {
    it('should not adjust padding for continuation lines even with hanging + tabs', () => {
      const blockId = 'continuation-line';
      const block = createBlockWithIndent(blockId, 'First line text continues here', {
        left: 360,
        hanging: 360,
      });
      const measure = createMultiLineMeasure(true); // First line has segments
      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 2,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 20,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lines = container.querySelectorAll('.superdoc-line');
      expect(lines.length).toBe(2);

      const firstLine = lines[0] as HTMLElement;
      const secondLine = lines[1] as HTMLElement;

      // First line: adjusted padding
      expect(firstLine.style.paddingLeft).toBe('');

      // Second line: normal left indent (no adjustment)
      expect(secondLine.style.paddingLeft).toBe('360px');
      expect(secondLine.style.textIndent).toBe('0px');
    });

    it('should handle fragments that continue from previous page', () => {
      const blockId = 'continues-from-prev';
      const block = createBlockWithIndent(blockId, 'Text\twith tab', {
        left: 360,
        hanging: 360,
      });
      const measure = createMeasure(13, true);
      const layout = createLayout(blockId, 13, true); // continuesFromPrev = true

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // When continuing from previous page, it's not the "first line" of the paragraph
      // so should use normal left indent
      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.textIndent).toBe('0px');
    });
  });

  describe('Edge cases', () => {
    it('should handle zero hanging indent', () => {
      const blockId = 'zero-hanging';
      const block = createBlockWithIndent(blockId, 'Tab\there', {
        left: 360,
        hanging: 0,
      });
      const measure = createMeasure(8, true);
      const layout = createLayout(blockId, 8);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // Zero hanging = normal behavior
      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.textIndent).toBe('');
    });

    it('should handle undefined indent', () => {
      const blockId = 'no-indent';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Tab\there', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 8 }],
        // No attrs.indent
      };
      const measure = createMeasure(8, true);
      const layout = createLayout(blockId, 8);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // No indent values = no padding styles set
      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.textIndent).toBe('');
    });

    it('should handle undefined left indent with hanging', () => {
      const blockId = 'hanging-no-left';
      const block = createBlockWithIndent(blockId, 'Text\twith tab', {
        hanging: 360,
      });
      const measure = createMeasure(13, true);
      const layout = createLayout(blockId, 13);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // No left indent means the padding adjustment logic doesn't run
      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.textIndent).toBe('');
    });

    it('should handle mixed segments (some with X, some without)', () => {
      const blockId = 'mixed-segments';
      const block = createBlockWithIndent(blockId, 'Mixed segments', {
        left: 360,
        hanging: 360,
      });

      // Create measure with mixed segments
      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 14,
            width: 200,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 5, width: 50, x: 0 },
              { runIndex: 0, fromChar: 5, toChar: 10, width: 75 }, // No X
              { runIndex: 0, fromChar: 10, toChar: 14, width: 75, x: 200 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout = createLayout(blockId, 14);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // If ANY segment has explicit X, treat as explicit positioning
      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.textIndent).toBe('');
    });

    it('should handle negative hanging (should not occur in practice but test defensive code)', () => {
      const blockId = 'negative-hanging';
      const block = createBlockWithIndent(blockId, 'Tab\there', {
        left: 360,
        hanging: -100,
      });
      const measure = createMeasure(8, true);
      const layout = createLayout(blockId, 8);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // Negative hanging (-100) behaves like positive firstLine (+100).
      // firstLineOffset = firstLine(0) - hanging(-100) = 100
      // With explicit positioning: paddingLeft = left(360) + firstLineOffset(100) = 460
      expect(lineEl.style.paddingLeft).toBe('460px');
    });

    it('should handle very large indent values', () => {
      const blockId = 'large-indent';
      const block = createBlockWithIndent(blockId, 'Tab\there', {
        left: 9999,
        hanging: 5000,
      });
      const measure = createMeasure(8, true);
      const layout = createLayout(blockId, 8);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // Should handle large values: 9999 - 5000 = 4999
      expect(lineEl.style.paddingLeft).toBe('4999px');
      expect(lineEl.style.textIndent).toBe('');
    });
  });

  describe('firstLineIndentMode marker positioning', () => {
    it('should position marker at left + firstLine when firstLineIndentMode is true', () => {
      const blockId = 'firstline-indent-mode';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'List item text', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 14 }],
        attrs: {
          indent: {
            left: 0,
            firstLine: 720,
          },
          wordLayout: {
            marker: {
              markerText: '1.',
              justification: 'left',
              suffix: 'tab',
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 0,
            firstLineIndentMode: true,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 14,
            width: 200,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 14,
                markerWidth: 24,
                markerTextWidth: 12,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft should be: left (0) + firstLine (720) = 720px
      expect(lineEl.style.paddingLeft).toBe('720px');

      const marker = lineEl.querySelector('.superdoc-paragraph-marker');
      expect(marker).toBeTruthy();
      expect(marker?.textContent).toBe('1.');
    });

    it('uses default tab interval for tab width in firstLine mode', () => {
      const blockId = 'firstline-mode-tab-gap';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'List text', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 9 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 500,
          },
          wordLayout: {
            marker: {
              markerText: 'A.',
              justification: 'left',
              suffix: 'tab',
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 100,
            firstLineIndentMode: true,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 9,
            width: 150,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 9,
                markerWidth: 20,
                markerTextWidth: 14,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft should be: left (100) + firstLine (500) = 600px
      expect(lineEl.style.paddingLeft).toBe('600px');

      // Tab element should exist and have width equal to LIST_MARKER_GAP (8px)
      const tabEl = lineEl.querySelector('.superdoc-tab') as HTMLElement;
      expect(tabEl).toBeTruthy();
      expect(tabEl.style.width).toBe('10px');
    });

    it('should position right-justified marker correctly in firstLine mode', () => {
      const blockId = 'firstline-right-justified';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Item text', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 9 }],
        attrs: {
          indent: {
            left: 200,
            firstLine: 400,
          },
          wordLayout: {
            marker: {
              markerText: 'IV.',
              justification: 'right',
              suffix: 'tab',
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 200,
            firstLineIndentMode: true,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 9,
            width: 150,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 9,
                markerWidth: 30,
                markerTextWidth: 20,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft should be: left (200) + firstLine (400) = 600px
      expect(lineEl.style.paddingLeft).toBe('600px');

      const markerContainer = lineEl.querySelector('.superdoc-paragraph-marker')?.parentElement as HTMLElement;
      expect(markerContainer).toBeTruthy();

      // For right-justified markers, container should be absolutely positioned
      expect(markerContainer.style.position).toBe('absolute');

      // Marker left position should be: markerStartPos (600) - markerTextWidth (20) = 580px
      expect(markerContainer.style.left).toBe('580px');
    });

    it('should handle firstLineIndentMode with zero left indent', () => {
      const blockId = 'firstline-zero-left';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 4 }],
        attrs: {
          indent: {
            left: 0,
            firstLine: 360,
          },
          wordLayout: {
            marker: {
              markerText: '1.',
              justification: 'left',
              suffix: 'tab',
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 0,
            firstLineIndentMode: true,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 4,
            width: 50,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 4,
                markerWidth: 20,
                markerTextWidth: 12,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft should be: left (0) + firstLine (360) = 360px
      expect(lineEl.style.paddingLeft).toBe('360px');
    });
  });

  describe('List first lines (should take precedence)', () => {
    it('should not apply hanging indent adjustment for list first lines', () => {
      const blockId = 'list-with-hanging';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'List item\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 18 }],
        attrs: {
          indent: {
            left: 360,
            hanging: 360,
          },
          wordLayout: {
            marker: {
              markerText: '1.',
              justification: 'right',
              suffix: 'tab',
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            gutter: {
              widthPx: 24,
            },
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 18,
            width: 200,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 9, width: 80, x: 0 },
              { runIndex: 0, fromChar: 9, toChar: 18, width: 120, x: 144 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 18,
                markerWidth: 24, // Indicates list item
                markerTextWidth: 12,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // List first lines use special marker positioning logic, not indent adjustment
      // The paddingLeft should be set by list logic: left - hanging = 0
      expect(lineEl.style.paddingLeft).toBe('0px');

      // Should contain marker element
      const marker = lineEl.querySelector('.superdoc-paragraph-marker');
      expect(marker).toBeTruthy();
      expect(marker?.textContent).toBe('1.');
    });
  });

  describe('Right indent', () => {
    it('should apply right indent regardless of hanging + tabs interaction', () => {
      const blockId = 'with-right-indent';
      const block = createBlockWithIndent(blockId, 'Tab\there', {
        left: 360,
        hanging: 360,
        right: 180,
      });
      const measure = createMeasure(8, true);
      const layout = createLayout(blockId, 8);

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      expect(lineEl.style.paddingLeft).toBe('');
      expect(lineEl.style.paddingRight).toBe('180px');
      expect(lineEl.style.textIndent).toBe('');
    });
  });

  describe('FirstLineIndentMode with firstLine=0 style override', () => {
    it('uses left + firstLine when firstLine=0 even if markerX is provided', () => {
      const blockId = 'firstline-zero-override';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'List item', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 9 }],
        attrs: {
          indent: {
            left: 360,
            firstLine: 0, // Style override cancels numbering level indent
          },
          wordLayout: {
            marker: {
              markerText: '1.',
              justification: 'left',
              suffix: 'tab',
              markerX: 720, // Pre-calculated position from word-layout
              textStartX: 760, // Pre-calculated text start
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 360,
            firstLineIndentMode: true,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 9,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 9,
                markerWidth: 20,
                markerTextWidth: 16,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft uses left + firstLine (markerX is not used in renderer)
      expect(lineEl.style.paddingLeft).toBe('360px');

      const marker = lineEl.querySelector('.superdoc-paragraph-marker');
      expect(marker).toBeTruthy();
      expect(marker?.textContent).toBe('1.');
    });

    it('should fall back to left + firstLine when markerX is not provided', () => {
      const blockId = 'firstline-zero-no-markerX';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'List item', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 9 }],
        attrs: {
          indent: {
            left: 360,
            firstLine: 0,
          },
          wordLayout: {
            marker: {
              markerText: '2.',
              justification: 'left',
              suffix: 'tab',
              // No markerX provided
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 360,
            firstLineIndentMode: true,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 9,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 9,
                markerWidth: 20,
                markerTextWidth: 16,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // Should fall back to left (360) + firstLine (0) = 360px
      expect(lineEl.style.paddingLeft).toBe('360px');
    });
  });

  describe('Tab width calculation with explicit tab stops', () => {
    it('should use explicit tab stop when available and past current position', () => {
      const blockId = 'explicit-tab-stop';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Item', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 4 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 500,
          },
          wordLayout: {
            marker: {
              markerText: 'A.',
              justification: 'left',
              suffix: 'tab',
              markerX: 600,
              textStartX: 800,
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 100,
            firstLineIndentMode: true,
            tabsPx: [400, 800, 1200], // Explicit tab stops
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 4,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 4,
                markerWidth: 30,
                markerTextWidth: 20,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // currentPos = markerStartPos (600) + markerTextWidth (20) = 620
      // First tab stop past 620 is 800
      // tabWidth should be 800 - 620 = 180
      const tabEl = lineEl.querySelector('.superdoc-tab') as HTMLElement;
      expect(tabEl).toBeTruthy();
      expect(tabEl.style.width).toBe('180px');
    });

    it('uses default tab interval when no explicit tab stops are past current position', () => {
      const blockId = 'use-textstartx';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Item', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 4 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 500,
          },
          wordLayout: {
            marker: {
              markerText: 'B.',
              justification: 'left',
              suffix: 'tab',
              markerX: 600,
              textStartX: 720, // Should be used when no tab stops available
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 100,
            firstLineIndentMode: true,
            tabsPx: [400, 500], // All tab stops are before current position
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 4,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 4,
                markerWidth: 30,
                markerTextWidth: 20,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // currentPos = markerStartPos (600) + markerTextWidth (20) = 620
      // No tab stops past 620, so advance to next default tab interval (48px)
      // next tab: 48 - (620 % 48) = 4
      const tabEl = lineEl.querySelector('.superdoc-tab') as HTMLElement;
      expect(tabEl).toBeTruthy();
      expect(tabEl.style.width).toBe('4px');
    });
  });

  describe('TextStartX fallback to default tab interval', () => {
    it('uses default tab interval when textStartX is behind current position', () => {
      const blockId = 'textstartx-behind';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Item', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 4 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 500,
          },
          wordLayout: {
            marker: {
              markerText: 'Very Long Marker Text.',
              justification: 'left',
              suffix: 'tab',
              markerX: 600,
              textStartX: 620, // Behind currentPos after adding marker text width
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 100,
            firstLineIndentMode: true,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 4,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 4,
                markerWidth: 150,
                markerTextWidth: 140, // Very wide marker
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // currentPos = markerStartPos (600) + markerTextWidth (140) = 740
      // textStartX (620) is behind currentPos (740), so advance to next default tab interval
      const tabEl = lineEl.querySelector('.superdoc-tab') as HTMLElement;
      expect(tabEl).toBeTruthy();
      expect(tabEl.style.width).toBe('28px');
    });

    it('uses default tab interval when textStartX is undefined', () => {
      const blockId = 'no-textstartx';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Item', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 4 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 500,
          },
          wordLayout: {
            marker: {
              markerText: 'C.',
              justification: 'left',
              suffix: 'tab',
              markerX: 600,
              // No textStartX provided
              run: {
                fontFamily: 'Arial',
                fontSize: 12,
                bold: false,
                italic: false,
              },
            },
            indentLeftPx: 100,
            firstLineIndentMode: true,
            // No textStartPx in wordLayout either
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 4,
            width: 80,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 4,
                markerWidth: 30,
                markerTextWidth: 20,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // No textStartX or textStartPx, so advance to next default tab interval
      const tabEl = lineEl.querySelector('.superdoc-tab') as HTMLElement;
      expect(tabEl).toBeTruthy();
      expect(tabEl.style.width).toBe('4px');
    });
  });

  describe('indentOffset calculation for segment positioning', () => {
    /**
     * These tests verify the indentOffset calculation logic used for positioning
     * segments with explicit X coordinates. The offset combines left indent with
     * first-line adjustments (firstLine - hanging on first line, 0 on subsequent lines).
     */

    it('calculates indentOffset correctly for first line with firstLine indent', () => {
      const blockId = 'firstline-indent-offset';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 13 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 200,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 4, width: 50, x: 0 },
              { runIndex: 0, fromChar: 4, toChar: 13, width: 130, x: 150 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 13,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      // Verify segments are rendered with correct positioning
      // indentOffset should be: left (100) + firstLine (200) = 300
      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // Get all absolutely positioned spans (segments) within the line
      const spans = Array.from(lineEl.querySelectorAll('span')).filter(
        (s) => (s as HTMLElement).style.position === 'absolute',
      ) as HTMLElement[];
      expect(spans.length).toBeGreaterThan(0);

      // First segment at x=0, positioned at 0 + indentOffset = 300
      const firstSpan = spans[0];
      expect(firstSpan.style.left).toBe('300px');

      // Second segment at x=150, positioned at 150 + indentOffset = 450
      const secondSpan = spans[1];
      expect(secondSpan.style.left).toBe('450px');
    });

    it('calculates indentOffset correctly for first line with hanging indent', () => {
      const blockId = 'hanging-indent-offset';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 13 }],
        attrs: {
          indent: {
            left: 360,
            hanging: 144,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 4, width: 50, x: 0 },
              { runIndex: 0, fromChar: 4, toChar: 13, width: 130, x: 150 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 13,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      // Verify segments are rendered with correct positioning
      // indentOffset should be: left (360) + (firstLine (0) - hanging (144)) = 216
      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      const spans = Array.from(lineEl.querySelectorAll('span')).filter(
        (s) => (s as HTMLElement).style.position === 'absolute',
      ) as HTMLElement[];
      expect(spans.length).toBeGreaterThan(0);

      // First segment at x=0, positioned at 0 + indentOffset = 216
      const firstSpan = spans[0];
      expect(firstSpan.style.left).toBe('216px');

      // Second segment at x=150, positioned at 150 + indentOffset = 366
      const secondSpan = spans[1];
      expect(secondSpan.style.left).toBe('366px');
    });

    it('calculates indentOffset correctly for non-first lines', () => {
      const blockId = 'non-first-line-offset';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [
          {
            text: 'First line text continues on second line\twith tab',
            fontFamily: 'Arial',
            fontSize: 12,
            pmStart: 0,
            pmEnd: 50,
          },
        ],
        attrs: {
          indent: {
            left: 360,
            firstLine: 720,
            hanging: 144,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 25,
            width: 280,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
          {
            fromRun: 0,
            fromChar: 25,
            toRun: 0,
            toChar: 50,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 25, toChar: 40, width: 80, x: 0 },
              { runIndex: 0, fromChar: 40, toChar: 50, width: 100, x: 150 },
            ],
          },
        ],
        totalHeight: 40,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 2,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 50,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      // Get the second line's segments
      const lines = container.querySelectorAll('.superdoc-line');
      expect(lines.length).toBe(2);

      const secondLine = lines[1];
      const spans = Array.from(secondLine.querySelectorAll('span')).filter(
        (s) => (s as HTMLElement).style.position === 'absolute',
      ) as HTMLElement[];
      expect(spans.length).toBeGreaterThan(0);

      // For non-first lines, indentOffset should be: left (360) + 0 = 360
      // (no firstLine or hanging adjustment)
      const firstSpan = spans[0];
      expect(firstSpan.style.left).toBe('360px');

      const secondSpan = spans[1];
      expect(secondSpan.style.left).toBe('510px'); // 150 + 360
    });

    it('calculates indentOffset with firstLine and hanging combined', () => {
      const blockId = 'combined-indent-offset';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 13 }],
        attrs: {
          indent: {
            left: 200,
            firstLine: 400,
            hanging: 100,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 4, width: 50, x: 0 },
              { runIndex: 0, fromChar: 4, toChar: 13, width: 130, x: 150 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 13,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      // Verify segments are rendered with correct positioning
      // indentOffset should be: left (200) + (firstLine (400) - hanging (100)) = 500
      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      const spans = Array.from(lineEl.querySelectorAll('span')).filter(
        (s) => (s as HTMLElement).style.position === 'absolute',
      ) as HTMLElement[];
      expect(spans.length).toBeGreaterThan(0);

      const firstSpan = spans[0];
      expect(firstSpan.style.left).toBe('500px');

      const secondSpan = spans[1];
      expect(secondSpan.style.left).toBe('650px'); // 150 + 500
    });

    it('handles zero indents correctly', () => {
      const blockId = 'zero-indent-offset';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 13 }],
        attrs: {
          indent: {
            left: 0,
            firstLine: 0,
            hanging: 0,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 4, width: 50, x: 0 },
              { runIndex: 0, fromChar: 4, toChar: 13, width: 130, x: 150 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 13,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      // With all zero indents, indentOffset = 0
      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      const spans = Array.from(lineEl.querySelectorAll('span')).filter(
        (s) => (s as HTMLElement).style.position === 'absolute',
      ) as HTMLElement[];
      expect(spans.length).toBeGreaterThan(0);

      const firstSpan = spans[0];
      expect(firstSpan.style.left).toBe('0px');

      const secondSpan = spans[1];
      expect(secondSpan.style.left).toBe('150px');
    });
  });

  describe('paddingLeft edge cases with hasExplicitSegmentPositioning', () => {
    /**
     * These tests verify the paddingLeft conditional logic that varies based on:
     * - hasExplicitSegmentPositioning (true when segments exist)
     * - isFirstLine (true for first line, false otherwise)
     * - firstLineOffset (calculated from firstLine - hanging)
     */

    it('sets paddingLeft when hasExplicitPositioning=true, isFirstLine=true, firstLineOffset!=0', () => {
      const blockId = 'explicit-first-nonzero';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 13 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 200,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 4, width: 50, x: 0 },
              { runIndex: 0, fromChar: 4, toChar: 13, width: 130, x: 150 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout = createLayout(blockId, 13);
      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // Should set paddingLeft = paraIndentLeft (100) + firstLineOffset (200) = 300
      expect(lineEl.style.paddingLeft).toBe('300px');
    });

    it('does not set paddingLeft when hasExplicitPositioning=true, isFirstLine=true, firstLineOffset=0', () => {
      const blockId = 'explicit-first-zero';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 13 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 0,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 4, width: 50, x: 0 },
              { runIndex: 0, fromChar: 4, toChar: 13, width: 130, x: 150 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout = createLayout(blockId, 13);
      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // firstLineOffset = 0, so paddingLeft should not be set
      expect(lineEl.style.paddingLeft).toBe('');
    });

    it('does not set paddingLeft when hasExplicitPositioning=true, isFirstLine=false', () => {
      const blockId = 'explicit-not-first';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [
          {
            text: 'First line text continues on second\twith tab',
            fontFamily: 'Arial',
            fontSize: 12,
            pmStart: 0,
            pmEnd: 45,
          },
        ],
        attrs: {
          indent: {
            left: 100,
            firstLine: 200,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 20,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
          {
            fromRun: 0,
            fromChar: 20,
            toRun: 0,
            toChar: 45,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 20, toChar: 36, width: 80, x: 0 },
              { runIndex: 0, fromChar: 36, toChar: 45, width: 100, x: 150 },
            ],
          },
        ],
        totalHeight: 40,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 2,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 45,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lines = container.querySelectorAll('.superdoc-line');
      expect(lines.length).toBe(2);

      const secondLine = lines[1] as HTMLElement;

      // Non-first line with explicit positioning should not set paddingLeft
      expect(secondLine.style.paddingLeft).toBe('');
    });

    it('sets paddingLeft when hasExplicitPositioning=false, isFirstLine=true', () => {
      const blockId = 'no-explicit-first';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text without tabs', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 17 }],
        attrs: {
          indent: {
            left: 100,
            firstLine: 200,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 17,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            // No segments - no explicit positioning
          },
        ],
        totalHeight: 20,
      };

      const layout = createLayout(blockId, 17);
      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // Without explicit positioning, should set paddingLeft = paraIndentLeft (100)
      expect(lineEl.style.paddingLeft).toBe('100px');

      // textIndent should be set for first line offset (200)
      expect(lineEl.style.textIndent).toBe('200px');
    });

    it('sets paddingLeft when hasExplicitPositioning=false, isFirstLine=false', () => {
      const blockId = 'no-explicit-not-first';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [
          {
            text: 'First line text continues on second line',
            fontFamily: 'Arial',
            fontSize: 12,
            pmStart: 0,
            pmEnd: 41,
          },
        ],
        attrs: {
          indent: {
            left: 100,
            firstLine: 200,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 20,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
          {
            fromRun: 0,
            fromChar: 20,
            toRun: 0,
            toChar: 41,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 40,
      };

      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId,
                fromLine: 0,
                toLine: 2,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 0,
                pmEnd: 41,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lines = container.querySelectorAll('.superdoc-line');
      expect(lines.length).toBe(2);

      const secondLine = lines[1] as HTMLElement;

      // Without explicit positioning, should set paddingLeft = paraIndentLeft (100)
      expect(secondLine.style.paddingLeft).toBe('100px');

      // textIndent should be 0px for non-first lines
      expect(secondLine.style.textIndent).toBe('0px');
    });

    it('handles negative firstLineOffset with explicit positioning', () => {
      const blockId = 'explicit-negative-offset';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 13 }],
        attrs: {
          indent: {
            left: 360,
            hanging: 144,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 4, width: 50, x: 0 },
              { runIndex: 0, fromChar: 4, toChar: 13, width: 130, x: 150 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout = createLayout(blockId, 13);
      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // firstLineOffset = firstLine (0) - hanging (144) = -144
      // paddingLeft = paraIndentLeft (360) + firstLineOffset (-144) = 216
      expect(lineEl.style.paddingLeft).toBe('216px');
    });

    it('handles zero left indent with explicit positioning and non-zero firstLineOffset', () => {
      const blockId = 'explicit-zero-left';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text\twith tab', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 13 }],
        attrs: {
          indent: {
            left: 0,
            firstLine: 200,
          },
        },
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 13,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
            segments: [
              { runIndex: 0, fromChar: 0, toChar: 4, width: 50, x: 0 },
              { runIndex: 0, fromChar: 4, toChar: 13, width: 130, x: 150 },
            ],
          },
        ],
        totalHeight: 20,
      };

      const layout = createLayout(blockId, 13);
      const painter = createDomPainter({ blocks: [block], measures: [measure], container });
      painter.paint(layout, container);

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).toBeTruthy();

      // paddingLeft = paraIndentLeft (0) + firstLineOffset (200) = 200
      expect(lineEl.style.paddingLeft).toBe('200px');
    });
  });
});
