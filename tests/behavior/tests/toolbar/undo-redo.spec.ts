import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

test('undo button removes last typed text', async ({ superdoc }) => {
  const undoButton = superdoc.page.locator('[data-item="btn-undo"]');

  await superdoc.type('First paragraph.');
  await superdoc.newLine();
  await superdoc.type('Second paragraph.');
  await superdoc.waitForStable();

  await superdoc.assertTextContains('Second paragraph.');

  await undoButton.click();
  await superdoc.waitForStable();

  await superdoc.assertTextNotContains('Second paragraph.');
  await superdoc.assertTextContains('First paragraph.');
});

test('redo button restores undone text', async ({ superdoc }) => {
  const undoButton = superdoc.page.locator('[data-item="btn-undo"]');
  const redoButton = superdoc.page.locator('[data-item="btn-redo"]');

  await superdoc.type('First paragraph.');
  await superdoc.newLine();
  await superdoc.type('Second paragraph.');
  await superdoc.waitForStable();

  await undoButton.click();
  await superdoc.waitForStable();
  await superdoc.assertTextNotContains('Second paragraph.');

  await redoButton.click();
  await superdoc.waitForStable();

  await superdoc.assertTextContains('First paragraph.');
  await superdoc.assertTextContains('Second paragraph.');
});
