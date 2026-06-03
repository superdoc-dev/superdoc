import { test, expect } from '../../fixtures/superdoc.js';

test('list indentation with Tab and outdentation with Shift+Tab', async ({ superdoc }) => {
  // Create a numbered list by typing "1. "
  await superdoc.type('1. ');
  await superdoc.type('item 1');
  await superdoc.waitForStable();

  // Verify list item 1 exists with a marker
  await superdoc.assertElementExists('.superdoc-paragraph-marker');

  // Add second item
  await superdoc.newLine();
  await superdoc.type('item 2');
  await superdoc.waitForStable();

  // Indent third item with Tab
  await superdoc.newLine();
  await superdoc.press('Tab');
  await superdoc.type('item a');
  await superdoc.waitForStable();

  // Indented item should have a different marker style (nested list)
  const markers = superdoc.page.locator('.superdoc-paragraph-marker');
  const markerCount = await markers.count();
  expect(markerCount).toBeGreaterThanOrEqual(3);

  // Outdent with Shift+Tab
  await superdoc.newLine();
  await superdoc.press('Shift+Tab');
  await superdoc.type('item 3');
  await superdoc.waitForStable();

  // Text content should contain all items
  await superdoc.assertTextContains('item 1');
  await superdoc.assertTextContains('item 2');
  await superdoc.assertTextContains('item a');
  await superdoc.assertTextContains('item 3');

  // Verify list markers exist for all items
  const finalMarkerCount = await markers.count();
  expect(finalMarkerCount).toBeGreaterThanOrEqual(4);

  await superdoc.snapshot('indent-list-items');
});
