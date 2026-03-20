import { test, expect } from '@playwright/test';

test('demo loads without errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Disable telemetry during tests by stubbing the ingest endpoint.
  // Using fulfill (instead of abort) avoids browser console errors.
  await page.route('**/ingest.superdoc.dev/**', (route) =>
    route.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/');
  // SPA frameworks (e.g. Next.js) may hide the body during hydration;
  // give them enough time to mount before checking visibility.
  await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });

  // Give the app a moment to initialize (SuperDoc is async)
  await page.waitForTimeout(2000);

  expect(errors).toEqual([]);
});
