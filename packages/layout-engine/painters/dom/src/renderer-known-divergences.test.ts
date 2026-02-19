/**
 * Known divergence lock tests.
 *
 * Rule: This file contains ONLY intentional mismatches between rendering
 * paths. Every test has a Resolution target comment. When a future PR
 * resolves the divergence, it deletes the corresponding test(s).
 *
 * If a new divergence is discovered during PR 0 implementation, it is added
 * here with a resolution target — not fixed in production code.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDomPainter } from './index.js';
import { DomPainter } from './renderer.js';
import type { FlowBlock, Measure, Layout, Line } from '@superdoc/contracts';
import { normalizeLines } from './test-utils/normalize-line.js';

// ---------------------------------------------------------------------------
// Shared constants and helpers
// ---------------------------------------------------------------------------

const JUSTIFY_TEXT = 'The quick brown fox jumps over';
const JUSTIFY_TEXT_LEN = JUSTIFY_TEXT.length;
const LINE_WIDTH = 150;
const FRAGMENT_WIDTH = 300;

function makeLine(fromChar: number, toChar: number, overrides?: Partial<Line>): Line {
  return {
    fromRun: 0,
    fromChar,
    toRun: 0,
    toChar,
    width: LINE_WIDTH,
    maxWidth: FRAGMENT_WIDTH,
    ascent: 10,
    descent: 4,
    lineHeight: 16,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// List-item fixtures
// ---------------------------------------------------------------------------

function listItemFixtures(opts: { alignment?: string; lines?: Line[] }) {
  const halfLen = Math.floor(JUSTIFY_TEXT_LEN / 2);
  const lines = opts.lines ?? [makeLine(0, halfLen), makeLine(halfLen, JUSTIFY_TEXT_LEN)];

  const block: FlowBlock = {
    kind: 'list',
    id: 'list-div',
    listType: 'number',
    items: [
      {
        id: 'item-div',
        marker: { kind: 'number', text: '1.', level: 0 },
        paragraph: {
          kind: 'paragraph',
          id: 'list-para-div',
          runs: [{ text: JUSTIFY_TEXT, fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 1 + JUSTIFY_TEXT_LEN }],
          ...(opts.alignment ? { attrs: { alignment: opts.alignment } } : {}),
        },
      },
    ],
  };

  const measure: Measure = {
    kind: 'list',
    items: [
      {
        itemId: 'item-div',
        markerWidth: 24,
        markerTextWidth: 12,
        indentLeft: 36,
        paragraph: {
          kind: 'paragraph',
          lines,
          totalHeight: lines.reduce((h, l) => h + l.lineHeight, 0),
        },
      },
    ],
    totalHeight: lines.reduce((h, l) => h + l.lineHeight, 0),
  };

  const layout: Layout = {
    pageSize: { w: 600, h: 800 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'list-item',
            blockId: 'list-div',
            itemId: 'item-div',
            fromLine: 0,
            toLine: lines.length,
            x: 60,
            y: 40,
            width: FRAGMENT_WIDTH,
            markerWidth: 24,
          },
        ],
      },
    ],
  };

  return { blocks: [block], measures: [measure], layout };
}

// ---------------------------------------------------------------------------
// Body/table-cell fixtures (for three-way comparison)
// ---------------------------------------------------------------------------

function bodyFixtures(alignment: string) {
  const halfLen = Math.floor(JUSTIFY_TEXT_LEN / 2);
  const lines = [makeLine(0, halfLen), makeLine(halfLen, JUSTIFY_TEXT_LEN)];

  const block: FlowBlock = {
    kind: 'paragraph',
    id: 'body-para-div',
    runs: [{ text: JUSTIFY_TEXT, fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 1 + JUSTIFY_TEXT_LEN }],
    attrs: { alignment },
  };

  const measure: Measure = {
    kind: 'paragraph',
    lines,
    totalHeight: lines.reduce((h, l) => h + l.lineHeight, 0),
  };

  const layout: Layout = {
    pageSize: { w: 600, h: 800 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'para',
            blockId: 'body-para-div',
            fromLine: 0,
            toLine: lines.length,
            x: 30,
            y: 40,
            width: FRAGMENT_WIDTH,
            pmStart: 1,
            pmEnd: 1 + JUSTIFY_TEXT_LEN,
          },
        ],
      },
    ],
  };

  return { blocks: [block], measures: [measure], layout };
}

function tableCellFixtures(alignment: string) {
  const halfLen = Math.floor(JUSTIFY_TEXT_LEN / 2);
  const lines = [makeLine(0, halfLen), makeLine(halfLen, JUSTIFY_TEXT_LEN)];

  const block: FlowBlock = {
    kind: 'table',
    id: 'table-div',
    rows: [
      {
        id: 'row-0',
        cells: [
          {
            id: 'cell-0',
            blocks: [
              {
                kind: 'paragraph',
                id: 'table-para-div',
                runs: [
                  { text: JUSTIFY_TEXT, fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 1 + JUSTIFY_TEXT_LEN },
                ],
                attrs: { alignment },
              },
            ],
            attrs: {},
          },
        ],
      },
    ],
  };

  const measure: Measure = {
    kind: 'table',
    rows: [
      {
        height: 40,
        cells: [
          {
            width: FRAGMENT_WIDTH,
            height: 40,
            gridColumnStart: 0,
            blocks: [
              {
                kind: 'paragraph',
                lines,
                totalHeight: lines.reduce((h, l) => h + l.lineHeight, 0),
              },
            ],
          },
        ],
      },
    ],
    columnWidths: [FRAGMENT_WIDTH],
    totalWidth: FRAGMENT_WIDTH,
    totalHeight: 40,
  };

  const layout: Layout = {
    pageSize: { w: 600, h: 800 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'table',
            blockId: 'table-div',
            fromRow: 0,
            toRow: 1,
            x: 30,
            y: 40,
            width: FRAGMENT_WIDTH,
            height: 40,
          },
        ],
      },
    ],
  };

  return { blocks: [block], measures: [measure], layout };
}

function renderAndNormalize(fixtures: { blocks: FlowBlock[]; measures: Measure[]; layout: Layout }) {
  const container = document.createElement('div');
  const painter = createDomPainter({ blocks: fixtures.blocks, measures: fixtures.measures });
  painter.paint(fixtures.layout, container);
  return normalizeLines(container);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('known divergences (frozen — delete when resolved)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Resolution target: PR 7 (collapse list-item parallel paint model)
  // -----------------------------------------------------------------------

  describe('list-item force-left alignment — Resolution target: PR 7 (collapse list-item parallel paint model)', () => {
    it('list-item fragment forces textAlign to left even when paragraph alignment is justify', () => {
      const container = document.createElement('div');
      const fix = listItemFixtures({ alignment: 'justify' });
      const painter = createDomPainter({ blocks: fix.blocks, measures: fix.measures });
      painter.paint(fix.layout, container);

      // The list-item content div overrides textAlign to 'left'
      const contentEl = container.querySelector('.superdoc-list-content') as HTMLElement | null;
      expect(contentEl).not.toBeNull();
      expect(contentEl!.style.textAlign).toBe('left');
    });

    it('list-item fragment forces textAlign to left even when paragraph alignment is center', () => {
      const container = document.createElement('div');
      const fix = listItemFixtures({ alignment: 'center' });
      const painter = createDomPainter({ blocks: fix.blocks, measures: fix.measures });
      painter.paint(fix.layout, container);

      const contentEl = container.querySelector('.superdoc-list-content') as HTMLElement | null;
      expect(contentEl).not.toBeNull();
      expect(contentEl!.style.textAlign).toBe('left');
    });
  });

  // -----------------------------------------------------------------------
  // Resolution target: PR 7 (collapse list-item parallel paint model)
  // -----------------------------------------------------------------------

  describe('list-item skip-justify on all lines — Resolution target: PR 7 (collapse list-item parallel paint model)', () => {
    it('multi-line list-item produces zero wordSpacing on every line including non-last', () => {
      // 2-line list item with alignment: 'justify' and multi-word text
      const listLines = renderAndNormalize(listItemFixtures({ alignment: 'justify' }));

      expect(listLines.length).toBe(2);
      // ALL lines have no word-spacing — body/table-cell would justify non-last lines
      for (const line of listLines) {
        expect(line.wordSpacing).toBe('');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Resolution target: PR 5–7 (shared flow + list-item collapse)
  // -----------------------------------------------------------------------

  describe('three-way justify snapshot — Resolution target: PR 5–7 (shared flow + list-item collapse)', () => {
    it('body and table-cell justify non-last lines; list-item does not', () => {
      // Same logical paragraph (alignment: 'justify', 2 lines, multi-word text)
      const bodyLines = renderAndNormalize(bodyFixtures('justify'));
      const tableLines = renderAndNormalize(tableCellFixtures('justify'));
      const listLines = renderAndNormalize(listItemFixtures({ alignment: 'justify' }));

      expect(bodyLines.length).toBe(2);
      expect(tableLines.length).toBe(2);
      expect(listLines.length).toBe(2);

      // Parity: body and table-cell line 0 wordSpacing should match and be > 0
      expect(bodyLines[0]!.wordSpacing).not.toBe('');
      expect(bodyLines[0]!.wordSpacing).toBe(tableLines[0]!.wordSpacing);

      // Divergence: list-item line 0 wordSpacing is empty (no justify)
      expect(listLines[0]!.wordSpacing).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // Resolution target: PR 6 (migrate table-cell to shared flow)
  // -----------------------------------------------------------------------

  describe('table render errors propagate uncaught — Resolution target: PR 6 (migrate table-cell to shared flow)', () => {
    // The divergence: renderParagraphFragment has try/catch INSIDE its body,
    // but the table rendering chain (renderer.ts:renderTableFragment → renderTableFragmentElement
    // → renderTableCell → renderLine callback) does NOT have a catch wrapper.
    //
    // To test this properly, we spy on renderLine (called by both paths) and
    // force it to throw. The paragraph path's try/catch catches it; the table
    // path lets it propagate.

    const renderLineError = new Error('renderLine forced error');

    it('table path: renderLine error propagates as thrown exception', () => {
      vi.spyOn(DomPainter.prototype as any, 'renderLine').mockImplementation(() => {
        throw renderLineError;
      });

      const block: FlowBlock = {
        kind: 'table',
        id: 'table-err',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'p-err',
                    runs: [{ text: 'Cell text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 10 }],
                  },
                ],
                attrs: {},
              },
            ],
          },
        ],
      };
      const measure: Measure = {
        kind: 'table',
        rows: [
          {
            height: 24,
            cells: [
              {
                width: 120,
                height: 24,
                gridColumnStart: 0,
                blocks: [
                  {
                    kind: 'paragraph',
                    lines: [
                      {
                        fromRun: 0,
                        fromChar: 0,
                        toRun: 0,
                        toChar: 9,
                        width: 60,
                        ascent: 10,
                        descent: 4,
                        lineHeight: 16,
                      },
                    ],
                    totalHeight: 16,
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [120],
        totalWidth: 120,
        totalHeight: 24,
      };
      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              { kind: 'table', blockId: 'table-err', fromRow: 0, toRow: 1, x: 0, y: 0, width: 120, height: 24 },
            ],
          },
        ],
      };

      const container = document.createElement('div');
      const painter = createDomPainter({ blocks: [block], measures: [measure] });
      expect(() => painter.paint(layout, container)).toThrow('renderLine forced error');
    });

    it('body paragraph path: renderLine error is caught and does not propagate', () => {
      vi.spyOn(DomPainter.prototype as any, 'renderLine').mockImplementation(() => {
        throw renderLineError;
      });

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-err',
        runs: [{ text: 'Test text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 10 }],
      };
      const measure: Measure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 9, width: 60, ascent: 10, descent: 4, lineHeight: 16 }],
        totalHeight: 16,
      };
      const layout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-err',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 300,
                pmStart: 1,
                pmEnd: 10,
              },
            ],
          },
        ],
      };

      const container = document.createElement('div');
      const painter = createDomPainter({ blocks: [block], measures: [measure] });
      // Body path: try/catch in renderParagraphFragment catches the error
      expect(() => painter.paint(layout, container)).not.toThrow();
    });
  });
});
