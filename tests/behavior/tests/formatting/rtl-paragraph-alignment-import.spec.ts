import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/rtl-paragraph-alignment.docx');

// SD-3093: When a Word doc has `w:bidi` + explicit `w:jc="left"`/"right"/"center",
// ECMA-376 §17.3.1.13 says left = leading edge, right = trailing edge. In an RTL
// paragraph that resolves to visual right / visual left / center respectively.
// This spec loads a Word-authored fixture exercising all three to guard the
// import + render path that PR #3235 fixes.
test('RTL paragraph w:jc=left renders text-align: right', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const lines = superdoc.page.locator('.superdoc-page .superdoc-fragment .superdoc-line');
  const jcLeftLine = lines.filter({ hasText: 'jc=left' }).first();
  await expect(jcLeftLine).toBeVisible();
  const textAlign = await jcLeftLine.evaluate((el) => window.getComputedStyle(el).textAlign);
  expect(textAlign).toBe('right');
});

test('RTL paragraph w:jc=right renders text-align: left', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const lines = superdoc.page.locator('.superdoc-page .superdoc-fragment .superdoc-line');
  const jcRightLine = lines.filter({ hasText: 'jc=right' }).first();
  await expect(jcRightLine).toBeVisible();
  const textAlign = await jcRightLine.evaluate((el) => window.getComputedStyle(el).textAlign);
  expect(textAlign).toBe('left');
});

test('RTL paragraph w:jc=center renders text-align: center', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const lines = superdoc.page.locator('.superdoc-page .superdoc-fragment .superdoc-line');
  const jcCenterLine = lines.filter({ hasText: 'jc=center' }).first();
  await expect(jcCenterLine).toBeVisible();
  const textAlign = await jcCenterLine.evaluate((el) => window.getComputedStyle(el).textAlign);
  expect(textAlign).toBe('center');
});
