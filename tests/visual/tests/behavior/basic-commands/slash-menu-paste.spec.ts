import { test } from '../../fixtures/superdoc.js';

test('@behavior slash menu paste preserves formatting', async ({ superdoc }) => {
  await superdoc.type('Normal line');
  await superdoc.newLine();
  await superdoc.waitForStable();
  await superdoc.screenshot('slash-menu-before-paste');

  // Right-click to open context menu
  const lines = superdoc.page.locator('.superdoc-line');
  const lastLine = lines.last();
  const box = await lastLine.boundingBox();
  if (!box) throw new Error('Last line not visible');

  await superdoc.page.mouse.click(box.x + 20, box.y + box.height / 2, { button: 'right' });
  await superdoc.waitForStable();

  const menu = superdoc.page.locator('.slash-menu');
  const menuVisible = await menu.isVisible().catch(() => false);

  if (menuVisible) {
    await superdoc.screenshot('slash-menu-open');
    await superdoc.press('Escape');
    await superdoc.waitForStable();
  }

  // Paste formatted HTML via editor API
  await superdoc.clickOnLine(1);
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    if (editor?.commands?.insertContent) {
      editor.commands.insertContent('<b>Bold pasted text</b>');
    }
  });

  await superdoc.waitForStable();
  await superdoc.screenshot('slash-menu-after-paste');
});
