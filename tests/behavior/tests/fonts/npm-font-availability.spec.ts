import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

// Font availability + curation on the npm path, driven through the existing Vite harness via the
// `fonts` config mode (see resolveHarnessFontsConfig in harness/main.ts): no-pack baseline,
// include/exclude curation, applying a bundled font (loads the substitute, keeps the logical name),
// malformed raw config, a broken asset base, and programmatic apply. The package-import DX,
// document-font preservation, and custom fonts live in sibling specs.

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

test.describe('npm + pack with a broken asset base', () => {
  test.use({ config: { toolbar: 'full', fonts: 'bad-url' } });

  test('advertises rich on config presence and requests faces from the configured base, staying graceful', async ({
    superdoc,
  }) => {
    const woff2: string[] = [];
    superdoc.page.on('response', (res) => {
      if (/\.woff2(\?|$)/.test(res.url())) woff2.push(res.url());
    });

    // Advertising is gated on config PRESENCE, not on the assets actually being served - so a
    // configured-but-broken base still shows the full rich set.
    await openFontDropdown(superdoc);
    expect(await fontOptionLabels(superdoc)).toEqual(RICH_LABELS);
    await superdoc.page.keyboard.press('Escape');
    await superdoc.waitForStable();

    await superdoc.type('Broken base sample');
    await superdoc.waitForStable();
    const pos = await superdoc.findTextPos('Broken base sample');
    await superdoc.setTextSelection(pos, pos + 'Broken base sample'.length);
    await superdoc.waitForStable();
    await openFontDropdown(superdoc);
    await selectFontOption(superdoc, 'Calibri');

    // SuperDoc honors the configured base: it requests Calibri's substitute from exactly where the
    // app pointed it, not anywhere else. (A real server would 404 here; this harness returns Vite's
    // SPA fallback, which the browser then can't decode - SuperDoc itself does not warn on a load
    // failure, it falls back to the logical name, which the run keeps.)
    await expect
      .poll(() => woff2.some((u) => /\/__missing-fonts__\/Carlito.*\.woff2/.test(u)), { timeout: 10_000 })
      .toBe(true);
    expect(woff2.every((u) => /\/__missing-fonts__\//.test(u))).toBe(true);
    await superdoc.assertTextMarkAttrs('Broken base sample', 'textStyle', { fontFamily: 'Calibri' });
  });
});

test.describe('npm, no pack: programmatic apply', () => {
  test.use({ config: { fonts: 'no-pack' } });

  test('applying a bundled font via the editor command keeps the name and fetches no substitute', async ({
    superdoc,
  }) => {
    // Exercises the resolver gate with the UI out of the picture: a font absent from the no-pack
    // toolbar can still be applied programmatically (or arrive in a document), and must keep its
    // logical name without pulling a substitute.
    const fontRequests: string[] = [];
    superdoc.page.on('request', (req) => {
      if (/\.woff2(\?|$)/.test(req.url())) fontRequests.push(req.url());
    });
    const warnings: string[] = [];
    superdoc.page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });

    await superdoc.type('Programmatic sample');
    await superdoc.waitForStable();
    const pos = await superdoc.findTextPos('Programmatic sample');
    await superdoc.setTextSelection(pos, pos + 'Programmatic sample'.length);
    await superdoc.waitForStable();

    await superdoc.page.evaluate(() => {
      (
        window as unknown as { editor: { commands: { setFontFamily: (f: string) => void } } }
      ).editor.commands.setFontFamily('Calibri');
    });
    await superdoc.waitForStable();

    // Stored value is the logical name; no pack means no substitute fetch and no font-config warning.
    await superdoc.assertTextMarkAttrs('Programmatic sample', 'textStyle', { fontFamily: 'Calibri' });
    expect(fontRequests).toEqual([]);
    expect(
      warnings.filter((w) => /bundled|substitute|@superdoc-dev\/fonts|assetBaseUrl|not a bundled font/i.test(w)),
    ).toEqual([]);
  });
});
