/**
 * SD-3310 regression for imported Word-authored content controls.
 *
 * `nda-template.docx` is the contract-templates demo's fixture: 13 real
 * Word SDTs (7 inline smart fields + 6 block clauses). It is copied here
 * (not loaded from demos/) so the behavior suite isn't coupled to demo
 * paths.
 *
 * Confirms `ui.contentControls.scrollIntoView` resolves controls imported
 * from a real .docx (not just programmatically-created ones) and scrolls
 * them into view from an off-screen start.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NDA = path.resolve(__dirname, 'fixtures/nda-template.docx');

test.use({ viewport: { width: 1000, height: 360 } });

type Item = { id: string; kind: string; text?: string };

async function snapshotItems(page: import('@playwright/test').Page): Promise<Item[]> {
  return page.evaluate(() => {
    const ui = (window as any).__bootSuperDocUI?.();
    if (!ui) return [];
    return ui.contentControls.getSnapshot().items.map((it: any) => ({ id: it.id, kind: it.kind, text: it.text }));
  });
}

async function probeVisible(page: import('@playwright/test').Page, id: string) {
  return page.evaluate((sdtId) => {
    const el = document.querySelector<HTMLElement>(`[data-sdt-id="${sdtId}"]`);
    if (!el) return { painted: false, inViewport: false };
    const r = el.getBoundingClientRect();
    return { painted: true, inViewport: r.top >= 0 && r.top <= window.innerHeight };
  }, id);
}

async function scrollTo(page: import('@playwright/test').Page, id: string): Promise<{ success: boolean }> {
  return page.evaluate(async (sdtId) => {
    const ui = (window as any).__bootSuperDocUI?.();
    if (!ui) return { success: false };
    return ui.contentControls.scrollIntoView({ id: sdtId, block: 'center', behavior: 'auto' });
  }, id);
}

async function scrollContainerTo(page: import('@playwright/test').Page, edge: 'top' | 'bottom'): Promise<void> {
  await page.evaluate((to) => {
    let node: HTMLElement | null = document.querySelector<HTMLElement>('.presentation-editor__pages');
    let scroller: HTMLElement | null = null;
    while (node) {
      if (node.scrollHeight > node.clientHeight + 4) {
        scroller = node;
        break;
      }
      node = node.parentElement;
    }
    const target = to === 'top' ? 0 : 1_000_000;
    if (scroller) scroller.scrollTop = target;
    else window.scrollTo(0, target);
  }, edge);
}

test('@behavior SD-3310: scrolls real imported NDA-template controls (first field + last clause) into view', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(NDA);
  await superdoc.waitForStable();

  const items = await snapshotItems(superdoc.page);
  // Sanity: the fixture's controls are visible to the handle.
  expect(items.length).toBeGreaterThanOrEqual(6);

  const first = items[0]; // top-most (an inline smart field)
  const last = items[items.length - 1]; // bottom-most (a block clause)
  expect(first.id).toBeTruthy();
  expect(last.id).toBeTruthy();

  // Bottom clause: scroll to top so it's off-screen, then scroll it in.
  await scrollContainerTo(superdoc.page, 'top');
  await superdoc.waitForStable();
  expect((await probeVisible(superdoc.page, last.id)).inViewport).toBe(false);
  expect((await scrollTo(superdoc.page, last.id)).success).toBe(true);
  await superdoc.waitForStable();
  expect(await probeVisible(superdoc.page, last.id)).toEqual({ painted: true, inViewport: true });

  // Top field: scroll to bottom so it's off-screen, then scroll it in.
  await scrollContainerTo(superdoc.page, 'bottom');
  await superdoc.waitForStable();
  expect((await probeVisible(superdoc.page, first.id)).inViewport).toBe(false);
  expect((await scrollTo(superdoc.page, first.id)).success).toBe(true);
  await superdoc.waitForStable();
  expect(await probeVisible(superdoc.page, first.id)).toEqual({ painted: true, inViewport: true });
});
