import { test, expect } from '../../fixtures/superdoc.js';
import { createOrderedList, createBulletList, LIST_MARKER_SELECTOR } from '../../helpers/lists.js';

test.use({ config: { toolbar: 'full' } });

type MarkerStyle = {
  fontFamily: string;
  fontSize: string;
};

const FONT_SIZE_CARET = '[data-item="btn-fontSize"] .sd-dropdown-caret';

/**
 * Helper: get computed font styles of a list marker by index.
 * DomPainter renders markers as .superdoc-paragraph-marker. CSS is the
 * authoritative source for visual font since the layout engine sets it.
 */
async function getMarkerStyle(
  superdoc: Parameters<Parameters<typeof test>[2]>[0]['superdoc'],
  markerIndex: number,
): Promise<MarkerStyle> {
  return superdoc.page.evaluate((idx) => {
    const markers = document.querySelectorAll('.superdoc-paragraph-marker');
    const marker = markers[idx];
    if (!marker) throw new Error(`Marker at index ${idx} not found`);
    const style = getComputedStyle(marker);
    return { fontFamily: style.fontFamily, fontSize: style.fontSize };
  }, markerIndex);
}

test('existing list markers restyle when font family changes (SD-3238)', async ({ superdoc }) => {
  await createOrderedList(superdoc, ['first item', 'second item']);
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.page.locator('[data-item="btn-fontFamily-toggle"]').click();
  await superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: 'Times New Roman' }).click();
  await superdoc.waitForStable();

  await superdoc.assertTextMarkAttrs('first item', 'textStyle', { fontFamily: 'Times New Roman' });

  const firstMarker = await getMarkerStyle(superdoc, 0);
  expect(firstMarker.fontFamily.toLowerCase()).toContain('times new roman');
});

test('existing list markers restyle when font size changes (SD-3238)', async ({ superdoc }) => {
  await createBulletList(superdoc, ['alpha', 'beta']);
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.page.locator(FONT_SIZE_CARET).click();
  await superdoc.page.locator('[data-item="btn-fontSize-option"]').filter({ hasText: '30' }).click();
  await superdoc.waitForStable();

  await superdoc.assertTextMarkAttrs('alpha', 'textStyle', { fontSize: '30pt' });

  const firstMarker = await getMarkerStyle(superdoc, 0);
  expect(parseFloat(firstMarker.fontSize)).toBeGreaterThanOrEqual(29);
});

test('new empty list item marker inherits font from previous paragraph', async ({ superdoc }) => {
  await createOrderedList(superdoc, ['first item', 'second item']);
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.page.locator('[data-item="btn-fontFamily-toggle"]').click();
  await superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: 'Times New Roman' }).click();
  await superdoc.waitForStable();

  await superdoc.assertTextMarkAttrs('first item', 'textStyle', { fontFamily: 'Times New Roman' });

  const pos = await superdoc.findTextPos('second item');
  await superdoc.setTextSelection(pos + 'second item'.length);
  await superdoc.waitForStable();
  await superdoc.newLine();
  await superdoc.waitForStable();

  const markerCount = await superdoc.page.locator(LIST_MARKER_SELECTOR).count();
  expect(markerCount).toBe(3);

  const newMarker = await getMarkerStyle(superdoc, 2);
  expect(newMarker.fontFamily.toLowerCase()).toContain('times new roman');
});

test('existing list markers restyle after toggle-list flow with pre-typed font (SD-3238)', async ({ superdoc }) => {
  await superdoc.page.locator('[data-item="btn-fontFamily-toggle"]').click();
  await superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: 'Times New Roman' }).click();
  await superdoc.waitForStable();
  await superdoc.page.locator(FONT_SIZE_CARET).click();
  await superdoc.page.locator('[data-item="btn-fontSize-option"]').filter({ hasText: '30' }).click();
  await superdoc.waitForStable();

  await superdoc.type('first line');
  await superdoc.waitForStable();
  await superdoc.newLine();
  await superdoc.waitForStable();
  await superdoc.type('second line');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.executeCommand('toggleOrderedList');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.page.locator(FONT_SIZE_CARET).click();
  await superdoc.page.locator('[data-item="btn-fontSize-option"]').filter({ hasText: '18' }).click();
  await superdoc.waitForStable();

  await superdoc.assertTextMarkAttrs('first line', 'textStyle', { fontSize: '18pt' });

  const firstMarker = await getMarkerStyle(superdoc, 0);
  expect(parseFloat(firstMarker.fontSize)).toBeGreaterThanOrEqual(17);
});
