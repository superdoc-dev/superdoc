/**
 * Tests for Paragraph Attributes Computation Module.
 *
 * This suite focuses on the exported helpers:
 * - deepClone
 * - normalizeFramePr
 * - normalizeDropCap
 * - computeParagraphAttrs
 * - computeRunAttrs
 */

import { describe, it, expect } from 'vitest';
import {
  deepClone,
  normalizeFramePr,
  normalizeDropCap,
  computeParagraphAttrs,
  computeRunAttrs,
  hasExplicitParagraphRunProperties,
} from './paragraph.js';
import { twipsToPx } from '../utilities.js';

type PMNode = {
  type?: { name?: string };
  attrs?: Record<string, unknown>;
  content?: Array<{
    type?: string;
    attrs?: Record<string, unknown>;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

describe('deepClone', () => {
  it('creates a deep copy of nested objects and arrays', () => {
    const source = {
      spacing: { before: 120, after: 240 },
      tabs: [{ val: 'start', pos: 720 }],
    };

    const result = deepClone(source);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.spacing).not.toBe(source.spacing);
    expect(result.tabs).not.toBe(source.tabs);
  });
});

describe('normalizeFramePr', () => {
  it('normalizes frame properties and converts positions to pixels', () => {
    const framePr = {
      wrap: 'around',
      x: 720,
      y: 1440,
      xAlign: 'right',
      yAlign: 'center',
      hAnchor: 'page',
      vAnchor: 'margin',
    };

    const result = normalizeFramePr(framePr);

    expect(result).toEqual({
      wrap: 'around',
      x: twipsToPx(720),
      y: twipsToPx(1440),
      xAlign: 'right',
      yAlign: 'center',
      hAnchor: 'page',
      vAnchor: 'margin',
    });
  });
});

describe('normalizeDropCap', () => {
  it('extracts drop cap run info from paragraph content', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      content: [
        {
          type: 'run',
          attrs: { runProperties: { fontSize: 24, bold: true } },
          content: [{ type: 'text', text: 'A' }],
        },
      ],
    };

    const framePr = { dropCap: 'drop', lines: 2 };
    const result = normalizeDropCap(framePr, paragraph as never);

    expect(result?.mode).toBe('drop');
    expect(result?.lines).toBe(2);
    expect(result?.run?.text).toBe('A');
    expect(result?.run?.bold).toBe(true);
    expect(typeof result?.run?.fontSize).toBe('number');
  });
});

