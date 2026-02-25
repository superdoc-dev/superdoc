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

test('undo paragraph split preserves rendered text (SD-1984)', async ({ superdoc }) => {
  await superdoc.type('Hello World');
  await superdoc.waitForStable();
  await superdoc.assertLineCount(1);

  // Place cursor between "Hello " and "World"
  const pos = await superdoc.findTextPos('World');
  await superdoc.setTextSelection(pos);

  // Split paragraph with Enter
  await superdoc.newLine();
  await superdoc.waitForStable();
  await superdoc.assertLineCount(2);

  // Undo the split — the bug caused "World" to vanish from the rendered DOM
  // because the flow block cache reused stale lines with matching sdBlockRev values.
  await superdoc.undo();
  await superdoc.waitForStable();

  await superdoc.assertLineCount(1);
  await superdoc.assertLineText(0, 'Hello World');
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
