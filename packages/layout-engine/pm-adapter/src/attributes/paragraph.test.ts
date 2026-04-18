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

    expect(paragraphAttrs.direction).toBe('rtl');
    expect(paragraphAttrs.rtl).toBe(true);
  });
});

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
