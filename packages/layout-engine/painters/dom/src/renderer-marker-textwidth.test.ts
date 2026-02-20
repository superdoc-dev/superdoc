/**
 * Comprehensive tests for markerTextWidth feature in DomPainter
 *
 * Tests the behavior of markerTextWidth property including:
 * - Missing markerTextWidth prevents list marker rendering
 * - Tab width calculation using markerTextWidth
 * - Edge cases: zero, negative, Infinity, NaN values
 * - Left-justified markers do NOT have fixed width set
 * - Right/center justified markers use markerBoxWidth for visual alignment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Measure, Layout, WordParagraphLayoutOutput } from '@superdoc/contracts';

describe('DomPainter markerTextWidth feature', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  /**
   * Helper to create a list paragraph block with wordLayout
   */
  function createListBlock(
    blockId: string,
    markerText: string,
    justification: 'left' | 'right' | 'center' = 'left',
  ): FlowBlock {
    const wordLayout: WordParagraphLayoutOutput = {
      marker: {
        markerText,
        justification,
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
    };

    return {
      kind: 'paragraph',
      id: blockId,
      runs: [{ text: 'List item text', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 14 }],
      attrs: {
        wordLayout,
        indent: {
          left: 48, // Standard indent
        },
      },
    };
  }

  /**
   * Helper to create measure for a list paragraph
   */
  function createListMeasure(): Measure {
    return {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 14,
          width: 120,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };
  }

  /**
   * Helper to create layout for a list paragraph with marker
   */
  function createListLayout(
    blockId: string,
    markerBoxWidth: number,
    markerTextWidth?: number,
    markerGutter?: number,
  ): Layout {
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
              x: 48,
              y: 40,
              width: 300,
              markerWidth: markerBoxWidth,
              markerTextWidth,
              markerGutter,
              continuesFromPrev: false,
            },
          ],
        },
      ],
    };
  }

  describe('fallback behavior when markerTextWidth is undefined/null', () => {
    it('does not render list markers when markerTextWidth is undefined', () => {
      const blockId = 'list-undefined-textwidth';
      const block = createListBlock(blockId, '1.', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 24;
      // markerTextWidth is undefined
      const layout = createListLayout(blockId, markerBoxWidth, undefined);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerContainer = container.querySelector('.superdoc-paragraph-marker');
      expect(markerContainer).toBeFalsy();

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();
    });

    it('does not render list markers when markerTextWidth is null', () => {
      const blockId = 'list-null-textwidth';
      const block = createListBlock(blockId, '2.', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 30;
      // @ts-expect-error Testing null case explicitly
      const layout = createListLayout(blockId, markerBoxWidth, null);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerContainer = container.querySelector('.superdoc-paragraph-marker');
      expect(markerContainer).toBeFalsy();

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();
    });
  });

  describe('tab width calculation uses markerTextWidth', () => {
    it('should use markerTextWidth for left-justified marker tab calculation', () => {
      const blockId = 'list-left-textwidth';
      const block = createListBlock(blockId, 'a)', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 30; // Box width includes padding
      const markerTextWidth = 18; // Actual text is narrower
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // Tab should be calculated from markerTextWidth, not markerBoxWidth
      // With indent.left = 48, markerStartPos = 48, currentPos = 48 + 18 = 66
      // implicitTabStop = 48, so we're past it
      // Next default tab: 48 - (66 % 48) = 48 - 18 = 30
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('30px');
    });

    it('should calculate different tab width with markerTextWidth vs markerBoxWidth', () => {
      const blockId = 'list-textwidth-difference';
      const block = createListBlock(blockId, 'i.', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 40;
      const markerTextWidth = 15; // Significantly narrower than box
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // With markerTextWidth = 15:
      // markerStartPos = 48, currentPos = 48 + 15 = 63
      // implicitTabStop = 48, past it
      // Next tab: 48 - (63 % 48) = 48 - 15 = 33
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('33px');
    });

    it('uses hanging indent for right-justified marker tab width (no hanging => 0)', () => {
      const blockId = 'list-right-textwidth';
      const block = createListBlock(blockId, '1.', 'right');
      const measure = createListMeasure();
      const markerBoxWidth = 36;
      const markerTextWidth = 20;
      const markerGutter = 12;
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth, markerGutter);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      // For right-justified, tab uses gutter width, not calculated from text width
      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('0px');
    });
  });

  describe('edge case: markerTextWidth is 0', () => {
    it('does not render list markers when markerTextWidth is 0 for left-justified markers', () => {
      const blockId = 'list-zero-textwidth-left';
      const block = createListBlock(blockId, '', 'left'); // Empty marker
      const measure = createListMeasure();
      const markerBoxWidth = 20;
      const markerTextWidth = 0; // Zero width text
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();
    });

    it('does not render list markers when markerTextWidth is 0 for right-justified markers', () => {
      const blockId = 'list-zero-textwidth-right';
      const block = createListBlock(blockId, '', 'right');
      const measure = createListMeasure();
      const markerBoxWidth = 20;
      const markerTextWidth = 0;
      const markerGutter = 16;
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth, markerGutter);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();
    });
  });

  describe('edge case: negative markerTextWidth', () => {
    it('uses negative markerTextWidth directly when provided', () => {
      const blockId = 'list-negative-textwidth';
      const block = createListBlock(blockId, 'A.', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 25;
      const markerTextWidth = -10; // Invalid negative value
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // currentPos = 48 + (-10) = 38
      // next tab: 48 - (38 % 48) = 48 - 38 = 10
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('10px');
    });
  });

  describe('edge case: Infinity markerTextWidth', () => {
    it('does not apply a usable tab width when markerTextWidth is Infinity', () => {
      const blockId = 'list-infinity-textwidth';
      const block = createListBlock(blockId, 'I.', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 28;
      const markerTextWidth = Infinity; // Invalid infinite value
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('');
    });
  });

  describe('edge case: NaN markerTextWidth', () => {
    it('does not render list markers when markerTextWidth is NaN', () => {
      const blockId = 'list-nan-textwidth';
      const block = createListBlock(blockId, 'III.', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 32;
      const markerTextWidth = NaN; // Invalid NaN value
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();
    });
  });

  describe('left-justified markers should NOT have fixed width set', () => {
    it('should not set width style on left-justified marker element', () => {
      const blockId = 'list-left-no-width';
      const block = createListBlock(blockId, '1.', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 30;
      const markerTextWidth = 18;
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerEl = container.querySelector('.superdoc-paragraph-marker') as HTMLElement;
      expect(markerEl).toBeTruthy();

      // Left-justified markers should NOT have a fixed width
      expect(markerEl.style.width).toBe('');
    });

    it('does not set width style on right-justified marker element', () => {
      const blockId = 'list-right-has-width';
      const block = createListBlock(blockId, '2.', 'right');
      const measure = createListMeasure();
      const markerBoxWidth = 30;
      const markerTextWidth = 18;
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerEl = container.querySelector('.superdoc-paragraph-marker') as HTMLElement;
      expect(markerEl).toBeTruthy();

      // Marker element does not apply width or alignment styles in the renderer.
      expect(markerEl.style.width).toBe('');
      expect(markerEl.style.textAlign).toBe('');
    });

    it('does not set width style on center-justified marker element', () => {
      const blockId = 'list-center-has-width';
      const block = createListBlock(blockId, '3.', 'center');
      const measure = createListMeasure();
      const markerBoxWidth = 35;
      const markerTextWidth = 20;
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerEl = container.querySelector('.superdoc-paragraph-marker') as HTMLElement;
      expect(markerEl).toBeTruthy();

      // Marker element does not apply width or alignment styles in the renderer.
      expect(markerEl.style.width).toBe('');
      expect(markerEl.style.textAlign).toBe('');
    });
  });

  describe('integration test: markerTextWidth with various marker styles', () => {
    it('should handle long marker text with smaller textWidth', () => {
      const blockId = 'list-long-marker';
      const block = createListBlock(blockId, 'XXIV.', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 60; // Box is wide
      const markerTextWidth = 45; // Text is narrower
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerEl = container.querySelector('.superdoc-paragraph-marker');
      expect(markerEl).toBeTruthy();
      expect(markerEl?.textContent).toBe('XXIV.');

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // Tab should be calculated using markerTextWidth = 45
      // markerStartPos = 48, currentPos = 48 + 45 = 93
      // implicitTabStop = 48, past it
      // Next tab: 48 - (93 % 48) = 48 - 45 = 3
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('3px');
    });

    it('should handle small marker with markerTextWidth smaller than box', () => {
      const blockId = 'list-small-marker';
      const block = createListBlock(blockId, '•', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 20;
      const markerTextWidth = 8; // Bullet is very narrow
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // Tab calculation with markerTextWidth = 8
      // markerStartPos = 48, currentPos = 48 + 8 = 56
      // implicitTabStop = 48, past it
      // Next tab: 48 - (56 % 48) = 48 - 8 = 40
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('40px');
    });

    it('should handle markerTextWidth equal to markerBoxWidth', () => {
      const blockId = 'list-equal-widths';
      const block = createListBlock(blockId, 'a)', 'left');
      const measure = createListMeasure();
      const markerBoxWidth = 22;
      const markerTextWidth = 22; // Same as box width
      const layout = createListLayout(blockId, markerBoxWidth, markerTextWidth);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // Tab calculation with equal widths
      // markerStartPos = 48, currentPos = 48 + 22 = 70
      // implicitTabStop = 48, past it
      // Next tab: 48 - (70 % 48) = 48 - 22 = 26
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('26px');
    });
  });
});
