import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const value = 'CONTENTCONTROLVALUE';

test('updates a Word text content control', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');
  const field = page.getByLabel('Company name');
  await expect(field).toBeEnabled({ timeout: 120_000 });
  await expect(field).toHaveValue('Acme Corp');
  await field.fill(value);
  await page.getByRole('button', { name: 'Update field' }).click();
  await expect(page.locator('#status')).toHaveText('Field updated.', { timeout: 120_000 });
  await expect(page.locator('#editor')).toContainText(value);

  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export DOCX' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('The browser did not save the exported DOCX.');

  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  expect(documentXml).toContain('<w:sdt>');
  expect(documentXml).toContain('<w:tag w:val="company-name"');
  expect(documentXml).toContain(value);
  expect(errors).toEqual([]);
});
