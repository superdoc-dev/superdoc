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

  // SD-2781: TextRun.bidi and TextRun.script preserve run-level direction and
  // script signals from raw run properties. Wave 1a does not render either.
  describe('SD-2781 bidi/script preservation', () => {
    it('does not attach bidi or script when no relevant signals are set', () => {
      const result = applyInlineRunProperties(baseRun, { bold: true });
      expect(result.bidi).toBeUndefined();
      expect(result.script).toBeUndefined();
    });

    it('preserves run rtl on TextRun.bidi (does not affect script)', () => {
      const result = applyInlineRunProperties(baseRun, { rtl: true });
      expect(result.bidi).toEqual({ rtl: true });
      expect(result.script).toBeUndefined();
    });

    it('preserves explicit rtl=false (a meaningful override of inherited rtl)', () => {
      const result = applyInlineRunProperties(baseRun, { rtl: false });
      expect(result.bidi).toEqual({ rtl: false });
    });

    it('preserves complex-script flag on TextRun.script (does not affect bidi)', () => {
      const result = applyInlineRunProperties(baseRun, { cs: true });
      expect(result.script).toEqual({ complexScript: true });
      expect(result.bidi).toBeUndefined();
    });

    it('preserves the three lang tags on separate fields per ECMA §17.3.2.20', () => {
      const result = applyInlineRunProperties(baseRun, {
        lang: { val: 'en-US', bidi: 'ar-SA', eastAsia: 'ja-JP' },
      });
      expect(result.script?.language).toEqual({
        default: 'en-US',
        complexScript: 'ar-SA',
        eastAsian: 'ja-JP',
      });
    });

    it('partial lang attrs only fill the fields that were set', () => {
      const result = applyInlineRunProperties(baseRun, { lang: { bidi: 'he-IL' } });
      expect(result.script?.language).toEqual({ complexScript: 'he-IL' });
    });

    it('keeps rtl and cs on separate axes (axis non-collapse)', () => {
      const result = applyInlineRunProperties(baseRun, { rtl: true, cs: true });
      // rtl goes to bidi only; cs goes to script only
      expect(result.bidi).toEqual({ rtl: true });
      expect(result.script).toEqual({ complexScript: true });
      // cs must NOT leak into bidi, and rtl must NOT leak into script
      expect(result.bidi).not.toHaveProperty('complexScript');
      expect(result.script).not.toHaveProperty('rtl');
    });
  });
});
