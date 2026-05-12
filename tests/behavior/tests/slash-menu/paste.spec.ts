import { test, expect } from '../../fixtures/superdoc.js';
import { rightClickAtDocPos } from '../../helpers/editor-interactions.js';

test.use({ config: { toolbar: 'full' } });
test.describe.configure({ mode: 'serial' });

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

async function readClipboardHtml(page: import('@playwright/test').Page) {
  try {
    await page.context().grantPermissions(['clipboard-read']);
  } catch {
    // Firefox/WebKit don't support this permission name.
  }
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('text/html')) {
        return (await item.getType('text/html')).text();
      }
    }
    return '';
  });
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

test('context-menu paste uses embedded SuperDoc slice instead of hidden copy data (SD-2934)', async ({
  superdoc,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Rich HTML clipboard reads are only reliable in Chromium behavior tests');

  const copiedText = 'Copied from SuperDoc';
  await superdoc.type(copiedText);
  await superdoc.newLine();
  await superdoc.waitForStable();

  const copiedPos = await superdoc.findTextPos(copiedText);
  await superdoc.setTextSelection(copiedPos, copiedPos + copiedText.length);
  await superdoc.waitForStable();

  await rightClickAtDocPos(superdoc.page, copiedPos + 1);
  await superdoc.waitForStable();

  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();
  const copyItem = menu.locator('.context-menu-item').filter({ hasText: 'Copy' });
  await expect(copyItem).toBeVisible();
  await copyItem.click();
  await superdoc.waitForStable();

  const clipboardHtml = await readClipboardHtml(superdoc.page);
  expect(clipboardHtml).toContain('data-superdoc-slice');

  await superdoc.clickOnLine(1);
  await superdoc.waitForStable();

  const line = superdoc.page.locator('.superdoc-line').nth(1);
  const box = await line.boundingBox();
  if (!box) throw new Error('Line 1 not visible');
  await superdoc.page.mouse.click(box.x + 20, box.y + box.height / 2, { button: 'right' });
  await superdoc.waitForStable();

  await expect(menu).toBeVisible();
  const pasteItem = menu.locator('.context-menu-item').filter({ hasText: 'Paste' });
  await expect(pasteItem).toBeVisible();
  await pasteItem.click();
  await superdoc.waitForStable();

  const text = await superdoc.getTextContent();
  expect(text.match(new RegExp(copiedText, 'g')) ?? []).toHaveLength(2);
  expect(text).not.toMatch(/eyJ[A-Za-z0-9+/=]{20,}/);
});

// FIXME: PM strips trailing/leading whitespace when pasting into run-wrapped content.
// The paste text arrives correctly but whitespace is lost during PM's DOM-based parseFromClipboard.
test.fixme('context menu paste inserts at cursor position, not document start (SD-1302)', async ({ superdoc }) => {
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

// FIXME: posAtCoords round-trip in presentation mode misreports position, collapsing the selection.
test.fixme('context menu paste replaces selected text (SD-1302)', async ({ superdoc, browserName }) => {
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

// FIXME: PM strips leading whitespace when pasting into run-wrapped content (same root cause as above).
test.fixme('context menu paste at end of document appends correctly (SD-1302)', async ({ superdoc }) => {
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
