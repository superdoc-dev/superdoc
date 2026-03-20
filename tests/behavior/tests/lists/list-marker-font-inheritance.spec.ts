import { test, expect } from '../../fixtures/superdoc.js';
import { createOrderedList, LIST_MARKER_SELECTOR } from '../../helpers/lists.js';

test.use({ config: { toolbar: 'full' } });

/**
 * Helper: get the computed font-family of a list marker by index.
 * DomPainter renders markers as .superdoc-paragraph-marker — CSS is the
 * authoritative source for visual font since the layout engine sets it.
 */
async function getMarkerFontFamily(
  superdoc: Parameters<Parameters<typeof test>[2]>[0]['superdoc'],
  markerIndex: number,
): Promise<string> {
  return superdoc.page.evaluate((idx) => {
    const markers = document.querySelectorAll('.superdoc-paragraph-marker');
    const marker = markers[idx];
    if (!marker) throw new Error(`Marker at index ${idx} not found`);
    return getComputedStyle(marker).fontFamily;
  }, markerIndex);
}

test('new empty list item marker inherits font from previous paragraph', async ({ superdoc }) => {
  // Create a 2-item ordered list and change text font to Georgia.
  // The toolbar applies a textStyle mark on the text runs — this does NOT
  // change existing marker fonts (markers resolve from the numbering cascade).
  // But previousParagraphFont reads the first run's resolved font, so a new
  // empty list item should inherit Georgia for its marker.
  await createOrderedList(superdoc, ['first item', 'second item']);
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.page.locator('[data-item="btn-fontFamily"]').click();
  await superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: 'Georgia' }).click();
  await superdoc.waitForStable();

  // Verify the text itself is in Georgia
  await superdoc.assertTextMarkAttrs('first item', 'textStyle', { fontFamily: 'Georgia' });

  // Place cursor at end of last item and press Enter to create a new empty item
  const pos = await superdoc.findTextPos('second item');
  await superdoc.setTextSelection(pos + 'second item'.length);
  await superdoc.waitForStable();
  await superdoc.newLine();
  await superdoc.waitForStable();

  // Should now have 3 markers
  const markerCount = await superdoc.page.locator(LIST_MARKER_SELECTOR).count();
  expect(markerCount).toBe(3);

  // The new (third) marker should inherit Georgia from the previous paragraph's
  // text run, not fall back to the document default (Arial).
  const newMarkerFont = await getMarkerFontFamily(superdoc, 2);
  expect(newMarkerFont.toLowerCase()).toContain('georgia');
});
