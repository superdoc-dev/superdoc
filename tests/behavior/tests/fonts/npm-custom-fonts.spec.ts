import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

// Custom (consumer-licensed) fonts, split along the contract that surprises people:
//  - fonts.families REGISTERS a face so it RENDERS when the document uses it - but registration alone
//    does NOT add a toolbar option.
//  - A custom family becomes SELECTABLE only when the consumer lists it in modules.toolbar.fonts (or
//    the document already uses it, which surfaces it as a document font).
// The harness registers "Brand Sans" from a real served woff2 under a distinct name (see the `custom`
// modes in harness/main.ts).

const FONT_TOGGLE = '[data-item="btn-fontFamily-toggle"]';
const FONT_OPTION = '[data-item="btn-fontFamily-option"]';
const OPTION_LABEL = `${FONT_OPTION} .toolbar-dropdown-option__label`;

async function fontOptionLabels(superdoc: SuperDocFixture): Promise<string[]> {
  await superdoc.page.locator(FONT_TOGGLE).click();
  await superdoc.page.locator(FONT_OPTION).first().waitFor({ state: 'visible', timeout: 5000 });
  await superdoc.waitForStable();
  return (await superdoc.page.locator(OPTION_LABEL).allInnerTexts()).map((label) => label.trim());
}

test.describe('npm + custom font registered via fonts.families', () => {
  test.use({ config: { toolbar: 'full', fonts: 'custom' } });

  test('renders when applied but is NOT a toolbar option from registration alone', async ({ superdoc }) => {
    const woff2: Array<{ url: string; status: number }> = [];
    superdoc.page.on('response', (res) => {
      if (/\.woff2(\?|$)/.test(res.url())) woff2.push({ url: res.url(), status: res.status() });
    });

    // Registration alone does not add a toolbar row: the dropdown is the no-pack baseline only.
    expect(await fontOptionLabels(superdoc)).not.toContain('Brand Sans');
    await superdoc.page.keyboard.press('Escape');
    await superdoc.waitForStable();

    // It still RENDERS when the document uses it: apply it programmatically, and its registered face
    // loads over the wire.
    await superdoc.type('Brand Sans sample');
    await superdoc.waitForStable();
    const pos = await superdoc.findTextPos('Brand Sans sample');
    await superdoc.setTextSelection(pos, pos + 'Brand Sans sample'.length);
    await superdoc.waitForStable();
    await superdoc.page.evaluate(() => {
      (
        window as unknown as { editor: { commands: { setFontFamily: (f: string) => void } } }
      ).editor.commands.setFontFamily('Brand Sans');
    });
    await superdoc.waitForStable();

    await superdoc.assertTextMarkAttrs('Brand Sans sample', 'textStyle', { fontFamily: 'Brand Sans' });
    await expect.poll(() => woff2.filter((r) => r.status === 200).length, { timeout: 10_000 }).toBeGreaterThan(0);
  });
});

test.describe('npm + custom font listed in modules.toolbar.fonts', () => {
  test.use({ config: { toolbar: 'full', fonts: 'custom-toolbar' } });

  test('is selectable because the consumer provided the toolbar list', async ({ superdoc }) => {
    await superdoc.type('Toolbar custom sample');
    await superdoc.waitForStable();
    const pos = await superdoc.findTextPos('Toolbar custom sample');
    await superdoc.setTextSelection(pos, pos + 'Toolbar custom sample'.length);
    await superdoc.waitForStable();

    // A consumer-provided fonts list replaces the built-in one entirely, so Brand Sans appears and is
    // selectable. Open the dropdown once, assert it's there, then pick it.
    const labels = await fontOptionLabels(superdoc);
    expect(labels).toContain('Brand Sans');
    await superdoc.page
      .locator(FONT_OPTION)
      .filter({ has: superdoc.page.getByText('Brand Sans', { exact: true }) })
      .click();
    await superdoc.waitForStable();
    await superdoc.page
      .locator('.presentation-editor__viewport')
      .first()
      .click({ position: { x: 50, y: 50 } });
    await superdoc.waitForStable();

    await superdoc.assertTextMarkAttrs('Toolbar custom sample', 'textStyle', { fontFamily: 'Brand Sans' });
  });
});
