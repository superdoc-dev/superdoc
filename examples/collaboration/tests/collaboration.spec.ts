import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const edit = 'COLLABORATIONEDITMARKER';

test('synchronizes a DOCX edit between two browser pages', async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const creator = await context.newPage();
  const joiner = await context.newPage();
  const errors: string[] = [];

  for (const page of [creator, joiner]) {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
  }

  await creator.goto('/?mode=create&user=Creator');
  await expect(creator.locator('#status')).toHaveText('Connected.', { timeout: 180_000 });
  await joiner.goto('/?user=Joiner');
  await expect(joiner.locator('#status')).toHaveText('Connected.', { timeout: 180_000 });

  const textRun = creator.locator('.superdoc-text-run').first();
  await textRun.click();
  await creator.keyboard.type(edit);
  await expect(joiner.locator('#editor')).toContainText(edit, { timeout: 120_000 });

  const download = joiner.waitForEvent('download', { timeout: 120_000 });
  await joiner.getByRole('button', { name: 'Export DOCX' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('The browser did not save the exported DOCX.');

  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  expect(documentXml).toContain(edit);
  expect(errors).toEqual([]);
  await context.close();
});
