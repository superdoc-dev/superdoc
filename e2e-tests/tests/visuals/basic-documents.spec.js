import { test, expect } from '@playwright/test';
import fs from 'fs';
import config from '../../test-config';
import { filterDocxFiles } from './doc-loader.js';

const testData = filterDocxFiles(fs.readdirSync(config.basicDocumentsFolder), new Set(config.ignoreDocuments || []));

// Run this test with each file on the test-data/basic-documents folder
// and compare the screenshot with the reference image
test.describe('basic documents', () => {
  testData.forEach((fileName) => {
    test(`${fileName}`, async ({ page }) => {
      test.setTimeout(50_000);

      await page.goto('http://localhost:4173/');
      await page.locator('input[type="file"]').setInputFiles(`./test-data/basic-documents/${fileName}`);
      await page.waitForSelector('div.super-editor');
      await expect(page.locator('div.super-editor').first()).toBeVisible();

      await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
        polling: 100,
        timeout: 10_000,
      });

      await page.waitForFunction(() => {
        const toolbar = document.querySelector('#toolbar');
        return toolbar && toolbar.children.length > 0;
      });

      await expect(page).toHaveScreenshot({
        path: `${fileName}.png`,
        fullPage: true,
        timeout: 30_000,
      });
    });
  });
});
