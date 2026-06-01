/**
 * Verifies collapsed-cursor insertion of an inline content control via
 * `editor.doc.create.contentControl({ at, content, tag, alias })`.
 *
 * This is the load-bearing primitive for a "smart tags" authoring UI: clicking
 * a tag in a side panel must insert a new inline SDT at the caret. The
 * Document API frames `at` as a text range to *wrap*; this confirms a COLLAPSED
 * range (a caret, nothing selected) + `content` creates a fresh SDT carrying
 * that content. If this fails, it's a real API gap, not a demo problem.
 */

import { test, expect } from '../../fixtures/superdoc.js';

test('@behavior create.contentControl inserts an inline SDT at a collapsed caret', async ({ superdoc }) => {
  await superdoc.page.waitForFunction(() => (window as any).editor?.doc?.create?.contentControl, null, {
    timeout: 30_000,
  });

  await superdoc.type('Alpha Bravo');
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => {
    const ed = (window as any).editor;
    const ui = (window as any).__bootSuperDocUI?.();
    // Capture the caret (collapsed) and turn it into a SelectionTarget. The UI
    // slice exposes the selection as a TextTarget (segments); create.contentControl
    // wants a SelectionTarget (start/end points), so bridge the two.
    const cap = ui?.selection?.capture?.();
    const seg = cap?.target?.segments?.[0];
    if (!seg) return { ok: false, why: 'no-capture' };
    const point = { kind: 'text', blockId: seg.blockId, offset: seg.range.start };
    const tag = JSON.stringify({ kind: 'smartField', key: 'price' });
    const res = ed.doc.create.contentControl({
      kind: 'inline',
      controlType: 'text',
      at: { kind: 'selection', start: point, end: point },
      content: 'EXERCISE_PRICE',
      tag,
      alias: 'Exercise price',
    });
    // Read back: is there now an inline structuredContent SDT carrying that tag + text?
    let found: { tag: string; text: string } | null = null;
    ed.state.doc.descendants((node: any) => {
      if (found) return false;
      if (node.type.name === 'structuredContent' && node.attrs?.tag === tag) {
        found = { tag: node.attrs.tag, text: node.textContent };
      }
      return true;
    });
    return { ok: true, createSuccess: res?.success === true, failure: res?.failure?.code ?? null, found };
  });

  expect(result.ok, result.why ?? '').toBe(true);
  expect(result.createSuccess, `create.contentControl failed: ${result.failure}`).toBe(true);
  expect(result.found, 'inserted inline SDT not found in the document').not.toBeNull();
  expect(result.found!.text).toBe('EXERCISE_PRICE');
});
