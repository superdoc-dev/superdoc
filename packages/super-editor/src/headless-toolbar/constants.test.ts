import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT_FAMILY_OPTIONS } from './constants';

describe('DEFAULT_FONT_FAMILY_OPTIONS (headless default font options, derived from the font-offering registry)', () => {
  it('is the conservative no-pack baseline: one Word font per CSS generic', () => {
    expect(DEFAULT_FONT_FAMILY_OPTIONS).toEqual([
      { label: 'Arial', value: 'Arial, sans-serif' },
      { label: 'Courier New', value: 'Courier New, monospace' },
      { label: 'Times New Roman', value: 'Times New Roman, serif' },
    ]);
  });

  it('does not advertise the rich pack or unsupported fonts in the static default', () => {
    const labels = new Set(DEFAULT_FONT_FAMILY_OPTIONS.map((o) => o.label));
    // Rich-pack families appear only once the pack is configured (built per instance). Georgia is a
    // second serif, so it is a pack-enabled option, not part of the one-per-generic baseline.
    expect(labels.has('Calibri')).toBe(false);
    expect(labels.has('Georgia')).toBe(false);
    expect(labels.has('Cooper Black')).toBe(false);
    expect(labels.has('Verdana')).toBe(false);
    // Never-default fonts stay absent regardless.
    expect(labels.has('Aptos')).toBe(false);
    expect(labels.has('Cambria')).toBe(false);
    expect(labels.has('Calibri Light')).toBe(false);
    expect(labels.has('Arial MT')).toBe(false);
  });
});
