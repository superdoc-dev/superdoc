import { test, expect } from '@playwright/test';

test('demo loads without errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Block telemetry requests during tests
  await page.route('**/ingest.superdoc.dev/**', (route) => route.abort());

  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();

  // Give the app a moment to initialize (SuperDoc is async)
  await page.waitForTimeout(2000);

  expect(errors).toEqual([]);
});
