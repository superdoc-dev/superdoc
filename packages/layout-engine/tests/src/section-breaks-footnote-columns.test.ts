/**
 * `w15:footnoteColumns` reaches the section model
 *
 * A section's footnote band has its own column count, in the Word 2012 extension namespace and
 * independent of `w:cols`. The value the field takes in practice is `1` under a multi-column body:
 * Word prints one note strip across the whole content area, and the band layout the engine derives
 * from it (`resolveFootnoteBandColumns`) is only reachable if the read happens at all — an element
 * nobody parses reads exactly like Word's default.
 *
 * The fixture is the sectPr set of a real Hebrew document that surfaced this: a single-column
 * opening section, a two-column `continuous` section, a single-column `continuous` close, `w:bidi`
 * throughout, and `<w15:footnoteColumns w:val="1"/>` on all three.
 *
 * @module section-breaks-footnote-columns.test
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { resolveFootnoteBandColumns, resolveFootnoteColumnCount } from '@superdoc/contracts';
import {
  createPMDocWithSections,
  pmToFlowBlocks,
  getSectionBreaks,
  resetBlockIdCounter,
  type TestSectionProps,
} from './test-helpers/section-test-utils.js';

// A4 at 96dpi. The gutter is a whole number of px because the fixture round-trips through twips,
// which the reader rounds back to whole px.
const A4 = { w: 794, h: 1123 };
const GAP = 48;

const SINGLE_COLUMN: TestSectionProps = {
  pageSize: A4,
  columns: { count: 1, gap: GAP },
  bidi: true,
  footnoteColumns: 1,
};

const TWO_COLUMN_CONTINUOUS: TestSectionProps = {
  type: 'continuous',
  pageSize: A4,
  columns: { count: 2, gap: GAP },
  bidi: true,
  footnoteColumns: 1,
};

describe('Section Breaks - footnote band columns', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  it('carries w15:footnoteColumns from every sectPr onto its section break', () => {
    const pmDoc = createPMDocWithSections(
      [
        { paragraphs: ['Opening, single column'], props: SINGLE_COLUMN },
        { paragraphs: ['Body, two columns'], props: TWO_COLUMN_CONTINUOUS },
        { paragraphs: ['Close, single column'] },
      ],
      { ...SINGLE_COLUMN, type: 'continuous' },
    );

    const breaks = getSectionBreaks(pmToFlowBlocks(pmDoc).blocks);

    expect(breaks).toHaveLength(3);
    expect(breaks.map((sectionBreak) => sectionBreak.footnoteColumns)).toEqual([1, 1, 1]);
    // The body columns are untouched by the note-band property.
    expect(breaks.map((sectionBreak) => sectionBreak.columns?.count)).toEqual([1, 2, 1]);
    expect(breaks.every((sectionBreak) => sectionBreak.columns?.direction === 'rtl')).toBe(true);
  });

  it('resolves the two-column section to a single full-width note band', () => {
    const pmDoc = createPMDocWithSections(
      [
        { paragraphs: ['Opening, single column'], props: SINGLE_COLUMN },
        { paragraphs: ['Body, two columns'], props: TWO_COLUMN_CONTINUOUS },
        { paragraphs: ['Close, single column'] },
      ],
      { ...SINGLE_COLUMN, type: 'continuous' },
    );

    const breaks = getSectionBreaks(pmToFlowBlocks(pmDoc).blocks);
    const twoColumnSection = breaks[1];

    expect(resolveFootnoteColumnCount(twoColumnSection.columns, twoColumnSection.footnoteColumns)).toBe(1);
    // One column, the body's gutter, the body's fill direction — the band spans the content area
    // rather than a 253px body column of it.
    expect(resolveFootnoteBandColumns(twoColumnSection.columns, twoColumnSection.footnoteColumns)).toEqual({
      count: 1,
      gap: GAP,
      direction: 'rtl',
    });
  });

  it('omits the property when the sectPr does not declare it', () => {
    const pmDoc = createPMDocWithSections([{ paragraphs: ['Only section'] }], {
      pageSize: A4,
      columns: { count: 2, gap: GAP },
    });

    const [sectionBreak] = getSectionBreaks(pmToFlowBlocks(pmDoc).blocks);

    expect(sectionBreak.footnoteColumns).toBeUndefined();
    // Absent means "match the body", so the band stays the body's two columns.
    expect(resolveFootnoteColumnCount(sectionBreak.columns, sectionBreak.footnoteColumns)).toBe(2);
  });

  it('reads the schema default 0 as "match the body"', () => {
    const pmDoc = createPMDocWithSections([{ paragraphs: ['Only section'] }], {
      pageSize: A4,
      columns: { count: 2, gap: GAP },
      footnoteColumns: 0,
    });

    const [sectionBreak] = getSectionBreaks(pmToFlowBlocks(pmDoc).blocks);

    expect(sectionBreak.footnoteColumns).toBe(0);
    expect(resolveFootnoteColumnCount(sectionBreak.columns, sectionBreak.footnoteColumns)).toBe(2);
  });
});
