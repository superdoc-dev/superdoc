/**
 * Body-canonical parity contract tests.
 *
 * Rule: This file contains ONLY assertions that must match between body
 * and table-cell rendering. If a test reveals a difference, it belongs in
 * renderer-known-divergences.test.ts, not here.
 *
 * Comparison is at line level (both paths call renderLine). Fragment-level
 * DOM structure is intentionally different.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Measure, Layout, ParagraphMeasure, Line, Run } from '@superdoc/contracts';
import { normalizeLines, type NormalizedLine } from './test-utils/normalize-line.js';

// ---------------------------------------------------------------------------
// Shared fixture builders
// ---------------------------------------------------------------------------

/** Multi-word text for justify tests — multiple spaces so wordSpacing is non-zero. */
const JUSTIFY_TEXT = 'The quick brown fox jumps over';
const JUSTIFY_TEXT_LEN = JUSTIFY_TEXT.length;

/** Line width intentionally smaller than fragment width to force word-spacing. */
const LINE_WIDTH = 150;
const FRAGMENT_WIDTH = 300;

function makeRuns(
  text: string,
  overrides?: Partial<FlowBlock & { kind: 'paragraph' }>,
  runOverrides?: Record<string, unknown>,
) {
  return [{ text, fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 1 + text.length, ...runOverrides }];
}

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

/**
 * Create body paragraph block + measure + layout.
 */
function bodyFixtures(opts: {
  text?: string;
  runs?: Run[];
  attrs?: Record<string, unknown>;
  lines?: Line[];
  continuesOnNext?: boolean;
}) {
  const text = opts.text ?? 'Hello world';
  const runs = opts.runs ?? makeRuns(text);
  const lines = opts.lines ?? [makeLine(0, text.length)];

  const block: FlowBlock = {
    kind: 'paragraph',
    id: 'body-para',
    runs,
    ...(opts.attrs ? { attrs: opts.attrs } : {}),
  };

  const measure: Measure = {
    kind: 'paragraph',
    lines,
    totalHeight: lines.reduce((h, l) => h + l.lineHeight, 0),
  } as ParagraphMeasure;

  const layout: Layout = {
    pageSize: { w: 600, h: 800 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'para',
            blockId: 'body-para',
            fromLine: 0,
            toLine: lines.length,
            x: 30,
            y: 40,
            width: FRAGMENT_WIDTH,
            pmStart: 1,
            pmEnd: 1 + text.length,
            ...(opts.continuesOnNext != null ? { continuesOnNext: opts.continuesOnNext } : {}),
          },
        ],
      },
    ],
  };

  return { blocks: [block], measures: [measure], layout };
}

/**
 * Create table-cell paragraph with identical content.
 * The paragraph is nested inside a table cell.
 */
