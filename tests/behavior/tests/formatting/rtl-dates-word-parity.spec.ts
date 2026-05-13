import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/rtl-dates.docx');

test('rtl dates render in the same visual order as Word', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const headerRuns = superdoc.page.locator('.superdoc-page-header .superdoc-line span');
  await expect(headerRuns.last()).toHaveAttribute('dir', 'rtl');
  const headerText = await headerRuns.last().evaluate((el) => el.textContent ?? '');
  expect(headerText.includes('\u200F/\u200F')).toBe(true);

  const bodyDateRuns = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line span')
    .filter({ hasText: '-03-23' });
  await expect(bodyDateRuns.first()).toHaveAttribute('dir', 'ltr');

  const bodyRtlNumericRun = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line span[dir="rtl"]')
    .filter({ hasText: '2026' })
    .first();
  await expect(bodyRtlNumericRun).toBeVisible();
});
