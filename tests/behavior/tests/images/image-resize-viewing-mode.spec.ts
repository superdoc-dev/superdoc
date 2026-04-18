import { test, expect } from '../../fixtures/superdoc.js';
import path from 'node:path';

/**
 * Behavior test: image resize handles and selection outlines must be
 * suppressed in viewing mode.
 *
 * Regression test for SD-2323 / IT-760.
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/sd-2323-image-resize-test.docx');

test.describe('Image resize in viewing mode (SD-2323)', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(FIXTURE);
  });

  test('@behavior SD-2323: image resize overlay is hidden when hovering in viewing mode', async ({ superdoc }) => {
    // Verify image loaded
    const imageCount = await superdoc.page.evaluate(() => {
      const doc = (window as any).editor?.state?.doc;
      let count = 0;
      doc?.descendants((node: any) => {
        if (node.type?.name === 'image') count++;
      });
      return count;
    });
    expect(imageCount).toBeGreaterThanOrEqual(1);

    // Switch to viewing mode
    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();
    await superdoc.assertDocumentMode('viewing');

    // Hover over the image
    const img = superdoc.page.locator('.superdoc-inline-image').first();
    await expect(img).toBeAttached({ timeout: 5000 });
    await img.hover();
    await superdoc.waitForStable();

    // The resize overlay should NOT appear
    const overlay = superdoc.page.locator('.superdoc-image-resize-overlay');
    await expect(overlay).toHaveCount(0);
  });

  test('@behavior SD-2323: image selection outline is not applied in viewing mode', async ({ superdoc }) => {
    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();
    await superdoc.assertDocumentMode('viewing');

    // Click on the image
    const img = superdoc.page.locator('.superdoc-inline-image').first();
    await expect(img).toBeAttached({ timeout: 5000 });
    await img.click();
    await superdoc.waitForStable();

    // The image should NOT have the selection class
    await expect(img).not.toHaveClass(/superdoc-image-selected/);
  });

  test('@behavior SD-2323: image resize overlay works normally in editing mode', async ({ superdoc }) => {
    // Stay in editing mode (default)
    const img = superdoc.page.locator('.superdoc-inline-image').first();
    await expect(img).toBeAttached({ timeout: 5000 });

    // Hover over the image to trigger resize overlay
    await img.hover();
    await superdoc.waitForStable();

    // The resize overlay should appear
    const overlay = superdoc.page.locator('.superdoc-image-resize-overlay');
    await expect(overlay).toBeAttached({ timeout: 5000 });
  });
});
