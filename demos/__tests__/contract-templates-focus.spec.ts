import { test, expect } from '@playwright/test';

/**
 * SD-3312 acceptance: clicking a field's "Focus" button in the contract-templates
 * sidebar places the editor caret INSIDE that control (the "scroll there and let
 * me edit" step, vs "Locate" which only scrolls). Dogfoods ui.contentControls.focus.
 *
 * Runs only for the contract-templates demo (the shared suite runs once per DEMO).
 */

// Short viewport so the bottom clause reliably starts below the fold for the
// off-screen focus case (the field case works at any height).
test.use({ viewport: { width: 1100, height: 520 } });

test('clicking a field Focus places the caret inside that control', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );

  // Field value rows (with the Focus buttons) live on the Values tab.
  await page.click('.tab[data-tab="values"]');
  await page.waitForSelector('[data-focus-field]');
  const key = await page.getAttribute('[data-focus-field]', 'data-focus-field');
  expect(key).toBeTruthy();

  // Resolve which structuredContent control (by id) the caret currently sits in.
  const controlKeyAtSelection = () =>
    page.evaluate(() => {
      const ed = (window as any).__demo.superdoc.activeEditor;
      const from = ed?.state?.selection?.from;
      if (typeof from !== 'number') return null;
      let hit: string | null = null;
      ed.state.doc.descendants((node: any, pos: number) => {
        if (
          (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
          from > pos &&
          from < pos + node.nodeSize
        ) {
          try {
            hit = JSON.parse(node.attrs.tag ?? '{}').key ?? null;
          } catch {
            hit = null;
          }
        }
        return true;
      });
      return hit;
    });

  // Caret should not already be in this field's control.
  expect(await controlKeyAtSelection()).not.toBe(key);

  await page.click(`[data-focus-field="${key}"]`);

  // After focus, the caret lands inside a control whose tag carries this key.
  await expect.poll(controlKeyAtSelection, { timeout: 5_000 }).toBe(key);
});
