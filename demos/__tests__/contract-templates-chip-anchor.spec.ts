import { test, expect } from '@playwright/test';

/**
 * SD-3311 regression: the field chip must stay anchored to its active control
 * after a geometry change that fires NO scroll event (zoom). The chip is a
 * fixed-position overlay positioned from `ui.contentControls.getRect()`. Today
 * field-chip only re-anchors on active-change / scroll / resize, so a zoom
 * leaves it stranded (verified: ~230px drift). This is RED until
 * `ui.viewport.observe()` lands and field-chip re-queries on it.
 *
 * Runs only for the contract-templates demo (the shared suite runs once per DEMO).
 */

test.use({ viewport: { width: 1280, height: 800 } });

test('field chip stays anchored to its control after a zoom (no-scroll geometry change)', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => {
      const ui = (window as any).__demo?.state?.ui;
      return !!ui && ui.contentControls.getSnapshot().items.length > 0;
    },
    null,
    { timeout: 30_000 },
  );

  // Activate the first inline smart field so the chip appears and anchors.
  await page.waitForSelector('.superdoc-structured-content-inline[data-sdt-id]');
  await page.locator('.superdoc-structured-content-inline[data-sdt-id]').first().click();
  await page.locator('.sd-field-chip').waitFor({ state: 'visible', timeout: 10_000 });

  // Horizontal gap between the chip's left edge and its active control's left
  // edge. positionChip sets chip.left = control.left, so this is ~0 when anchored.
  const probe = () =>
    page.evaluate(() => {
      const ui = (window as any).__demo.state.ui;
      const activeId = ui.contentControls.getSnapshot().activeId as string | null;
      const chip = document.querySelector<HTMLElement>('.sd-field-chip');
      const ctrl = activeId ? document.querySelector<HTMLElement>(`[data-sdt-id="${activeId}"]`) : null;
      if (!chip || !ctrl) return null;
      const c = chip.getBoundingClientRect();
      const k = ctrl.getBoundingClientRect();
      return { dxLeft: Math.abs(c.left - k.left), ctrlLeft: Math.round(k.left) };
    });

  const before = await probe();
  expect(before, 'chip + active control both resolve').not.toBeNull();
  expect(before!.dxLeft, 'chip starts anchored to the control').toBeLessThanOrEqual(2);

  // Zoom: a geometry change with no scroll event.
  await page.evaluate(() => (window as any).__demo.superdoc.setZoom(150));

  // Poll for the settled state: the control has moved (zoom applied) AND the
  // chip has re-anchored to it. Polling absorbs the rAF/repaint delay between
  // the geometry change and the viewport.observe -> positionChip re-query.
  // Without the SD-3311 fix this stays "drift:~230" and times out.
  await expect
    .poll(
      async () => {
        const p = await probe();
        if (!p) return 'no-probe';
        if (p.ctrlLeft === before!.ctrlLeft) return 'control-not-moved';
        return p.dxLeft <= 2 ? 'anchored' : `drift:${Math.round(p.dxLeft)}`;
      },
      { timeout: 6_000 },
    )
    .toBe('anchored');
});
