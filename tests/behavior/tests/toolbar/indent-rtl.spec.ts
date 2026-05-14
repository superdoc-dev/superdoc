import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.resolve(__dirname, '../formatting/fixtures/rtl-paragraph-alignment.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

// SD-3094 + ECMA-376 §17.3.1.6: w:bidi affects w:ind the same way it
// affects w:jc. Per the spec, increasing indent on an RTL paragraph
// should grow the leading edge (the right visual side). This spec is
// a smoke test that the Increase Indent toolbar action runs without
// error on an RTL paragraph and produces a paragraph-properties update
// observable through the doc-api.

test('Increase Indent on RTL paragraph updates paragraph properties', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC);
  await superdoc.waitForStable();

  const line = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'jc=center' })
    .first();
  await line.click();
  await superdoc.waitForStable();

  const before = await superdoc.page.evaluate(() => {
    const docApi = (window as any).editor?.doc;
    const m = docApi.query.match({ select: { type: 'text', pattern: 'jc=center' }, require: 'first' });
    const addr = m?.items?.[0]?.address;
    if (!addr) return null;
    const n = docApi.getNode(addr);
    const p = (n?.node ?? n).paragraph;
    return { indent: p?.props?.indent ?? null };
  });

  await superdoc.page.locator('[data-item="btn-indentright"]').click();
  await superdoc.waitForStable();

  const after = await superdoc.page.evaluate(() => {
    const docApi = (window as any).editor?.doc;
    const m = docApi.query.match({ select: { type: 'text', pattern: 'jc=center' }, require: 'first' });
    const addr = m?.items?.[0]?.address;
    if (!addr) return null;
    const n = docApi.getNode(addr);
    const p = (n?.node ?? n).paragraph;
    return { indent: p?.props?.indent ?? null };
  });

  // The indent must change (an exact value depends on the existing
  // indent + step size; we only assert it is no longer the original).
  expect(JSON.stringify(after?.indent)).not.toBe(JSON.stringify(before?.indent));
});
