import { describe, expect, it } from 'vite-plus/test';
import type { ParagraphAttrs } from './index.js';
import { resolveFootnoteSeparatorX } from './footnote-separator-placement.js';

const COLUMN_X = 120;
const COLUMN_WIDTH = 554;
const SEPARATOR_WIDTH = COLUMN_WIDTH / 2;

const attrs = (overrides: ParagraphAttrs): ParagraphAttrs => overrides;

const rtl = attrs({ directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } });
const ltr = attrs({ directionContext: { inlineDirection: 'ltr', writingMode: 'horizontal-tb' } });

const separatorX = (paragraph?: ParagraphAttrs, separatorWidth = SEPARATOR_WIDTH): number =>
  resolveFootnoteSeparatorX({
    columnX: COLUMN_X,
    columnWidth: COLUMN_WIDTH,
    separatorWidth,
    attrs: paragraph,
  });

describe('footnote separator placement', () => {
  it('keeps the LTR start edge when nothing is known about the separator paragraph', () => {
    // No evidence is not the same as LTR evidence, but it has to render somewhere, and the start
    // edge of an LTR paragraph is what the engine has always drawn.
    expect(separatorX(undefined)).toBe(COLUMN_X);
  });

  it('draws from the right edge when the separator paragraph resolves RTL', () => {
    expect(separatorX(rtl)).toBe(COLUMN_X + COLUMN_WIDTH - SEPARATOR_WIDTH);
  });

  it('draws from the left edge when the separator paragraph resolves LTR', () => {
    expect(separatorX(ltr)).toBe(COLUMN_X);
  });

  it('does not consult anything but the separator paragraph', () => {
    // The regression this guards: a Hebrew SECTION whose separator paragraph is LTR. Word draws the
    // mark on the left there, and a fix keyed on the section's `w:bidi` would put it on the right.
    // Nothing about the section reaches this function — the inputs are the note column's own
    // geometry and that one paragraph — so the case cannot regress by construction.
    expect(separatorX(ltr)).toBe(COLUMN_X);
    expect(separatorX(rtl)).toBe(COLUMN_X + COLUMN_WIDTH - SEPARATOR_WIDTH);
  });

  describe('w:jc', () => {
    it('treats an explicit left or right as physical, whatever the direction', () => {
      expect(separatorX({ ...rtl, alignment: 'left' })).toBe(COLUMN_X);
      expect(separatorX({ ...ltr, alignment: 'right' })).toBe(COLUMN_X + COLUMN_WIDTH - SEPARATOR_WIDTH);
    });

    it('centers on center', () => {
      expect(separatorX({ ...rtl, alignment: 'center' })).toBe(COLUMN_X + (COLUMN_WIDTH - SEPARATOR_WIDTH) / 2);
      expect(separatorX({ ...ltr, alignment: 'center' })).toBe(COLUMN_X + (COLUMN_WIDTH - SEPARATOR_WIDTH) / 2);
    });

    it('resolves justify to the start edge, which is the right in an RTL paragraph', () => {
      // The separator paragraph's single line is also its last, and justification never stretches a
      // last line — the real document that surfaced this carries `w:jc w:val="both"` from docDefaults.
      expect(separatorX({ ...rtl, alignment: 'justify' })).toBe(COLUMN_X + COLUMN_WIDTH - SEPARATOR_WIDTH);
      expect(separatorX({ ...ltr, alignment: 'justify' })).toBe(COLUMN_X);
    });
  });

  describe('w:ind', () => {
    it('narrows the extent the mark is aligned in', () => {
      expect(separatorX({ ...ltr, indent: { left: 40 } })).toBe(COLUMN_X + 40);
      expect(separatorX({ ...rtl, indent: { right: 40 } })).toBe(COLUMN_X + COLUMN_WIDTH - 40 - SEPARATOR_WIDTH);
    });

    it('applies both indents to the extent, not just the aligned edge', () => {
      expect(separatorX({ ...rtl, indent: { left: 30, right: 40 } })).toBe(
        COLUMN_X + COLUMN_WIDTH - 40 - SEPARATOR_WIDTH,
      );
      expect(separatorX({ ...ltr, indent: { left: 30, right: 40 } })).toBe(COLUMN_X + 30);
      expect(separatorX({ ...rtl, alignment: 'center', indent: { left: 30, right: 40 } })).toBe(
        COLUMN_X + 30 + (COLUMN_WIDTH - 70 - SEPARATOR_WIDTH) / 2,
      );
    });

    it('ignores a negative indent rather than pushing the mark out of the column', () => {
      expect(separatorX({ ...ltr, indent: { left: -40 } })).toBe(COLUMN_X);
    });

    it('falls back to the column edge when the indents leave no extent', () => {
      expect(separatorX({ ...rtl, indent: { left: 400, right: 400 } })).toBe(COLUMN_X);
    });
  });

  it('starts a mark that fills or overflows the extent at the extent start', () => {
    // The continuation separator spans the full text extent, so there is no slack to align in.
    expect(separatorX(rtl, COLUMN_WIDTH)).toBe(COLUMN_X);
    expect(separatorX(rtl, COLUMN_WIDTH * 2)).toBe(COLUMN_X);
    expect(separatorX({ ...rtl, indent: { left: 20 } }, COLUMN_WIDTH)).toBe(COLUMN_X + 20);
  });
});
