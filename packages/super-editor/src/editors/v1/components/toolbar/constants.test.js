import { describe, expect, it } from 'vitest';
import { composeToolbarFontOptions, TOOLBAR_FONTS } from './constants';

describe('TOOLBAR_FONTS (built-in font dropdown, derived from the font-offering registry)', () => {
  it('advertises bundled defaults and selected bundled fallback choices, in alphabetical order', () => {
    expect(TOOLBAR_FONTS.map((f) => f.label)).toEqual([
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
    ]);
  });

  it('does not leak non-advertised fonts into the default dropdown', () => {
    const labels = new Set(TOOLBAR_FONTS.map((f) => f.label));
    for (const name of ['Aptos', 'Cambria', 'Calibri Light', 'Century Schoolbook', 'Arial MT', 'Courier', 'Times']) {
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

describe('composeToolbarFontOptions (document fonts unioned with the bundled defaults)', () => {
  const doc = (logicalFamily, previewFamily) => ({
    logicalFamily,
    previewFamily: previewFamily ?? logicalFamily,
  });

  it('returns a consumer-provided fonts list unchanged (custom toolbars own their list)', () => {
    const custom = [{ label: 'My Font', key: 'My Font' }];
    expect(composeToolbarFontOptions([doc('Aptos')], custom)).toBe(custom);
  });

  it('returns undefined with no document fonts, so the caller keeps the bundled defaults', () => {
    expect(composeToolbarFontOptions([], undefined)).toBeUndefined();
    expect(composeToolbarFontOptions(undefined, undefined)).toBeUndefined();
  });

  it('combines defaults and document fonts alphabetically, deduping one already in the defaults', () => {
    const options = composeToolbarFontOptions(
      [doc('Calibri', 'Carlito'), doc('Bangla MN'), doc('Aptos'), doc('Apple Chancery')],
      undefined,
    );
    expect(options.map((o) => o.label)).toEqual([
      'Apple Chancery',
      'Aptos',
      'Arial',
      'Arial Black',
      'Arial Narrow',
      'Bangla MN',
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
    ]);
    expect(options.filter((o) => o.label === 'Calibri')).toHaveLength(1);
  });

  it('maps a document font as a plain logical picker row, with no visible status text', () => {
    const options = composeToolbarFontOptions([doc('Aptos')], undefined);
    const aptos = options.find((option) => option.label === 'Aptos');
    expect(aptos).toMatchObject({
      label: 'Aptos', // pure logical name (active-state match + the stored/exported value)
      key: 'Aptos',
      props: { style: { fontFamily: 'Aptos' }, 'data-item': 'btn-fontFamily-option' },
    });
  });

  it('keeps a document font as a plain name', () => {
    const options = composeToolbarFontOptions([doc('BrandSans')], undefined);
    const brandSans = options.find((option) => option.label === 'BrandSans');
    expect(brandSans.label).toBe('BrandSans');
  });
});
