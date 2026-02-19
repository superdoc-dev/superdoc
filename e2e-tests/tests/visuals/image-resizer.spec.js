import { test, expect } from '@playwright/test';

test.describe('image resizer', () => {
  test('resize handles align with image', async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto('http://localhost:4173/?layout=1');
    await page.locator('input[type="file"]').setInputFiles('./test-data/image-documents/image-resizer.docx');
    await page.waitForSelector('div.super-editor');
    await expect(page.locator('div.super-editor').first()).toBeVisible();

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    // Wait for image to load
    await page.waitForTimeout(1_000);

    // Click on the image to select it
    const image = page.locator('div.super-editor img').first();
    await expect(image).toBeVisible({ timeout: 5_000 });
    await image.click();

    // Wait for resize handles
    await page.waitForSelector('.sd-editor-resizable-wrapper', { state: 'attached', timeout: 5_000 });
    await page.waitForTimeout(500);

    // Verify resize container is present
    await expect(page.locator('.sd-editor-resize-container')).toBeAttached({ timeout: 5_000 });

    await expect(page).toHaveScreenshot({
      name: 'image-resizer.png',
      fullPage: true,
    });
  });
});
