import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
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
 * Returns null while the marker does not exist so callers can expect.poll
 * (a thrown callback would abort the poll instead of retrying).
 */
async function getMarkerStyle(superdoc: SuperDocFixture, markerIndex: number): Promise<MarkerStyle | null> {
  return superdoc.page.evaluate((idx) => {
    const marker = document.querySelectorAll('.superdoc-paragraph-marker')[idx];
    if (!marker) return null;
    const style = getComputedStyle(marker);
    return { fontFamily: style.fontFamily, fontSize: style.fontSize };
  }, markerIndex);
}

/**
 * DomPainter repaints markers asynchronously after a font change; a single
 * computed-style read can observe the stale font under CI load. Poll instead.
 */
async function expectMarkerFontFamily(superdoc: SuperDocFixture, markerIndex: number, family: string): Promise<void> {
  await expect
    .poll(async () => (await getMarkerStyle(superdoc, markerIndex))?.fontFamily.toLowerCase() ?? '', {
      timeout: 10_000,
    })
    .toContain(family);
}

async function expectMarkerFontSizeAtLeast(superdoc: SuperDocFixture, markerIndex: number, px: number): Promise<void> {
  await expect
    .poll(async () => parseFloat((await getMarkerStyle(superdoc, markerIndex))?.fontSize ?? '0'), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(px);
}

/**
 * Toolbar dropdowns animate open; under load the toggle click can land while the
 * toolbar is mid-update and the options never appear, or the dropdown can close
 * again before the option click lands. Keep the bounded option click inside the
 * retry so either failure re-opens the dropdown (see behavior CLAUDE.md on
 * animated UI).
 */
async function pickDropdownOption(
  superdoc: SuperDocFixture,
  toggleSelector: string,
  optionSelector: string,
  option: string,
): Promise<void> {
  const optionLocator = superdoc.page.locator(optionSelector).filter({ hasText: option }).first();
  await expect(async () => {
    await superdoc.page.locator(toggleSelector).click();
    await optionLocator.click({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

async function pickFontFamily(superdoc: SuperDocFixture, family: string): Promise<void> {
  await pickDropdownOption(
    superdoc,
    '[data-item="btn-fontFamily-toggle"]',
    '[data-item="btn-fontFamily-option"]',
    family,
  );
}

async function pickFontSize(superdoc: SuperDocFixture, size: string): Promise<void> {
  await pickDropdownOption(superdoc, FONT_SIZE_CARET, '[data-item="btn-fontSize-option"]', size);
}

test('existing list markers restyle when font family changes (SD-3238)', async ({ superdoc }) => {
  await createOrderedList(superdoc, ['first item', 'second item']);
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await pickFontFamily(superdoc, 'Times New Roman');
  await superdoc.waitForStable();

  await superdoc.assertTextMarkAttrs('first item', 'textStyle', { fontFamily: 'Times New Roman' });

  await expectMarkerFontFamily(superdoc, 0, 'times new roman');
});

test('existing list markers restyle when font size changes (SD-3238)', async ({ superdoc }) => {
  await createBulletList(superdoc, ['alpha', 'beta']);
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await pickFontSize(superdoc, '30');
  await superdoc.waitForStable();

  await superdoc.assertTextMarkAttrs('alpha', 'textStyle', { fontSize: '30pt' });

  await expectMarkerFontSizeAtLeast(superdoc, 0, 29);
});

test('new empty list item marker inherits font from previous paragraph', async ({ superdoc }) => {
  await createOrderedList(superdoc, ['first item', 'second item']);
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await pickFontFamily(superdoc, 'Times New Roman');
  await superdoc.waitForStable();

  await superdoc.assertTextMarkAttrs('first item', 'textStyle', { fontFamily: 'Times New Roman' });

  const pos = await superdoc.findTextPos('second item');
  await superdoc.setTextSelection(pos + 'second item'.length);
  await superdoc.waitForStable();
  await superdoc.newLine();
  await superdoc.waitForStable();

  await expect(superdoc.page.locator(LIST_MARKER_SELECTOR)).toHaveCount(3, { timeout: 10_000 });

  await expectMarkerFontFamily(superdoc, 2, 'times new roman');
});

test('existing list markers restyle after toggle-list flow with pre-typed font (SD-3238)', async ({ superdoc }) => {
  await pickFontFamily(superdoc, 'Times New Roman');
  await superdoc.waitForStable();
  await pickFontSize(superdoc, '30');
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
  await pickFontSize(superdoc, '18');
  await superdoc.waitForStable();

  await superdoc.assertTextMarkAttrs('first line', 'textStyle', { fontSize: '18pt' });

  await expectMarkerFontSizeAtLeast(superdoc, 0, 17);
});
