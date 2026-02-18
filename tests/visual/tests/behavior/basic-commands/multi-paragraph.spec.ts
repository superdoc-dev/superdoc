import { test } from '../../fixtures/superdoc.js';

test('@behavior multi-paragraph document with heading and list', async ({ superdoc }) => {
  await superdoc.type('Document Heading');
  await superdoc.newLine();
  await superdoc.newLine();
  await superdoc.type('This is the first paragraph of text.');
  await superdoc.newLine();
  await superdoc.newLine();
  await superdoc.type('This is the second paragraph with more content.');
  await superdoc.newLine();
  await superdoc.newLine();
  await superdoc.type('- Bullet item one');
  await superdoc.newLine();
  await superdoc.type('- Bullet item two');
  await superdoc.newLine();
  await superdoc.type('- Bullet item three');

  await superdoc.screenshot('multi-paragraph');
});
