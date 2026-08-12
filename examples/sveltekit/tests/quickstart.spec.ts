import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const edit = 'SVELTEKITQUICKSTARTEDITMARKER';

test('renders on the server, gates readiness, edits, and exports the sample document', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  let releaseDocument = () => {};
  const documentHeld = new Promise<void>((resolve) => {
    releaseDocument = resolve;
  });
  await page.route('**/sample.docx', async (route) => {
    await documentHeld;
    await route.continue();
  });

  const response = await request.get('/');
  expect(await response.text()).toContain('Export DOCX');

  await page.goto('/');
  const exportButton = page.getByRole('button', { name: 'Export DOCX' });
  await expect(exportButton).toBeDisabled();
  releaseDocument();
  await expect(exportButton).toBeEnabled({ timeout: 120_000 });

  const textRun = page.locator('.superdoc-text-run').first();
  await expect(textRun).toBeVisible({ timeout: 60_000 });
  await textRun.click();
  await page.keyboard.type(edit);
  await expect(page.locator('.superdoc')).toContainText(edit);

  const download = page.waitForEvent('download', { timeout: 120_000 });
  await exportButton.click();
  const path = await (await download).path();
  if (!path) throw new Error('The browser did not save the exported DOCX.');

  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  expect(documentXml).toBeTruthy();
  expect(documentXml?.replace(/<[^>]+>/g, '')).toContain(edit);
  expect(errors).toEqual([]);
});
