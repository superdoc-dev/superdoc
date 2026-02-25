import { test } from '../../fixtures/superdoc.js';

test('type basic text into a blank document', async ({ superdoc }) => {
  await superdoc.type('Hello, SuperDoc!');
  await superdoc.newLine();
  await superdoc.type('This is a simple paragraph of text.');
  await superdoc.waitForStable();

  await superdoc.assertLineCount(2);
  await superdoc.assertTextContains('Hello, SuperDoc!');
  await superdoc.assertTextContains('This is a simple paragraph of text.');
});