describe('computeParagraphAttrs', () => {
  it('treats only raw paragraph runProperties as explicit', () => {
    expect(hasExplicitParagraphRunProperties({ runProperties: { fontSize: 24 } } as never)).toBe(true);
    expect(hasExplicitParagraphRunProperties({ styleId: 'Heading1' } as never)).toBe(false);
    expect(hasExplicitParagraphRunProperties({ runProperties: {} } as never)).toBe(false);
  });

  it('ignores tracked change metadata in runProperties', () => {
    expect(
      hasExplicitParagraphRunProperties({
        runProperties: { trackInsert: { id: '1', author: 'Author', date: '2026-01-01' } },
      } as never),
    ).toBe(false);
    expect(
      hasExplicitParagraphRunProperties({
        runProperties: { trackDelete: { id: '2', author: 'Author', date: '2026-01-01' } },
      } as never),
    ).toBe(false);
    expect(
      hasExplicitParagraphRunProperties({
        runProperties: {
          trackInsert: { id: '1', author: 'Author', date: '2026-01-01' },
          trackDelete: { id: '2', author: 'Author', date: '2026-01-01' },
        },
      } as never),
    ).toBe(false);
    // Real formatting alongside tracked changes should still count as explicit
    expect(
      hasExplicitParagraphRunProperties({
        runProperties: {
          trackInsert: { id: '1', author: 'Author', date: '2026-01-01' },
          fontSize: 24,
        },
      } as never),
    ).toBe(true);
  });

  it('normalizes spacing, indent, alignment, and tabs from paragraphProperties', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          justification: 'center',
          spacing: { before: 240, after: 120, line: 210, lineRule: 'exact' },
          indent: { left: 720, hanging: 360 },
          tabStops: [{ val: 'left', pos: 48 }],
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never);

    expect(paragraphAttrs.alignment).toBe('center');
    expect(paragraphAttrs.spacing?.before).toBe(twipsToPx(240));
    expect(paragraphAttrs.spacing?.after).toBe(twipsToPx(120));
    expect(paragraphAttrs.spacing?.line).toBe(twipsToPx(210));
    expect(paragraphAttrs.spacing?.lineRule).toBe('exact');
    expect(paragraphAttrs.spacing?.lineUnit).toBe('px');
    expect(paragraphAttrs.indent?.left).toBe(twipsToPx(720));
    expect(paragraphAttrs.indent?.hanging).toBe(twipsToPx(360));
    expect(paragraphAttrs.tabs?.[0]).toEqual({ val: 'start', pos: 720 });
  });

  it('maps logical indent start/end to physical left/right for LTR paragraphs', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          indent: { start: 720, end: 1440 },
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never);

    expect(paragraphAttrs.indent?.left).toBe(twipsToPx(720));
    expect(paragraphAttrs.indent?.right).toBe(twipsToPx(1440));
  });

  it('maps logical indent start/end for RTL paragraphs and applies mirroring', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          rightToLeft: true,
          indent: { start: 720, end: 1440 },
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never);

    expect(paragraphAttrs.indent?.left).toBe(twipsToPx(1440));
    expect(paragraphAttrs.indent?.right).toBe(twipsToPx(720));
  });

  it('mirrors physical indent values for RTL paragraphs', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          rightToLeft: true,
          indent: { left: 720, right: 1440, firstLine: 360, hanging: 240 },
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never);

    expect(paragraphAttrs.indent?.left).toBe(twipsToPx(1440));
    expect(paragraphAttrs.indent?.right).toBe(twipsToPx(720));
    expect(paragraphAttrs.indent?.firstLine).toBe(-twipsToPx(360));
    expect(paragraphAttrs.indent?.hanging).toBe(-twipsToPx(240));
  });

  it('exposes resolved paragraph properties when no converter context is provided', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { styleId: 'Heading1' },
      },
    };

    const { resolvedParagraphProperties } = computeParagraphAttrs(paragraph as never);
    expect(resolvedParagraphProperties.styleId).toBe('Heading1');
  });

  it('resolves built-in heading level from localized style metadata', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { styleId: 'Ttulo1' },
      },
    };
    const converterContext = {
      translatedNumbering: {},
      translatedLinkedStyles: {
        docDefaults: {},
        styles: {
          Ttulo1: {
            type: 'paragraph',
            styleId: 'Ttulo1',
            name: 'heading 1',
            paragraphProperties: { outlineLvl: 0 },
          },
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never, converterContext as never);

    expect(paragraphAttrs.styleId).toBe('Ttulo1');
    expect(paragraphAttrs.headingLevel).toBe(1);
  });

  it('exposes the current structured list level ordinal', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {},
        listRendering: {
          numberingType: 'decimal',
          markerText: '',
          path: [3, 1],
          suffix: 'nothing',
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never);

    expect(paragraphAttrs.listLevelOrdinal).toBe(1);
  });

  it('passes previousParagraphFont to marker run when paragraph has listRendering and numbering', () => {
    const previousFont = { fontFamily: 'MarkerFont, sans-serif', fontSize: 11 };

    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          numberingProperties: { numId: 1, ilvl: 0 },
        },
        listRendering: {
          markerText: '1.',
          justification: 'left',
          path: [0],
          numberingType: 'decimal',
          suffix: 'tab',
        },
      },
    };

    const minimalContext = {
      translatedNumbering: {},
      translatedLinkedStyles: { docDefaults: {}, styles: {} },
      tableInfo: null,
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never, minimalContext as never, previousFont);
    const markerRun = (
      paragraphAttrs as { wordLayout?: { marker?: { run?: { fontFamily?: string; fontSize?: number } } } }
    )?.wordLayout?.marker?.run;
    expect(markerRun?.fontFamily).toBeDefined();
    expect(markerRun?.fontFamily).toContain('MarkerFont');
    expect(markerRun?.fontSize).toBe(11);
  });

  it('does not overwrite numbering marker font family with previousParagraphFont', () => {
    const previousFont = { fontFamily: 'PrevMarkerFont, sans-serif', fontSize: 11 };

    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          numberingProperties: { numId: 1, ilvl: 0 },
        },
        listRendering: {
          markerText: '1.',
          justification: 'left',
          path: [0],
          numberingType: 'decimal',
          suffix: 'tab',
        },
      },
    };

    const minimalContext = {
      translatedNumbering: {
        definitions: {
          '1': {
            numId: 1,
            abstractNumId: 1,
          },
        },
        abstracts: {
          '1': {
            abstractNumId: 1,
            levels: {
              '0': {
                ilvl: 0,
                runProperties: {
                  fontFamily: { ascii: 'Symbol' },
                },
              },
            },
          },
        },
      },
      translatedLinkedStyles: { docDefaults: {}, styles: {} },
      tableInfo: null,
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never, minimalContext as never, previousFont);
    const markerRun = (
      paragraphAttrs as { wordLayout?: { marker?: { run?: { fontFamily?: string; fontSize?: number } } } }
    )?.wordLayout?.marker?.run;

    expect(markerRun?.fontFamily).toContain('Symbol');
    // Font size still inherits from previous paragraph when the paragraph has no explicit run props.
    expect(markerRun?.fontSize).toBe(11);
  });

  // SD-3269: w:vanish / w:specVanish on the paragraph-mark rPr (w:pPr/w:rPr)
  // apply to the paragraph-mark glyph only (ECMA-376 §17.3.2.36/§17.3.2.41).
  // They must not leak into the auto-generated list marker's run properties,
  // or the renderer drops the marker (e.g. "Section 2.01" disappears).
  it('does not leak paragraph-mark vanish/specVanish into the list marker run', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          numberingProperties: { numId: 1, ilvl: 0 },
          runProperties: {
            vanish: true,
            specVanish: true,
          },
        },
        listRendering: {
          markerText: 'Section 1.01',
          justification: 'left',
          path: [0],
          numberingType: 'decimalZero',
          suffix: 'tab',
        },
      },
    };

    const minimalContext = {
      translatedNumbering: {
        definitions: { '1': { numId: 1, abstractNumId: 1 } },
        abstracts: {
          '1': {
            abstractNumId: 1,
            levels: {
              '0': {
                ilvl: 0,
                runProperties: {},
              },
            },
          },
        },
      },
      translatedLinkedStyles: { docDefaults: {}, styles: {} },
      tableInfo: null,
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never, minimalContext as never);
    const markerRun = (
      paragraphAttrs as {
        wordLayout?: { marker?: { run?: { vanish?: boolean; specVanish?: boolean } } };
      }
    )?.wordLayout?.marker?.run;

    expect(markerRun?.vanish).not.toBe(true);
    expect(markerRun?.specVanish).not.toBe(true);
  });

  // Vanish defined on the numbering definition itself is still honoured.
  // That is the supported way to hide an auto-generated list marker.
  it('honours w:vanish defined on the numbering definition rPr for the marker', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          numberingProperties: { numId: 1, ilvl: 0 },
        },
        listRendering: {
          markerText: '1.',
          justification: 'left',
          path: [0],
          numberingType: 'decimal',
          suffix: 'tab',
        },
      },
    };

    const minimalContext = {
      translatedNumbering: {
        definitions: { '1': { numId: 1, abstractNumId: 1 } },
        abstracts: {
          '1': {
            abstractNumId: 1,
            levels: {
              '0': {
                ilvl: 0,
                runProperties: { vanish: true },
              },
            },
          },
        },
      },
      translatedLinkedStyles: { docDefaults: {}, styles: {} },
      tableInfo: null,
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never, minimalContext as never);
    const markerRun = (paragraphAttrs as { wordLayout?: { marker?: { run?: { vanish?: boolean } } } })?.wordLayout
      ?.marker?.run;

    expect(markerRun?.vanish).toBe(true);
  });

  it('preserves explicit paragraph bidi direction', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          rightToLeft: true,
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never);

    expect(paragraphAttrs.directionContext?.inlineDirection).toBe('rtl');
  });

  it('does NOT inherit section direction for paragraph inline direction (§17.6.1)', () => {
    // Section bidi affects section chrome only; paragraph inline direction
    // must come from paragraph w:bidi or its style cascade, never the section.
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {},
      },
    };

    const converterContext = {
      sectionDirection: 'rtl',
      translatedNumbering: {},
      translatedLinkedStyles: { docDefaults: {}, styles: {} },
      tableInfo: null,
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never, converterContext as never);
    expect(paragraphAttrs.directionContext?.inlineDirection).toBeUndefined();
  });

  // SD-2778: pm-adapter writes inline direction onto `directionContext.inlineDirection`
  // as the single source of truth. The legacy scalar `attrs.direction` field has been
  // removed; `getParagraphInlineDirection` reads `directionContext` directly.
  describe('SD-2778: directionContext.inlineDirection mirrors paragraphProperties.rightToLeft', () => {
    const cases: Array<{ name: string; rightToLeft: boolean | undefined; expected: 'rtl' | 'ltr' | undefined }> = [
      { name: 'rightToLeft=true', rightToLeft: true, expected: 'rtl' },
      { name: 'rightToLeft=false', rightToLeft: false, expected: 'ltr' },
      { name: 'rightToLeft=undefined', rightToLeft: undefined, expected: undefined },
    ];

    for (const { name, rightToLeft, expected } of cases) {
      it(`${name}: directionContext.inlineDirection === ${String(expected)}`, () => {
        const paragraph: PMNode = {
          type: { name: 'paragraph' },
          attrs: {
            paragraphProperties: rightToLeft === undefined ? {} : { rightToLeft },
          },
        };

        const { paragraphAttrs } = computeParagraphAttrs(paragraph as never);

        expect(paragraphAttrs.directionContext?.inlineDirection).toBe(expected);
        // Pin the producer contract: pm-adapter must not emit the legacy
        // scalar `direction` field. A future accidental spread that
        // re-introduced it would slip past the TypeScript check (since
        // index signatures permit extra keys) but fail this runtime guard.
        expect(Object.hasOwn(paragraphAttrs, 'direction')).toBe(false);
      });
    }
  });

  it('inherits writing mode from body section context (§17.3.1.41)', () => {
    // When the paragraph omits w:textDirection, it should pick up writing-mode
    // from the section. This test feeds a pre-resolved sectionDirectionContext
    // (the production wiring populates this from the body sectPr).
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {},
      },
    };

    const converterContext = {
      sectionDirectionContext: {
        pageDirection: 'ltr',
        writingMode: 'vertical-rl',
        rtlGutter: false,
      },
      translatedNumbering: {},
      translatedLinkedStyles: { docDefaults: {}, styles: {} },
      tableInfo: null,
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never, converterContext as never);
    expect(paragraphAttrs.directionContext?.writingMode).toBe('vertical-rl');
  });

  it('paragraph w:textDirection wins over section writing-mode (§17.3.1.41 explicit override)', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { textDirection: 'lrTb' },
      },
    };

    const converterContext = {
      sectionDirectionContext: {
        pageDirection: 'ltr',
        writingMode: 'vertical-rl',
        rtlGutter: false,
      },
      translatedNumbering: {},
      translatedLinkedStyles: { docDefaults: {}, styles: {} },
      tableInfo: null,
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never, converterContext as never);
    expect(paragraphAttrs.directionContext?.writingMode).toBe('horizontal-tb');
  });
});

