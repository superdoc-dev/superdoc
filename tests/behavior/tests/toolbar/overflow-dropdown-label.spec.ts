import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

test('font family applies and label updates when selected from overflow menu', async ({ superdoc }) => {
  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  // Select the text
  const pos = await superdoc.findTextPos('Hello world');
  await superdoc.setTextSelection(pos, pos + 'Hello world'.length);
  await superdoc.waitForStable();

  // Shrink viewport so toolbar items overflow
  await superdoc.page.setViewportSize({ width: 400, height: 600 });
  await superdoc.waitForStable();

  // Skip if overflow menu doesn't appear
  const overflowBtn = superdoc.page.locator('[data-item="btn-overflow"]');
  if (!(await overflowBtn.isVisible())) {
    test.skip();
  }

  // Open overflow menu
  await overflowBtn.click();
  await superdoc.page.locator('.overflow-menu_items').waitFor({ state: 'visible', timeout: 5000 });
  await superdoc.waitForStable();

  // Select Georgia from font family dropdown
  await superdoc.page.locator('[data-item="btn-fontFamily"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: 'Georgia' }).click();
  await superdoc.waitForStable();

  // Click into the editor to trigger pending command execution
  await superdoc.page
    .locator('.presentation-editor__viewport')
    .first()
    .click({ position: { x: 50, y: 50 } });
  await superdoc.waitForStable();

  // Verify the font was applied to the text
  await superdoc.assertTextMarkAttrs('Hello world', 'textStyle', { fontFamily: 'Georgia, serif' });

  // Re-select text and check the toolbar label updated
  const newPos = await superdoc.findTextPos('Hello world');
  await superdoc.setTextSelection(newPos, newPos + 'Hello world'.length);
  await superdoc.waitForStable();

  // Restore viewport to see font family in main toolbar
  await superdoc.page.setViewportSize({ width: 1600, height: 1200 });
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('[data-item="btn-fontFamily"]')).toContainText('Georgia');
});
