import { test, expect } from '@playwright/test';

const example = process.env.EXAMPLE || 'react';

test('example loads without errors', async ({ page }) => {
  const errors: string[] = [];
  let rejectOnFirstError: (error: Error) => void = () => {};
  const firstPageError = new Promise<never>((_, reject) => {
    rejectOnFirstError = reject;
  });

  const recordError = (message: string) => {
    errors.push(message);
    rejectOnFirstError(new Error(`Example emitted a browser error before it became visible:\n${message}`));
  };

  page.on('pageerror', (err) => recordError(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore network errors from blocked telemetry and missing collab servers
      if (text.includes('net::ERR_FAILED') || text.includes('net::ERR_CONNECTION_REFUSED')) return;
      recordError(text);
    }
  });

  // Block telemetry requests during tests
  await page.route('**/ingest.superdoc.dev/**', (route) => route.abort());

  await Promise.race([
    (async () => {
      await page.goto('/');
      // SPA frameworks (e.g. Nuxt with ssr:false) hide the body during hydration;
      // give them enough time to mount before checking visibility.
      await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });
    })(),
    firstPageError,
  ]);

  // Give the app a moment to initialize (SuperDoc is async)
  await page.waitForTimeout(2000);

  expect(errors).toEqual([]);
});

test.describe('cdn example', () => {
  test.skip(example !== 'cdn', 'cdn-specific assertions');

  test('window.SuperDoc is a constructor and the bundled sample renders', async ({ page }) => {
    await page.route('**/ingest.superdoc.dev/**', (route) => route.abort());
    await page.goto('/');

    const globalShape = await page.evaluate(() => ({
      isFunction: typeof (window as any).SuperDoc === 'function',
      hasCreateTheme: typeof (window as any).SuperDoc?.createTheme === 'function',
      hasDOCX: typeof (window as any).SuperDoc?.DOCX !== 'undefined',
    }));
    expect(globalShape).toEqual({ isFunction: true, hasCreateTheme: true, hasDOCX: true });

    await page.waitForFunction(() => (window as any).__SUPERDOC_READY__ === true, null, {
      timeout: 15_000,
    });

    const rendered = await page.evaluate(() => {
      const el = document.querySelector('#editor');
      return {
        hasChildren: (el?.children.length || 0) > 0,
        innerHTMLLength: el?.innerHTML.length || 0,
        visibleText: (el as HTMLElement)?.innerText || '',
      };
    });
    expect(rendered.hasChildren).toBe(true);
    expect(rendered.innerHTMLLength).toBeGreaterThan(1000);
    // The bundled sample DOCX contains "Lorem ipsum" — prove the doc parsed,
    // not just that editor chrome rendered.
    expect(rendered.visibleText).toContain('Lorem ipsum');
  });
});
