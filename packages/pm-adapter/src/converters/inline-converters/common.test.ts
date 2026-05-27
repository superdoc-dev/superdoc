import { describe, it, expect, vi } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import type { RunProperties } from '@superdoc/style-engine/ooxml';
import { applyInlineRunProperties } from './common.js';

vi.mock('../../attributes/paragraph.js', () => ({
  computeRunAttrs: vi.fn((runProps: RunProperties) => ({
    fontFamily: 'Arial',
    fontSize: 12,
    bold: runProps.bold,
    italic: runProps.italic,
    color: runProps.color?.val ? `#${runProps.color.val.toUpperCase()}` : undefined,
  })),
}));

describe('applyInlineRunProperties', () => {
  const baseRun: TextRun = {
    text: 'Hello',
    fontFamily: 'Times New Roman',
    fontSize: 16,
  };

  it('returns unchanged run when runProperties is undefined', () => {
    const result = applyInlineRunProperties(baseRun, undefined);

    expect(result).toBe(baseRun);
  });

  it('merges computed attributes from runProperties onto the run', () => {
    const runProperties: RunProperties = { bold: true };

    const result = applyInlineRunProperties(baseRun, runProperties);

    expect(result.bold).toBe(true);
    expect(result.fontFamily).toBe('Arial');
    expect(result.fontSize).toBe(12);
    expect(result.text).toBe('Hello');
  });

  it('preserves run.color when runProperties does not specify a color', () => {
    const runWithColor: TextRun = {
      ...baseRun,
      color: '#FF0000',
    };
    const runProperties: RunProperties = { bold: true };

    const result = applyInlineRunProperties(runWithColor, runProperties);

    expect(result.color).toBe('#FF0000');
  });

  it('overwrites run.color when runProperties specifies a color', () => {
    const runWithColor: TextRun = {
      ...baseRun,
      color: '#FF0000',
    };
    const runProperties: RunProperties = {
      color: { val: '00FF00' },
    };

    const result = applyInlineRunProperties(runWithColor, runProperties);

    expect(result.color).toBe('#00FF00');
  });

  it('does not set color when both run and runProperties have no color', () => {
    const runProperties: RunProperties = { bold: true };

    const result = applyInlineRunProperties(baseRun, runProperties);

    expect(result.color).toBeUndefined();
  });

  it('returns a new object instead of mutating the original run', () => {
    const runProperties: RunProperties = { italic: true };

    const result = applyInlineRunProperties(baseRun, runProperties);

    expect(result).not.toBe(baseRun);
    expect(baseRun.italic).toBeUndefined();
  });

  it('preserves mark-derived bold when runProperties does not specify bold (SD-2011)', () => {
    const runWithBold: TextRun = {
      ...baseRun,
      bold: true,
    };
    // Empty runProperties — bold is undefined in computeRunAttrs result
    const runProperties: RunProperties = {};

    const result = applyInlineRunProperties(runWithBold, runProperties);

    // bold should be preserved from the run (mark-derived), not overwritten by undefined
    expect(result.bold).toBe(true);
  });

  it('preserves mark-derived italic when runProperties does not specify italic (SD-2011)', () => {
    const runWithItalic: TextRun = {
      ...baseRun,
      italic: true,
    };
    const runProperties: RunProperties = {};

    const result = applyInlineRunProperties(runWithItalic, runProperties);

    expect(result.italic).toBe(true);
  });

  it('overwrites bold when runProperties explicitly sets bold to false', () => {
    const runWithBold: TextRun = {
      ...baseRun,
      bold: true,
    };
    const runProperties: RunProperties = { bold: false };

    const result = applyInlineRunProperties(runWithBold, runProperties);

    expect(result.bold).toBe(false);
  });

  // Wave 1a preserves these signals; nothing renders them yet.
  describe('SD-2781 bidi/script preservation', () => {
    it('does not attach bidi or script when no relevant signals are set', () => {
      const result = applyInlineRunProperties(baseRun, { bold: true }, undefined, { bold: true });
      expect(result.bidi).toBeUndefined();
      expect(result.script).toBeUndefined();
    });

    it('preserves run rtl on TextRun.bidi (does not affect script)', () => {
      const result = applyInlineRunProperties(baseRun, { rtl: true }, undefined, { rtl: true });
      expect(result.bidi).toEqual({ rtl: true });
      expect(result.script).toBeUndefined();
    });

    it('preserves explicit rtl=false (a meaningful override of inherited rtl)', () => {
      const result = applyInlineRunProperties(baseRun, { rtl: false }, undefined, { rtl: false });
      expect(result.bidi).toEqual({ rtl: false });
    });

    it('preserves complex-script flag on TextRun.script (does not affect bidi)', () => {
      const result = applyInlineRunProperties(baseRun, { cs: true }, undefined, { cs: true });
      expect(result.script).toEqual({ complexScript: true });
      expect(result.bidi).toBeUndefined();
    });

    it('preserves the three lang tags on separate fields per ECMA §17.3.2.20', () => {
      const lang = { val: 'en-US', bidi: 'ar-SA', eastAsia: 'ja-JP' };
      const result = applyInlineRunProperties(baseRun, { lang }, undefined, { lang });
      expect(result.script?.language).toEqual({
        default: 'en-US',
        complexScript: 'ar-SA',
        eastAsian: 'ja-JP',
      });
    });

    it('partial lang attrs only fill the fields that were set', () => {
      const lang = { bidi: 'he-IL' };
      const result = applyInlineRunProperties(baseRun, { lang }, undefined, { lang });
      expect(result.script?.language).toEqual({ complexScript: 'he-IL' });
    });

    // Per ECMA §17.3.2.7, w:cs absent != false. Absence inherits from the style
    // hierarchy and ultimately falls back to Unicode-based detection. Only set
    // complexScript when the source explicitly carries w:cs.
    it('omits complexScript when only lang is set (no explicit w:cs)', () => {
      const lang = { bidi: 'he-IL' };
      const result = applyInlineRunProperties(baseRun, { lang }, undefined, { lang });
      expect(result.script).toBeDefined();
      expect(result.script).not.toHaveProperty('complexScript');
      expect(result.script?.language).toEqual({ complexScript: 'he-IL' });
    });

    it('preserves explicit cs=false (a meaningful toggle-off of inherited cs)', () => {
      const result = applyInlineRunProperties(baseRun, { cs: false }, undefined, { cs: false });
      expect(result.script).toEqual({ complexScript: false });
    });

    it('keeps rtl and cs on separate axes (axis non-collapse)', () => {
      const props = { rtl: true, cs: true };
      const result = applyInlineRunProperties(baseRun, props, undefined, props);
      // rtl goes to bidi only; cs goes to script only
      expect(result.bidi).toEqual({ rtl: true });
      expect(result.script).toEqual({ complexScript: true });
      // cs must NOT leak into bidi, and rtl must NOT leak into script
      expect(result.bidi).not.toHaveProperty('complexScript');
      expect(result.script).not.toHaveProperty('rtl');
    });

    // Cascade-leak guard: when the cascade-resolved runProperties has rtl/cs/lang
    // but the raw inline runProperties does NOT, the metadata must not appear.
    // Otherwise every style-inherited run gets false bidi/script signals.
    it('does NOT populate bidi/script from cascade-resolved props alone', () => {
      const cascadedProps = { rtl: true, cs: true, lang: { bidi: 'ar-SA' } };
      const inlineProps = {}; // No inline rtl/cs/lang on the source run
      const result = applyInlineRunProperties(baseRun, cascadedProps, undefined, inlineProps);
      expect(result.bidi).toBeUndefined();
      expect(result.script).toBeUndefined();
    });

    it('does NOT populate bidi/script when caller omits inlineRunProperties', () => {
      // Default safety: callers that don't opt in to metadata get nothing.
      const result = applyInlineRunProperties(baseRun, { rtl: true, cs: true });
      expect(result.bidi).toBeUndefined();
      expect(result.script).toBeUndefined();
    });

    it('inline overrides survive even when cascade-resolved props differ', () => {
      // User explicitly set rtl=true inline; cascade may also resolve to true.
      // Either way, inline is the source of truth for preservation.
      const cascaded = { rtl: true, fontSize: 12 };
      const inline = { rtl: true };
      const result = applyInlineRunProperties(baseRun, cascaded, undefined, inline);
      expect(result.bidi).toEqual({ rtl: true });
    });
  });
});
