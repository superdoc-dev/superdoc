import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

async function openFontSizeDropdown(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.locator('[data-item="btn-fontSize"]').click();
  await superdoc.waitForStable();
}

async function expectFontSizeDropdownOpen(superdoc: SuperDocFixture): Promise<void> {
  await expect(superdoc.page.locator('[data-item="btn-fontSize-option"]').first()).toBeVisible();
}

async function expectFontSizeDropdownClosed(superdoc: SuperDocFixture): Promise<void> {
  await expect(superdoc.page.locator('[data-item="btn-fontSize-option"]:visible')).toHaveCount(0);
}

async function openDocumentModeDropdown(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.locator('[data-item="btn-documentMode"]').click();
  await superdoc.waitForStable();
}

async function expectDocumentModeDropdownOpen(superdoc: SuperDocFixture): Promise<void> {
  await expect(superdoc.page.locator('[data-item="btn-documentMode-option"]').first()).toBeVisible();
}

async function expectDocumentModeDropdownClosed(superdoc: SuperDocFixture): Promise<void> {
  await expect(superdoc.page.locator('[data-item="btn-documentMode-option"]:visible')).toHaveCount(0);
}

test('cross-group switch closes previous dropdown (font size -> document mode)', async ({ superdoc }) => {
  await openFontSizeDropdown(superdoc);
  await expectFontSizeDropdownOpen(superdoc);

  await openDocumentModeDropdown(superdoc);
  await expectDocumentModeDropdownOpen(superdoc);
  await expectFontSizeDropdownClosed(superdoc);
});

test('same trigger click toggles dropdown open/close', async ({ superdoc }) => {
  await openFontSizeDropdown(superdoc);
  await expectFontSizeDropdownOpen(superdoc);

  await superdoc.page.locator('[data-item="btn-fontSize"]').click();
  await superdoc.waitForStable();
  await expectFontSizeDropdownClosed(superdoc);
});

test('outside click closes open dropdown', async ({ superdoc }) => {
  await superdoc.type('Outside click test');
  await superdoc.waitForStable();

  await openFontSizeDropdown(superdoc);
  await expectFontSizeDropdownOpen(superdoc);

  await superdoc.page
    .locator('.presentation-editor__viewport')
    .first()
    .click({ position: { x: 10, y: 10 } });
  await superdoc.waitForStable();
  await expectFontSizeDropdownClosed(superdoc);
});

test('regular button click closes currently open dropdown', async ({ superdoc }) => {
  await openDocumentModeDropdown(superdoc);
  await expectDocumentModeDropdownOpen(superdoc);

  await superdoc.page.locator('[data-item="btn-bold"]').click();
  await superdoc.waitForStable();

  await expectDocumentModeDropdownClosed(superdoc);
});

test('escape closes currently open dropdown', async ({ superdoc }) => {
  await openFontSizeDropdown(superdoc);
  await expectFontSizeDropdownOpen(superdoc);

  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();

  await expectFontSizeDropdownClosed(superdoc);
});
