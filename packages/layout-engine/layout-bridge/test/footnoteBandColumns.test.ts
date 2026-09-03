/**
 * The footnote band's own geometry: its column count (`w15:footnoteColumns`), and the placement of
 * the separator mark inside it. Both are independent of the body's `w:cols`, and the separator is
 * independent of the section's `w:bidi` as well.
 *
 * Word's default is "match the body", and every test that omits the property covers that. The
 * authored value that matters is `1` under a multi-column body: Word lays the notes out as ONE
 * strip across the whole content area, while the engine used to reuse the body's column geometry
 * for the band and print a note strip one body column wide, tucked under a single column.
 *
 * Two independent defects came out of that reuse, and both are covered here:
 *  - placement: the band's x/width, its reference-to-stack grouping, and the reserve that keeps it
 *    inside the bottom margin all came from the body's columns;
 *  - measurement: the single note measurement width was the narrowest BODY column anywhere in the
 *    document, so one two-column section in the middle narrowed the notes of every single-column
 *    section too.
 *
 * The separator suite covers a third, orthogonal defect: the short rule above the band was pinned to
 * the note column's left edge. It is a `<w:separator/>` RUN in its own paragraph in footnotes.xml,
 * so it belongs at THAT paragraph's start edge — and a Hebrew section can carry an LTR separator
 * paragraph, or the reverse, so the section's direction is not evidence about it either way.
 *
 * @module footnoteBandColumns.test
 */

import { describe, it, expect, vi } from 'vite-plus/test';
import type { FlowBlock, Measure, ParagraphAttrs, SectionBreakBlock } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

/** CSS px per twip at 96dpi, so the fixtures can be written in the units the docx carries. */
const px = (twips: number): number => (twips * 96) / 1440;

// Geometry of the reported document: A4, 1800tw side margins, a 708tw column gutter.
const PAGE_SIZE = { w: px(11906), h: px(16838) };
const MARGINS = { top: px(1440), right: px(1800), bottom: px(1440), left: px(1800) };
const GAP = px(708);
const CONTENT_WIDTH = PAGE_SIZE.w - MARGINS.left - MARGINS.right;
const BODY_COLUMN_WIDTH = (CONTENT_WIDTH - GAP) / 2;

const NOTE_LINE_HEIGHT = 10;
const BODY_LINE_HEIGHT = 18;

const paragraph = (id: string, text: string, pmStart: number): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart, pmEnd: pmStart + text.length }],
});

const measure = (lineHeight: number, textLength: number, lines = 1): Measure => ({
  kind: 'paragraph',
  lines: Array.from({ length: lines }, () => ({
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: textLength,
    width: 200,
    ascent: lineHeight * 0.8,
    descent: lineHeight * 0.2,
    lineHeight,
  })),
  totalHeight: lineHeight * lines,
});

type NoteFragment = {
  blockId: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  columnIndex?: number;
};

/**
 * Note text is content-hashed into the shared measure cache, so two layouts in this file that ask
 * for the same note at the same width would reuse the first one's measure — and with it the first
 * one's LINE COUNT. Each harness run stamps its own token into the text to stay independent.
 */
let harnessRun = 0;

type Harness = {
  fragments: NoteFragment[];
  /** `maxWidth` each note block was measured at, by block id. */
  noteMeasurementWidths: Map<string, number>;
  pageBottomLimit: number;
};

const isNoteBlockId = (blockId: string): boolean => blockId.startsWith('footnote-');

/**
 * Lay out `blocks` with `noteHeights[id]` lines of note body per reference and read back the note
 * plane: the painted band fragments, and the width each note was measured at.
 */
