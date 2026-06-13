import { describe, expect, it, vi } from 'vitest';
import { BASELINE_BUNDLED, FULLY_ACTIVE_BUNDLED, createBundledActivation } from './activation';
import {
  FONT_OFFERINGS,
  fontOfferingRenderStack,
  fontOfferingStack,
  getBuiltInToolbarFontOfferings,
  getDefaultFontFamilyOptions,
  getDefaultFontOfferings,
  warnUnknownBundledSelection,
} from './font-offerings';
import { SUBSTITUTION_EVIDENCE } from './substitution-evidence';

/** No-pack toolbar baseline: one common Word font per CSS generic, each with a generic CSS fallback. */
const EXPECTED_BASELINE = ['Arial', 'Courier New', 'Times New Roman'];

const EXPECTED_DEFAULTS = ['Arial', 'Calibri', 'Courier New', 'Helvetica', 'Times New Roman'];
const EXPECTED_BUILT_IN_TOOLBAR = [
  'Arial',
  'Arial Black',
  'Arial Narrow',
  'Baskerville Old Face',
  'Bookman Old Style',
  'Brush Script MT',
  'Calibri',
  'Century',
  'Century Gothic',
  'Comic Sans MS',
  'Cooper Black',
  'Courier New',
  'Garamond',
  'Georgia',
  'Gill Sans MT Condensed',
  'Helvetica',
  'Lucida Console',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];

/**
 * Must NOT appear as DEFAULT options yet. Aptos has no clone, Cambria/Georgia/Cooper Black/
 * Baskerville Old Face/Arial Black/Arial Narrow/Century/Century Gothic/Century Schoolbook/ITC
 * Bookman are qualified/category rows, Arial MT/Courier/Times are supported aliases, and Calibri
 * Light/Tahoma/Trebuchet MS/Garamond/Comic Sans MS/Brush Script MT/Gill Sans MT Condensed/Lucida
 * Console/Consolas/Verdana/Segoe UI are category fallbacks. Some may be explicit built-in picker
 * choices, but none should become silent strict defaults.
 */
const NOT_DEFAULT_YET = [
  'Aptos',
  'Arial MT',
  'Georgia',
  'Cambria',
  'Cooper Black',
  'Arial Black',
  'Calibri Light',
  'Baskerville Old Face',
  'Bookman Old Style',
  'Arial Narrow',
  'Century Gothic',
  'Century',
  'Century Schoolbook',
  'Courier',
  'Tahoma',
  'Times',
  'Trebuchet MS',
  'Garamond',
  'Comic Sans MS',
  'Brush Script MT',
  'Lucida Console',
  'Gill Sans MT Condensed',
  'Consolas',
  'ITC Bookman',
  'Verdana',
  'Segoe UI',
];

