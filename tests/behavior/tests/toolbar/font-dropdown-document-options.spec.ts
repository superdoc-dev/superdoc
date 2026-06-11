import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

const FONT_OPTION = '[data-item="btn-fontFamily-option"]';
const FONT_TOGGLE = '[data-item="btn-fontFamily-toggle"]';
const OPTION_LABEL = `${FONT_OPTION} .toolbar-dropdown-option__label`;
const DEFAULT_FONT_LABELS = [
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

function expectedLabelsWithDocumentFonts(documentLabels: string[]): string[] {
  return Array.from(new Set([...DEFAULT_FONT_LABELS, ...documentLabels])).sort((left, right) =>
    left.localeCompare(right),
  );
}

async function openFontFamilyDropdown(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.locator(FONT_TOGGLE).click();
  await superdoc.page.locator(FONT_OPTION).first().waitFor({ state: 'visible', timeout: 5000 });
  await superdoc.waitForStable();
}

async function fontOptionLabels(superdoc: SuperDocFixture): Promise<string[]> {
  return (await superdoc.page.locator(OPTION_LABEL).allInnerTexts()).map((label) => label.trim());
}

async function expectDefaultFontOptions(superdoc: SuperDocFixture): Promise<void> {
  await openFontFamilyDropdown(superdoc);
  expect(await fontOptionLabels(superdoc)).toEqual(DEFAULT_FONT_LABELS);
  await superdoc.page.keyboard.press('Escape');
  await expectFontFamilyDropdownClosed(superdoc);
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

async function replaceSelectionThroughFontInputs(
  superdoc: SuperDocFixture,
  options: { fontPrefix: string; fontSize: string; replacement: string },
): Promise<void> {
  const fontInput = superdoc.page.locator('[data-item="btn-fontFamily"] input');
  await fontInput.click();
  await expectFontFamilyDropdownClosed(superdoc);

  await superdoc.page.keyboard.type(options.fontPrefix);
  await superdoc.page.keyboard.press('Tab');

  const fontSizeInput = superdoc.page.locator('#inlineTextInput-fontSize');
  await expect(fontSizeInput).toBeFocused();
  await superdoc.page.keyboard.type(options.fontSize);
  await superdoc.page.keyboard.press('Tab');

  await superdoc.page.keyboard.type(options.replacement);
  await superdoc.waitForStable();
}

test('font dropdown opens immediately with the built-in font list and an enabled control', async ({ superdoc }) => {
  const fontFamily = superdoc.page.locator('[data-item="btn-fontFamily"]');
  await expect(fontFamily).not.toHaveClass(/sd-disabled/);

  await openFontFamilyDropdown(superdoc);

  const labels = await fontOptionLabels(superdoc);
  expect(labels).toEqual(DEFAULT_FONT_LABELS);
  for (const absent of ['Aptos', 'Cambria', 'Calibri Light', 'Century Schoolbook', 'Arial MT', 'Courier', 'Times']) {
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

test('typing in the font combobox applies to the selected text without opening the list', async ({ superdoc }) => {
  await superdoc.type('Combobox font sample');
  await superdoc.waitForStable();

  // Pin document fonts: async font detection can add document-derived families whose
  // names also start with the typed prefix, making autocomplete pick a different font.
  await stubDocumentFontsAndNotify(superdoc, []);

  const pos = await superdoc.findTextPos('Combobox font sample');
  await superdoc.setTextSelection(pos, pos + 'Combobox font sample'.length);
  await superdoc.waitForStable();

  const fontInput = superdoc.page.locator('[data-item="btn-fontFamily"] input');
  await fontInput.click();
  await expectFontFamilyDropdownClosed(superdoc);

  await fontInput.fill('cou');
  await fontInput.press('Enter');
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .sd-button-label')).toHaveText('Courier New');
  await superdoc.assertTextMarkAttrs('Combobox font sample', 'textStyle', { fontFamily: 'Courier New' });
});

test('tabbing through font family and size returns to the editor with formatting preserved', async ({ superdoc }) => {
  await superdoc.type('Keyboard flow sample');
  await superdoc.waitForStable();

  await stubDocumentFontsAndNotify(superdoc, []);
  await expectDefaultFontOptions(superdoc);

  const pos = await superdoc.findTextPos('Keyboard flow sample');
  await superdoc.setTextSelection(pos, pos + 'Keyboard flow sample'.length);
  await superdoc.waitForStable();

  await replaceSelectionThroughFontInputs(superdoc, {
    fontPrefix: 'cou',
    fontSize: '18',
    replacement: 'done',
  });

  await superdoc.assertTextContent('done');
  await superdoc.assertTextMarkAttrs('done', 'textStyle', {
    fontFamily: 'Courier New',
    fontSize: '18pt',
  });
});

test('tabbing through font family and size preserves formatting when all text is selected', async ({ superdoc }) => {
  await superdoc.type('Select all keyboard flow');
  await superdoc.waitForStable();

  await stubDocumentFontsAndNotify(superdoc, []);
  await expectDefaultFontOptions(superdoc);

  await superdoc.selectAll();
  await superdoc.waitForStable();

  await replaceSelectionThroughFontInputs(superdoc, {
    fontPrefix: 'cal',
    fontSize: '20',
    replacement: 'done',
  });

  await superdoc.assertTextContent('done');
  await superdoc.assertTextMarkAttrs('done', 'textStyle', {
    fontFamily: 'Calibri',
    fontSize: '20pt',
  });
});

test('pressing Enter in the font combobox preserves formatting when all text is selected', async ({ superdoc }) => {
  await superdoc.type('Select all enter flow');
  await superdoc.waitForStable();

  await stubDocumentFontsAndNotify(superdoc, []);
  await expectDefaultFontOptions(superdoc);

  await superdoc.selectAll();
  await superdoc.waitForStable();

  const fontInput = superdoc.page.locator('[data-item="btn-fontFamily"] input');
  await fontInput.click();
  await expectFontFamilyDropdownClosed(superdoc);

  await superdoc.page.keyboard.type('cal');
  await superdoc.page.keyboard.press('Enter');
  await superdoc.page.keyboard.type('done');
  await superdoc.waitForStable();

  await superdoc.assertTextContent('done');
  await superdoc.assertTextMarkAttrs('done', 'textStyle', {
    fontFamily: 'Calibri',
  });
});

test('typing a custom font family preserves the typed logical name', async ({ superdoc }) => {
  await superdoc.type('Custom font sample');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('Custom font sample');
  await superdoc.setTextSelection(pos, pos + 'Custom font sample'.length);
  await superdoc.waitForStable();

  const fontInput = superdoc.page.locator('[data-item="btn-fontFamily"] input');
  await fontInput.click();
  await fontInput.fill('Brand Sans');
  await fontInput.press('Enter');
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .sd-button-label')).toHaveText('Brand Sans');
  await superdoc.assertTextMarkAttrs('Custom font sample', 'textStyle', { fontFamily: 'Brand Sans' });
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
  expect(await fontOptionLabels(superdoc)).toEqual(
    expectedLabelsWithDocumentFonts(['Aptos', 'Apple Chancery', 'Bangla MN']),
  );

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
