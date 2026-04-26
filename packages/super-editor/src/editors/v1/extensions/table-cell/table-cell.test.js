import { describe, it, expect, beforeAll } from 'vitest';

import { TableCell } from './table-cell.js';

describe('TableCell', () => {
  let attributes;

  beforeAll(() => {
    attributes = TableCell.config.addAttributes.call(TableCell);
  });

  describe('background', () => {
    describe('parseDOM', () => {
      it('parses rgb() background to hex', () => {
        const td = document.createElement('td');
        td.style.backgroundColor = 'rgb(255, 255, 0)';
        expect(attributes.background.parseDOM(td)).toEqual({ color: 'ffff00' });
      });

      it('returns null when background is unset', () => {
        expect(attributes.background.parseDOM(document.createElement('td'))).toBeNull();
      });
    });

    describe('renderDOM', () => {
      it('omits style when background is absent', () => {
        expect(attributes.background.renderDOM({})).toEqual({});
        expect(attributes.background.renderDOM({ background: null })).toEqual({});
      });

      // renderDOM prefixes `#`; store channel hex without leading `#` to avoid `##` in CSS.
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
      const td = document.createElement('td');
      td.style.backgroundColor = 'rgb(255, 255, 0)';
      const parsed = attributes.background.parseDOM(td);
      const { style } = attributes.background.renderDOM({ background: parsed });
      expect(style).toBe('background-color: #ffff00');
    });
  });

  describe('verticalAlign', () => {
    describe('parseDOM', () => {
      it('maps middle to center', () => {
        const td = document.createElement('td');
        td.style.verticalAlign = 'middle';
        expect(attributes.verticalAlign.parseDOM(td)).toBe('center');
      });

      it('normalizes top and bottom', () => {
        const topTd = document.createElement('td');
        topTd.style.verticalAlign = 'TOP';
        expect(attributes.verticalAlign.parseDOM(topTd)).toBe('top');

        const bottomTd = document.createElement('td');
        bottomTd.style.verticalAlign = 'bottom';
        expect(attributes.verticalAlign.parseDOM(bottomTd)).toBe('bottom');
      });

      it('returns null when vertical-align is missing', () => {
        expect(attributes.verticalAlign.parseDOM(document.createElement('td'))).toBeNull();
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
        const td = document.createElement('td');
        td.style.padding = '5pt';
        expect(attributes.cellMargins.parseDOM(td)).toEqual({
          top: 7,
          right: 7,
          bottom: 7,
          left: 7,
        });
      });

      it('parses per-side padding', () => {
        const td = document.createElement('td');
        td.style.paddingTop = '5pt';
        td.style.paddingRight = '10pt';
        td.style.paddingBottom = '15pt';
        expect(attributes.cellMargins.parseDOM(td)).toEqual({
          top: 7,
          right: 13,
          bottom: 20,
        });
      });

      it('returns null when no padding is set', () => {
        expect(attributes.cellMargins.parseDOM(document.createElement('td'))).toBeNull();
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
        const td = document.createElement('td');
        td.style.border = '1px solid rgb(0, 0, 0)';
        expect(attributes.borders.parseDOM(td)).toEqual({
          top: { val: 'single', size: 1, color: '#000000', style: 'solid' },
          right: { val: 'single', size: 1, color: '#000000', style: 'solid' },
          bottom: { val: 'single', size: 1, color: '#000000', style: 'solid' },
          left: { val: 'single', size: 1, color: '#000000', style: 'solid' },
        });
      });

      it('uses per-side rules when they override shorthand', () => {
        const td = document.createElement('td');
        td.style.border = '1px solid rgb(0, 0, 0)';
        td.style.borderTop = '2px dashed rgb(255, 0, 0)';
        td.style.borderRight = '3px dotted rgb(0, 0, 255)';
        td.style.borderBottom = '4px double rgb(0, 128, 0)';
        expect(attributes.borders.parseDOM(td)).toEqual({
          top: { val: 'dashed', size: 2, color: '#ff0000', style: 'dashed' },
          right: { val: 'dotted', size: 3, color: '#0000ff', style: 'dotted' },
          bottom: { val: 'single', size: 4, color: '#008000', style: 'double' },
          left: { val: 'single', size: 1, color: '#000000', style: 'solid' },
        });
      });

      it('returns null when no border is set', () => {
        expect(attributes.borders.parseDOM(document.createElement('td'))).toBeNull();
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
