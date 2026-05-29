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

  // Fields tab is the default; the Focus buttons live on field rows.
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

test('focusing an off-screen clause scrolls it in AND lands the caret inside it', async ({ page }) => {
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

  // Clause Focus buttons live in the (initially hidden) clauses panel.
  await page.click('.tab[data-tab="clauses"]');
  await page.waitForSelector('[data-focus-clause]');

  // Bottom-most block clause: its painted id + sectionId (= the button's data attr).
  const target = await page.evaluate(() => {
    const ui = (window as any).__demo.state.ui;
    const blocks = ui.contentControls.getSnapshot().items.filter((i: any) => i.kind === 'block');
    const last = blocks[blocks.length - 1];
    let sectionId: string | null = null;
    try {
      sectionId = JSON.parse(last?.properties?.tag ?? '{}').sectionId ?? null;
    } catch {
      sectionId = null;
    }
    return { id: last?.id ?? null, sectionId };
  });
  expect(target.id).toBeTruthy();
  expect(target.sectionId).toBeTruthy();

  // Scroll to the top so the bottom clause starts off-screen.
  await page.evaluate(() => {
    let node: HTMLElement | null = document.querySelector('.presentation-editor__pages');
    while (node && !(node.scrollHeight > node.clientHeight + 4)) node = node.parentElement;
    if (node) node.scrollTop = 0;
    else window.scrollTo(0, 0);
  });

  const state = () =>
    page.evaluate((id) => {
      // caret's containing control id
      const ed = (window as any).__demo.superdoc.activeEditor;
      const from = ed?.state?.selection?.from;
      let caretIn: string | null = null;
      if (typeof from === 'number') {
        ed.state.doc.descendants((node: any, pos: number) => {
          if (
            (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
            from > pos &&
            from < pos + node.nodeSize
          ) {
            caretIn = String(node.attrs.id);
          }
          return true;
        });
      }
      // is the control's painted element in the viewport?
      const el = document.querySelector<HTMLElement>(`[data-sdt-id="${id}"]`);
      const r = el?.getBoundingClientRect();
      const inViewport = r ? r.top >= 0 && r.top <= window.innerHeight : false;
      return { caretIn, inViewport };
    }, target.id);

  // Before focus: caret is not in the bottom clause and it's off-screen.
  const before = await state();
  expect(before.caretIn).not.toBe(target.id);
  expect(before.inViewport).toBe(false);

  await page.click(`[data-focus-clause="${target.sectionId}"]`);

  // After focus: the control is scrolled into view AND the caret is inside it.
  await expect.poll(state, { timeout: 6_000 }).toEqual({ caretIn: target.id, inViewport: true });
});
