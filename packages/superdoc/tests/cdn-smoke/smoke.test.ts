import { test, expect } from '@playwright/test';

test('IIFE bundle (superdoc.global.js) exposes SuperDoc class on window', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/tests/cdn-smoke/index.html');

  const globalShape = await page.evaluate(() => {
    const g = (window as any).SuperDoc;
    return {
      isFunction: typeof g === 'function',
      hasCreateTheme: typeof g?.createTheme === 'function',
      hasDOCX: typeof g?.DOCX !== 'undefined',
    };
  });
  expect(globalShape.isFunction).toBe(true);
  expect(globalShape.hasCreateTheme).toBe(true);
  expect(globalShape.hasDOCX).toBe(true);

  const ready = await page.evaluate(() => (window as any).__SUPERDOC_READY__ === true);
  expect(ready).toBe(true);

  expect(errors).toEqual([]);
});
