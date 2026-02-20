import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

// WebKit blocks clipboard API reads even on localhost — skip it.
test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not support clipboard API in tests');

async function writeToClipboard(page: import('@playwright/test').Page, text: string) {
  // Chromium needs explicit permission; Firefox/WebKit allow clipboard in
  // secure contexts (localhost) when triggered from a user gesture.
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  } catch {
    // Firefox/WebKit don't support these permission names — that's fine.
  }
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
}

test('right-click opens context menu and paste inserts clipboard text', async ({ superdoc }) => {
  await superdoc.type('Hello world');
  await superdoc.newLine();
  await superdoc.waitForStable();

  await writeToClipboard(superdoc.page, 'Pasted content');

  // Right-click on the empty second line to open the context menu
  await superdoc.clickOnLine(1);
  await superdoc.waitForStable();

  const line = superdoc.page.locator('.superdoc-line').nth(1);
  const box = await line.boundingBox();
  if (!box) throw new Error('Line 1 not visible');
  await superdoc.page.mouse.click(box.x + 20, box.y + box.height / 2, { button: 'right' });
  await superdoc.waitForStable();

  // Assert the context menu is visible
  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();

  // Click the Paste option
  const pasteItem = menu.locator('.context-menu-item').filter({ hasText: 'Paste' });
  await expect(pasteItem).toBeVisible();
  await pasteItem.click();
  await superdoc.waitForStable();

  // Assert the clipboard text was pasted into the document
  await superdoc.assertTextContains('Pasted content');
});
