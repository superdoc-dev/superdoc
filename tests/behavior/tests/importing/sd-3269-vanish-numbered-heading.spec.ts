import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures');

// SD-3269 import-rendering matrix. Each fixture is a Word-native .docx with one
// numbered Heading2 paragraph (numId=1, ilvl=1, lvlText="Section %1.%2",
// numFmt=decimalZero) followed by one plain paragraph. The four variants
// isolate where vanish/specVanish lives.
//
// Word 16.0 behavior, verified against PDF export of each fixture:
//   F1 (vanish + specVanish on paragraph mark) - fused, marker "Section 1.01" visible
//   F2 (vanish only on paragraph mark)         - fused, marker visible
//   F3 (specVanish only on paragraph mark)     - NOT fused, marker visible
//   F4 (vanish on numbering def w:lvl/w:rPr)   - NOT fused, marker hidden
//
// Assertions go through the browser render path (.superdoc-fragment count for
// fuse, .superdoc-list-marker for marker visibility) rather than the document
// model, because the original SD-3269 regression was a visual marker drop that
// a model-level assertion would have missed.

type Case = {
  id: string;
  file: string;
  desc: string;
  expectFragments: number; // paragraph fragments after pm-adapter fuse + paint
  expectMarkerVisible: boolean;
};

const CASES: Case[] = [
  {
    id: 'F1',
    file: 'sd3269-F1-vanish-specVanish.docx',
    desc: 'paragraph-mark rPr with vanish + specVanish',
    expectFragments: 1,
    expectMarkerVisible: true,
  },
  {
    id: 'F2',
    file: 'sd3269-F2-vanish-only.docx',
    desc: 'paragraph-mark rPr with vanish only',
    expectFragments: 1,
    expectMarkerVisible: true,
  },
  {
    id: 'F3',
    file: 'sd3269-F3-specVanish-only.docx',
    desc: 'paragraph-mark rPr with specVanish only',
    expectFragments: 2,
    expectMarkerVisible: true,
  },
  {
    id: 'F4',
    file: 'sd3269-F4-lvl-vanish.docx',
    desc: 'numbering def lvl/rPr with vanish (marker hidden the supported way)',
    expectFragments: 2,
    expectMarkerVisible: false,
  },
];

test.use({ config: { toolbar: 'full', comments: 'off' } });

for (const c of CASES) {
  const docPath = path.join(FIXTURE_DIR, c.file);

  test.skip(!fs.existsSync(docPath), `Fixture ${c.file} not available`);

  test(`SD-3269 ${c.id}: ${c.desc}`, async ({ superdoc }) => {
    await superdoc.loadDocument(docPath);
    await superdoc.waitForStable();

    // Count paragraph fragments rendered. `.superdoc-fragment` is the painter's
    // block-container class (paragraph, table, image). For these fixtures only
    // paragraphs render, so fragment count == paragraph block count.
    const fragmentCount = await superdoc.page.locator('.superdoc-fragment').count();
    expect(fragmentCount, `${c.id} fragment count`).toBe(c.expectFragments);

    // Marker visibility: the painter wraps the auto-generated marker in
    // `<span class="superdoc-list-marker">` only when marker.run.vanish !== true
    // (painters/dom/src/renderer.ts ~line 3553). So a hidden marker has no
    // such element in the DOM.
    const markerLocator = superdoc.page.locator('.superdoc-list-marker');
    if (c.expectMarkerVisible) {
      // Marker text matches lvlText "Section %1.%2" with numFmt decimalZero.
      await expect(markerLocator.first()).toBeVisible();
      const markerText = (await markerLocator.first().innerText()).trim();
      expect(markerText, `${c.id} marker text`).toContain('Section 1.01');
    } else {
      expect(await markerLocator.count(), `${c.id} expected no rendered marker`).toBe(0);
    }

    // Sanity: both runs of text are present in the document somewhere.
    const bodyText = await superdoc.page.locator('.superdoc-page').first().innerText();
    expect(bodyText, `${c.id} head text`).toContain('Purchase Price.');
    expect(bodyText, `${c.id} body text`).toContain('The Purchase Price shall be paid at Closing.');
  });
}
