import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const edit = 'CUSTOMUIBOLDMARKER';

test('formats the DOCX with an application-owned control', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Export DOCX' })).toBeEnabled({ timeout: 120_000 });
  await expect(page.locator('.superdoc-toolbar')).toHaveCount(0);

  const textRun = page.locator('.superdoc-text-run').nth(1);
  await expect(textRun).toBeVisible();
  await textRun.click();

  const bold = page.getByRole('button', { name: 'Bold' });
  await expect(bold).toBeEnabled();
  await bold.click();
  await expect(page.locator('#status')).toHaveText('Bold applied.');
  await page.keyboard.type(edit);
  await expect(page.locator('#editor')).toContainText(edit);

  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export DOCX' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('The browser did not save the exported DOCX.');

  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  expect(documentXml).toBeTruthy();
  const editedRun = documentXml?.match(new RegExp(`<w:r>[\\s\\S]*?${edit}[\\s\\S]*?</w:r>`))?.[0];
  expect(editedRun).toContain('<w:b');
  expect(errors).toEqual([]);
});
