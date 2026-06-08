import { describe, it, expect } from 'vitest';
import {
  FONT_OFFERINGS,
  getDefaultFontOfferings,
  getDefaultFontFamilyOptions,
  fontOfferingStack,
  fontOfferingRenderStack,
} from './font-offerings';
import { SUBSTITUTION_EVIDENCE } from './substitution-evidence';

const EXPECTED_DEFAULTS = ['Arial', 'Calibri', 'Courier New', 'Helvetica', 'Times New Roman'];

/**
 * Must NOT appear as DEFAULT options yet. Aptos/Georgia/Baskerville/Arial Narrow are not bundled (or
 * have no clone); Cambria is qualified (visual_only); Calibri Light is a category fallback. They can
 * reach the toolbar as document-specific options, never as silent defaults.
 */
const NOT_DEFAULT_YET = ['Aptos', 'Georgia', 'Cambria', 'Calibri Light', 'Baskerville', 'Arial Narrow'];

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

  it('classifies the qualified and category rows distinctly (carried for the later fidelity layer)', () => {
    const byName = (n: string) => FONT_OFFERINGS.find((o) => o.logicalFamily === n);
    expect(byName('Cambria')).toMatchObject({ offering: 'qualified', verdict: 'visual_only', bundled: true });
    expect(byName('Calibri Light')).toMatchObject({ offering: 'category_fallback', bundled: true });
  });

  it('getDefaultFontFamilyOptions returns logical label + logical stack', () => {
    expect(getDefaultFontFamilyOptions()).toEqual([
      { label: 'Arial', value: 'Arial, sans-serif' },
      { label: 'Calibri', value: 'Calibri, sans-serif' },
      { label: 'Courier New', value: 'Courier New, monospace' },
      { label: 'Helvetica', value: 'Helvetica, sans-serif' },
      { label: 'Times New Roman', value: 'Times New Roman, serif' },
    ]);
  });

  it('render stack uses the bundled physical clone for an accurate preview', () => {
    const calibri = getDefaultFontOfferings().find((o) => o.logicalFamily === 'Calibri')!;
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
