import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { LIST_MARKER_SELECTOR, getParagraphNumberingByText } from '../../helpers/lists.js';

test.use({ config: { toolbar: 'full' } });

const BULLET_DROPDOWN_CARET = '[aria-label="Bullet list"] .sd-dropdown-caret';
const STYLE_OPTION = (label: string) => `.style-buttons-list [aria-label="${label}"]`;

const STYLE_LABEL = {
  disc: 'Opaque circle',
  circle: 'Outline circle',
  square: 'Opaque square',
} as const;

async function openBulletDropdown(superdoc: SuperDocFixture) {
  await superdoc.page.locator(BULLET_DROPDOWN_CARET).click();
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('.style-buttons-list')).toBeVisible();
}

async function pickStyle(superdoc: SuperDocFixture, style: keyof typeof STYLE_LABEL) {
  await openBulletDropdown(superdoc);
  await superdoc.page.locator(STYLE_OPTION(STYLE_LABEL[style])).click();
  await superdoc.waitForStable();
}

async function getMarkerTextForParagraph(superdoc: SuperDocFixture, text: string): Promise<string | null> {
  return superdoc.page.evaluate((searchText: string) => {
    const editor = (window as any).editor;
    let marker: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (marker !== null) return false;
      if (node.type.name !== 'paragraph') return true;
      const paraText = String(node.textContent ?? '');
      if (!paraText.includes(searchText)) return true;
      marker = node.attrs?.listRendering?.markerText ?? null;
      return false;
    });
    return marker;
  }, text);
}

async function getBulletPickerSelectedValue(superdoc: SuperDocFixture): Promise<string | null> {
  return superdoc.page.evaluate(() => {
    const sd = (window as any).superdoc;
    const items = sd?.toolbar?.toolbarItems;
    const arr = Array.isArray(items) ? items : Object.values(items ?? {});
    const bullet = arr.find((i: any) => (i?.name?.value ?? i?.name) === 'list');
    const v = bullet?.selectedValue?.value;
    return v == null ? null : String(v);
  });
}

test.describe('bullet style picker (SD-2526)', () => {
  test('AC1: dropdown shows the three style options (disc, circle, square)', async ({ superdoc }) => {
    await superdoc.page.locator(BULLET_DROPDOWN_CARET).click();
    await superdoc.waitForStable();

    await expect(superdoc.page.locator(STYLE_OPTION('Opaque circle'))).toBeVisible();
    await expect(superdoc.page.locator(STYLE_OPTION('Outline circle'))).toBeVisible();
    await expect(superdoc.page.locator(STYLE_OPTION('Opaque square'))).toBeVisible();
  });

  test('AC2: picking a style on an empty paragraph creates a list with the right marker', async ({ superdoc }) => {
    await superdoc.type('alpha');
    await superdoc.waitForStable();

    await pickStyle(superdoc, 'square');

    expect(await getMarkerTextForParagraph(superdoc, 'alpha')).toBe('▪');
    await superdoc.assertElementCount(LIST_MARKER_SELECTOR, 1);
  });

  test('AC3: select text + pick style → applied across selection', async ({ superdoc }) => {
    await superdoc.type('alpha');
    await superdoc.newLine();
    await superdoc.type('beta');
    await superdoc.newLine();
    await superdoc.type('gamma');
    await superdoc.waitForStable();
    await superdoc.selectAll();
    await superdoc.waitForStable();

    await pickStyle(superdoc, 'circle');

    expect(await getMarkerTextForParagraph(superdoc, 'alpha')).toBe('◦');
    expect(await getMarkerTextForParagraph(superdoc, 'beta')).toBe('◦');
    expect(await getMarkerTextForParagraph(superdoc, 'gamma')).toBe('◦');
  });

  test('AC5: swapping to a different style with a bare caret applies the new marker', async ({ superdoc }) => {
    // SD-2527 takes the whole-list-restyle path with a bare caret on a list paragraph:
    // clones the abstract with the new style at the paragraph's level and migrates the
    // paragraph (and its same-level siblings) to the new numId. PM-tracked migration
    // means undo can revert the style change.
    await superdoc.type('alpha');
    await superdoc.waitForStable();
    await pickStyle(superdoc, 'disc');
    expect(await getMarkerTextForParagraph(superdoc, 'alpha')).toBe('•');

    await pickStyle(superdoc, 'square');

    expect(await getMarkerTextForParagraph(superdoc, 'alpha')).toBe('▪');
    const after = await getParagraphNumberingByText(superdoc, 'alpha');
    expect(after?.numId).not.toBeNull();
  });

  test('toolbar reflects the active style when caret is in a styled bullet list', async ({ superdoc }) => {
    await superdoc.type('alpha');
    await superdoc.waitForStable();
    await pickStyle(superdoc, 'circle');

    expect(await getBulletPickerSelectedValue(superdoc)).toBe('circle');

    // Type more so a fresh selection update fires.
    await superdoc.type(' more');
    await superdoc.waitForStable();
    expect(await getBulletPickerSelectedValue(superdoc)).toBe('circle');
  });
});
