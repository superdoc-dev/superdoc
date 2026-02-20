import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

test('document mode dropdown shows Editing by default', async ({ superdoc }) => {
  const modeButton = superdoc.page.locator('[data-item="btn-documentMode"]');
  await expect(modeButton).toContainText('Editing');
});

test('switching to suggesting updates the dropdown label', async ({ superdoc }) => {
  const modeButton = superdoc.page.locator('[data-item="btn-documentMode"]');

  await modeButton.click();
  await superdoc.waitForStable();

  await superdoc.page.locator('[data-item="btn-documentMode-option"]').filter({ hasText: 'Suggesting' }).click();
  await superdoc.waitForStable();

  await expect(modeButton).toContainText('Suggesting');
  await superdoc.assertDocumentMode('suggesting');
});

test('switching to viewing updates the dropdown label', async ({ superdoc }) => {
  const modeButton = superdoc.page.locator('[data-item="btn-documentMode"]');

  await modeButton.click();
  await superdoc.waitForStable();

  await superdoc.page.locator('[data-item="btn-documentMode-option"]').filter({ hasText: 'Viewing' }).click();
  await superdoc.waitForStable();

  await expect(modeButton).toContainText('Viewing');
  await superdoc.assertDocumentMode('viewing');
});

test('programmatic mode change syncs the dropdown', async ({ superdoc }) => {
  const modeButton = superdoc.page.locator('[data-item="btn-documentMode"]');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();
  await expect(modeButton).toContainText('Suggesting');

  await superdoc.setDocumentMode('viewing');
  await superdoc.waitForStable();
  await expect(modeButton).toContainText('Viewing');

  await superdoc.setDocumentMode('editing');
  await superdoc.waitForStable();
  await expect(modeButton).toContainText('Editing');
});

test('cycling through all modes via dropdown', async ({ superdoc }) => {
  const modeButton = superdoc.page.locator('[data-item="btn-documentMode"]');
  const modes = ['Suggesting', 'Viewing', 'Editing'] as const;
  const modeValues = ['suggesting', 'viewing', 'editing'] as const;

  for (let i = 0; i < modes.length; i++) {
    await modeButton.click();
    await superdoc.waitForStable();

    await superdoc.page.locator('[data-item="btn-documentMode-option"]').filter({ hasText: modes[i] }).click();
    await superdoc.waitForStable();

    await expect(modeButton).toContainText(modes[i]);
    await superdoc.assertDocumentMode(modeValues[i]);
  }
});
