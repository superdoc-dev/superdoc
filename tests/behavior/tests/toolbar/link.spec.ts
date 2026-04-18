import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

const LINK_DROPDOWN = '.link-input-ctn';

/**
 * Apply a link to the current selection and wait for the dropdown to fully close.
 * The dropdown animates closed after apply — waitForStable() alone isn't enough.
 */
async function applyLink(superdoc: SuperDocFixture, href: string): Promise<void> {
  const page = superdoc.page;

  const linkButton = page.locator('[data-item="btn-link"]');
  await linkButton.click();
  await superdoc.waitForStable();

  const urlInput = page.locator(`${LINK_DROPDOWN} input[name="link"]`);
  await urlInput.fill(href);
  await page.locator('[data-item="btn-link-apply"]').click();

  // Wait for the dropdown to close — it animates away over ~300ms
  await page.locator(LINK_DROPDOWN).waitFor({ state: 'hidden', timeout: 5000 });
  await superdoc.waitForStable();
}

test('insert link on selected text', async ({ superdoc }) => {
  await superdoc.type('Visit our website for details');
  await superdoc.waitForStable();
  await superdoc.snapshot('typed text');

  // Select "website"
  const pos = await superdoc.findTextPos('website');
  await superdoc.setTextSelection(pos, pos + 'website'.length);
  await superdoc.waitForStable();
  await superdoc.snapshot('website selected');

  await applyLink(superdoc, 'https://example.com');
  await superdoc.snapshot('link applied');

  // Assert link mark exists
  await superdoc.assertTextHasMarks('website', ['link']);
  await superdoc.assertTextMarkAttrs('website', 'link', { href: 'https://example.com' });
});

test('edit existing link', async ({ superdoc }) => {
  await superdoc.type('Visit our website for details');
  await superdoc.waitForStable();

  // Select "website" and add a link
  const pos = await superdoc.findTextPos('website');
  await superdoc.setTextSelection(pos, pos + 'website'.length);
  await superdoc.waitForStable();

  await applyLink(superdoc, 'https://example.com');
  await superdoc.snapshot('link created');

  // Re-select the linked text and open the link dropdown to edit
  const linkPos = await superdoc.findTextPos('website');
  await superdoc.setTextSelection(linkPos, linkPos + 'website'.length);
  await superdoc.waitForStable();

  const linkButton = superdoc.page.locator('[data-item="btn-link"]');
  await linkButton.click();
  await superdoc.waitForStable();

  // Should show "Edit link" title
  await expect(superdoc.page.locator('.link-title')).toHaveText('Edit link');
  await superdoc.snapshot('edit link dropdown open');

  // Clear and type new URL
  const editUrlInput = superdoc.page.locator(`${LINK_DROPDOWN} input[name="link"]`);
  await editUrlInput.fill('https://updated.com');
  await superdoc.page.locator('[data-item="btn-link-apply"]').click();
  await superdoc.page.locator(LINK_DROPDOWN).waitFor({ state: 'hidden', timeout: 5000 });
  await superdoc.waitForStable();
  await superdoc.snapshot('link updated');

  // Assert updated href
  await superdoc.assertTextMarkAttrs('website', 'link', { href: 'https://updated.com' });
});

test('remove link', async ({ superdoc }) => {
  await superdoc.type('Visit our website for details');
  await superdoc.waitForStable();

  // Select "website" and add a link
  const pos = await superdoc.findTextPos('website');
  await superdoc.setTextSelection(pos, pos + 'website'.length);
  await superdoc.waitForStable();

  await applyLink(superdoc, 'https://example.com');

  // Verify link exists
  const linkPos = await superdoc.findTextPos('website');
  await superdoc.assertTextHasMarks('website', ['link']);
  await superdoc.snapshot('link exists');

  // Re-select and open link dropdown, click Remove
  await superdoc.setTextSelection(linkPos, linkPos + 'website'.length);
  await superdoc.waitForStable();

  const linkButton = superdoc.page.locator('[data-item="btn-link"]');
  await linkButton.click();
  await superdoc.waitForStable();

  // Wait for the "Edit link" dropdown to fully render before clicking Remove
  await expect(superdoc.page.locator('.link-title')).toHaveText('Edit link');
  await superdoc.snapshot('link dropdown before remove');

  await superdoc.page.locator('[data-item="btn-link-remove"]').click();
  await superdoc.page.locator(LINK_DROPDOWN).waitFor({ state: 'hidden', timeout: 5000 });
  await superdoc.waitForStable();
  await superdoc.snapshot('after link removed');

  // Assert link mark is gone — re-find position after removal
  await superdoc.assertTextLacksMarks('website', ['link']);

  // Assert the text itself is still there
  await superdoc.assertTextContains('website');
});

test('link is not editable in viewing mode', async ({ superdoc }) => {
  await superdoc.type('Visit our website for details');
  await superdoc.waitForStable();

  // Add a link first
  const pos = await superdoc.findTextPos('website');
  await superdoc.setTextSelection(pos, pos + 'website'.length);
  await superdoc.waitForStable();

  await applyLink(superdoc, 'https://example.com');
  await superdoc.snapshot('link created in editing mode');

  // Switch to viewing mode
  await superdoc.setDocumentMode('viewing');
  await superdoc.waitForStable();
  await superdoc.assertDocumentMode('viewing');
  await superdoc.snapshot('switched to viewing mode');

  // Link toolbar button should be disabled in viewing mode
  const linkButton = superdoc.page.locator('[data-item="btn-link"]');
  await expect(linkButton).toHaveClass(/disabled/);

  // Stub window.open so we can assert navigation without depending on popup handling
  await superdoc.page.evaluate(() => {
    (window as any).__sdOpenedLinks = [];
    const originalOpen = window.open.bind(window);
    (window as any).__sdOriginalWindowOpen = originalOpen;
    window.open = (...args) => {
      (window as any).__sdOpenedLinks.push(args);
      return null;
    };
  });

  // Clicking the rendered link should navigate, not open the read-only link popup
  const linkElement = superdoc.page.locator('.superdoc-link:has-text("website")');
  await linkElement.click();
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.link-title').filter({ hasText: 'Link details' })).toBeHidden();
  await expect(superdoc.page.locator('[data-item="btn-link-remove"]')).toHaveCount(0);
  await expect(superdoc.page.locator('[data-item="btn-link-apply"]')).toHaveCount(0);
  await expect
    .poll(() => superdoc.page.evaluate(() => (window as any).__sdOpenedLinks))
    .toEqual([['https://example.com', '_blank', 'noopener,noreferrer']]);
  await superdoc.snapshot('link navigates in viewing mode');

  // Restore window.open for cleanliness in the browser context
  await superdoc.page.evaluate(() => {
    const originalOpen = (window as any).__sdOriginalWindowOpen;
    if (originalOpen) {
      window.open = originalOpen;
    }
    delete (window as any).__sdOriginalWindowOpen;
    delete (window as any).__sdOpenedLinks;
  });
});
