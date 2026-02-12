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

  test('should show inserted and removed text in tracked change replacement bubble', async ({ page }) => {
    await goToPageAndWaitForEditor(page, { includeComments: true });
    await page.locator('input[type="file"]').setInputFiles(`${config.commentsDocumentsFolder}/basic-comments.docx`);

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    const superEditor = page.locator('div.super-editor').first();
    const targetText = 'replaced_token';
    const insertedText = 'inserted_token';

    await superEditor.click();
    await page.keyboard.type(` ${targetText}`);
    for (let i = 0; i < targetText.length; i += 1) {
      await page.keyboard.press('Shift+ArrowLeft');
    }

    const trackChangesToggled = await page.evaluate(() => window.editor.commands.toggleTrackChanges());
    expect(trackChangesToggled).toBe(true);
    await page.keyboard.type(insertedText);
    await sleep(600);

    const replacementBubble = page
      .getByRole('dialog')
      .filter({ hasText: 'Added:' })
      .filter({ hasText: 'inserted_token' })
      .filter({ hasText: 'Deleted:' })
      .filter({ hasText: 'replaced_token' })
      .first();

    await expect(replacementBubble).toBeVisible();
    await expect(replacementBubble).toContainText('Added:');
    await expect(replacementBubble).toContainText('inserted_token');
    await expect(replacementBubble).toContainText('Deleted:');
    await expect(replacementBubble).toContainText('replaced_token');
    await expect(replacementBubble).toHaveScreenshot('tracked-change-replacement-bubble.png');
  });
});
