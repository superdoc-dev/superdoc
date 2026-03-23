import { test, expect } from '@playwright/test';

test('example loads without errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore network errors from blocked telemetry and missing collab servers
      if (text.includes('net::ERR_FAILED') || text.includes('net::ERR_CONNECTION_REFUSED')) return;
      errors.push(text);
    }
  });

  // Block telemetry requests during tests
  await page.route('**/ingest.superdoc.dev/**', (route) => route.abort());

  await page.goto('/');
  // SPA frameworks (e.g. Nuxt with ssr:false) hide the body during hydration;
  // give them enough time to mount before checking visibility.
  await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });

  // Give the app a moment to initialize (SuperDoc is async)
  await page.waitForTimeout(2000);

  expect(errors).toEqual([]);
});
