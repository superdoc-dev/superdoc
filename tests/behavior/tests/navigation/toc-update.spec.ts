import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/layout/toc-with-heading2.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

/**
 * Reads every TOC entry's title text from the document.
 *
 * The rebuilt entries are wrapped in `run` nodes whose first text run holds
 * the title (without the page-number `tocPageNumber` mark).
 */
const readTocTitles = async (superdoc) =>
  superdoc.page.evaluate(() => {
    const editor = (window as unknown as { editor?: { state: { doc: unknown } } }).editor;
    if (!editor?.state?.doc) return [];
    const titles: string[] = [];
    (editor.state.doc as { descendants: (cb: (n: any) => boolean | void) => void }).descendants((node) => {
      if (node?.type?.name !== 'tableOfContents') return true;
      node.descendants((child: any) => {
        if (child?.type?.name !== 'paragraph') return true;
        // First non-page-number text run is the entry title.
        let captured = false;
        child.descendants((leaf: any) => {
          if (captured) return false;
          if (!leaf.isText || !leaf.text) return true;
          const isPageNumber = (leaf.marks ?? []).some((m: any) => m.type?.name === 'tocPageNumber');
          if (!isPageNumber) {
            titles.push(leaf.text);
            captured = true;
          }
          return true;
        });
        return false;
      });
      return false;
    });
    return titles;
  });

test('@behavior SD-2664: updateFieldsInSelection (F9) rebuilds every TOC entry from the document headings', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);

  // Capture the original TOC entries.
  const titlesBefore = await readTocTitles(superdoc);
  expect(titlesBefore.length).toBeGreaterThan(0);

  // Read the heading texts that should drive the rebuilt TOC. The fixture
  // contains Heading1/Heading2 paragraphs in the body.
  const headingTexts = await superdoc.page.evaluate(() => {
    const editor = (window as unknown as { editor?: { state: { doc: unknown } } }).editor;
    if (!editor?.state?.doc) return [];
    const out: string[] = [];
    (editor.state.doc as { descendants: (cb: (n: any) => boolean | void) => void }).descendants((node) => {
      if (node?.type?.name === 'tableOfContents') return false; // skip TOC contents
      if (node?.type?.name !== 'paragraph') return true;
      const styleId = node.attrs?.paragraphProperties?.styleId;
      if (!styleId || !/^Heading[1-9]$/.test(styleId)) return true;
      let text = '';
      node.descendants((c: any) => {
        if (c.isText && c.text) text += c.text;
        return true;
      });
      if (text.trim()) out.push(text.trim());
      return true;
    });
    return out;
  });
  expect(headingTexts.length).toBeGreaterThan(0);

  // Press F9 — the FieldUpdate extension binds it to updateFieldsInSelection,
  // which routes through editor.doc.toc.update for every TOC in the doc.
  await superdoc.executeCommand('updateFieldsInSelection');
  await superdoc.waitForStable(2000);

  const titlesAfter = await readTocTitles(superdoc);
  // Every heading in the doc should now appear as an entry, and every entry
  // should map to a heading text. Order must match document order.
  expect(titlesAfter).toEqual(headingTexts);
});
