import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const edit = 'QUICKSTARTEDITMARKER';

test('opens, edits, and exports the sample document', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');
  await expect(page.locator('#export-docx')).toBeEnabled({ timeout: 120_000 });

  const textRun = page.locator('#editor .superdoc-text-run').first();
  await expect(textRun).toBeVisible({ timeout: 60_000 });
  await textRun.click();
  await page.keyboard.type(edit);
  await expect(page.locator('#editor')).toContainText(edit);

  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.locator('#export-docx').click();
  const path = await (await download).path();
  if (!path) throw new Error('The browser did not save the exported DOCX.');

  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  expect(documentXml).toBeTruthy();
  expect(documentXml?.replace(/<[^>]+>/g, '')).toContain(edit);
  expect(errors).toEqual([]);
});
