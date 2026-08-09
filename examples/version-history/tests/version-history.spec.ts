import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const edit = 'VERSIONHISTORYEDITMARKER';

test('saves and restores a DOCX snapshot', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');
  const save = page.getByRole('button', { name: 'Save version' });
  await expect(save).toBeEnabled({ timeout: 120_000 });
  await save.click();
  await expect(page.getByRole('button', { name: 'Restore version 1' })).toBeVisible();

  const textRun = page.locator('.superdoc-text-run').first();
  await textRun.click();
  await page.keyboard.type(edit);
  await expect(page.locator('#editor')).toContainText(edit);

  await save.click();
  await expect(page.getByRole('button', { name: 'Restore version 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore version 1' }).click();
  await expect(page.locator('#status')).toHaveText('Version 1 restored.', { timeout: 120_000 });
  await expect(page.locator('#editor')).not.toContainText(edit);

  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export current DOCX' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('The browser did not save the exported DOCX.');

  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  expect(documentXml).toBeTruthy();
  expect(documentXml).not.toContain(edit);
  expect(errors).toEqual([]);
});
