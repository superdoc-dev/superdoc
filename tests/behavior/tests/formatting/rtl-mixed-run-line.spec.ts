import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/rtl-mixed-run-line.docx');

// SD-3098 negative test: Hebrew + date + Hebrew on one line, where Word
// only marks the Hebrew runs with <w:rtl/>. The date run has no rtl flag,
// so neither the RLM injection nor the dir="ltr" force should kick in.
// Confirms we don't break standard mixed-language paragraphs.
test('mixed Hebrew + date line keeps Hebrew runs rtl and does not inject RLM into the date', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const lineSpans = superdoc.page.locator('.superdoc-page .superdoc-fragment .superdoc-line span');

  const hebrewSpans = lineSpans.filter({ hasText: /[\u0590-\u05FF]/ });
  expect(await hebrewSpans.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await hebrewSpans.count()); i++) {
    await expect(hebrewSpans.nth(i)).toHaveAttribute('dir', 'rtl');
  }

  const dateSpan = lineSpans.filter({ hasText: '23/03/2026' }).first();
  await expect(dateSpan).toBeVisible();
  const dateText = await dateSpan.evaluate((el) => el.textContent ?? '');
  expect(dateText.includes('\u200F')).toBe(false);
});
