import { test, expect } from '@playwright/test';

test('UMD bundle loads and initializes SuperDoc', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/tests/umd-smoke/index.html');

  const hasLibrary = await page.evaluate(() => typeof (window as any).SuperDocLibrary !== 'undefined');
  expect(hasLibrary).toBe(true);

  const ready = await page.evaluate(() => (window as any).__SUPERDOC_READY__ === true);
  expect(ready).toBe(true);

  expect(errors).toEqual([]);
});
