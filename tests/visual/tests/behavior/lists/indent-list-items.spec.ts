import { test } from '../../fixtures/superdoc.js';

test('@behavior list indentation and outdentation', async ({ superdoc }) => {
  // Create a numbered list by typing "1. "
  await superdoc.type('1. ');
  await superdoc.type('item 1');
  await superdoc.screenshot('list-item-1');

  // Add second item
  await superdoc.newLine();
  await superdoc.type('item 2');
  await superdoc.screenshot('list-item-2');

  // Indent third item with Tab
  await superdoc.newLine();
  await superdoc.press('Tab');
  await superdoc.type('item a');
  await superdoc.screenshot('list-indented');

  // Outdent with Shift+Tab
  await superdoc.newLine();
  await superdoc.press('Shift+Tab');
  await superdoc.type('item 3');
  await superdoc.screenshot('list-outdented');
});
