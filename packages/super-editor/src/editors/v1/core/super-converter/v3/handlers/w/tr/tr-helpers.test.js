import { describe, expect, it } from 'vitest';
import { advancePastRowSpans, createPlaceholderCell, fillPlaceholderColumns, isPlaceholderCell } from './tr-helpers.js';

const makeCell = (overrides = {}) => ({
  type: 'tableCell',
  attrs: {
    colspan: 1,
    rowspan: 1,
    colwidth: [100],
    ...overrides.attrs,
  },
  content: [{ type: 'paragraph', content: [] }],
});

describe('tr helpers', () => {
  describe('createPlaceholderCell', () => {
    it('creates a placeholder with neutral borders and reason tag', () => {
      const placeholder = createPlaceholderCell(120, 'gridBefore');

      expect(placeholder.type).toBe('tableCell');
      expect(placeholder.attrs.__placeholder).toBe('gridBefore');
      expect(placeholder.attrs.colwidth).toEqual([120]);
      expect(placeholder.attrs.borders.top).toEqual({ val: 'none', size: 0 });
      expect(placeholder.content).toHaveLength(1);
    });

    it('normalizes non-numeric widths to zero', () => {
      const placeholder = createPlaceholderCell('not-a-number', 'gridAfter');
      expect(placeholder.attrs.colwidth).toEqual([0]);
    });
  });

  describe('advancePastRowSpans', () => {
    it('consumes row span counters while advancing index', () => {
      const spans = [0, 2, 1, 0];
      const nextIndex = advancePastRowSpans(spans, 1, 4);

      expect(nextIndex).toBe(3);
      expect(spans).toEqual([0, 1, 0, 0]);
    });

    it('stops at totalColumns even when spans remain', () => {
      const spans = [1, 1];
      const nextIndex = advancePastRowSpans(spans, 0, 1);

      expect(nextIndex).toBe(1);
      expect(spans).toEqual([0, 1]);
    });
  });

  describe('fillPlaceholderColumns', () => {
    it('fills gaps with placeholders while respecting spans', () => {
      const content = [];
      const spans = [0, 1, 0, 0];

      const nextIndex = fillPlaceholderColumns({
        content,
        pendingRowSpans: spans,
        currentIndex: 0,
        targetIndex: 4,
        totalColumns: 4,
        gridColumnWidths: [50, 60, 70, 80],
        reason: 'gridBefore',
      });

      expect(nextIndex).toBe(4);
      expect(content).toHaveLength(3);
      expect(content.map((cell) => cell.attrs.colwidth[0])).toEqual([50, 70, 80]);
      expect(spans).toEqual([0, 0, 0, 0]);
    });

    it('respects totalColumns even if target is larger', () => {
      const result = fillPlaceholderColumns({
        content: [],
        pendingRowSpans: [0, 0],
        currentIndex: 0,
        targetIndex: 5,
        totalColumns: 2,
        gridColumnWidths: [100, 200],
        reason: 'gridAfter',
      });

      expect(result).toBe(2);
    });
  });

  describe('isPlaceholderCell', () => {
    it('detects explicit placeholder markers', () => {
      expect(isPlaceholderCell(makeCell({ attrs: { __placeholder: 'gridBefore' } }))).toBe(true);
    });

    it('treats zero-width cells as placeholders', () => {
      expect(isPlaceholderCell(makeCell({ attrs: { colwidth: [0] } }))).toBe(true);
      expect(isPlaceholderCell(makeCell({ attrs: { colwidth: [0.4, 0] } }))).toBe(true);
    });

    it('identifies real cells with meaningful width', () => {
      expect(isPlaceholderCell(makeCell({ attrs: { colwidth: [32] } }))).toBe(false);
    });

    it('returns false for null or undefined inputs', () => {
      expect(isPlaceholderCell()).toBe(false);
    });
  });
});
