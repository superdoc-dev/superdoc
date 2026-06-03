import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOWERCASE_DOC = path.resolve(__dirname, 'fixtures/pageref-standalone-h.docx');
const UPPERCASE_DOC = path.resolve(__dirname, 'fixtures/pageref-standalone-uppercase-h.docx');

// SD-2537: PAGEREF fields with the \h switch render as internal hyperlinks
// whose clicks navigate to the referenced bookmark. This test covers the
// standalone case — a PAGEREF \h NOT wrapped in a <w:hyperlink> element.
// The wrapped case (Word TOCs) is covered by toc-anchor-scroll.spec.ts.
//
// Both fixtures are a 7-entry TOC where the first entry's outer <w:hyperlink>
// has been removed, leaving only the inner PAGEREF \h field for that row.
// The other entries retain their wrappers and serve as a control.
//
// The "Introduction" entry uses bookmark id _Toc227765979. Its page number
// anchor only exists if the PAGEREF \h switch produces a link on its own.

test.skip(!fs.existsSync(LOWERCASE_DOC), 'Standalone PAGEREF fixture missing');
test.skip(!fs.existsSync(UPPERCASE_DOC), 'Uppercase PAGEREF fixture missing');

test('@behavior SD-2537: standalone PAGEREF with \\h renders a clickable anchor', async ({ superdoc }) => {
  await superdoc.loadDocument(LOWERCASE_DOC);
  await superdoc.waitForStable(2000);

  // The first TOC entry has its outer <w:hyperlink> stripped. The page
  // number should still be an anchor because the PAGEREF \h synthesizes one.
  const pageNumberLink = superdoc.page.locator('a.superdoc-link[href="#_Toc227765979"]');
  await expect(pageNumberLink).toBeVisible({ timeout: 10_000 });
});

test('@behavior SD-2537: clicking standalone PAGEREF navigates to the bookmark', async ({ superdoc }) => {
  await superdoc.loadDocument(LOWERCASE_DOC);
  await superdoc.waitForStable(2000);

  const selBefore = await superdoc.getSelection();
  const pageNumberLink = superdoc.page.locator('a.superdoc-link[href="#_Toc227765979"]').first();
  await expect(pageNumberLink).toBeVisible({ timeout: 10_000 });
  await pageNumberLink.click();
  await superdoc.waitForStable(2000);

  // goToAnchor moves the caret to the bookmark target.
  const selAfter = await superdoc.getSelection();
  expect(selAfter.from).not.toBe(selBefore.from);
});

test('@behavior SD-2537: standalone PAGEREF with uppercase \\H also renders a clickable anchor', async ({
  superdoc,
}) => {
  // ECMA-376 §17.16.1 says field switches are case-insensitive. \H should
  // behave identically to \h.
  await superdoc.loadDocument(UPPERCASE_DOC);
  await superdoc.waitForStable(2000);

  const pageNumberLink = superdoc.page.locator('a.superdoc-link[href="#_Toc227765979"]');
  await expect(pageNumberLink).toBeVisible({ timeout: 10_000 });
});
