import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

test('@behavior undo tracked insertion removes suggestion bubble and sidebar entry', async ({ superdoc }) => {
  const sidebar = superdoc.page.locator('.superdoc__right-sidebar');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type('Tracked insertion');
  await superdoc.waitForStable();
  await expect.poll(async () => superdoc.page.locator('.tracked-change-text').count()).toBeGreaterThan(0);
  await expect(sidebar).toBeVisible();
  await superdoc.screenshot('behavior-comments-tcs-undo-tracked-insert-before-undo');

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect(sidebar.locator('.tracked-change-text')).toHaveCount(0);
  await expect(superdoc.page.locator('.tracked-change-text')).toHaveCount(0);
  await superdoc.screenshot('behavior-comments-tcs-undo-tracked-insert-after-undo');
});
