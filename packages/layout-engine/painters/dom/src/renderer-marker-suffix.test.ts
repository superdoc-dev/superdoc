/**
 * Tests for marker suffix rendering in DomPainter
 *
 * Tests all suffix types: 'tab', 'space', 'nothing', and edge cases for gutterWidthPx
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Measure, Layout, WordParagraphLayoutOutput } from '@superdoc/contracts';

describe('DomPainter marker suffix rendering', () => {
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
    suffix: 'tab' | 'space' | 'nothing',
    gutterWidthPx?: number,
  ): FlowBlock {
    const wordLayout: WordParagraphLayoutOutput = {
      marker: {
        markerText,
        justification: 'right',
        suffix,
        gutterWidthPx,
        run: {
          fontFamily: 'Arial',
          fontSize: 12,
          bold: false,
          italic: false,
        },
      },
      gutter: {
        widthPx: gutterWidthPx ?? 24,
      },
    };

    return {
      kind: 'paragraph',
      id: blockId,
      runs: [{ text: 'List item text', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 14 }],
      attrs: {
        wordLayout,
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
  function createListLayout(blockId: string, markerWidth: number, markerTextWidth = markerWidth): Layout {
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
              markerWidth,
              markerTextWidth,
              continuesFromPrev: false,
            },
          ],
        },
      ],
    };
  }

  describe('suffix type: tab', () => {
    it('should render tab suffix with default gutterWidthPx', () => {
      const blockId = 'list-tab-default';
      const block = createListBlock(blockId, '1.', 'tab');
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      // Find the marker container
      const markerContainer = container.querySelector('.superdoc-paragraph-marker');
      expect(markerContainer).toBeTruthy();
      expect(markerContainer?.textContent).toBe('1.');

      // Find the tab element (inline spacer in the line)
      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();
      expect(tabElement?.innerHTML).toBe('&nbsp;');

      // Right-justified markers use hanging indent for tab width (no hanging => 0px).
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('0px');
    });

    it('should render tab suffix with custom gutterWidthPx', () => {
      const blockId = 'list-tab-custom';
      const customGutter = 36;
      const block = createListBlock(blockId, 'a)', 'tab', customGutter);
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('0px');
    });

    it('should handle gutterWidthPx of 0', () => {
      const blockId = 'list-tab-zero';
      const block = createListBlock(blockId, '•', 'tab', 0);
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // Right-justified markers use hanging indent for tab width (no hanging => 0px).
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('0px');
    });

    it('should handle negative gutterWidthPx', () => {
      const blockId = 'list-tab-negative';
      const block = createListBlock(blockId, 'i.', 'tab', -10);
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // Right-justified markers use hanging indent for tab width (no hanging => 0px).
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('0px');
    });

    it('should handle Infinity gutterWidthPx', () => {
      const blockId = 'list-tab-infinity';
      const block = createListBlock(blockId, 'A.', 'tab', Infinity);
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // Right-justified markers use hanging indent for tab width (no hanging => 0px).
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('0px');
    });

    it('should handle NaN gutterWidthPx', () => {
      const blockId = 'list-tab-nan';
      const block = createListBlock(blockId, 'I.', 'tab', NaN);
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();

      // Right-justified markers use hanging indent for tab width (no hanging => 0px).
      const tabWidth = (tabElement as HTMLElement)?.style.width;
      expect(tabWidth).toBe('0px');
    });
  });

  describe('suffix type: space', () => {
    it('should render space suffix as non-breaking space', () => {
      const blockId = 'list-space';
      const block = createListBlock(blockId, '2.', 'space');
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerContainer = container.querySelector('.superdoc-paragraph-marker');
      expect(markerContainer).toBeTruthy();

      const line = container.querySelector('.superdoc-line');
      expect(line?.textContent || '').toContain('\u00A0');

      // Should NOT have a tab element
      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();
    });

    it('should render space suffix without gutterWidthPx constraint', () => {
      const blockId = 'list-space-gutter';
      const block = createListBlock(blockId, 'b)', 'space', 100);
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerParent = container.querySelector('.superdoc-paragraph-marker')?.parentElement;
      expect(markerParent).toBeTruthy();

      // Space suffix doesn't use gutterWidthPx - just adds a non-breaking space
      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();
    });
  });

  describe('suffix type: nothing', () => {
    it('should render no suffix element for "nothing" type', () => {
      const blockId = 'list-nothing';
      const block = createListBlock(blockId, '3.', 'nothing');
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const markerContainer = container.querySelector('.superdoc-paragraph-marker');
      expect(markerContainer).toBeTruthy();
      expect(markerContainer?.textContent).toBe('3.');

      // Should have only the marker span, no tab or space
      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();

      const markerSpans = container.querySelectorAll('.superdoc-paragraph-marker');
      expect(markerSpans?.length).toBe(1);
    });

    it('should ignore gutterWidthPx for "nothing" suffix', () => {
      const blockId = 'list-nothing-gutter';
      const block = createListBlock(blockId, '•', 'nothing', 48);
      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      // No tab element should exist
      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeFalsy();
    });
  });

  describe('edge cases', () => {
    it('should handle missing suffix (defaults to tab)', () => {
      const blockId = 'list-default-suffix';
      const wordLayout: WordParagraphLayoutOutput = {
        marker: {
          markerText: '1.',
          justification: 'right',
          // suffix intentionally omitted
          run: {
            fontFamily: 'Arial',
            fontSize: 12,
          },
        },
        gutter: {
          widthPx: 24,
        },
      };

      const block: FlowBlock = {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Text', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 4 }],
        attrs: { wordLayout },
      };

      const measure = createListMeasure();
      const layout = createListLayout(blockId, 24);

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      // Should default to tab suffix
      const tabElement = container.querySelector('.superdoc-tab');
      expect(tabElement).toBeTruthy();
    });

    it('should render only on first line when continuesFromPrev is false', () => {
      const blockId = 'list-first-line';
      const block = createListBlock(blockId, '4.', 'tab');
      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 7,
            width: 60,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
          {
            fromRun: 0,
            fromChar: 7,
            toRun: 0,
            toChar: 14,
            width: 60,
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
                toLine: 1,
                x: 48,
                y: 40,
                width: 300,
                markerWidth: 24,
                markerTextWidth: 12,
                continuesFromPrev: false,
              },
              {
                kind: 'para',
                blockId,
                fromLine: 1,
                toLine: 2,
                x: 48,
                y: 60,
                width: 300,
                continuesFromPrev: true, // Second fragment continues
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      // Should have exactly one marker (only on first fragment)
      const markers = container.querySelectorAll('.superdoc-paragraph-marker');
      expect(markers.length).toBe(1);
    });
  });
});