/*
 * The previous tests for `resolveEffectiveParagraphDirection` codified
 * direction-resolution behavior that the new resolver chain replaces:
 *
 *   - Section bidi propagating to paragraph inline direction (§17.6.1
 *     violation — section bidi affects section chrome only).
 *   - A run-content heuristic for paragraph base direction (UAX #9 P2/P3
 *     specifies first-strong-character; the browser handles this via UBA
 *     when `dir` is omitted, so SuperDoc does not need a server-side
 *     classifier).
 *   - A docDefaults parameter (redundant — the style-engine cascade
 *     already resolves docDefaults/pPrDefault/pPr/bidi into
 *     `paragraphProperties.rightToLeft` before this resolver runs).
 *
 * Direction-axis correctness is now tested in
 * `direction/non-collapse.test.ts` where each axis stays separate.
 */

describe('computeRunAttrs', () => {
  it('normalizes font family, font size, and color', () => {
    const runProps = {
      fontFamily: { ascii: 'Arial' },
      fontSize: 24,
      color: { val: 'ff0000' },
    };

    const result = computeRunAttrs(runProps as never);

    expect(result.fontFamily).toContain('Arial');
    expect(result.fontSize).toBeGreaterThan(0);
    expect(result.color).toBe('#FF0000');
  });

  it('includes the vanish property', () => {
    const runProps = {
      vanish: true,
    };

    const result = computeRunAttrs(runProps as never);

    expect(result.vanish).toBe(true);
  });

  it('uses runProps font settings when previousParagraphFont is not provided', () => {
    const runProps = {
      fontFamily: { ascii: 'RunFont' },
      fontSize: 20,
    };

    const result = computeRunAttrs(runProps as never);

    expect(result.fontFamily).toContain('RunFont');
    expect(result.fontSize).toBeGreaterThan(10);
  });

  it('passes through vertAlign', () => {
    const result = computeRunAttrs({ vertAlign: 'superscript', fontSize: 24 } as never);
    expect(result.vertAlign).toBe('superscript');
  });

  it('scales fontSize by 0.65 for superscript', () => {
    const base = computeRunAttrs({ fontSize: 24 } as never);
    const sup = computeRunAttrs({ fontSize: 24, vertAlign: 'superscript' } as never);
    expect(sup.fontSize).toBeCloseTo(base.fontSize * 0.65);
  });

  it('scales fontSize by 0.65 for subscript', () => {
    const base = computeRunAttrs({ fontSize: 24 } as never);
    const sub = computeRunAttrs({ fontSize: 24, vertAlign: 'subscript' } as never);
    expect(sub.fontSize).toBeCloseTo(base.fontSize * 0.65);
  });

  it('does not scale fontSize when position is set', () => {
    const base = computeRunAttrs({ fontSize: 24 } as never);
    const result = computeRunAttrs({ fontSize: 24, vertAlign: 'superscript', position: 6 } as never);
    expect(result.fontSize).toBe(base.fontSize);
  });

  it('treats zero position as an identity value for superscript scaling', () => {
    const base = computeRunAttrs({ fontSize: 24 } as never);
    const result = computeRunAttrs({ fontSize: 24, vertAlign: 'superscript', position: 0 } as never);
    expect(result.fontSize).toBeCloseTo(base.fontSize * 0.65);
    expect(result.baselineShift).toBeUndefined();
  });

  it('converts position from half-points to points as baselineShift', () => {
    const result = computeRunAttrs({ position: 6 } as never);
    expect(result.baselineShift).toBe(3);
  });

  it('does not set baselineShift when position is absent', () => {
    const result = computeRunAttrs({ fontSize: 24 } as never);
    expect(result.baselineShift).toBeUndefined();
  });

  it('does not set baselineShift for zero position', () => {
    const result = computeRunAttrs({ position: 0 } as never);
    expect(result.baselineShift).toBeUndefined();
  });
});
