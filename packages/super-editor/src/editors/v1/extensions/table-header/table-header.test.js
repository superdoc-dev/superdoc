import { describe, it, expect, beforeAll } from 'vitest';

import { TableHeader } from './table-header.js';

/**
 * `tableHeader` uses the same DOM attribute specs as `tableCell` for presentation;
 * parse rules run on `<th>` (e.g. Google Docs header rows).
 */
describe('TableHeader', () => {
  let attributes;

  beforeAll(() => {
    attributes = TableHeader.config.addAttributes.call(TableHeader);
  });

  describe('background', () => {
    describe('parseDOM', () => {
      it('parses rgb() background to hex', () => {
        const th = document.createElement('th');
        th.style.backgroundColor = 'rgb(255, 255, 0)';
        expect(attributes.background.parseDOM(th)).toEqual({ color: 'ffff00' });
      });

      it('returns null when background is unset', () => {
        expect(attributes.background.parseDOM(document.createElement('th'))).toBeNull();
      });
    });

    describe('renderDOM', () => {
      it('omits style when background is absent', () => {
        expect(attributes.background.renderDOM({})).toEqual({});
        expect(attributes.background.renderDOM({ background: null })).toEqual({});
      });

      it('renders background-color for hex digits without leading #', () => {
        expect(attributes.background.renderDOM({ background: { color: 'ffff00' } })).toEqual({
          style: 'background-color: #ffff00',
        });
      });

      it('uses transparent when color is missing on background object', () => {
        expect(attributes.background.renderDOM({ background: {} })).toEqual({
          style: 'background-color: transparent',
        });
      });
    });

    it('parseDOM → renderDOM round-trips to valid CSS', () => {
      const th = document.createElement('th');
      th.style.backgroundColor = 'rgb(255, 255, 0)';
      const parsed = attributes.background.parseDOM(th);
      const { style } = attributes.background.renderDOM({ background: parsed });
      expect(style).toBe('background-color: #ffff00');
    });
  });

  describe('verticalAlign', () => {
    describe('parseDOM', () => {
      it('maps middle to center', () => {
        const th = document.createElement('th');
        th.style.verticalAlign = 'middle';
        expect(attributes.verticalAlign.parseDOM(th)).toBe('center');
      });

      it('normalizes top and bottom', () => {
        const topTh = document.createElement('th');
        topTh.style.verticalAlign = 'TOP';
        expect(attributes.verticalAlign.parseDOM(topTh)).toBe('top');

        const bottomTh = document.createElement('th');
        bottomTh.style.verticalAlign = 'bottom';
        expect(attributes.verticalAlign.parseDOM(bottomTh)).toBe('bottom');
      });

      it('returns null when vertical-align is missing', () => {
        expect(attributes.verticalAlign.parseDOM(document.createElement('th'))).toBeNull();
      });
    });

    describe('renderDOM', () => {
      it('omits style when verticalAlign is unset', () => {
        expect(attributes.verticalAlign.renderDOM({})).toEqual({});
        expect(attributes.verticalAlign.renderDOM({ verticalAlign: null })).toEqual({});
      });

      it('emits vertical-align CSS', () => {
        expect(attributes.verticalAlign.renderDOM({ verticalAlign: 'bottom' })).toEqual({
          style: 'vertical-align: bottom',
        });
      });
    });
  });

  describe('cellMargins', () => {
    describe('parseDOM', () => {
      it('parses uniform padding in pt', () => {
        const th = document.createElement('th');
        th.style.padding = '5pt';
        expect(attributes.cellMargins.parseDOM(th)).toEqual({
          top: 7,
          right: 7,
          bottom: 7,
          left: 7,
        });
      });

      it('parses per-side padding', () => {
        const th = document.createElement('th');
        th.style.paddingTop = '5pt';
        th.style.paddingRight = '10pt';
        th.style.paddingBottom = '15pt';
        expect(attributes.cellMargins.parseDOM(th)).toEqual({
          top: 7,
          right: 13,
          bottom: 20,
        });
      });

      it('returns null when no padding is set', () => {
        expect(attributes.cellMargins.parseDOM(document.createElement('th'))).toBeNull();
      });
    });

    describe('renderDOM', () => {
      it('returns {} when cellMargins is absent', () => {
        expect(attributes.cellMargins.renderDOM({})).toEqual({});
      });

      it('subtracts non-none border width from padding', () => {
        const result = attributes.cellMargins.renderDOM({
          cellMargins: { top: 12, right: 8 },
          borders: {
            top: { val: 'single', size: 3, color: '#000', style: 'solid' },
            right: { val: 'none', size: 0, color: 'auto', style: 'none' },
          },
        });
        expect(result.style).toContain('padding-top: 9px');
        expect(result.style).toContain('padding-right: 8px');
      });
    });
  });

  describe('borders', () => {
    describe('parseDOM', () => {
      it('applies shorthand border to all sides', () => {
        const th = document.createElement('th');
        th.style.border = '1px solid rgb(0, 0, 0)';
        expect(attributes.borders.parseDOM(th)).toEqual({
          top: { val: 'single', size: 1, color: '#000000', style: 'solid' },
          right: { val: 'single', size: 1, color: '#000000', style: 'solid' },
          bottom: { val: 'single', size: 1, color: '#000000', style: 'solid' },
          left: { val: 'single', size: 1, color: '#000000', style: 'solid' },
        });
      });

      it('uses per-side rules when they override shorthand', () => {
        const th = document.createElement('th');
        th.style.border = '1px solid rgb(0, 0, 0)';
        th.style.borderTop = '2px dashed rgb(255, 0, 0)';
        th.style.borderRight = '3px dotted rgb(0, 0, 255)';
        th.style.borderBottom = '4px double rgb(0, 128, 0)';
        expect(attributes.borders.parseDOM(th)).toEqual({
          top: { val: 'dashed', size: 2, color: '#ff0000', style: 'dashed' },
          right: { val: 'dotted', size: 3, color: '#0000ff', style: 'dotted' },
          bottom: { val: 'single', size: 4, color: '#008000', style: 'double' },
          left: { val: 'single', size: 1, color: '#000000', style: 'solid' },
        });
      });

      it('returns null when no border is set', () => {
        expect(attributes.borders.parseDOM(document.createElement('th'))).toBeNull();
      });
    });

    describe('renderDOM', () => {
      it('returns {} when borders are absent', () => {
        expect(attributes.borders.renderDOM({})).toEqual({});
      });

      it('delegates to renderCellBorderStyle (solid px, auto → black)', () => {
        const result = attributes.borders.renderDOM({
          borders: {
            top: { val: 'single', size: 1, color: 'auto', style: 'solid' },
          },
        });
        expect(result.style).toContain('border-top: 1px solid black');
      });

      it('renders border none without width', () => {
        const result = attributes.borders.renderDOM({
          borders: {
            top: { val: 'none', size: 0, color: 'auto', style: 'none' },
          },
        });
        expect(result.style).toContain('border-top: none');
      });
    });
  });
});
