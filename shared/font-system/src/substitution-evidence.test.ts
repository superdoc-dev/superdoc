import { describe, it, expect } from 'vitest';
import { createFontResolver, resolveFontFamily } from './resolver';
import { SUBSTITUTION_EVIDENCE } from './substitution-evidence';
import { BUNDLED_MANIFEST } from './bundled-manifest';

/**
 * The six logical -> physical substitutions the resolver shipped before the evidence registry
 * existed. The registry must derive EXACTLY these - introducing the manifest is a no-behavior-change
 * refactor, not an expansion. Adding a substitute is a deliberate, reviewed edit to this list.
 */
const EXPECTED_SUBSTITUTES: ReadonlyArray<readonly [logical: string, physical: string]> = [
  ['Calibri', 'Carlito'],
  ['Cambria', 'Caladea'],
  ['Arial', 'Liberation Sans'],
  ['Times New Roman', 'Liberation Serif'],
  ['Courier New', 'Liberation Mono'],
  ['Helvetica', 'Liberation Sans'],
];

describe('substitution evidence -> resolver derivation', () => {
  it("derives exactly today's six substitutions (no behavior change)", () => {
    const resolver = createFontResolver();
    for (const [logical, physical] of EXPECTED_SUBSTITUTES) {
      expect(resolver.resolvePrimaryPhysicalFamily(logical)).toBe(physical);
    }
    // The derivation input is exactly six rows: policyAction 'substitute' with a physical target.
    const substituteRows = SUBSTITUTION_EVIDENCE.filter((r) => r.policyAction === 'substitute' && r.physicalFamily);
    expect(substituteRows).toHaveLength(EXPECTED_SUBSTITUTES.length);
  });

  it('does not substitute a family with no evidence row (the map did not grow)', () => {
    // Aptos is not in the snapshot (no clean open substitute), so it must pass through unchanged.
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

  it('every substitute target is a family the bundled pack ships (asset-availability invariant)', () => {
    const bundledFamilies = new Set(BUNDLED_MANIFEST.map((f) => f.family));
    for (const row of SUBSTITUTION_EVIDENCE) {
      if (row.policyAction === 'substitute' && row.physicalFamily) {
        expect(bundledFamilies.has(row.physicalFamily)).toBe(true);
      }
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

  it('Calibri Light is a category_fallback (visual_only), not a metric substitute', () => {
    const cl = SUBSTITUTION_EVIDENCE.find((r) => r.evidenceId === 'calibri-light');
    expect(cl).toMatchObject({ policyAction: 'category_fallback', verdict: 'visual_only', physicalFamily: 'Carlito' });
    // NOT among the metric substitutes, so the six-pair guard above is unaffected; the resolver maps it
    // with reason category_fallback, never bundled_substitute.
    const substituteRows = SUBSTITUTION_EVIDENCE.filter((r) => r.policyAction === 'substitute' && r.physicalFamily);
    expect(substituteRows.some((r) => r.evidenceId === 'calibri-light')).toBe(false);
    expect(resolveFontFamily('Calibri Light').reason).toBe('category_fallback');
    // Its Carlito target still ships in the bundled pack, so the runtime can render the fallback.
    expect(new Set(BUNDLED_MANIFEST.map((f) => f.family)).has('Carlito')).toBe(true);
  });
});
