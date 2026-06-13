import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

// The real `@superdoc-dev/fonts` DX, distinct from the `assetBaseUrl: '/fonts/'` harness: import the
// package, pass `superdocFonts`, and the bundled faces resolve to bundler-emitted asset URLs (the
// package writes them as `new URL('../assets/<file>', import.meta.url)`). This proves the
// import-and-go path users copy from the docs actually loads a face over the wire.

const FONT_TOGGLE = '[data-item="btn-fontFamily-toggle"]';
const FONT_OPTION = '[data-item="btn-fontFamily-option"]';

async function openFontDropdown(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.locator(FONT_TOGGLE).click();
  await superdoc.page.locator(FONT_OPTION).first().waitFor({ state: 'visible', timeout: 5000 });
  await superdoc.waitForStable();
}

async function selectFontOption(superdoc: SuperDocFixture, label: string): Promise<void> {
  await superdoc.page
    .locator(FONT_OPTION)
    .filter({ has: superdoc.page.getByText(label, { exact: true }) })
    .click();
  await superdoc.waitForStable();
  await superdoc.page
    .locator('.presentation-editor__viewport')
    .first()
    .click({ position: { x: 50, y: 50 } });
  await superdoc.waitForStable();
}

test.describe('npm + @superdoc-dev/fonts package (real DX)', () => {
  test.use({ config: { toolbar: 'full', fonts: 'package' } });

  test('applying Calibri loads the package-emitted substitute (200) and stores the logical name', async ({
    superdoc,
  }) => {
    const fontResponses: Array<{ url: string; status: number }> = [];
    superdoc.page.on('response', (res) => {
      if (/\.woff2(\?|$)/.test(res.url())) fontResponses.push({ url: res.url(), status: res.status() });
    });

    await superdoc.type('Calibri via package');
    await superdoc.waitForStable();
    const pos = await superdoc.findTextPos('Calibri via package');
    await superdoc.setTextSelection(pos, pos + 'Calibri via package'.length);
    await superdoc.waitForStable();

    await openFontDropdown(superdoc);
    await selectFontOption(superdoc, 'Calibri');

    // Stored/exported value is the logical Word family, never the physical substitute.
    await superdoc.assertTextMarkAttrs('Calibri via package', 'textStyle', { fontFamily: 'Calibri' });

    // Carlito (Calibri's substitute) loaded 200 from the PACKAGE's emitted asset path - the
    // import-and-go DX: `new URL('../assets/Carlito-Regular.woff2', import.meta.url)` resolved and
    // served by the bundler, with no assetBaseUrl.
    await expect
      .poll(() => fontResponses.find((r) => /packages\/fonts\/assets\/Carlito.*\.woff2/.test(r.url))?.status ?? 0, {
        timeout: 10_000,
      })
      .toBe(200);
    // Nothing came from an assetBaseUrl `/fonts/` path - the package resolved every face itself.
    expect(fontResponses.every((r) => !/localhost:9990\/fonts\//.test(r.url))).toBe(true);
  });
});