describe('font offerings', () => {
  it('default offerings are exactly the metric-safe bundled fonts', () => {
    expect(getDefaultFontOfferings().map((o) => o.logicalFamily)).toEqual(EXPECTED_DEFAULTS);
    expect(getDefaultFontOfferings().every((o) => o.offering === 'default' && o.bundled)).toBe(true);
  });

  it('does not advertise qualified / category / unbundled / customer fonts as defaults', () => {
    const defaultNames = new Set(getDefaultFontOfferings().map((o) => o.logicalFamily));
    for (const name of NOT_DEFAULT_YET) {
      expect(defaultNames.has(name)).toBe(false);
    }
  });

  it('built-in toolbar offerings default to the conservative no-pack baseline', () => {
    // No activation (and the explicit BASELINE_BUNDLED) = no pack configured = the baseline (one per generic).
    expect(getBuiltInToolbarFontOfferings().map((o) => o.logicalFamily)).toEqual(EXPECTED_BASELINE);
    expect(getBuiltInToolbarFontOfferings(BASELINE_BUNDLED).map((o) => o.logicalFamily)).toEqual(EXPECTED_BASELINE);
  });

  it('built-in toolbar offerings show the full advertised set when the pack is configured', () => {
    expect(getBuiltInToolbarFontOfferings(FULLY_ACTIVE_BUNDLED).map((o) => o.logicalFamily)).toEqual(
      EXPECTED_BUILT_IN_TOOLBAR,
    );
    expect(
      getBuiltInToolbarFontOfferings(FULLY_ACTIVE_BUNDLED).find((o) => o.logicalFamily === 'Cooper Black'),
    ).toMatchObject({ offering: 'qualified', verdict: 'visual_only', bundled: true });
  });

  it('curation narrows the configured toolbar set by logical Word name', () => {
    const excluded = getBuiltInToolbarFontOfferings(
      createBundledActivation({ packConfigured: true, exclude: ['Cooper Black', 'Verdana'] }),
    ).map((o) => o.logicalFamily);
    expect(excluded).not.toContain('Cooper Black');
    expect(excluded).not.toContain('Verdana');
    expect(excluded).toContain('Calibri');
    expect(excluded.length).toBe(EXPECTED_BUILT_IN_TOOLBAR.length - 2);

    // include is an allow-list, applied within the offered set (names outside it stay non-default
    // toolbar options - use modules.toolbar.fonts for those).
    const included = getBuiltInToolbarFontOfferings(
      createBundledActivation({ packConfigured: true, include: ['Calibri', 'Georgia', 'Arial'] }),
    ).map((o) => o.logicalFamily);
    expect(included).toEqual(['Arial', 'Calibri', 'Georgia']);
  });

  it('classifies the qualified and category rows distinctly (carried for the later fidelity layer)', () => {
    const byName = (n: string) => FONT_OFFERINGS.find((o) => o.logicalFamily === n);
    expect(byName('Cambria')).toMatchObject({ offering: 'qualified', verdict: 'visual_only', bundled: true });
    expect(byName('Cooper Black')).toMatchObject({ offering: 'qualified', verdict: 'visual_only', bundled: true });
    expect(byName('Arial Black')).toMatchObject({
      offering: 'qualified',
      verdict: 'visual_only',
      bundled: true,
      physicalFamily: 'Archivo Black',
    });
    expect(byName('Georgia')).toMatchObject({ offering: 'qualified', verdict: 'near_metric', bundled: true });
    expect(byName('Baskerville Old Face')).toMatchObject({
      offering: 'qualified',
      verdict: 'visual_only',
      bundled: true,
      physicalFamily: 'Bacasime Antique',
    });
    expect(byName('Bookman Old Style')).toMatchObject({
      offering: 'qualified',
      verdict: 'visual_only',
      bundled: true,
      physicalFamily: 'TeX Gyre Bonum',
    });
    expect(byName('ITC Bookman')).toMatchObject({
      offering: 'qualified',
      verdict: 'visual_only',
      bundled: true,
      physicalFamily: 'TeX Gyre Bonum',
    });
    expect(byName('Arial Narrow')).toMatchObject({
      offering: 'qualified',
      verdict: 'visual_only',
      bundled: true,
      physicalFamily: 'Liberation Sans Narrow',
    });
    expect(byName('Century')).toMatchObject({
      offering: 'qualified',
      verdict: 'visual_only',
      bundled: true,
      physicalFamily: 'C059',
    });
    expect(byName('Century Gothic')).toMatchObject({
      offering: 'category_fallback',
      verdict: 'visual_only',
      bundled: true,
      physicalFamily: 'URW Gothic',
    });
    expect(byName('Century Schoolbook')).toMatchObject({
      offering: 'qualified',
      verdict: 'visual_only',
      bundled: true,
      physicalFamily: 'C059',
    });
    expect(byName('Calibri Light')).toMatchObject({ offering: 'category_fallback', bundled: true });
    expect(byName('Tahoma')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'Noto Sans',
    });
    expect(byName('Trebuchet MS')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'PT Sans',
    });
    expect(byName('Garamond')).toMatchObject({ offering: 'category_fallback', bundled: true, physicalFamily: 'Cardo' });
    expect(byName('Comic Sans MS')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'Comic Relief',
    });
    expect(byName('Brush Script MT')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'Oregano Italic',
    });
    expect(byName('Lucida Console')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'Noto Sans Mono',
    });
    expect(byName('Consolas')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'Inconsolata SemiExpanded',
    });
    expect(byName('Gill Sans MT Condensed')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'PT Sans Narrow',
    });
    expect(byName('Verdana')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'Noto Sans',
    });
    expect(byName('Segoe UI')).toMatchObject({
      offering: 'category_fallback',
      bundled: true,
      physicalFamily: 'Selawik',
    });
    expect(byName('Arial MT')).toMatchObject({
      offering: 'supported_alias',
      bundled: true,
      physicalFamily: 'Liberation Sans',
    });
    expect(byName('Times')).toMatchObject({
      offering: 'supported_alias',
      bundled: true,
      physicalFamily: 'Liberation Serif',
    });
    expect(byName('Courier')).toMatchObject({
      offering: 'supported_alias',
      bundled: true,
      physicalFamily: 'Liberation Mono',
    });
  });

  it('getDefaultFontFamilyOptions returns the baseline by default (logical label + logical stack)', () => {
    expect(getDefaultFontFamilyOptions()).toEqual([
      { label: 'Arial', value: 'Arial, sans-serif' },
      { label: 'Courier New', value: 'Courier New, monospace' },
      { label: 'Times New Roman', value: 'Times New Roman, serif' },
    ]);
  });

  it('getDefaultFontFamilyOptions returns the full set when the pack is configured', () => {
    expect(getDefaultFontFamilyOptions(FULLY_ACTIVE_BUNDLED)).toEqual([
      { label: 'Arial', value: 'Arial, sans-serif' },
      { label: 'Arial Black', value: 'Arial Black, sans-serif' },
      { label: 'Arial Narrow', value: 'Arial Narrow, sans-serif' },
      { label: 'Baskerville Old Face', value: 'Baskerville Old Face, serif' },
      { label: 'Bookman Old Style', value: 'Bookman Old Style, serif' },
      { label: 'Brush Script MT', value: 'Brush Script MT, serif' },
      { label: 'Calibri', value: 'Calibri, sans-serif' },
      { label: 'Century', value: 'Century, serif' },
      { label: 'Century Gothic', value: 'Century Gothic, sans-serif' },
      { label: 'Comic Sans MS', value: 'Comic Sans MS, sans-serif' },
      { label: 'Cooper Black', value: 'Cooper Black, serif' },
      { label: 'Courier New', value: 'Courier New, monospace' },
      { label: 'Garamond', value: 'Garamond, serif' },
      { label: 'Georgia', value: 'Georgia, serif' },
      { label: 'Gill Sans MT Condensed', value: 'Gill Sans MT Condensed, sans-serif' },
      { label: 'Helvetica', value: 'Helvetica, sans-serif' },
      { label: 'Lucida Console', value: 'Lucida Console, monospace' },
      { label: 'Segoe UI', value: 'Segoe UI, sans-serif' },
      { label: 'Tahoma', value: 'Tahoma, sans-serif' },
      { label: 'Times New Roman', value: 'Times New Roman, serif' },
      { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
      { label: 'Verdana', value: 'Verdana, sans-serif' },
    ]);
  });

  it('render stack uses the bundled physical clone for an accurate preview', () => {
    const calibri = getDefaultFontOfferings().find((o) => o.logicalFamily === 'Calibri');
    expect(calibri).toBeDefined();
    if (!calibri) return;
    expect(fontOfferingStack(calibri)).toBe('Calibri, sans-serif'); // logical: stored / applied
    expect(fontOfferingRenderStack(calibri)).toBe('Carlito, sans-serif'); // physical: dropdown preview
  });

  it('uses the CSS generic category supplied by DocFonts evidence', () => {
    const evidenceGeneric = new Map(SUBSTITUTION_EVIDENCE.map((row) => [row.logicalFamily, row.generic]));
    for (const o of FONT_OFFERINGS) {
      expect(o.generic).toBe(evidenceGeneric.get(o.logicalFamily));
    }
  });
});

