import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'on', trackChanges: true } });

test('SD-2250 hyperlink tracked-change bubble describes a hyperlink instead of underline formatting', async ({
  superdoc,
}) => {
  await superdoc.type('Visit website');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const websiteStart = await superdoc.findTextPos('website');
  await superdoc.setTextSelection(websiteStart, websiteStart + 'website'.length);
  await superdoc.waitForStable();

  await superdoc.executeCommand('setLink', { href: 'https://example.com' });
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');
  await superdoc.assertTextHasMarks('website', ['link']);
  await superdoc.assertTextMarkAttrs('website', 'link', { href: 'https://example.com' });

  const hyperlinkDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.change-type', { hasText: 'Added hyperlink' }),
  });
  await expect(hyperlinkDialog).toBeVisible({ timeout: 10_000 });
  await expect(hyperlinkDialog.locator('.tracked-change-text', { hasText: 'https://example.com' })).toBeVisible();

  await expect(
    superdoc.page.locator('.comment-placeholder .comments-dialog .change-type', { hasText: 'Format:' }),
  ).toHaveCount(0);
  await expect(
    superdoc.page.locator('.comment-placeholder .comments-dialog .tracked-change-text', { hasText: 'underline' }),
  ).toHaveCount(0);
});