const layoutWithNotes = async (
  blocks: FlowBlock[],
  refs: Array<{ id: string; pos: number }>,
  options: {
    columns?: SectionBreakBlock['columns'];
    footnoteColumns?: number;
    noteLines?: number;
    separatorParagraph?: ParagraphAttrs;
  } = {},
): Promise<Harness> => {
  const noteLines = options.noteLines ?? 1;
  const runToken = `run-${(harnessRun += 1)}`;
  const noteMeasurementWidths = new Map<string, number>();

  const measureBlock = vi.fn(async (block: FlowBlock, constraints?: { maxWidth: number; maxHeight: number }) => {
    if (block.kind === 'columnBreak') return { kind: 'columnBreak' } as Measure;
    if (block.kind === 'sectionBreak') return { kind: 'sectionBreak' } as Measure;
    const textLength = block.kind === 'paragraph' ? (block.runs?.[0]?.text?.length ?? 1) : 1;
    if (isNoteBlockId(block.id)) {
      if (constraints) noteMeasurementWidths.set(block.id, constraints.maxWidth);
      return measure(NOTE_LINE_HEIGHT, textLength, noteLines);
    }
    return measure(BODY_LINE_HEIGHT, textLength);
  });

  const result = await incrementalLayout(
    [],
    null,
    blocks,
    {
      pageSize: PAGE_SIZE,
      margins: MARGINS,
      ...(options.columns ? { columns: options.columns } : {}),
      ...(options.footnoteColumns !== undefined ? { footnoteColumns: options.footnoteColumns } : {}),
      footnotes: {
        refs,
        ...(options.separatorParagraph ? { separatorParagraph: options.separatorParagraph } : {}),
        blocksById: new Map(
          refs.map((ref) => [ref.id, [paragraph(`footnote-${ref.id}-0-paragraph`, `Note ${ref.id} ${runToken}`, 0)]]),
        ),
      },
    },
    measureBlock,
  );

  const page = result.layout.pages[0];
  const fragments = page.fragments
    .filter((fragment) => isNoteBlockId(String((fragment as { blockId?: string }).blockId ?? '')))
    .map((fragment) => ({
      blockId: (fragment as { blockId: string }).blockId,
      kind: fragment.kind,
      x: fragment.x,
      y: fragment.y,
      width: (fragment as { width?: number }).width ?? 0,
      columnIndex: (fragment as { columnIndex?: number }).columnIndex,
    }));

  // `page.margins.bottom` carries the reserve the body yielded; the band must still end above the
  // section's own bottom margin.
  return { fragments, noteMeasurementWidths, pageBottomLimit: PAGE_SIZE.h - MARGINS.bottom };
};

const twoColumnRtlBody = (refs: Array<{ id: string; pos: number }>) => ({
  blocks: [
    paragraph('para-1', 'Column one text', 0),
    { kind: 'columnBreak', id: 'cb-1' } as FlowBlock,
    paragraph('para-2', 'Column two text', 40),
  ],
  refs,
});

const REFS = [
  { id: '1', pos: 2 },
  { id: '2', pos: 42 },
];

const noteBody = (harness: Harness, id: string): NoteFragment => {
  const fragment = harness.fragments.find((entry) => entry.blockId === `footnote-${id}-0-paragraph`);
  if (!fragment) throw new Error(`note ${id} was not painted`);
  return fragment;
};

