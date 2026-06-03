import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

// Firefox collapses PM selection on right-click at the browser level — not a SuperDoc bug
test('selection is preserved when right-clicking on selected text', async ({ superdoc, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox collapses selection on right-click natively');
  await superdoc.type('Select this text and right-click');
  await superdoc.waitForStable();

  // Select the full line
  await superdoc.tripleClickLine(0);
  await superdoc.waitForStable();

  // Verify we have a non-collapsed selection
  const selBefore = await superdoc.getSelection();
  expect(selBefore.to - selBefore.from).toBeGreaterThan(0);

  // Right-click on the selected text
  const line = superdoc.page.locator('.superdoc-line').first();
  const box = await line.boundingBox();
  if (!box) throw new Error('Line not visible');
  await superdoc.page.mouse.click(box.x + box.width / 3, box.y + box.height / 2, { button: 'right' });
  await superdoc.waitForStable();

  // Context menu should be open
  await expect(superdoc.page.locator('.context-menu')).toBeVisible();

  // Selection should still be non-collapsed (Firefox may adjust the exact range
  // on right-click, but the selection must not collapse to a cursor)
  const selAfter = await superdoc.getSelection();
  expect(selAfter.to - selAfter.from).toBeGreaterThan(0);

  await superdoc.snapshot('selection preserved after right-click');
});

test('selection highlight preserved when focus moves to toolbar dropdown', async ({ superdoc }) => {
  await superdoc.type('Select this text then open dropdown');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();

  // Selection overlay should have visible rects
  const overlayBefore = await superdoc.page.evaluate(() => {
    const overlay = document.querySelector('.presentation-editor__selection-layer--local');
    return overlay ? overlay.children.length : -1;
  });
  expect(overlayBefore).toBeGreaterThan(0);

  // Simulate focus moving to a toolbar UI surface (e.g. a dropdown)
  await superdoc.page.evaluate(() => {
    const btn = document.createElement('button');
    btn.setAttribute('data-editor-ui-surface', '');
    btn.textContent = 'Fake toolbar button';
    btn.id = 'test-ui-surface';
    document.body.appendChild(btn);
    btn.focus();
  });
  await superdoc.waitForStable();

  // Selection overlay should still be visible
  const overlayAfter = await superdoc.page.evaluate(() => {
    const overlay = document.querySelector('.presentation-editor__selection-layer--local');
    return overlay ? overlay.children.length : -1;
  });
  expect(overlayAfter).toBeGreaterThan(0);

  // Clean up
  await superdoc.page.evaluate(() => {
    document.getElementById('test-ui-surface')?.remove();
  });

  await superdoc.snapshot('selection preserved after toolbar focus');
});
