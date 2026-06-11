import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

const BULLET_DROPDOWN_CARET = '[aria-label="Bullet list"] .sd-dropdown-caret';
const STYLE_OPTION = (label: string) => `.style-buttons-list [aria-label="${label}"]`;

const STYLE_LABEL = {
  disc: 'Opaque circle',
  circle: 'Outline circle',
  square: 'Opaque square',
} as const;

async function pickStyle(superdoc: SuperDocFixture, style: keyof typeof STYLE_LABEL) {
  await superdoc.page.locator(BULLET_DROPDOWN_CARET).click();
  await superdoc.waitForStable();
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

test.describe('bullet style picker undo/redo (SD-2526 AC9)', () => {
  async function focusEditor(superdoc: SuperDocFixture) {
    // Dropdown clicks drop editor focus; selectAll re-focuses the editor DOM.
    await superdoc.selectAll();
    await superdoc.waitForStable();
  }

  test('undo of initial create removes the list entirely', async ({ superdoc }) => {
    await superdoc.type('alpha');
    await superdoc.waitForStable();
    await pickStyle(superdoc, 'circle');
    expect(await getMarkerTextForParagraph(superdoc, 'alpha')).toBe('◦');

    await focusEditor(superdoc);
    await superdoc.undo();
    await superdoc.waitForStable();
    expect(await getMarkerTextForParagraph(superdoc, 'alpha')).toBeNull();
  });
});
