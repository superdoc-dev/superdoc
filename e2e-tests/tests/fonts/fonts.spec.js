import { test, expect } from '@playwright/test';
import { goToPageAndWaitForEditor, sleep } from '../helpers.js';

test.describe('fonts', () => {
  test('should resolve document fonts with blank doc', async ({ page, context }) => {
    await context.grantPermissions(['local-fonts']);

    const resolvedFonts = {};

    const onFontsResolved = new Promise((resolve) => {
      page.exposeFunction('onFontsResolved', ({ documentFonts, unsupportedFonts }) => {
        resolvedFonts.documentFonts = documentFonts.sort();
        resolvedFonts.unsupportedFonts = unsupportedFonts.sort();
        resolve();
      });
    });

    await goToPageAndWaitForEditor(page, { includeFontsResolved: true });
    await onFontsResolved;

    expect(resolvedFonts).toEqual({
      documentFonts: ['Courier New', 'Arial', 'Times New Roman'].sort(),
      unsupportedFonts: [],
    });
  });

  test('should resolve document fonts with only inline fonts', async ({ page, context }) => {
    await context.grantPermissions(['local-fonts']);

    await goToPageAndWaitForEditor(page, { includeFontsResolved: true });

    const resolvedFonts = {};
    const onFontsResolved = new Promise((resolve) => {
      page.exposeFunction('onFontsResolved', ({ documentFonts, unsupportedFonts }) => {
        resolvedFonts.documentFonts = documentFonts.sort();
        resolvedFonts.unsupportedFonts = unsupportedFonts.sort();
        resolve();
      });
    });

    // This document doesn't have any fonts on the fontTable, but instead they are defined inline
    await page.locator('input[type="file"]').setInputFiles(`./test-data/font-documents/inline-fonts.docx`);

    await onFontsResolved;

    // None of them are supported on the Ubuntu docker image but they must be here
    expect(resolvedFonts).toEqual({
      documentFonts: ['Aptos', 'Arial', 'Comic Sans MS'].sort(),
      unsupportedFonts: ['Aptos', 'Comic Sans MS'].sort(),
    });
  });

  test('should resolve fonts when all fonts are indeed supported', async ({ page, context }) => {
    await context.grantPermissions(['local-fonts']);

    await goToPageAndWaitForEditor(page, { includeFontsResolved: true });

    const resolvedFonts = {};
    const onFontsResolved = new Promise((resolve) => {
      page.exposeFunction('onFontsResolved', ({ documentFonts, unsupportedFonts }) => {
        resolvedFonts.documentFonts = documentFonts.sort();
        resolvedFonts.unsupportedFonts = unsupportedFonts.sort();
        resolve();
      });
    });

    await page.locator('input[type="file"]').setInputFiles(`./test-data/font-documents/supported-fonts-ubuntu.docx`);

    await onFontsResolved;
    await page.waitForSelector('div.super-editor');
    await expect(page.locator('div.super-editor').first()).toBeVisible();

    expect(resolvedFonts).toEqual({
      // Arial is included because it's the document's default font in w:docDefaults
      documentFonts: ['Arial', 'DejaVu Sans', 'Liberation Serif', 'Unifont Upper'].sort(),
      unsupportedFonts: [],
    });
  });

  test('should resolve ~30 fonts with a very large document', async ({ page, context }) => {
    test.setTimeout(15_000);
    await context.grantPermissions(['local-fonts']);

    await goToPageAndWaitForEditor(page, { includeFontsResolved: true });

    const resolvedFonts = {};
    const onFontsResolved = new Promise((resolve) => {
      page.exposeFunction('onFontsResolved', ({ documentFonts, unsupportedFonts }) => {
        resolvedFonts.documentFonts = documentFonts.sort();
        resolvedFonts.unsupportedFonts = unsupportedFonts.sort();
        resolve();
      });
    });

    await page.locator('input[type="file"]').setInputFiles(`./test-data/font-documents/600-pages-multiple-fonts.docx`);

    await onFontsResolved;

    expect(resolvedFonts).toEqual({
      documentFonts: [
        'Andale Mono',
        'AppleGothic',
        'BM DoHyeon OTF',
        'BM HANNA Air OTF',
        'BM YEONSUNG OTF',
        'Batang',
        'Calibri',
        'Calibri Light',
        'Cambria',
        'Cooper Black',
        'Didot',
        'Dotum',
        'Georgia',
        'Gulim',
        'HeadLineA',
        'Helvetica',
        'Malgun Gothic',
        'NANUMMYEONGJOEXTRABOLD',
        'Nanum Brush Script',
        'NanumMyeongjo',
        'October Compressed Devanagari',
        'Onest',
        'Open Sans',
        'PCMyungjo',
        'Papyrus',
        'Symbol',
        'Times New Roman',
        'Yu Gothic Medium',
      ].sort(),
      unsupportedFonts: [
        'Andale Mono',
        'AppleGothic',
        'BM DoHyeon OTF',
        'BM HANNA Air OTF',
        'BM YEONSUNG OTF',
        'Batang',
        'Calibri',
        'Calibri Light',
        'Cambria',
        'Cooper Black',
        'Didot',
        'Dotum',
        'Georgia',
        'Gulim',
        'HeadLineA',
        'Malgun Gothic',
        'NANUMMYEONGJOEXTRABOLD',
        'Nanum Brush Script',
        'NanumMyeongjo',
        'October Compressed Devanagari',
        'Onest',
        'Open Sans',
        'PCMyungjo',
        'Papyrus',
        'Symbol',
        'Yu Gothic Medium',
      ],
    });
  });

  test('should resolve embedded fonts', async ({ page, context }) => {
    await context.grantPermissions(['local-fonts']);
    await goToPageAndWaitForEditor(page, { includeFontsResolved: true });

    const resolvedFonts = {};
    const onFontsResolved = new Promise((resolve) => {
      page.exposeFunction('onFontsResolved', ({ documentFonts, unsupportedFonts }) => {
        resolvedFonts.documentFonts = documentFonts.sort();
        resolvedFonts.unsupportedFonts = unsupportedFonts.sort();
        resolve();
      });
    });

    await page.locator('input[type="file"]').setInputFiles(`./test-data/font-documents/embedded-fonts.docx`);

    await onFontsResolved;

    expect(resolvedFonts).toEqual({
      documentFonts: ['Aptos', 'Aptos Display', 'Times New Roman'].sort(),
      unsupportedFonts: [],
    });
  });
});
