import { test } from '../../fixtures/superdoc.js';

test('@behavior undo and redo text', async ({ superdoc }) => {
  await superdoc.type('First paragraph.');
  await superdoc.newLine();
  await superdoc.type('Second paragraph.');
  await superdoc.screenshot('before-undo');

  await superdoc.undo();
  await superdoc.screenshot('after-undo');

  await superdoc.redo();
  await superdoc.screenshot('after-redo');
});
