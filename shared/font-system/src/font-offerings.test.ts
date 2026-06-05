import { describe, it, expect } from 'vitest';
import {
  FONT_OFFERINGS,
  getDefaultFontOfferings,
  getDefaultFontFamilyOptions,
  fontOfferingStack,
  fontOfferingRenderStack,
} from './font-offerings';
import { BUNDLED_MANIFEST } from './bundled-manifest';

/**
 * The default toolbar set this PR ships, in explicit product order (metric-safe fonts SuperDoc
 * renders deterministically). Order is pinned, not evidence order; see DEFAULT_FONT_ORDER.
 */
const EXPECTED_DEFAULTS = ['Calibri', 'Arial', 'Courier New', 'Times New Roman', 'Helvetica'];

/**
 * Must NOT appear as DEFAULT options yet. Aptos/Georgia/Baskerville/Arial Narrow are not bundled (or
 * have no clone); Cambria is qualified (visual_only); Calibri Light is a category fallback. They reach
 * the toolbar later as document-specific options with a fidelity status, never as silent defaults.
 */
const NOT_DEFAULT_YET = ['Aptos', 'Georgia', 'Cambria', 'Calibri Light', 'Baskerville', 'Arial Narrow'];

/** Pin the generic classifier: every bundled family maps to exactly this generic (deliberate, tested). */
const EXPECTED_GENERIC: Record<string, string> = {
  Carlito: 'sans-serif',
  Caladea: 'serif',
  'Liberation Sans': 'sans-serif',
  'Liberation Serif': 'serif',
  'Liberation Mono': 'monospace',
};

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
      { label: 'Calibri', value: 'Calibri, sans-serif' },
      { label: 'Arial', value: 'Arial, sans-serif' },
      { label: 'Courier New', value: 'Courier New, monospace' },
      { label: 'Times New Roman', value: 'Times New Roman, serif' },
      { label: 'Helvetica', value: 'Helvetica, sans-serif' },
    ]);
  });

  it('render stack uses the bundled physical clone for an accurate preview', () => {
    const calibri = getDefaultFontOfferings().find((o) => o.logicalFamily === 'Calibri')!;
    expect(fontOfferingStack(calibri)).toBe('Calibri, sans-serif'); // logical: stored / applied
    expect(fontOfferingRenderStack(calibri)).toBe('Carlito, sans-serif'); // physical: dropdown preview
  });

  it('generic classifier is complete and correct for every bundled family (deliberate, pinned)', () => {
    // Completeness: every bundled physical family has a pinned generic - a new clone cannot ship without one.
    for (const family of BUNDLED_MANIFEST.map((f) => f.family)) {
      expect(EXPECTED_GENERIC[family]).toBeDefined();
    }
    // Correctness: each offering's generic matches the pinned generic for its physical family.
    for (const o of FONT_OFFERINGS) {
      if (o.physicalFamily && EXPECTED_GENERIC[o.physicalFamily]) {
        expect(o.generic).toBe(EXPECTED_GENERIC[o.physicalFamily]);
      }
    }
  });
});
