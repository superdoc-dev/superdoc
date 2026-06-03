import { test, expect } from '../../fixtures/superdoc.js';

test('new paragraphs inherit bold formatting through Enter', async ({ superdoc }) => {
  // Type with bold active
  await superdoc.bold();
  await superdoc.type('First paragraph bold');
  await superdoc.waitForStable();

  await superdoc.assertTextHasMarks('First paragraph', ['bold']);

  // Press Enter — new paragraph should inherit bold
  await superdoc.newLine();
  await superdoc.type('Second paragraph inherits bold');
  await superdoc.waitForStable();

  await superdoc.assertTextHasMarks('Second paragraph', ['bold']);

  // Type more paragraphs to verify continued inheritance
  await superdoc.newLine();
  await superdoc.type('Third paragraph also bold');
  await superdoc.waitForStable();

  await superdoc.assertTextHasMarks('Third paragraph', ['bold']);

  await superdoc.snapshot('paragraph-style-inheritance');
});

test('new paragraphs inherit combined bold+italic formatting', async ({ superdoc }) => {
  // Type with both bold and italic active from the start
  await superdoc.bold();
  await superdoc.italic();
  await superdoc.type('First paragraph both');
  await superdoc.waitForStable();

  await superdoc.assertTextHasMarks('First paragraph', ['bold', 'italic']);

  // Press Enter — new paragraph should inherit both
  await superdoc.newLine();
  await superdoc.type('Second paragraph inherits both');
  await superdoc.waitForStable();

  await superdoc.assertTextHasMarks('Second paragraph', ['bold', 'italic']);

  await superdoc.snapshot('paragraph-style-inheritance-combined');
});
