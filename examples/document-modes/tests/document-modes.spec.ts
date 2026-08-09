import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const blockedEdit = 'VIEWMODEBLOCKEDMARKER';
const suggestedEdit = 'SUGGESTEDMODEMARKER';

test('blocks viewing edits and records suggesting edits', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');
  const mode = page.getByLabel('Document mode');
  await expect(mode).toBeEnabled({ timeout: 120_000 });

  const textRun = page.locator('.superdoc-text-run').nth(1);
  await mode.selectOption('viewing');
  await expect(page.locator('#status')).toHaveText('Viewing mode.');
  await textRun.click();
  await page.keyboard.type(blockedEdit);
  await expect(page.locator('#editor')).not.toContainText(blockedEdit);

  await mode.selectOption('suggesting');
  await expect(page.locator('#status')).toHaveText('Suggesting mode.');
  await textRun.click();
  await page.keyboard.type(suggestedEdit);
  await expect(page.locator('#editor')).toContainText(suggestedEdit);

  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export DOCX' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('The browser did not save the exported DOCX.');

  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  expect(documentXml).toContain('<w:ins');
  expect(documentXml).toContain(suggestedEdit);
  expect(documentXml).not.toContain(blockedEdit);
  expect(errors).toEqual([]);
});
