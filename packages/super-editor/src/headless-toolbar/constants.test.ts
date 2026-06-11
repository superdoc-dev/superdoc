import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT_FAMILY_OPTIONS } from './constants';

describe('DEFAULT_FONT_FAMILY_OPTIONS (headless default font options, derived from the font-offering registry)', () => {
  it('advertises bundled defaults and selected bundled fallback choices (logical name + logical stack)', () => {
    expect(DEFAULT_FONT_FAMILY_OPTIONS).toEqual([
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

  it('drops non-advertised fonts from defaults', () => {
    const labels = new Set(DEFAULT_FONT_FAMILY_OPTIONS.map((o) => o.label));
    expect(labels.has('Aptos')).toBe(false);
    expect(labels.has('Cambria')).toBe(false);
    expect(labels.has('Calibri Light')).toBe(false);
    expect(labels.has('Century Schoolbook')).toBe(false);
    expect(labels.has('Arial MT')).toBe(false);
    expect(labels.has('Courier')).toBe(false);
    expect(labels.has('Times')).toBe(false);
  });
});