function tableCellFixtures(opts: { text?: string; runs?: Run[]; attrs?: Record<string, unknown>; lines?: Line[] }) {
  const text = opts.text ?? 'Hello world';
  const runs = opts.runs ?? makeRuns(text);
  const lines = opts.lines ?? [makeLine(0, text.length)];

  const block: FlowBlock = {
    kind: 'table',
    id: 'table-parity',
    rows: [
      {
        id: 'row-0',
        cells: [
          {
            id: 'cell-0',
            blocks: [
              {
                kind: 'paragraph',
                id: 'table-para',
                runs,
                ...(opts.attrs ? { attrs: opts.attrs } : {}),
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
        height: lines.reduce((h, l) => h + l.lineHeight, 0) + 8,
        cells: [
          {
            width: FRAGMENT_WIDTH,
            height: lines.reduce((h, l) => h + l.lineHeight, 0) + 8,
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
    totalHeight: lines.reduce((h, l) => h + l.lineHeight, 0) + 8,
  };

  const layout: Layout = {
    pageSize: { w: 600, h: 800 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'table',
            blockId: 'table-parity',
            fromRow: 0,
            toRow: 1,
            x: 30,
            y: 40,
            width: FRAGMENT_WIDTH,
            height: lines.reduce((h, l) => h + l.lineHeight, 0) + 8,
          },
        ],
      },
    ],
  };

  return { blocks: [block], measures: [measure], layout };
}

function renderAndNormalize(fixtures: { blocks: FlowBlock[]; measures: Measure[]; layout: Layout }): NormalizedLine[] {
  const container = document.createElement('div');
  const painter = createDomPainter({ blocks: fixtures.blocks, measures: fixtures.measures });
  painter.paint(fixtures.layout, container);
  return normalizeLines(container);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('body vs table-cell line-level parity', () => {
  describe('run style equivalence', () => {
    it('renders identical font properties for plain text', () => {
      const opts = { text: 'Hello world' };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));

      expect(bodyLines.length).toBeGreaterThan(0);
      expect(bodyLines.length).toBe(tableLines.length);
      for (let i = 0; i < bodyLines.length; i++) {
        expect(bodyLines[i]!.runs.length).toBe(tableLines[i]!.runs.length);
        for (let j = 0; j < bodyLines[i]!.runs.length; j++) {
          const bodyRun = bodyLines[i]!.runs[j]!;
          const tableRun = tableLines[i]!.runs[j]!;
          expect(bodyRun.text).toBe(tableRun.text);
          expect(bodyRun.fontFamily).toBe(tableRun.fontFamily);
          expect(bodyRun.fontSize).toBe(tableRun.fontSize);
        }
      }
    });

    it('renders identical bold/italic/underline/strike styles', () => {
      const runs = [
        {
          text: 'Bold italic',
          fontFamily: 'Arial',
          fontSize: 12,
          bold: true,
          italic: true,
          underline: { style: 'single' },
          strike: true,
          pmStart: 1,
          pmEnd: 12,
        },
      ];
      const opts = { text: 'Bold italic', runs };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));

      expect(bodyLines.length).toBe(tableLines.length);
      for (let i = 0; i < bodyLines.length; i++) {
        for (let j = 0; j < bodyLines[i]!.runs.length; j++) {
          const bodyRun = bodyLines[i]!.runs[j]!;
          const tableRun = tableLines[i]!.runs[j]!;
          expect(bodyRun.fontWeight).toBe(tableRun.fontWeight);
          expect(bodyRun.fontStyle).toBe(tableRun.fontStyle);
          expect(bodyRun.textDecoration).toBe(tableRun.textDecoration);
        }
      }
    });

    it('renders identical color and highlight styles', () => {
      const runs = [
        {
          text: 'Colored text',
          fontFamily: 'Arial',
          fontSize: 12,
          color: '#ff0000',
          highlight: '#ffff00',
          pmStart: 1,
          pmEnd: 13,
        },
      ];
      const opts = { text: 'Colored text', runs };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));

      expect(bodyLines.length).toBe(tableLines.length);
      for (let i = 0; i < bodyLines.length; i++) {
        for (let j = 0; j < bodyLines[i]!.runs.length; j++) {
          expect(bodyLines[i]!.runs[j]!.color).toBe(tableLines[i]!.runs[j]!.color);
          expect(bodyLines[i]!.runs[j]!.backgroundColor).toBe(tableLines[i]!.runs[j]!.backgroundColor);
        }
      }
    });

    it('renders identical link href/target/rel attributes', () => {
      const runs = [
        {
          text: 'Click here',
          fontFamily: 'Arial',
          fontSize: 12,
          pmStart: 1,
          pmEnd: 11,
          link: {
            version: 1 as const,
            href: 'https://example.com',
            target: '_blank' as const,
            rel: 'noopener',
          },
        },
      ];
      const opts = { text: 'Click here', runs };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));

      expect(bodyLines.length).toBe(tableLines.length);
      // Guard against vacuous pass: both paths must produce at least one run with an href
      expect(bodyLines[0]!.runs.length).toBeGreaterThan(0);
      expect(bodyLines[0]!.runs[0]!.href).toBe('https://example.com');
      for (let i = 0; i < bodyLines.length; i++) {
        expect(bodyLines[i]!.runs.length).toBe(tableLines[i]!.runs.length);
        for (let j = 0; j < bodyLines[i]!.runs.length; j++) {
          expect(bodyLines[i]!.runs[j]!.href).toBe(tableLines[i]!.runs[j]!.href);
          expect(bodyLines[i]!.runs[j]!.target).toBe(tableLines[i]!.runs[j]!.target);
          expect(bodyLines[i]!.runs[j]!.rel).toBe(tableLines[i]!.runs[j]!.rel);
        }
      }
    });
  });

  describe('justify last-line matrix — body vs table-cell must match', () => {
    // All justify tests use multi-word text with line.width < fragment.width
    // so wordSpacing is forced non-zero when justify is active.

    it('single-line justify paragraph: last line skips justify in both', () => {
      const opts = {
        text: JUSTIFY_TEXT,
        attrs: { alignment: 'justify' },
        lines: [makeLine(0, JUSTIFY_TEXT_LEN)],
      };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));

      expect(bodyLines.length).toBe(1);
      expect(tableLines.length).toBe(1);
      // Single line = last line → no justify
      expect(bodyLines[0]!.wordSpacing).toBe('');
      expect(tableLines[0]!.wordSpacing).toBe('');
    });

    it('multi-line justify paragraph: non-last lines justified identically', () => {
      const halfLen = Math.floor(JUSTIFY_TEXT_LEN / 2);
      const lines = [makeLine(0, halfLen), makeLine(halfLen, JUSTIFY_TEXT_LEN)];
      const opts = {
        text: JUSTIFY_TEXT,
        attrs: { alignment: 'justify' },
        lines,
      };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));

      expect(bodyLines.length).toBe(2);
      expect(tableLines.length).toBe(2);
      // Non-last line should be justified with matching wordSpacing
      expect(bodyLines[0]!.wordSpacing).not.toBe('');
      expect(tableLines[0]!.wordSpacing).not.toBe('');
      expect(bodyLines[0]!.wordSpacing).toBe(tableLines[0]!.wordSpacing);
    });

    it('multi-line justify paragraph: last line skips justify in both', () => {
      const halfLen = Math.floor(JUSTIFY_TEXT_LEN / 2);
      const lines = [makeLine(0, halfLen), makeLine(halfLen, JUSTIFY_TEXT_LEN)];
      const opts = {
        text: JUSTIFY_TEXT,
        attrs: { alignment: 'justify' },
        lines,
      };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));

      // Last line → no justify in both
      expect(bodyLines[1]!.wordSpacing).toBe('');
      expect(tableLines[1]!.wordSpacing).toBe('');
    });

    it('lineBreak-ending justify paragraph: last line justified in both', () => {
      const runs = [
        { text: JUSTIFY_TEXT, fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 1 + JUSTIFY_TEXT_LEN },
        { kind: 'lineBreak' as const, pmStart: 1 + JUSTIFY_TEXT_LEN, pmEnd: 2 + JUSTIFY_TEXT_LEN },
      ];
      const halfLen = Math.floor(JUSTIFY_TEXT_LEN / 2);
      const lines = [makeLine(0, halfLen), makeLine(halfLen, JUSTIFY_TEXT_LEN)];
      const opts = {
        text: JUSTIFY_TEXT,
        runs,
        attrs: { alignment: 'justify' },
        lines,
      };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));

      expect(bodyLines.length).toBe(2);
      expect(tableLines.length).toBe(2);
      // lineBreak ending means last line IS justified
      expect(bodyLines[1]!.wordSpacing).not.toBe('');
      expect(tableLines[1]!.wordSpacing).not.toBe('');
      expect(bodyLines[1]!.wordSpacing).toBe(tableLines[1]!.wordSpacing);
    });
  });

  describe('continuation fragment justify (body-only baseline)', () => {
    it('body continuation fragment: all lines justified when continuesOnNext=true', () => {
      // Body-only: fragment with continuesOnNext=true, alignment: 'justify'
      // NOT a cross-context parity assertion. Table-cell uses isLastLine (passed by
      // table cell renderer) instead of fragment.continuesOnNext, so multi-fragment
      // continuation is not directly comparable between contexts.
      const halfLen = Math.floor(JUSTIFY_TEXT_LEN / 2);
      const lines = [makeLine(0, halfLen), makeLine(halfLen, JUSTIFY_TEXT_LEN)];
      const opts = {
        text: JUSTIFY_TEXT,
        attrs: { alignment: 'justify' },
        lines,
        continuesOnNext: true,
      };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));

      expect(bodyLines.length).toBe(2);
      // When continuesOnNext=true, even the last line of this fragment is justified
      expect(bodyLines[0]!.wordSpacing).not.toBe('');
      expect(bodyLines[1]!.wordSpacing).not.toBe('');
    });
  });

  describe('paragraph alignment pass-through', () => {
    it('center alignment renders identically', () => {
      const opts = { text: 'Centered text', attrs: { alignment: 'center' } };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));
      expect(bodyLines[0]!.textAlign).toBe('center');
      expect(tableLines[0]!.textAlign).toBe('center');
    });

    it('right alignment renders identically', () => {
      const opts = { text: 'Right-aligned text', attrs: { alignment: 'right' } };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));
      expect(bodyLines[0]!.textAlign).toBe('right');
      expect(tableLines[0]!.textAlign).toBe('right');
    });

    it('left alignment renders identically', () => {
      const opts = { text: 'Left-aligned text', attrs: { alignment: 'left' } };
      const bodyLines = renderAndNormalize(bodyFixtures(opts));
      const tableLines = renderAndNormalize(tableCellFixtures(opts));
      expect(bodyLines[0]!.textAlign).toBe('left');
      expect(tableLines[0]!.textAlign).toBe('left');
    });
  });
});
