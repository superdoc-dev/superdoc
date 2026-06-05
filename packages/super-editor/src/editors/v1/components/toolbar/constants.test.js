import { describe, it, expect } from 'vitest';
import { TOOLBAR_FONTS } from './constants';

describe('TOOLBAR_FONTS (built-in font dropdown, derived from the font-offering registry)', () => {
  it('advertises only the metric-safe bundled defaults, in order', () => {
    expect(TOOLBAR_FONTS.map((f) => f.label)).toEqual(['Calibri', 'Arial', 'Courier New', 'Times New Roman', 'Helvetica']);
  });

  it('does not leak non-bundled or qualified fonts into the default dropdown', () => {
    const labels = new Set(TOOLBAR_FONTS.map((f) => f.label));
    for (const name of ['Georgia', 'Aptos', 'Cambria', 'Calibri Light']) {
      expect(labels.has(name)).toBe(false);
    }
  });

  it('builds a FontConfig: logical label + logical key + physical-clone preview', () => {
    const calibri = TOOLBAR_FONTS.find((f) => f.label === 'Calibri');
    expect(calibri).toMatchObject({
      label: 'Calibri', // applied to the selection + active-state match (Word-facing name)
      key: 'Calibri, sans-serif', // logical CSS stack (option identity)
      fontWeight: 400,
      props: {
        style: { fontFamily: 'Carlito, sans-serif' }, // preview renders in the bundled clone that paints
        'data-item': 'btn-fontFamily-option',
      },
    });
  });

  it('honors the FontConfig contract: label equals the first family in key', () => {
    for (const f of TOOLBAR_FONTS) {
      expect(f.key.split(',')[0].trim()).toBe(f.label);
    }
  });
});
