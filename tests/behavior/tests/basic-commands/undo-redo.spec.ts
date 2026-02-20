import { test, expect } from '../../fixtures/superdoc.js';

test('undo removes last typed text', async ({ superdoc }) => {
  await superdoc.type('First paragraph.');
  await superdoc.newLine();
  await superdoc.type('Second paragraph.');
  await superdoc.waitForStable();

  await superdoc.assertTextContains('Second paragraph.');

  await superdoc.undo();
  await superdoc.waitForStable();

  await superdoc.assertTextNotContains('Second paragraph.');
  await superdoc.assertTextContains('First paragraph.');
});

test('redo restores undone text', async ({ superdoc }) => {
  await superdoc.type('First paragraph.');
  await superdoc.newLine();
  await superdoc.type('Second paragraph.');
  await superdoc.waitForStable();

  await superdoc.undo();
  await superdoc.waitForStable();
  await superdoc.assertTextNotContains('Second paragraph.');

  await superdoc.redo();
  await superdoc.waitForStable();

  await superdoc.assertTextContains('First paragraph.');
  await superdoc.assertTextContains('Second paragraph.');
});
