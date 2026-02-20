import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true, comments: 'on' } });

test('comment bubble appears on text selection', async ({ superdoc }) => {
  await superdoc.type('Select some of this text');
  await superdoc.waitForStable();

  const bubble = superdoc.page.locator('.superdoc__tools');

  // No selection yet — bubble should not be visible
  await expect(bubble).not.toBeVisible();

  // Select "some" via PM positions
  const pos = await superdoc.findTextPos('some');
  await superdoc.setTextSelection(pos, pos + 'some'.length);
  await superdoc.waitForStable();

  // Bubble should appear
  await expect(bubble).toBeVisible();
  await expect(superdoc.page.locator('.superdoc__tools [data-id="is-tool"]').first()).toBeVisible();
  await superdoc.snapshot('bubble visible on selection');
});

test('comment bubble disappears when selection is collapsed', async ({ superdoc }) => {
  await superdoc.type('Select some of this text');
  await superdoc.waitForStable();

  const bubble = superdoc.page.locator('.superdoc__tools');

  // Select text
  const pos = await superdoc.findTextPos('some');
  await superdoc.setTextSelection(pos, pos + 'some'.length);
  await superdoc.waitForStable();
  await expect(bubble).toBeVisible();

  // Collapse selection (cursor only)
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  // Bubble should disappear
  await expect(bubble).not.toBeVisible();
  await superdoc.snapshot('bubble hidden after deselect');
});
