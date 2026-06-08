import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

const FONT_OPTION = '[data-item="btn-fontFamily-option"]';
const OPTION_LABEL = `${FONT_OPTION} .toolbar-dropdown-option__label`;

async function openFontFamilyDropdown(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.locator('[data-item="btn-fontFamily"]').click();
  await superdoc.page.locator(FONT_OPTION).first().waitFor({ state: 'visible', timeout: 5000 });
  await superdoc.waitForStable();
}

async function fontOptionLabels(superdoc: SuperDocFixture): Promise<string[]> {
  return (await superdoc.page.locator(OPTION_LABEL).allInnerTexts()).map((label) => label.trim());
}

async function expectFontFamilyDropdownClosed(superdoc: SuperDocFixture): Promise<void> {
  await expect(superdoc.page.locator(`${FONT_OPTION}:visible`)).toHaveCount(0);
}

async function selectFontOption(superdoc: SuperDocFixture, label: string): Promise<void> {
  await superdoc.page
    .locator(FONT_OPTION)
    .filter({ has: superdoc.page.getByText(label, { exact: true }) })
    .click();
  await superdoc.waitForStable();
  await superdoc.page
    .locator('.presentation-editor__viewport')
    .first()
    .click({ position: { x: 50, y: 50 } });
  await superdoc.waitForStable();
}

async function stubDocumentFontsAndNotify(
  superdoc: SuperDocFixture,
  options: Array<{ logicalFamily: string; previewFamily: string }>,
): Promise<void> {
  await superdoc.page.evaluate((opts) => {
    const sd = (window as any).superdoc;
    sd.fonts.getDocumentFontOptions = () => opts;
    sd.toolbar.activeEditor.emit('fonts-changed');
  }, options);
  await superdoc.waitForStable();
}

test('font dropdown opens immediately with the clean default list and an enabled control', async ({ superdoc }) => {
  const fontFamily = superdoc.page.locator('[data-item="btn-fontFamily"]');
  await expect(fontFamily).not.toHaveClass(/sd-disabled/);

  await openFontFamilyDropdown(superdoc);

  const labels = await fontOptionLabels(superdoc);
  expect(labels).toEqual(['Arial', 'Calibri', 'Courier New', 'Helvetica', 'Times New Roman']);
  for (const absent of ['Aptos', 'Georgia', 'Cambria', 'Calibri Light']) {
    expect(labels).not.toContain(absent);
  }
});

test('selecting a default font applies its logical Word-facing family to the selection', async ({ superdoc }) => {
  await superdoc.type('Default font sample');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('Default font sample');
  await superdoc.setTextSelection(pos, pos + 'Default font sample'.length);
  await superdoc.waitForStable();

  await openFontFamilyDropdown(superdoc);
  await selectFontOption(superdoc, 'Helvetica');

  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .sd-button-label')).toHaveText('Helvetica');
  await superdoc.assertTextMarkAttrs('Default font sample', 'textStyle', { fontFamily: 'Helvetica' });
});

test('a document-specific font reaches the live dropdown without status text and applies the logical family', async ({
  superdoc,
}) => {
  await superdoc.type('Document font sample');
  await superdoc.waitForStable();

  await stubDocumentFontsAndNotify(superdoc, [
    { logicalFamily: 'Aptos', previewFamily: 'Aptos' },
    { logicalFamily: 'Apple Chancery', previewFamily: 'Apple Chancery' },
    { logicalFamily: 'Bangla MN', previewFamily: 'Bangla MN' },
  ]);

  const pos = await superdoc.findTextPos('Document font sample');
  await superdoc.setTextSelection(pos, pos + 'Document font sample'.length);
  await superdoc.waitForStable();

  await openFontFamilyDropdown(superdoc);
  expect(await fontOptionLabels(superdoc)).toEqual([
    'Apple Chancery',
    'Aptos',
    'Arial',
    'Bangla MN',
    'Calibri',
    'Courier New',
    'Helvetica',
    'Times New Roman',
  ]);

  const aptosOption = superdoc.page
    .locator(FONT_OPTION)
    .filter({ has: superdoc.page.getByText('Aptos', { exact: true }) });
  await expect(aptosOption.locator('.toolbar-dropdown-option__label')).toHaveText('Aptos');
  await expect(aptosOption).toHaveAttribute('aria-label', 'Font family - Aptos');

  await selectFontOption(superdoc, 'Aptos');

  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .sd-button-label')).toHaveText('Aptos');
  await superdoc.assertTextMarkAttrs('Document font sample', 'textStyle', { fontFamily: 'Aptos' });
});

test('the dropdown refreshes on fonts-changed without a resize', async ({ superdoc }) => {
  await openFontFamilyDropdown(superdoc);
  expect(await fontOptionLabels(superdoc)).not.toContain('Aptos');
  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();
  await expectFontFamilyDropdownClosed(superdoc);

  await stubDocumentFontsAndNotify(superdoc, [{ logicalFamily: 'Aptos', previewFamily: 'Aptos' }]);

  await openFontFamilyDropdown(superdoc);
  expect(await fontOptionLabels(superdoc)).toContain('Aptos');
});
