import { test, expect } from '@playwright/test';
import fs from 'fs';
import { goToPageAndWaitForEditor, sleep } from '../helpers';
import config from '../../test-config';
import { filterDocxFiles } from './doc-loader.js';

// Run this test with each file on the test-data/comments-documents folder
// and compare the screenshot with the reference image
const testData = filterDocxFiles(fs.readdirSync(config.commentsDocumentsFolder), new Set(config.ignoreDocuments || []));

test.describe('documents with comments', () => {
  testData.forEach((fileName) => {
    test(`${fileName}`, async ({ page }) => {
      await goToPageAndWaitForEditor(page, { includeComments: true });
      await page.locator('input[type="file"]').setInputFiles(`${config.commentsDocumentsFolder}/${fileName}`);

      await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
        polling: 100,
        timeout: 10_000,
      });

      await expect(page).toHaveScreenshot({
        path: `${fileName}.png`,
        fullPage: true,
        timeout: 30_000,
      });
    });
  });
});

test.describe('viewing mode comments visibility', () => {
  const fileName = 'basic-comments.docx';

  test('comments hidden by default in viewing mode', async ({ page }) => {
    await goToPageAndWaitForEditor(page, {
      includeComments: true,
      layout: 1,
      queryParams: { documentMode: 'viewing' },
    });
    await page.locator('input[type="file"]').setInputFiles(`${config.commentsDocumentsFolder}/${fileName}`);

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    await sleep(1000);

    await expect(page).toHaveScreenshot({
      path: 'viewing-comments-hidden.png',
      fullPage: true,
      timeout: 30_000,
    });
  });

  test('comments visible when enabled in viewing mode', async ({ page }) => {
    await goToPageAndWaitForEditor(page, {
      includeComments: true,
      layout: 1,
      queryParams: { documentMode: 'viewing', commentsVisible: true },
    });
    await page.locator('input[type="file"]').setInputFiles(`${config.commentsDocumentsFolder}/${fileName}`);

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    await sleep(1000);

    await expect(page).toHaveScreenshot({
      path: 'viewing-comments-visible.png',
      fullPage: true,
      timeout: 30_000,
    });
  });
});