describe('footnote band columns (w15:footnoteColumns)', () => {
  describe('placement', () => {
    it('prints one band across the content area when a two-column RTL section declares 1', async () => {
      const { blocks, refs } = twoColumnRtlBody(REFS);
      const harness = await layoutWithNotes(blocks, refs, {
        columns: { count: 2, gap: GAP, direction: 'rtl' },
        footnoteColumns: 1,
      });

      const first = noteBody(harness, '1');
      const second = noteBody(harness, '2');

      // Both notes sit in the one band stack, at the content area's left edge and its full width —
      // not in the two body-column-wide strips the band used to reuse.
      for (const note of [first, second]) {
        expect(note.x).toBeCloseTo(MARGINS.left, 4);
        expect(note.width).toBeCloseTo(CONTENT_WIDTH, 4);
        expect(note.columnIndex).toBe(0);
      }
      // A merged stack keeps note order: the reference in the right (first) column is numbered
      // before the one in the left column, so its note is printed above it.
      expect(first.y).toBeLessThan(second.y);

      const separators = harness.fragments.filter((fragment) => fragment.kind === 'drawing');
      expect(separators).toHaveLength(1);
      expect(separators[0].x).toBeCloseTo(MARGINS.left, 4);
    });

    it('keeps one band per body column when the section declares nothing', async () => {
      const { blocks, refs } = twoColumnRtlBody(REFS);
      const harness = await layoutWithNotes(blocks, refs, { columns: { count: 2, gap: GAP, direction: 'rtl' } });

      const first = noteBody(harness, '1');
      const second = noteBody(harness, '2');

      expect(first.width).toBeCloseTo(BODY_COLUMN_WIDTH, 4);
      expect(second.width).toBeCloseTo(BODY_COLUMN_WIDTH, 4);
      // RTL: the first column, and so the first note, is the RIGHT one.
      expect(first.x).toBeGreaterThan(second.x);
      expect(second.x).toBeCloseTo(MARGINS.left, 4);
      expect(harness.fragments.filter((fragment) => fragment.kind === 'drawing')).toHaveLength(2);
    });

    it('treats the schema default 0 as "match the body"', async () => {
      const { blocks, refs } = twoColumnRtlBody(REFS);
      const harness = await layoutWithNotes(blocks, refs, {
        columns: { count: 2, gap: GAP, direction: 'rtl' },
        footnoteColumns: 0,
      });

      expect(noteBody(harness, '1').width).toBeCloseTo(BODY_COLUMN_WIDTH, 4);
      expect(noteBody(harness, '2').width).toBeCloseTo(BODY_COLUMN_WIDTH, 4);
    });

    it('reserves for the merged stack, so a tall band still ends above the bottom margin', async () => {
      // The reserve is the tallest band stack. A merged band has ONE stack holding both notes, so a
      // reserve still taken from the two body-column stacks (their max, not their sum) would let the
      // band run past the page's bottom margin.
      const { blocks, refs } = twoColumnRtlBody(REFS);
      const harness = await layoutWithNotes(blocks, refs, {
        columns: { count: 2, gap: GAP, direction: 'rtl' },
        footnoteColumns: 1,
        noteLines: 20,
      });

      const notes = [noteBody(harness, '1'), noteBody(harness, '2')];
      for (const note of notes) {
        expect(note.y).toBeGreaterThan(0);
      }
      const bandBottom = Math.max(...notes.map((note) => note.y)) + NOTE_LINE_HEIGHT * 20;
      expect(bandBottom).toBeLessThanOrEqual(harness.pageBottomLimit + 0.5);
      // The stacks are genuinely sequential, not overlaid: 20 lines separate them.
      expect(notes[1].y - notes[0].y).toBeGreaterThanOrEqual(NOTE_LINE_HEIGHT * 20);
    });
  });

  describe('separator mark placement', () => {
    // `<w:separator/>` is a RUN inside its own paragraph in footnotes.xml, so the short rule above
    // the band is placed by THAT paragraph's inline direction, `w:jc` and `w:ind` — never by the
    // section's `w:bidi`. The two axes are independent and they do come apart, which is why each
    // case below pins the section direction and the separator paragraph separately.
    const RTL_PARAGRAPH: ParagraphAttrs = {
      directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' },
    };
    const LTR_PARAGRAPH: ParagraphAttrs = {
      directionContext: { inlineDirection: 'ltr', writingMode: 'horizontal-tb' },
    };

    const separatorOf = (harness: Harness): NoteFragment => {
      const [separator] = harness.fragments.filter((fragment) => fragment.kind === 'drawing');
      if (!separator) throw new Error('no separator was painted');
      return separator;
    };

    const singleColumnRtlSection = async (separatorParagraph?: ParagraphAttrs): Promise<Harness> =>
      layoutWithNotes([paragraph('para-1', 'Body text', 0)], [{ id: '1', pos: 2 }], {
        columns: { count: 1, gap: GAP, direction: 'rtl' },
        separatorParagraph,
      });

    it('draws the rule from the right of the note column when its paragraph is RTL', async () => {
      const separator = separatorOf(await singleColumnRtlSection(RTL_PARAGRAPH));

      expect(separator.width).toBeCloseTo(CONTENT_WIDTH / 2, 4);
      expect(separator.x).toBeCloseTo(MARGINS.left + CONTENT_WIDTH - separator.width, 4);
    });

    it('leaves the rule on the left in an RTL section whose separator paragraph is LTR', async () => {
      // The case a section-direction "fix" would break: Word draws this one on the left.
      const separator = separatorOf(await singleColumnRtlSection(LTR_PARAGRAPH));

      expect(separator.x).toBeCloseTo(MARGINS.left, 4);
    });

    it('moves the rule to the right in an LTR section whose separator paragraph is RTL', async () => {
      const harness = await layoutWithNotes([paragraph('para-1', 'Body text', 0)], [{ id: '1', pos: 2 }], {
        columns: { count: 1, gap: GAP },
        separatorParagraph: RTL_PARAGRAPH,
      });
      const separator = separatorOf(harness);

      expect(separator.x).toBeCloseTo(MARGINS.left + CONTENT_WIDTH - separator.width, 4);
    });

    it('keeps the left edge when the host supplies no separator paragraph', async () => {
      const separator = separatorOf(await singleColumnRtlSection(undefined));

      expect(separator.x).toBeCloseTo(MARGINS.left, 4);
    });

    it('places the rule at the right of a merged full-width band', async () => {
      // The two fixes meet here: the band spans the content area because `w15:footnoteColumns` is 1,
      // and the rule sits at that band's right edge because its own paragraph is RTL.
      const { blocks, refs } = twoColumnRtlBody(REFS);
      const harness = await layoutWithNotes(blocks, refs, {
        columns: { count: 2, gap: GAP, direction: 'rtl' },
        footnoteColumns: 1,
        separatorParagraph: RTL_PARAGRAPH,
      });

      const separators = harness.fragments.filter((fragment) => fragment.kind === 'drawing');
      expect(separators).toHaveLength(1);
      expect(separators[0].width).toBeCloseTo(CONTENT_WIDTH / 2, 4);
      expect(separators[0].x).toBeCloseTo(MARGINS.left + CONTENT_WIDTH - separators[0].width, 4);
    });

    it('places one rule per body column, at the right edge of each, when the band matches the body', async () => {
      const { blocks, refs } = twoColumnRtlBody(REFS);
      const harness = await layoutWithNotes(blocks, refs, {
        columns: { count: 2, gap: GAP, direction: 'rtl' },
        separatorParagraph: RTL_PARAGRAPH,
      });

      const separators = harness.fragments
        .filter((fragment) => fragment.kind === 'drawing')
        .sort((left, right) => left.x - right.x);
      expect(separators).toHaveLength(2);
      for (const separator of separators) {
        expect(separator.width).toBeCloseTo(BODY_COLUMN_WIDTH / 2, 4);
      }
      // Left column's rule against the left column's right edge, and the same for the right column.
      expect(separators[0].x).toBeCloseTo(MARGINS.left + BODY_COLUMN_WIDTH - separators[0].width, 4);
      expect(separators[1].x).toBeCloseTo(
        MARGINS.left + BODY_COLUMN_WIDTH + GAP + BODY_COLUMN_WIDTH - separators[1].width,
        4,
      );
    });
  });

  describe('measurement width', () => {
    /**
     * Section 0 is single-column, section 1 is a two-column continuous section, and both declare
     * `w15:footnoteColumns` per the argument. One note is anchored in each.
     */
    const twoSectionDocument = (footnoteColumns?: number) => {
      const sectionColumns = (count: number): SectionBreakBlock['columns'] => ({
        count,
        gap: GAP,
        direction: 'rtl',
      });
      const sectionBreak = (id: string, sectionIndex: number, count: number): FlowBlock => ({
        kind: 'sectionBreak',
        id,
        ...(sectionIndex === 0 ? {} : { type: 'continuous' as const }),
        pageSize: PAGE_SIZE,
        margins: MARGINS,
        columns: sectionColumns(count),
        ...(footnoteColumns === undefined ? {} : { footnoteColumns }),
        attrs: { source: 'sectPr', sectionIndex, ...(sectionIndex === 0 ? { isFirstSection: true } : {}) },
      });

      return {
        blocks: [
          sectionBreak('section-break-1', 0, 1),
          paragraph('para-1', 'Single column intro', 0),
          sectionBreak('section-break-2', 1, 2),
          paragraph('para-2', 'Two column body', 40),
        ],
        refs: [
          { id: '1', pos: 2 },
          { id: '2', pos: 42 },
        ],
      };
    };

    it('measures notes at the band width, not at the narrowest body column in the document', async () => {
      const { blocks, refs } = twoSectionDocument(1);
      const harness = await layoutWithNotes(blocks, refs, { columns: { count: 1, gap: GAP, direction: 'rtl' } });

      // Both sections declare a full-width band, so no note in the document is narrowed by the
      // two-column section in the middle.
      expect([...harness.noteMeasurementWidths.values()]).not.toHaveLength(0);
      for (const width of harness.noteMeasurementWidths.values()) {
        expect(width).toBeCloseTo(CONTENT_WIDTH, 4);
      }
    });

    it('still measures at the narrowest band in the document when a band matches a two-column body', async () => {
      // Nothing here declares a band of its own, so the band is the body's and the document-wide
      // minimum still applies: one measurement pass has to serve every section, and the narrowest
      // band is the only width no note can overflow.
      const { blocks, refs } = twoSectionDocument(undefined);
      const harness = await layoutWithNotes(blocks, refs, { columns: { count: 1, gap: GAP, direction: 'rtl' } });

      expect([...harness.noteMeasurementWidths.values()]).not.toHaveLength(0);
      for (const width of harness.noteMeasurementWidths.values()) {
        expect(width).toBeCloseTo(BODY_COLUMN_WIDTH, 4);
      }
    });
  });
});
