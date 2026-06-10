import { describe, expect, it } from 'vitest';
import { BUNDLED_MANIFEST } from './bundled-manifest';
import { createFontResolver, resolveFontFamily } from './resolver';
import { SUBSTITUTION_EVIDENCE } from './substitution-evidence';

/**
 * The logical -> physical substitutions the resolver activates from DocFonts evidence and bundled
 * assets. Adding a substitute is a deliberate, reviewed edit to this list.
 */
const EXPECTED_SUBSTITUTES: ReadonlyArray<readonly [logical: string, physical: string]> = [
  ['Calibri', 'Carlito'],
  ['Cambria', 'Caladea'],
  ['Arial', 'Liberation Sans'],
  ['Times New Roman', 'Liberation Serif'],
  ['Courier New', 'Liberation Mono'],
  ['Helvetica', 'Liberation Sans'],
  ['Cooper Black', 'Caprasimo'],
  ['Georgia', 'Gelasio'],
  ['Baskerville Old Face', 'Bacasime Antique'],
];

describe('substitution evidence -> resolver derivation', () => {
  it('derives exactly the reviewed bundled substitutions', () => {
    const resolver = createFontResolver();
    for (const [logical, physical] of EXPECTED_SUBSTITUTES) {
      expect(resolver.resolvePrimaryPhysicalFamily(logical)).toBe(physical);
    }
    // Asset-gated input: the registry carries more substitute rows than SuperDoc ships, so count only
    // the ones whose clone is bundled (the resolver's actual input).
    const bundled = new Set(BUNDLED_MANIFEST.map((f) => f.family));
    const activeSubstitutes = SUBSTITUTION_EVIDENCE.filter(
      (r) => r.policyAction === 'substitute' && r.physicalFamily && bundled.has(r.physicalFamily),
    );
    expect(activeSubstitutes).toHaveLength(EXPECTED_SUBSTITUTES.length);
  });

  it('does not substitute a family with no evidence row (the map did not grow)', () => {
    // Aptos has a registry row but no open substitute (customer_supplied), so it passes through unchanged.
    expect(resolveFontFamily('Aptos')).toEqual({
      logicalFamily: 'Aptos',
      physicalFamily: 'Aptos',
      reason: 'as_requested',
    });
  });

  it('keeps a QUALIFIED substitute mapped: Cambria -> Caladea (verdict does not gate inclusion)', () => {
    const cambria = SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'cambria');
    expect(cambria?.verdict).toBe('visual_only'); // worst-face verdict (Bold Italic U+0060)
    expect(cambria?.policyAction).toBe('substitute'); // ...but still the recommended substitute
    // So the resolver maps it like any other bundled substitute; reporting stays bundled_substitute
    // until the verdict-aware reporting pass.
    expect(resolveFontFamily('Cambria')).toEqual({
      logicalFamily: 'Cambria',
      physicalFamily: 'Caladea',
      reason: 'bundled_substitute',
    });
  });

  it('every substitute the resolver activates ships in the bundled pack (asset-availability invariant)', () => {
    const bundled = new Set(BUNDLED_MANIFEST.map((f) => f.family));
    for (const [, physical] of EXPECTED_SUBSTITUTES) {
      expect(bundled.has(physical)).toBe(true);
    }
  });

  it('keeps an un-bundled substitute inert until its asset ships (the asset gate, not just the policy)', () => {
    // The registry recommends substitutes SuperDoc has not shipped a clone for (e.g. Arial Narrow).
    // canRenderFamily must keep every such row OUT of the resolver: it resolves as_requested, not mapped.
    const bundled = new Set(BUNDLED_MANIFEST.map((f) => f.family));
    const unbundled = SUBSTITUTION_EVIDENCE.filter(
      (r) => r.policyAction === 'substitute' && r.physicalFamily && !bundled.has(r.physicalFamily),
    );
    expect(unbundled.length).toBeGreaterThan(0); // the registry really does carry some.
    for (const row of unbundled) {
      expect(resolveFontFamily(row.logicalFamily).reason).toBe('as_requested');
    }
  });

  it('a QUALIFIED row carries the authoritative per-face breakdown its top-level verdict hides', () => {
    // The whole point of the evidence layer: visual_only at the top, but three faces are metric_safe.
    const cambria = SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'cambria');
    expect(cambria?.faceVerdicts).toEqual({
      regular: 'metric_safe',
      bold: 'metric_safe',
      italic: 'metric_safe',
      boldItalic: 'visual_only',
    });
    expect(cambria?.glyphExceptions?.[0]).toMatchObject({ slot: 'boldItalic', codepoint: 0x60 });
  });

  it('keeps the advance basis so proportional and monospace rows are not conflated', () => {
    const calibri = SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'calibri');
    const lucidaConsole = SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'lucida-console');

    expect(calibri?.advance).toMatchObject({ basis: 'latin_full', meanDelta: 0, maxDelta: 0 });
    expect(lucidaConsole?.advance).toMatchObject({ basis: 'monospace_cell' });
  });

  it('Calibri Light is a category_fallback (visual_only), not a metric substitute', () => {
    const cl = SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'calibri-light');
    expect(cl).toMatchObject({ policyAction: 'category_fallback', verdict: 'visual_only', physicalFamily: 'Carlito' });
    // NOT among the metric substitutes, so the reviewed-substitute guard above is unaffected; the resolver maps it
    // with reason category_fallback, never bundled_substitute.
    const substituteRows = SUBSTITUTION_EVIDENCE.filter((r) => r.policyAction === 'substitute' && r.physicalFamily);
    expect(substituteRows.some((r) => r.evidenceId === 'calibri-light')).toBe(false);
    expect(resolveFontFamily('Calibri Light').reason).toBe('category_fallback');
    // Its Carlito target still ships in the bundled pack, so the runtime can render the fallback.
    expect(new Set(BUNDLED_MANIFEST.map((f) => f.family)).has('Carlito')).toBe(true);
  });

  it('Cooper Black activates Caprasimo with explicit synthetic styled faces from DocFonts', () => {
    const row = SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'cooper-black');
    expect(row).toMatchObject({
      logicalFamily: 'Cooper Black',
      physicalFamily: 'Caprasimo',
      policyAction: 'substitute',
      verdict: 'visual_only',
      faces: { regular: true, bold: false, italic: false, boldItalic: false },
      faceSources: {
        bold: { kind: 'synthetic', from: 'regular' },
        italic: { kind: 'synthetic', from: 'regular' },
        boldItalic: { kind: 'synthetic', from: 'regular' },
      },
      faceVerdicts: {
        regular: 'metric_safe',
        bold: 'visual_only',
        italic: 'visual_only',
        boldItalic: 'visual_only',
      },
    });
    expect(resolveFontFamily('Cooper Black')).toEqual({
      logicalFamily: 'Cooper Black',
      physicalFamily: 'Caprasimo',
      reason: 'bundled_substitute',
    });
  });

  it('new reviewed rows preserve their real-vs-synthetic face model', () => {
    expect(SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'baskerville-old-face')).toMatchObject({
      logicalFamily: 'Baskerville Old Face',
      physicalFamily: 'Bacasime Antique',
      policyAction: 'substitute',
      verdict: 'visual_only',
      faces: { regular: true, bold: false, italic: false, boldItalic: false },
      faceSources: {
        bold: { kind: 'synthetic', from: 'regular' },
        italic: { kind: 'synthetic', from: 'regular' },
        boldItalic: { kind: 'synthetic', from: 'regular' },
      },
    });
    expect(SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'brush-script-mt')).toMatchObject({
      logicalFamily: 'Brush Script MT',
      physicalFamily: 'Oregano Italic',
      policyAction: 'category_fallback',
      faces: { regular: true, bold: false, italic: false, boldItalic: false },
      faceSources: {
        bold: { kind: 'synthetic', from: 'regular' },
      },
    });
    expect(SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'lucida-console')).toMatchObject({
      logicalFamily: 'Lucida Console',
      physicalFamily: 'Noto Sans Mono',
      policyAction: 'category_fallback',
      faces: { regular: true, bold: true, italic: false, boldItalic: false },
      faceSources: {
        italic: { kind: 'synthetic', from: 'regular' },
        boldItalic: { kind: 'synthetic', from: 'bold' },
      },
      advance: { basis: 'monospace_cell', meanDelta: 0.00254, maxDelta: 0.00303 },
    });
    expect(resolveFontFamily('Baskerville Old Face').reason).toBe('bundled_substitute');
    expect(resolveFontFamily('Brush Script MT').reason).toBe('category_fallback');
    expect(resolveFontFamily('Lucida Console').reason).toBe('category_fallback');
  });
});
