import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

// A document that USES bundled fonts, with no pack configured. The point: SuperDoc preserves the
// document's font names (they show in the toolbar as document fonts) but must NOT activate a bundled
// substitute for them - no `.woff2` is fetched. This is the regression the 1.40 rollback was about:
// advertising/serving a substitute the app never configured.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CALIBRI_DOC = path.resolve(HERE, 'fixtures/calibri.docx'); // runs in Arial + Calibri

const FONT_TOGGLE = '[data-item="btn-fontFamily-toggle"]';
const FONT_OPTION = '[data-item="btn-fontFamily-option"]';
const OPTION_LABEL = `${FONT_OPTION} .toolbar-dropdown-option__label`;

async function fontOptionLabels(superdoc: SuperDocFixture): Promise<string[]> {
  await superdoc.page.locator(FONT_TOGGLE).click();
  await superdoc.page.locator(FONT_OPTION).first().waitFor({ state: 'visible', timeout: 5000 });
  await superdoc.waitForStable();
  return (await superdoc.page.locator(OPTION_LABEL).allInnerTexts()).map((label) => label.trim());
}

test.describe('npm, no pack: a document that uses bundled fonts', () => {
  test.use({ config: { toolbar: 'full', fonts: 'no-pack' } });

  test('preserves the document font name without fetching a bundled substitute', async ({ superdoc }) => {
    // No pack means no bundled substitution at all, so assert NO `.woff2` is fetched from any base.
    const fontRequests: string[] = [];
    superdoc.page.on('request', (req) => {
      if (/\.woff2(\?|$)/.test(req.url())) fontRequests.push(req.url());
    });

    await superdoc.loadDocument(CALIBRI_DOC);
    await superdoc.waitForStable();

    // Rendering a Calibri document with no pack must not fetch a substitute face.
    expect(fontRequests).toEqual([]);

    // The Calibri run keeps its logical Word name (no substitution baked in).
    await superdoc.assertTextMarkAttrs('Hamburgefonts', 'textStyle', { fontFamily: 'Calibri' });

    // The document's font still appears in the toolbar - document fonts are advertised even with no
    // pack - so the user can re-apply it; it simply renders with the system font, not a substitute.
    expect(await fontOptionLabels(superdoc)).toContain('Calibri');
  });
});
