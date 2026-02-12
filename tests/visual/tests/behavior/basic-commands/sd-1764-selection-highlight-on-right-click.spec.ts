import { test } from '../../fixtures/superdoc.js';

test.use({ config: { hideSelection: false } });

test('@behavior SD-1764 selection highlight preserved on right-click', async ({ superdoc }) => {
  await superdoc.type('Select this text and right-click');
  await superdoc.waitForStable();

  // Select "this text" by triple-clicking the line then adjusting
  await superdoc.tripleClickLine(0);
  await superdoc.waitForStable();
  await superdoc.screenshot('selection-before-right-click');

  // Right-click on the selected text to open context menu
  const line = superdoc.page.locator('.superdoc-line').first();
  const box = await line.boundingBox();
  if (!box) throw new Error('Line not visible');

  await superdoc.page.mouse.click(box.x + box.width / 3, box.y + box.height / 2, { button: 'right' });
  await superdoc.waitForStable();

  // Selection highlight should still be visible with context menu open
  await superdoc.screenshot('selection-after-right-click');
});
