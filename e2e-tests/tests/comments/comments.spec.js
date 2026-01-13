import { test, expect } from '@playwright/test';
import { goToPageAndWaitForEditor, sleep } from '../helpers.js';
import { fileURLToPath } from 'url';
import path from 'path';

test.describe('comments & tracked changes', () => {
  const __filename = fileURLToPath(import.meta.url);
  const testDataFolder = __filename.split('/tests/')[0] + '/test-data';

  const comments = [
    {
      author: 'Gabriel Chittolina (imported)',
      text: 'Hey there',
      date: new Date(1763038216000),
    },
    {
      author: 'Gabriel Chittolina (imported)',
      text: 'Hi again',
      date: new Date(1763038222000),
    },
  ];

  // This is now 4 tracked changes with 2 replacements , one addition and one deletion
  const documentTrackedChanges = [
    {
      author: 'SuperDoc 8083 (imported)',
      text: ['Added: ', 'such as this one'],
      date: new Date(1763743800000),
    },
    {
      author: 'SuperDoc 8083 (imported)',
      text: ['Deleted: ', 'removed'],
      date: new Date(1763743800000),
    },
    {
      author: 'SuperDoc 8083 (imported)',
      text: ['Added: ', 'switched', 'Deleted: ', 'replaced'],
      date: new Date(1763743800000),
    },
    {
      author: 'SuperDoc 8083 (imported)',
      text: ['Added: ', 'add', 'Deleted: ', 'rem'],
      date: new Date(1763743800000),
    },
  ];

  // Format date as "9:50AM Nov 13" for comments
  const formatDate = (date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();

    return `${hours}:${minutes}${ampm} ${month} ${day}`;
  };

  test('should import comments', async ({ page }) => {
    await goToPageAndWaitForEditor(page, { includeComments: true });
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(testDataFolder, 'comments-documents/basic-comments.docx'));

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    // Wait for comments to be loaded
    await sleep(1000);

    // Find all comments by "Gabriel Chittolina (imported)"
    const commentsElements = page
      .getByRole('dialog')
      .filter({ hasText: 'Gabriel Chittolina (imported)', visible: true });
    const commentCount = await commentsElements.count();
    expect(commentCount).toBe(2);
  });

  test('should have correct comment text', async ({ page }) => {
    await goToPageAndWaitForEditor(page, { includeComments: true });
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(testDataFolder, 'comments-documents/basic-comments.docx'));

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    await sleep(1000);

    const commentsElements = page
      .getByRole('dialog')
      .filter({ hasText: 'Gabriel Chittolina (imported)', visible: true });
    const commentCount = await commentsElements.count();

    for (let i = 0; i < commentCount; i++) {
      const comment = await commentsElements.nth(i);
      await expect(comment).toBeVisible();
      await expect(comment).toContainText(comments[i].author);
      await expect(comment).toContainText(comments[i].text);
      await expect(comment).toContainText(formatDate(comments[i].date));
    }
  });

  test('should import all tracked changes', async ({ page }) => {
    await goToPageAndWaitForEditor(page, { includeComments: true });
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(testDataFolder, 'comments-documents/tracked-changes.docx'));

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    await sleep(1000);

    const trackedChanges = page.getByRole('dialog').filter({ hasText: 'SuperDoc 8083 (imported)', visible: true });
    const trackedChangeCount = await trackedChanges.count();
    expect(trackedChangeCount).toBe(4);
  });

  test('should have correct tracked change text', async ({ page }) => {
    await goToPageAndWaitForEditor(page, { includeComments: true });
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(testDataFolder, 'comments-documents/tracked-changes.docx'));

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    await sleep(1000);

    const trackedChanges = page.getByRole('dialog').filter({ hasText: 'SuperDoc 8083 (imported)', visible: true });
    const trackedChangeCount = await trackedChanges.count();

    for (let i = 0; i < trackedChangeCount; i++) {
      const trackedChange = await trackedChanges.nth(i);
      await expect(trackedChange).toBeVisible();
      await expect(trackedChange).toContainText(documentTrackedChanges[i].author);
      await expect(trackedChange).toContainText(formatDate(documentTrackedChanges[i].date));
      await expect(trackedChange).toContainText(documentTrackedChanges[i].text.join(''));
    }
  });

  test('should hide comments in viewing mode by default', async ({ page }) => {
    await goToPageAndWaitForEditor(page, {
      includeComments: true,
      layout: 1,
      queryParams: { documentMode: 'viewing' },
    });
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(testDataFolder, 'comments-documents/basic-comments.docx'));

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    await sleep(1000);

    const commentsElements = page
      .getByRole('dialog')
      .filter({ hasText: 'Gabriel Chittolina (imported)', visible: true });
    const commentCount = await commentsElements.count();
    expect(commentCount).toBe(0);
  });

  test('should show comments in viewing mode when visible is true', async ({ page }) => {
    await goToPageAndWaitForEditor(page, {
      includeComments: true,
      layout: 1,
      queryParams: { documentMode: 'viewing', commentsVisible: true },
    });
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(testDataFolder, 'comments-documents/basic-comments.docx'));

    await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
      polling: 100,
      timeout: 10_000,
    });

    await sleep(1000);

    const commentsElements = page
      .getByRole('dialog')
      .filter({ hasText: 'Gabriel Chittolina (imported)', visible: true });
    const commentCount = await commentsElements.count();
    expect(commentCount).toBe(2);
  });
});
