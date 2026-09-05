// @vitest-environment jsdom
/*
 * Layout-aware inline boxes in a right-to-left paragraph.
 *
 * Measurement used to drop every box whose paragraph declared
 * `inlineDirection: 'rtl'`, or whose runs carried `w:rtl`, because the DOM
 * painter wrote physical left/right edges and could not render such a line.
 * Both sides are direction-agnostic now, and these tests pin that: an RTL
 * paragraph must measure exactly like the same paragraph in LTR, because a box
 * advance is a width and a width does not depend on direction.
 *
 * The fixture is the one `inline-box-poc.test.ts` already relies on, so the LTR
 * side of every comparison is the behaviour this package already guarantees.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { InlineBoxSpan, ParagraphBlock, ParagraphMeasure } from '@superdoc/contracts';
import { measureBlock } from '@superdoc/measuring-dom';
import { resolveCanvas } from '../../measuring/dom/src/canvas-resolver.js';
import { installNodeCanvasPolyfill } from '../../measuring/dom/src/setup.js';

const TEXT = 'prefix boxed words should wrap across lines suffix';
/* Hebrew, same shape: a boxed phrase in the middle of text that must wrap. */
const HEBREW = 'פתיחה מוקפת מילים אמורות להישבר על פני שורות סיום';
const WIDTH = 140;

const { Canvas } = resolveCanvas();

beforeAll(() => {
  installNodeCanvasPolyfill({ document, Canvas });
});

const inlineBox = (text: string): InlineBoxSpan => ({
  id: 'fixture-box',
  from: text.indexOf(' ') + 1,
  to: text.lastIndexOf(' '),
  layout: {
    paddingInlineStart: 24,
    paddingInlineEnd: 28,
    paddingBlockStart: 4,
    paddingBlockEnd: 4,
    gapBefore: 3,
    gapAfter: 5,
    borderWidth: 2,
  },
  appearance: {
    backgroundColor: '#fff2a8',
    borderColor: '#7c5c00',
    borderStyle: 'solid',
    borderRadius: 6,
    color: '#302400',
  },
});

type Direction = { rtlParagraph?: boolean; rtlRun?: boolean };

const paragraph = (text: string, direction: Direction, boxed: boolean): ParagraphBlock => ({
  kind: 'paragraph',
  id: 'inline-box-rtl-fixture',
  runs: [
    {
      text,
      fontFamily: 'Arial',
      fontSize: 16,
      pmStart: 100,
      pmEnd: 100 + text.length,
      ...(direction.rtlRun ? { bidi: { rtl: true } } : {}),
    },
  ],
  attrs: direction.rtlParagraph
    ? { directionContext: { inlineDirection: 'rtl' as const, writingMode: 'horizontal-tb' as const } }
    : {},
  ...(boxed ? { inlineBoxes: [inlineBox(text)] } : {}),
});

const measure = async (block: ParagraphBlock): Promise<ParagraphMeasure> =>
  (await measureBlock(block, WIDTH)) as ParagraphMeasure;

const breaks = (measured: ParagraphMeasure): number[] => measured.lines.map((line) => line.toChar);
const boxCount = (measured: ParagraphMeasure): number =>
  measured.lines.reduce((total, line) => total + (line.inlineBoxes?.length ?? 0), 0);

describe('inline boxes in an RTL paragraph', () => {
  it('projects boxes onto lines when the paragraph declares RTL', async () => {
    const measured = await measure(paragraph(TEXT, { rtlParagraph: true }, true));
    expect(boxCount(measured)).toBeGreaterThan(0);
  });

  it('projects boxes when a run carries w:rtl', async () => {
    const measured = await measure(paragraph(TEXT, { rtlRun: true }, true));
    expect(boxCount(measured)).toBeGreaterThan(0);
  });

  it('measures identically to the same paragraph in LTR', async () => {
    // The precise claim, and the reason no direction clause belongs in the
    // measurement filter: same glyphs, same widths, therefore same breaks.
    const [ltr, rtlParagraph, rtlRun] = await Promise.all([
      measure(paragraph(TEXT, {}, true)),
      measure(paragraph(TEXT, { rtlParagraph: true }, true)),
      measure(paragraph(TEXT, { rtlRun: true }, true)),
    ]);

    expect(breaks(rtlParagraph)).toEqual(breaks(ltr));
    expect(breaks(rtlRun)).toEqual(breaks(ltr));
    expect(boxCount(rtlParagraph)).toBe(boxCount(ltr));
    expect(boxCount(rtlRun)).toBe(boxCount(ltr));
  });

  it('changes where an RTL paragraph wraps, which is the point of the tier', async () => {
    // Projection alone would be inert. What makes these boxes layout-aware is
    // that their advances enter the line budget.
    const [plain, boxed] = await Promise.all([
      measure(paragraph(TEXT, { rtlParagraph: true }, false)),
      measure(paragraph(TEXT, { rtlParagraph: true }, true)),
    ]);

    expect(breaks(boxed)).not.toEqual(breaks(plain));
  });

  it('works on Hebrew text that declares its direction', async () => {
    /*
     * Hebrew without a direction declaration already worked before this change,
     * which is what showed the gate was the flag and not the script. Every real
     * Word document declares it: `w:bidi` on the paragraph, `w:rtl` on the runs.
     */
    const [plain, boxed] = await Promise.all([
      measure(paragraph(HEBREW, { rtlParagraph: true, rtlRun: true }, false)),
      measure(paragraph(HEBREW, { rtlParagraph: true, rtlRun: true }, true)),
    ]);

    expect(boxCount(boxed)).toBeGreaterThan(0);
    expect(breaks(boxed)).not.toEqual(breaks(plain));
  });
});
