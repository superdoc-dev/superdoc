/**
 * SD-3310 — `ui.contentControls.scrollIntoView({ id, block?, behavior? })`
 * scrolls a content control (SDT field/clause) into view by its id.
 *
 * Unit tests (`src/ui/content-controls.test.ts`) cover the handle contract
 * (id validation, presentation delegation, `{ success }` mapping) in jsdom.
 * This Playwright spec runs the real layout-engine + painted DOM and proves
 * the end-to-end, model-aware behavior the unit tests can't:
 *
 *   - An inline AND a block control are scrolled fully into the viewport.
 *   - It works when the target starts OFF-SCREEN — the position is resolved
 *     from the document model, not the painted DOM, so an unmounted /
 *     scrolled-away control is still reachable (the page mounts, then
 *     scrolls). A short viewport + filler content makes the off-screen
 *     start deterministic.
 *   - An unknown id resolves to `{ success: false }`.
 *
 * Scroll-only: this asserts the control lands in view, not that the caret
 * moved into it (focus/activate is a separate concern).
 */

import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';
import { insertInlineSdt, insertBlockSdt, getSdtIdFromState } from '../../helpers/sdt.js';

// A short viewport so a modest amount of filler content reliably pushes a
// control above/below the fold.
test.use({ viewport: { width: 1000, height: 360 } });

type VisibleProbe = { painted: boolean; inViewport: boolean; top: number | null; innerHeight: number };

/** Read whether the painted control for `id` is currently within the viewport. */
async function probeVisible(page: import('@playwright/test').Page, id: string): Promise<VisibleProbe> {
  return page.evaluate((sdtId) => {
    const el = document.querySelector<HTMLElement>(`[data-sdt-id="${sdtId}"]`);
    if (!el) return { painted: false, inViewport: false, top: null, innerHeight: window.innerHeight };
    const r = el.getBoundingClientRect();
    return {
      painted: true,
      inViewport: r.top >= 0 && r.top <= window.innerHeight,
      top: r.top,
      innerHeight: window.innerHeight,
    };
  }, id);
}

/** Scroll the presentation scroll container to top or bottom to force an off-screen target. */
async function scrollContainerTo(page: import('@playwright/test').Page, edge: 'top' | 'bottom'): Promise<void> {
  await page.evaluate((to) => {
    const host = document.querySelector<HTMLElement>('.presentation-editor__pages');
    // Walk up to the first scrollable ancestor; fall back to the window.
    let node: HTMLElement | null = host;
    let scroller: HTMLElement | null = null;
    while (node) {
      if (node.scrollHeight > node.clientHeight + 4) {
        scroller = node;
        break;
      }
      node = node.parentElement;
    }
    const target = to === 'top' ? 0 : 1_000_000;
    if (scroller) {
      scroller.scrollTop = target;
    } else {
      window.scrollTo(0, target);
    }
  }, edge);
}

async function scrollControlIntoView(page: import('@playwright/test').Page, id: string): Promise<{ success: boolean }> {
  return page.evaluate(async (sdtId) => {
    const ui = (window as any).__bootSuperDocUI?.();
    if (!ui) return { success: false };
    // Instant scroll so the position is final by the time we probe — a
    // smooth animation would still be running after waitForStable().
    return ui.contentControls.scrollIntoView({ id: sdtId, block: 'center', behavior: 'auto' });
  }, id);
}

test('@behavior SD-3310: scrolls an off-screen inline content control into view', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Inline control near the top, then filler to push it above the fold.
  await insertInlineSdt(superdoc.page, 'Inline Field', 'TARGET');
  await superdoc.waitForStable();
  for (let i = 0; i < 14; i++) {
    await superdoc.newLine();
    await superdoc.type(`filler line ${i}`);
  }
  await superdoc.waitForStable();

  const id = await getSdtIdFromState(superdoc.page, 'Inline Field');

  // Scroll to the bottom so the top control is off-screen.
  await scrollContainerTo(superdoc.page, 'bottom');
  await superdoc.waitForStable();
  const before = await probeVisible(superdoc.page, id);
  expect(before.inViewport).toBe(false);

  const result = await scrollControlIntoView(superdoc.page, id);
  await superdoc.waitForStable();
  expect(result.success).toBe(true);

  const after = await probeVisible(superdoc.page, id);
  expect(after.painted).toBe(true);
  expect(after.inViewport).toBe(true);
});

test('@behavior SD-3310: scrolls an off-screen block content control into view', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Filler first, then a block control at the bottom.
  for (let i = 0; i < 14; i++) {
    await superdoc.type(`filler line ${i}`);
    await superdoc.newLine();
  }
  await insertBlockSdt(superdoc.page, 'Block Clause', 'clause body text');
  await superdoc.waitForStable();

  const id = await getSdtIdFromState(superdoc.page, 'Block Clause');

  // Scroll to the top so the bottom control is off-screen.
  await scrollContainerTo(superdoc.page, 'top');
  await superdoc.waitForStable();
  const before = await probeVisible(superdoc.page, id);
  expect(before.inViewport).toBe(false);

  const result = await scrollControlIntoView(superdoc.page, id);
  await superdoc.waitForStable();
  expect(result.success).toBe(true);

  const after = await probeVisible(superdoc.page, id);
  expect(after.painted).toBe(true);
  expect(after.inViewport).toBe(true);
});

test('@behavior SD-3310: resolves a control whose PM id attr is numeric (id passed as its string form)', async ({ superdoc }) => {
  // Consumers always receive a string id (from the list / painted
  // `data-sdt-id`), but the PM node attr can be numeric. Build a node with a
  // genuinely numeric id and confirm scrollIntoView still resolves it by the
  // string form — guards the `String(node.attrs.id)` normalization.
  await assertDocumentApiReady(superdoc.page);
  for (let i = 0; i < 14; i++) {
    await superdoc.type(`filler line ${i}`);
    await superdoc.newLine();
  }
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    const ed = (window as any).editor;
    const { schema, doc, tr } = ed.state;
    const node = schema.nodes.structuredContent.create({ id: 909042, controlType: 'text' }, schema.text('numeric-id target'));
    // Insert inside the last paragraph (a valid inline insertion point).
    ed.view.dispatch(tr.insert(doc.content.size - 1, node));
  });
  await superdoc.waitForStable();

  await scrollContainerTo(superdoc.page, 'top');
  await superdoc.waitForStable();

  const result = await scrollControlIntoView(superdoc.page, '909042');
  await superdoc.waitForStable();
  expect(result.success).toBe(true);

  const after = await probeVisible(superdoc.page, '909042');
  expect(after.painted).toBe(true);
  expect(after.inViewport).toBe(true);
});

test('@behavior SD-3310: scrollIntoView returns { success: false } for an unknown id', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);
  await superdoc.type('any document');
  await superdoc.waitForStable();

  const result = await scrollControlIntoView(superdoc.page, 'no-such-control-id');
  expect(result.success).toBe(false);
});
