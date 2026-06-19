import { describe, expect, it } from 'vitest';
import { FULLY_ACTIVE_BUNDLED } from '@superdoc/font-system';
import { composeToolbarFontOptions, TOOLBAR_FONTS, toolbarFontOptionsFor } from './constants';

const RICH_LABELS = [
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

describe('TOOLBAR_FONTS (static built-in font dropdown)', () => {
  it('is the conservative no-pack baseline: one Word font per CSS generic', () => {
    expect(TOOLBAR_FONTS.map((f) => f.label)).toEqual(['Arial', 'Courier New', 'Times New Roman']);
  });

  it('does not advertise the rich pack or unsupported fonts in the static default', () => {
    const labels = new Set(TOOLBAR_FONTS.map((f) => f.label));
    // Georgia is a second serif: a pack-enabled rich option, not part of the one-per-generic baseline.
    for (const name of [
      'Calibri',
      'Georgia',
      'Cooper Black',
      'Verdana',
      'Aptos',
      'Cambria',
      'Calibri Light',
      'Arial MT',
    ]) {
      expect(labels.has(name)).toBe(false);
    }
  });

  it('honors the FontConfig contract: label equals the first family in key', () => {
    for (const f of TOOLBAR_FONTS) {
      expect(f.key.split(',')[0].trim()).toBe(f.label);
    }
  });
});

describe('toolbarFontOptionsFor (the configured rich set)', () => {
  it('returns the full advertised set when the pack is active', () => {
    expect(toolbarFontOptionsFor(FULLY_ACTIVE_BUNDLED).map((f) => f.label)).toEqual(RICH_LABELS);
  });

  it('builds a FontConfig: logical label + logical key + physical-clone preview', () => {
    const calibri = toolbarFontOptionsFor(FULLY_ACTIVE_BUNDLED).find((f) => f.label === 'Calibri');
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
});

describe('composeToolbarFontOptions (document fonts unioned with the built-in set)', () => {
  const doc = (logicalFamily, previewFamily) => ({
    logicalFamily,
    previewFamily: previewFamily ?? logicalFamily,
  });

  it('returns a consumer-provided fonts list unchanged (custom toolbars own their list)', () => {
    const custom = [{ label: 'My Font', key: 'My Font' }];
    expect(composeToolbarFontOptions([doc('Aptos')], custom)).toBe(custom);
  });

  it('returns undefined with baseline base AND no document fonts, so the caller keeps the static const', () => {
    expect(composeToolbarFontOptions([], undefined)).toBeUndefined();
    expect(composeToolbarFontOptions(undefined, undefined)).toBeUndefined();
  });

  it('with no pack configured: baseline base unioned with document fonts, alphabetical', () => {
    const options = composeToolbarFontOptions(
      [doc('Calibri', 'Carlito'), doc('Bangla MN'), doc('Aptos'), doc('Apple Chancery')],
      undefined,
    );
    expect(options.map((o) => o.label)).toEqual([
      'Apple Chancery',
      'Aptos',
      'Arial',
      'Bangla MN',
      'Calibri',
      'Courier New',
      'Times New Roman',
    ]);
    expect(options.filter((o) => o.label === 'Calibri')).toHaveLength(1);
  });

  it('with the pack configured: the full set unioned with document fonts, deduping shared names', () => {
    const options = composeToolbarFontOptions(
      [doc('Calibri', 'Carlito'), doc('Bangla MN'), doc('Aptos'), doc('Apple Chancery')],
      undefined,
      FULLY_ACTIVE_BUNDLED,
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