describe('warnUnknownBundledSelection', () => {
  it('stays silent for valid bundled families or no selection', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnknownBundledSelection(undefined);
    warnUnknownBundledSelection({ exclude: ['Cooper Black', 'Verdana'] });
    warnUnknownBundledSelection({ include: ['Calibri', 'Cambria'] });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns once per unknown name, suggesting the closest bundled family for a near typo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnknownBundledSelection({ exclude: ['Calibrii'] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/"Calibrii" is not a bundled font/);
    expect(warn.mock.calls[0][0]).toMatch(/did you mean "Calibri"\?/);
    warn.mockRestore();
  });

  it('warns for a real-but-unbundled Word font (no clone shipped), so curating it is a no-op', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnknownBundledSelection({ include: ['Aptos'] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/"Aptos" is not a bundled font/);
    warn.mockRestore();
  });

  it('warns when include and exclude are both set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnknownBundledSelection({ include: ['Calibri'], exclude: ['Cambria'] });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/not both/));
    warn.mockRestore();
  });

  it('coerces a non-array include (raw JS) - warns about the shape, never spreads it into characters', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A bare string must warn once about the wrong shape, not a per-character "unknown font" warning.
    warnUnknownBundledSelection({ include: 'Calibri' as unknown as string[] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/fonts\.bundled\.include must be an array/);
    expect(warn.mock.calls[0][0]).not.toMatch(/is not a bundled font/);
    warn.mockRestore();
  });
});
