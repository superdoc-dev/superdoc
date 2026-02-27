import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

async function typeAndSelect(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.type('This is a sentence');
  await superdoc.newLine();
  await superdoc.type('Hello tests');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('is a sentence');
  await superdoc.setTextSelection(pos, pos + 'is a sentence'.length);
  await superdoc.waitForStable();
}

async function clickToolbarButton(superdoc: SuperDocFixture, dataItem: string): Promise<void> {
  await superdoc.page.locator(`[data-item="btn-${dataItem}"]`).click();
  await superdoc.waitForStable();
}

async function selectDropdownOption(superdoc: SuperDocFixture, dataItem: string, optionText: string): Promise<void> {
  await superdoc.page.locator(`[data-item="btn-${dataItem}"]`).click();
  await superdoc.waitForStable();
  await superdoc.page.locator(`[data-item="btn-${dataItem}-option"]`).filter({ hasText: optionText }).click();
  await superdoc.waitForStable();
}

async function selectColorSwatch(superdoc: SuperDocFixture, dataItem: string, label: string): Promise<void> {
  await superdoc.page.locator(`[data-item="btn-${dataItem}"]`).click();
  await superdoc.waitForStable();
  await superdoc.page.locator(`.option[aria-label="${label}"]`).first().click();
  await superdoc.waitForStable();
}

// --- Toggle pairs ---

test('bold + italic', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  await clickToolbarButton(superdoc, 'bold');
  await clickToolbarButton(superdoc, 'italic');

  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-italic"]')).toHaveClass(/active/);
  await superdoc.snapshot('bold + italic applied');

  await superdoc.assertTextHasMarks('is a sentence', ['bold', 'italic']);
});

test('bold + underline', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  await clickToolbarButton(superdoc, 'bold');
  await clickToolbarButton(superdoc, 'underline');

  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-underline"]')).toHaveClass(/active/);
  await superdoc.snapshot('bold + underline applied');

  await superdoc.assertTextHasMarks('is a sentence', ['bold', 'underline']);
});

test('italic + strikethrough', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  await clickToolbarButton(superdoc, 'italic');
  await clickToolbarButton(superdoc, 'strike');

  await expect(superdoc.page.locator('[data-item="btn-italic"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-strike"]')).toHaveClass(/active/);
  await superdoc.snapshot('italic + strikethrough applied');

  await superdoc.assertTextHasMarks('is a sentence', ['italic', 'strike']);
});

// --- All toggles stacked ---

test('bold + italic + underline + strikethrough', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  await clickToolbarButton(superdoc, 'bold');
  await clickToolbarButton(superdoc, 'italic');
  await clickToolbarButton(superdoc, 'underline');
  await clickToolbarButton(superdoc, 'strike');

  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-italic"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-underline"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-strike"]')).toHaveClass(/active/);
  await superdoc.snapshot('all four toggles applied');

  await superdoc.assertTextHasMarks('is a sentence', ['bold', 'italic', 'underline', 'strike']);
});

// --- Toggle + value styles ---

test('bold + font family + font size', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  await clickToolbarButton(superdoc, 'bold');
  await selectDropdownOption(superdoc, 'fontFamily', 'Georgia');
  await selectDropdownOption(superdoc, 'fontSize', '24');

  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText('Georgia');
  await expect(superdoc.page.locator('#inlineTextInput-fontSize')).toHaveValue('24');
  await superdoc.snapshot('bold + Georgia 24pt applied');

  await superdoc.assertTextHasMarks('is a sentence', ['bold']);
  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { fontFamily: 'Georgia' });
  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { fontSize: '24pt' });
});

test('italic + color', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  await clickToolbarButton(superdoc, 'italic');
  await selectColorSwatch(superdoc, 'color', 'red');

  await expect(superdoc.page.locator('[data-item="btn-italic"]')).toHaveClass(/active/);
  const colorBar = superdoc.page.locator('[data-item="btn-color"] .color-bar');
  await expect(colorBar).toHaveCSS('background-color', 'rgb(210, 0, 63)');
  await superdoc.snapshot('italic + red color applied');

  await superdoc.assertTextHasMarks('is a sentence', ['italic']);
  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { color: '#D2003F' });
});

// --- Multiple value styles ---

test('font family + font size + color', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  await selectDropdownOption(superdoc, 'fontFamily', 'Georgia');
  await selectDropdownOption(superdoc, 'fontSize', '18');
  await selectColorSwatch(superdoc, 'color', 'dark red');

  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText('Georgia');
  await expect(superdoc.page.locator('#inlineTextInput-fontSize')).toHaveValue('18');
  const colorBar = superdoc.page.locator('[data-item="btn-color"] .color-bar');
  await expect(colorBar).toHaveCSS('background-color', 'rgb(134, 0, 40)');
  await superdoc.snapshot('Georgia 18pt dark red applied');

  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { fontFamily: 'Georgia' });
  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { fontSize: '18pt' });
  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { color: '#860028' });
});

// --- Kitchen sink ---

test('all styles combined', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  // Apply all toggle styles
  await clickToolbarButton(superdoc, 'bold');
  await clickToolbarButton(superdoc, 'italic');
  await clickToolbarButton(superdoc, 'underline');
  await clickToolbarButton(superdoc, 'strike');
  await superdoc.snapshot('all toggles applied');

  // Apply all value styles
  await selectDropdownOption(superdoc, 'fontFamily', 'Courier New');
  await selectDropdownOption(superdoc, 'fontSize', '24');
  await selectColorSwatch(superdoc, 'color', 'red');
  await selectColorSwatch(superdoc, 'highlight', 'yellow');

  // Assert all toolbar button states
  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-italic"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-underline"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-strike"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText('Courier New');
  await expect(superdoc.page.locator('#inlineTextInput-fontSize')).toHaveValue('24');
  const colorBar = superdoc.page.locator('[data-item="btn-color"] .color-bar');
  await expect(colorBar).toHaveCSS('background-color', 'rgb(210, 0, 63)');
  const highlightBar = superdoc.page.locator('[data-item="btn-highlight"] .color-bar');
  await expect(highlightBar).toHaveCSS('background-color', 'rgb(236, 207, 53)');
  await superdoc.snapshot('all styles applied');

  // Assert all PM marks
  await superdoc.assertTextHasMarks('is a sentence', ['bold', 'italic', 'underline', 'strike', 'highlight']);
  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { fontFamily: 'Courier New' });
  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { fontSize: '24pt' });
  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { color: '#D2003F' });
});

test('textStyle attr checks require one run to satisfy all attrs', async ({ superdoc }) => {
  await superdoc.type('Split attrs');
  await superdoc.waitForStable();

  const splitPos = await superdoc.findTextPos('Split');
  await superdoc.setTextSelection(splitPos, splitPos + 'Split'.length);
  await selectDropdownOption(superdoc, 'fontFamily', 'Georgia');

  const attrsPos = await superdoc.findTextPos('attrs');
  await superdoc.setTextSelection(attrsPos, attrsPos + 'attrs'.length);
  await selectColorSwatch(superdoc, 'color', 'red');

  await superdoc.assertTextMarkAttrs('Split', 'textStyle', { fontFamily: 'Georgia' });
  await superdoc.assertTextMarkAttrs('attrs', 'textStyle', { color: '#D2003F' });

  await expect(
    superdoc.assertTextMarkAttrs('Split attrs', 'textStyle', { fontFamily: 'Georgia', color: '#D2003F' }),
  ).rejects.toThrow();
});
