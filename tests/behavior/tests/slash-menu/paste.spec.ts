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

async function rightClickAtDocPos(page: import('@playwright/test').Page, pos: number) {
  const coords = await page.evaluate((p) => {
    const editor = (window as any).editor;
    const rect = editor?.coordsAtPos?.(p);
    if (!rect) return null;
    return {
      left: Number(rect.left),
      right: Number(rect.right),
      top: Number(rect.top),
      bottom: Number(rect.bottom),
    };
  }, pos);

  if (!coords) {
    throw new Error(`Could not resolve coordinates for document position ${pos}`);
  }

  const x = Math.min(Math.max(coords.left + 1, coords.left), Math.max(coords.right - 1, coords.left + 1));
  const y = (coords.top + coords.bottom) / 2;
  await page.mouse.click(x, y, { button: 'right' });
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

test('context menu paste inserts at cursor position, not document start (SD-1302)', async ({ superdoc }) => {
  await superdoc.type('AAA BBB');
  await superdoc.waitForStable();

  // Place cursor between AAA and BBB
  const pos = await superdoc.findTextPos('BBB');
  await superdoc.setTextSelection(pos, pos);
  await superdoc.waitForStable();

  await writeToClipboard(superdoc.page, 'INSERTED ');

  // Right-click exactly at the current cursor position.
  await rightClickAtDocPos(superdoc.page, pos);
  await superdoc.waitForStable();

  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();
  const pasteItem = menu.locator('.context-menu-item').filter({ hasText: 'Paste' });
  await pasteItem.click();
  await superdoc.waitForStable();

  // Pasted text should appear between AAA and BBB, NOT at doc start
  await superdoc.assertTextContains('AAA INSERTED BBB');
  await superdoc.assertTextNotContains('INSERTED AAA');
});

test('context menu paste replaces selected text (SD-1302)', async ({ superdoc, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox collapses selection on right-click natively');

  await superdoc.type('Hello cruel world');
  await superdoc.waitForStable();

  // Select "cruel"
  const pos = await superdoc.findTextPos('cruel');
  await superdoc.setTextSelection(pos, pos + 'cruel'.length);
  await superdoc.waitForStable();

  await writeToClipboard(superdoc.page, 'beautiful');

  // Right-click inside the selected range to preserve it.
  await rightClickAtDocPos(superdoc.page, pos + 1);
  await superdoc.waitForStable();

  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();
  const pasteItem = menu.locator('.context-menu-item').filter({ hasText: 'Paste' });
  await pasteItem.click();
  await superdoc.waitForStable();

  await superdoc.assertTextContains('Hello beautiful world');
  await superdoc.assertTextNotContains('cruel');
});

test('context menu paste at end of document appends correctly (SD-1302)', async ({ superdoc }) => {
  await superdoc.type('First line');
  await superdoc.newLine();
  await superdoc.type('Last line');
  await superdoc.waitForStable();

  // Place cursor at the end of "Last line"
  const pos = await superdoc.findTextPos('Last line');
  await superdoc.setTextSelection(pos + 'Last line'.length, pos + 'Last line'.length);
  await superdoc.waitForStable();

  await writeToClipboard(superdoc.page, ' appended');

  // Right-click on the second line
  const line = superdoc.page.locator('.superdoc-line').nth(1);
  const box = await line.boundingBox();
  if (!box) throw new Error('Line not visible');
  await superdoc.page.mouse.click(box.x + box.width - 5, box.y + box.height / 2, { button: 'right' });
  await superdoc.waitForStable();

  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();
  const pasteItem = menu.locator('.context-menu-item').filter({ hasText: 'Paste' });
  await pasteItem.click();
  await superdoc.waitForStable();

  await superdoc.assertTextContains('Last line appended');
});
