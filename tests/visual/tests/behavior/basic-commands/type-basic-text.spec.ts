import { test } from '../../fixtures/superdoc.js';

test('@behavior type basic text into blank document', async ({ superdoc }) => {
  await superdoc.type('Hello, SuperDoc!');
  await superdoc.newLine();
  await superdoc.type('This is a simple paragraph of text.');
  await superdoc.screenshot('type-basic-text');
});
