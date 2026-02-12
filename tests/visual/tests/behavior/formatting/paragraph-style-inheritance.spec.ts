import { test } from '../../fixtures/superdoc.js';

test('@behavior new paragraphs inherit formatting', async ({ superdoc }) => {
  // Type and apply bold
  await superdoc.type('First paragraph text');
  await superdoc.selectAll();
  await superdoc.bold();
  await superdoc.screenshot('style-inheritance-bold');

  // New paragraph should inherit bold
  await superdoc.press('End');
  await superdoc.newLine();
  await superdoc.type('Second paragraph text');
  await superdoc.screenshot('style-inheritance-bold-inherited');

  // Apply italic on top
  await superdoc.selectAll();
  await superdoc.italic();
  await superdoc.screenshot('style-inheritance-bold-italic');

  // New paragraph should inherit both
  await superdoc.press('End');
  await superdoc.newLine();
  await superdoc.type('Third paragraph text');
  await superdoc.screenshot('style-inheritance-both-inherited');
});
