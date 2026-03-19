import { test, expect } from '../../fixtures/superdoc.js';
import { createOrderedList, LIST_MARKER_SELECTOR } from '../../helpers/lists.js';

test.use({ config: { toolbar: 'full' } });

/**
 * Helper: select all text in the document and change font via toolbar.
 */
async function selectAllAndChangeFont(
  superdoc: Parameters<Parameters<typeof test>[2]>[0]['superdoc'],
  fontName: string,
) {
  await superdoc.selectAll();
  await superdoc.waitForStable();

  // Open font family dropdown and pick the font
  await superdoc.page.locator('[data-item="btn-fontFamily"]').click();
  await superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: fontName }).click();
  await superdoc.waitForStable();
}

/**
 * Helper: get the computed font-family of a list marker by line index.
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

test('new list item marker inherits font from previous paragraph', async ({ superdoc }) => {
  // Create a 2-item ordered list and change font to Georgia
  await createOrderedList(superdoc, ['first item', 'second item']);
  await superdoc.waitForStable();
  await selectAllAndChangeFont(superdoc, 'Georgia');

  // Verify markers are in Georgia
  const markerFontBefore = await getMarkerFontFamily(superdoc, 0);
  expect(markerFontBefore.toLowerCase()).toContain('georgia');

  // Place cursor at end of last item and press Enter to create a new empty item
  const pos = await superdoc.findTextPos('second item');
  await superdoc.setTextSelection(pos + 'second item'.length);
  await superdoc.waitForStable();
  await superdoc.newLine();
  await superdoc.waitForStable();

  // Should now have 3 markers
  const markerCount = await superdoc.page.locator(LIST_MARKER_SELECTOR).count();
  expect(markerCount).toBe(3);

  // The new (third) marker should inherit Georgia, not fall back to default
  const newMarkerFont = await getMarkerFontFamily(superdoc, 2);
  expect(newMarkerFont.toLowerCase()).toContain('georgia');
});
