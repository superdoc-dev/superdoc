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

  const bodyFragments = superdoc.page.locator('.superdoc-page > .superdoc-fragment');
  const bodyDateRuns = bodyFragments.locator('.superdoc-line span').filter({ hasText: '-03-23' });
  await expect(bodyDateRuns.first()).toHaveAttribute('dir', 'ltr');

  // SD-2933: rtl-tagged digit-only runs (e.g. a standalone "2026") fall into the
  // latin-only branch of resolveRunDirectionAttribute and intentionally do NOT
  // receive a per-run dir attribute. The paragraph direction carries them via
  // UBA, matching Word's empirical rendering. Per ECMA-376 §17.3.2.30, w:rtl on
  // strongly-LTR text is unspecified behavior.
  const bodyNumericRun = bodyFragments
    .locator('.superdoc-line span')
    .filter({ hasText: /^2026$/ })
    .first();
  await expect(bodyNumericRun).toBeVisible();
  await expect(bodyNumericRun).not.toHaveAttribute('dir', 'rtl');
});
