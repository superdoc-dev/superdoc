import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

// Font availability + curation on the npm path, driven through the existing Vite harness via the
// `fonts` config mode (see resolveHarnessFontsConfig in harness/main.ts). These rows assert what the
// toolbar ADVERTISES and that malformed raw config degrades safely - none of them need the bundled
// `.woff2` to be served, so they run without the font middleware. Apply/load/export and the CDN path
// live in sibling specs.

const FONT_TOGGLE = '[data-item="btn-fontFamily-toggle"]';
const FONT_OPTION = '[data-item="btn-fontFamily-option"]';
const OPTION_LABEL = `${FONT_OPTION} .toolbar-dropdown-option__label`;

// The full advertised set when the pack is configured (mirrors font-dropdown-document-options.spec).
const RICH_LABELS = [
  'Arial',
  'Arial Black',
  'Arial Narrow',
  'Baskerville Old Face',
  'Bookman Old Style',
  'Brush Script MT',
  'Calibri',
  'Century',
  'Century Gothic',
  'Comic Sans MS',
  'Cooper Black',
  'Courier New',
  'Garamond',
  'Georgia',
  'Gill Sans MT Condensed',
  'Helvetica',
  'Lucida Console',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];

const BASELINE_LABELS = ['Arial', 'Courier New', 'Times New Roman'];

async function openFontDropdown(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.locator(FONT_TOGGLE).click();
  await superdoc.page.locator(FONT_OPTION).first().waitFor({ state: 'visible', timeout: 5000 });
  await superdoc.waitForStable();
}

async function fontOptionLabels(superdoc: SuperDocFixture): Promise<string[]> {
  return (await superdoc.page.locator(OPTION_LABEL).allInnerTexts()).map((label) => label.trim());
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

test.describe('npm, no pack configured', () => {
  test.use({ config: { toolbar: 'full', fonts: 'no-pack' } });

  test('blank doc advertises only the one-per-generic baseline', async ({ superdoc }) => {
    await openFontDropdown(superdoc);
    // Exact list: with no pack and no document fonts, the toolbar is the conservative baseline only.
    expect(await fontOptionLabels(superdoc)).toEqual(BASELINE_LABELS);
  });

  test('the rich pack is not advertised without a configured pack', async ({ superdoc }) => {
    await openFontDropdown(superdoc);
    const labels = await fontOptionLabels(superdoc);
    for (const richOnly of ['Calibri', 'Georgia', 'Verdana', 'Cooper Black', 'Comic Sans MS']) {
      expect(labels).not.toContain(richOnly);
    }
  });
});

test.describe('npm + include curation', () => {
  test.use({ config: { toolbar: 'full', fonts: 'include-calibri' } });

  test('include is a strict allow-list: the built-in baseline is dropped', async ({ superdoc }) => {
    await openFontDropdown(superdoc);
    const labels = await fontOptionLabels(superdoc);
    // The contract: include gates the built-in set down to the named families, so the rest of the
    // baseline (Courier New, Times New Roman) and every other rich family are gone - the
    // surprising-but-current behavior. Arial still shows because the blank document itself uses it:
    // document-used fonts always appear in the toolbar, independent of bundled curation.
    expect(labels).toContain('Calibri');
    for (const dropped of ['Courier New', 'Times New Roman', 'Georgia', 'Verdana', 'Cooper Black', 'Comic Sans MS']) {
      expect(labels).not.toContain(dropped);
    }
  });
});

test.describe('npm + exclude curation', () => {
  test.use({ config: { toolbar: 'full', fonts: 'exclude-cooper' } });

  test('exclude removes only the named family from the rich set', async ({ superdoc }) => {
    await openFontDropdown(superdoc);
    const labels = await fontOptionLabels(superdoc);
    expect(labels).toEqual(RICH_LABELS.filter((label) => label !== 'Cooper Black'));
    expect(labels).not.toContain('Cooper Black');
  });
});

test.describe('npm + pack: applying a bundled font', () => {
  test.use({ config: { toolbar: 'full', fonts: 'pack' } });

  test('applying Calibri loads its bundled face (200) and stores the logical name, not Carlito', async ({
    superdoc,
  }) => {
    // Capture bundled-font responses from the moment we apply (faces load lazily, only on use). The
    // 'pack' mode uses the SERVED `/bundled-fonts/` base; the default `/fonts/` is intentionally
    // unserved so it doesn't perturb non-font specs (see harness/vite.config.ts).
    const fontResponses: Array<{ url: string; status: number }> = [];
    superdoc.page.on('response', (res) => {
      if (/\/bundled-fonts\/.*\.woff2(\?|$)/.test(res.url()))
        fontResponses.push({ url: res.url(), status: res.status() });
    });

    await superdoc.type('Calibri sample');
    await superdoc.waitForStable();
    const pos = await superdoc.findTextPos('Calibri sample');
    await superdoc.setTextSelection(pos, pos + 'Calibri sample'.length);
    await superdoc.waitForStable();

    await openFontDropdown(superdoc);
    await selectFontOption(superdoc, 'Calibri');

    // Stored/exported value is the logical Word family - never the physical substitute (Carlito).
    await superdoc.assertTextMarkAttrs('Calibri sample', 'textStyle', { fontFamily: 'Calibri' });

    // The substitute face actually loaded over the wire (200), proving the configured pack serves.
    await expect
      .poll(() => fontResponses.filter((r) => r.status === 200).length, { timeout: 10_000 })
      .toBeGreaterThan(0);
  });
});

test.describe('npm + malformed raw fonts.bundled', () => {
  test.use({ config: { toolbar: 'full', fonts: 'bad-raw' } });

  test('a non-array include warns once and falls back to the full pack, never crashing init', async ({ superdoc }) => {
    // The init warning fires during SuperDoc construction, which the fixture already awaited. Reload
    // with a console listener attached so we capture that first init.
    const warnings: string[] = [];
    superdoc.page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    await superdoc.page.reload({ waitUntil: 'networkidle' });
    await superdoc.page.waitForFunction(
      () => (window as Window & { superdocReady?: boolean }).superdocReady === true,
      null,
      {
        timeout: 30_000,
      },
    );
    await superdoc.waitForStable();

    // Exactly one shape warning, and crucially NO per-character "X is not a bundled font" spam.
    expect(warnings.filter((w) => /fonts\.bundled\.include must be an array/.test(w))).toHaveLength(1);
    expect(warnings.filter((w) => /is not a bundled font/.test(w))).toHaveLength(0);

    // No crash: the editor came up, and the malformed curation fell back to the full pack.
    await openFontDropdown(superdoc);
    expect(await fontOptionLabels(superdoc)).toEqual(RICH_LABELS);
  });
});
