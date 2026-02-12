import { test } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'off', hideCaret: false, hideSelection: false } });

test('@behavior cursor positioning after fully track-deleted content', async ({ superdoc }) => {
  await superdoc.type('Hello World');
  await superdoc.waitForStable();
  await superdoc.screenshot('tc-delete-initial');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.screenshot('tc-delete-selected');

  await superdoc.press('Backspace');
  await superdoc.waitForStable();
  await superdoc.screenshot('tc-delete-fully-deleted');

  // Typing "TEST" — bug would produce "TSET" instead
  await superdoc.type('TEST');
  await superdoc.waitForStable();
  await superdoc.screenshot('tc-delete-after-typing');
});
