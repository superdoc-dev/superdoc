/**
 * Pins the toolbar mount forms `Config.toolbar` documents.
 *
 * The resolver accepts an id selector, a class selector, a bare element id, or
 * an element, and falls back to `getElementById` for anything else. That makes
 * an ordinary-looking CSS selector such as `[data-toolbar]` resolve to nothing
 * and render no toolbar, with no error. The type documents that boundary, so
 * these assertions keep the documentation and the resolver from drifting apart.
 */
import { expect, test, type Page } from '@playwright/test';

const PAGE = `<!DOCTYPE html><html><head>
<link href="/dist-cdn/superdoc.min.css" rel="stylesheet"/>
<script>window.SUPERDOC_ENGINE_CDN_BASE_URL='/node_modules/@superdoc/docx-engine';</script>
<script src="/dist-cdn/superdoc.min.js"></script>
</head><body style="margin:0">
<div data-toolbar id="tb-id" class="tb-class"></div>
<div id="editor"></div>
</body></html>`;

/**
 * Mounts with the given `toolbar` value and reports whether a toolbar
 * rendered. `mounted` records whether `onReady` actually fired, so a mount
 * that times out cannot be mistaken for a toolbar that legitimately did not
 * render.
 */
async function mountToolbar(
  page: Page,
  toolbar: string | { element: true },
): Promise<{ mounted: boolean; rendered: boolean }> {
  return page.evaluate(async (value) => {
    const win = window as never as { SuperDoc: new (config: unknown) => { destroy?: () => void } };
    const mount = document.querySelector('[data-toolbar]') as HTMLElement;
    mount.innerHTML = '';

    const resolved = typeof value === 'string' ? value : mount;
    let mounted = false;
    const superdoc = await new Promise<{ destroy?: () => void }>((resolve) => {
      const instance = new win.SuperDoc({
        selector: '#editor',
        toolbar: resolved,
        onReady: () => {
          mounted = true;
          resolve(instance);
        },
      });
      setTimeout(() => resolve(instance), 30_000);
    });
    await new Promise((settle) => setTimeout(settle, 600));

    const rendered = !!document.querySelector('[data-toolbar] .superdoc-toolbar');
    superdoc.destroy?.();
    return { mounted, rendered };
  }, toolbar);
}

/** Asserts the editor actually mounted, then reports toolbar presence. */
async function rendersToolbar(page: Page, toolbar: string | { element: true }): Promise<boolean> {
  const { mounted, rendered } = await mountToolbar(page, toolbar);
  expect(mounted, 'the editor should reach onReady before toolbar presence is meaningful').toBe(true);
  return rendered;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/toolbar-mount.html', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }),
  );
  await page.goto('/toolbar-mount.html');
  await page.waitForFunction(() => (window as never as { SuperDoc?: unknown }).SuperDoc !== undefined, {
    timeout: 30_000,
  });
});

test('renders into an id selector, a class selector, a bare id, and an element', async ({ page }) => {
  test.setTimeout(240_000);
  expect(await rendersToolbar(page, '#tb-id')).toBe(true);
  expect(await rendersToolbar(page, '.tb-class')).toBe(true);
  expect(await rendersToolbar(page, 'tb-id')).toBe(true);
  expect(await rendersToolbar(page, { element: true })).toBe(true);
});

test('renders nothing for CSS selector syntax the resolver does not support', async ({ page }) => {
  test.setTimeout(120_000);
  // Documented limitation, not a bug being enshrined: if the resolver ever
  // learns full `querySelector` support, this expectation should flip and
  // `Config.toolbar` should stop warning about it.
  expect(await rendersToolbar(page, '[data-toolbar]')).toBe(false);
});
