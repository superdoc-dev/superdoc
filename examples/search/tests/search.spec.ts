import { expect, test } from '@playwright/test';

test('searches and navigates document matches', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');
  const textRun = page.locator('.superdoc-text-run').first();
  await expect(textRun).toBeVisible({ timeout: 120_000 });
  await textRun.click();
  await page.keyboard.type('SEARCHMATCH SEARCHMATCH');
  await expect(page.locator('#editor')).toContainText('SEARCHMATCH SEARCHMATCH');
  const searchButton = page.locator('[data-item="btn-search"]');
  await expect(searchButton).toBeVisible({ timeout: 120_000 });
  await expect(searchButton).toBeEnabled();
  await searchButton.click();

  const surface = page.locator('.sd-find-replace');
  await expect(surface).toBeVisible();
  const query = surface.getByLabel('Find text');
  await query.fill('SEARCHMATCH');
  const count = surface.locator('.sd-find-replace__count');
  await expect(count).toHaveText(/1 of [2-9]\d*/, { timeout: 120_000 });

  await surface.getByRole('button', { name: 'Next match' }).click();
  await expect(count).toHaveText(/2 of [2-9]\d*/);
  await surface.getByRole('button', { name: 'Previous match' }).click();
  await expect(count).toHaveText(/1 of [2-9]\d*/);
  expect(errors).toEqual([]);
});
