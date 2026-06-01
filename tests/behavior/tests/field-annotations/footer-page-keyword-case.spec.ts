import { test, expect } from '../../fixtures/superdoc.js';
import {
  FOOTER_FORMATTED_PAGE_FIELD_DOC_PATH,
  FOOTER_LOWERCASE_PAGE_FIELD_DOC_PATH,
} from '../../helpers/story-fixtures.js';

test('lowercase PAGE field in repeated footer resolves per page instead of using cached text', async ({ superdoc }) => {
  await superdoc.loadDocument(FOOTER_LOWERCASE_PAGE_FIELD_DOC_PATH);
  await superdoc.waitForStable();

  await expect.poll(() => superdoc.page.locator('.superdoc-page-footer').count()).toBeGreaterThanOrEqual(2);

  const secondPageFooter = superdoc.page.locator('.superdoc-page-footer').nth(1);
  await secondPageFooter.scrollIntoViewIfNeeded();
  await secondPageFooter.waitFor({ state: 'visible', timeout: 15_000 });

  await expect(secondPageFooter).toContainText(/Case footer\s*2/);
  await expect(secondPageFooter).not.toContainText(/Case footer\s*1/);
});

test('formatted PAGE fields in repeated footer resolve per page', async ({ superdoc }) => {
  await superdoc.loadDocument(FOOTER_FORMATTED_PAGE_FIELD_DOC_PATH);
  await superdoc.waitForStable();

  await expect.poll(() => superdoc.page.locator('.superdoc-page-footer').count()).toBeGreaterThanOrEqual(2);

  const secondPageFooter = superdoc.page.locator('.superdoc-page-footer').nth(1);
  await secondPageFooter.scrollIntoViewIfNeeded();
  await secondPageFooter.waitFor({ state: 'visible', timeout: 15_000 });

  await expect(secondPageFooter).toContainText(/Formats\s*II\s*B\s*-\s*2\s*-/);
  await expect(secondPageFooter).not.toContainText(/Formats\s*I\s*A\s*-\s*1\s*-/);
});
