import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('typing after fully track-deleted content produces correct text', async ({ superdoc }) => {
  await superdoc.type('Hello World');
  await superdoc.waitForStable();
  await superdoc.assertTextContent('Hello World');

  // Switch to suggesting mode
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select all and delete
  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.press('Backspace');
  await superdoc.waitForStable();

  // Tracked delete decoration should exist
  await superdoc.assertTrackedChangeExists('delete');

  // Type new text — a cursor-positioning bug would produce "TSET" instead of "TEST"
  await superdoc.type('TEST');
  await superdoc.waitForStable();

  // Assert "TEST" appears in the document (not "TSET")
  await superdoc.assertTextContains('TEST');
  await superdoc.assertTextNotContains('TSET');

  // Tracked insert decoration should also exist for the new text
  await superdoc.assertTrackedChangeExists('insert');

  await superdoc.snapshot('type-after-fully-deleted-content');
});
