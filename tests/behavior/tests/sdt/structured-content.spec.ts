import { test, expect } from '../../fixtures/superdoc.js';
import {
  insertBlockSdt,
  insertInlineSdt,
  getCenter,
  hasClass,
  isSelectionOnBlockSdt,
  deselectSdt,
} from '../../helpers/sdt.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const BLOCK_SDT = '.superdoc-structured-content-block';
const BLOCK_LABEL = '.superdoc-structured-content__label';
const INLINE_SDT = '.superdoc-structured-content-inline';
const INLINE_LABEL = '.superdoc-structured-content-inline__label';
const HOVER_CLASS = 'sdt-hover';

// ==========================================================================
// Block SDT Tests
// ==========================================================================

test.describe('block structured content', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.type('Before SDT');
    await superdoc.newLine();
    await superdoc.waitForStable();
    await insertBlockSdt(superdoc.page, 'Test Block', 'Block content here');
    await superdoc.waitForStable();
  });

  test('block SDT container renders with correct class and label', async ({ superdoc }) => {
    await superdoc.assertElementExists(BLOCK_SDT);
    await superdoc.assertElementExists(BLOCK_LABEL);

    const labelText = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      return label?.textContent?.trim() ?? '';
    }, BLOCK_LABEL);
    expect(labelText).toBe('Test Block');

    await superdoc.snapshot('block SDT rendered');
  });

  test('block SDT shows hover state on mouse enter', async ({ superdoc }) => {
    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, BLOCK_SDT);
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();

    expect(await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS)).toBe(true);

    const labelVisible = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      if (!label) return false;
      return getComputedStyle(label).display !== 'none';
    }, BLOCK_LABEL);
    expect(labelVisible).toBe(true);

    await superdoc.snapshot('block SDT hovered');
  });

  test('block SDT removes hover state on mouse leave', async ({ superdoc }) => {
    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, BLOCK_SDT);
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();
    expect(await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS)).toBe(true);

    await superdoc.page.mouse.move(0, 0);
    await superdoc.waitForStable();
    expect(await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS)).toBe(false);

    await superdoc.snapshot('block SDT hover removed');
  });

  test('clicking inside block SDT places cursor within the block', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, BLOCK_SDT);
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await superdoc.snapshot('block SDT cursor placed');
  });

  test('moving cursor outside block SDT leaves the block', async ({ superdoc }) => {
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(false);

    await superdoc.snapshot('cursor outside block SDT');
  });

  test('block SDT cursor persists through hover cycle', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, BLOCK_SDT);
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await superdoc.page.mouse.move(0, 0);
    await superdoc.waitForStable();
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await superdoc.snapshot('block SDT cursor after hover cycle');
  });

  test('block SDT has correct boundary data attributes', async ({ superdoc }) => {
    const attrs = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('No block SDT found');
      return {
        start: (el as HTMLElement).dataset.sdtContainerStart,
        end: (el as HTMLElement).dataset.sdtContainerEnd,
      };
    }, BLOCK_SDT);

    expect(attrs.start).toBe('true');
    expect(attrs.end).toBe('true');

    await superdoc.snapshot('block SDT boundary attributes');
  });
});

// ==========================================================================
// Inline SDT Tests
// ==========================================================================

test.describe('inline structured content', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.type('Hello ');
    await superdoc.waitForStable();
    await insertInlineSdt(superdoc.page, 'Test Inline', 'inline value');
    await superdoc.waitForStable();
  });

  test('inline SDT container renders with correct class and label', async ({ superdoc }) => {
    await superdoc.assertElementExists(INLINE_SDT);
    await superdoc.assertElementExists(INLINE_LABEL);

    const labelText = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      return label?.textContent?.trim() ?? '';
    }, INLINE_LABEL);
    expect(labelText).toBe('Test Inline');

    await superdoc.snapshot('inline SDT rendered');
  });

  test('inline SDT shows hover highlight', async ({ superdoc }) => {
    await deselectSdt(superdoc.page, 'Hello');
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, INLINE_SDT);
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();

    const hasBg = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const bg = getComputedStyle(el).backgroundColor;
      return bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    }, INLINE_SDT);
    expect(hasBg).toBe(true);

    const labelHidden = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      if (!label) return true;
      return getComputedStyle(label).display === 'none';
    }, INLINE_LABEL);
    expect(labelHidden).toBe(true);

    await superdoc.snapshot('inline SDT hovered');
  });

  test('first click inside inline SDT selects all content', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, INLINE_SDT);
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    const selection = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      const { from, to } = state.selection;
      return state.doc.textBetween(from, to);
    });

    expect(selection).toBe('inline value');

    await superdoc.snapshot('inline SDT content selected');
  });

  test('second click inside inline SDT allows cursor placement', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, INLINE_SDT);

    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    const selection = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      return { from: state.selection.from, to: state.selection.to };
    });

    expect(selection.to - selection.from).toBeLessThan('inline value'.length);

    await superdoc.snapshot('inline SDT cursor placed');
  });
});

// ==========================================================================
// Viewing Mode Tests
// ==========================================================================

test.describe('viewing mode hides SDT affordances', () => {
  test('block SDT border and label are hidden in viewing mode', async ({ superdoc }) => {
    await superdoc.type('Some text');
    await superdoc.newLine();
    await superdoc.waitForStable();
    await insertBlockSdt(superdoc.page, 'Hidden Block', 'Content');
    await superdoc.waitForStable();

    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();

    const styles = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { border: cs.borderStyle, padding: cs.padding };
    }, BLOCK_SDT);

    expect(styles).not.toBeNull();
    expect(styles!.border).toBe('none');
    await superdoc.assertElementHidden(BLOCK_LABEL);

    await superdoc.snapshot('block SDT viewing mode');
  });

  test('inline SDT border and label are hidden in viewing mode', async ({ superdoc }) => {
    await superdoc.type('Hello ');
    await superdoc.waitForStable();
    await insertInlineSdt(superdoc.page, 'Hidden Inline', 'value');
    await superdoc.waitForStable();

    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();

    const styles = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { border: cs.borderStyle };
    }, INLINE_SDT);

    expect(styles).not.toBeNull();
    expect(styles!.border).toBe('none');
    await superdoc.assertElementHidden(INLINE_LABEL);

    await superdoc.snapshot('inline SDT viewing mode');
  });
});

// ==========================================================================
// Stacking Context Regression (SD-2015)
// ==========================================================================

test.describe('SD-2015: SDT labels must not paint above the toolbar', () => {
  test('layout container isolates SDT z-indices from the toolbar', async ({ superdoc }) => {
    // Insert an SDT so the relevant DOM nodes exist.
    await insertBlockSdt(superdoc.page, 'Stacking Test', 'SDT content');
    await superdoc.waitForStable();

    // Verify the stacking-context fix: the layout container must have
    // isolation: isolate, which scopes all child z-indices (including the
    // z-index: 9999999 hover boost) so they cannot escape above the toolbar.
    const layoutIsolation = await superdoc.page.evaluate(() => {
      const layout = document.querySelector('.superdoc-layout');
      return layout ? getComputedStyle(layout).isolation : 'not-found';
    });
    expect(layoutIsolation).toBe('isolate');

    // Verify the toolbar establishes its own stacking context above the
    // document surface.
    const toolbarStyles = await superdoc.page.evaluate(() => {
      const toolbar = document.querySelector('.superdoc-toolbar');
      if (!toolbar) return null;
      const cs = getComputedStyle(toolbar);
      return { position: cs.position, zIndex: cs.zIndex };
    });
    expect(toolbarStyles).not.toBeNull();
    expect(toolbarStyles!.position).toBe('relative');
    expect(Number(toolbarStyles!.zIndex)).toBeGreaterThan(0);

    // Activate the hover boost on the SDT, then force the SDT element to
    // overlay the toolbar via CSS. This creates the exact stacking conflict
    // from the bug (z-index: 9999999 inside the document vs toolbar z-index)
    // without depending on the harness scroll setup.
    const hitTag = await superdoc.page.evaluate(
      ({ sdtSel, labelSel }) => {
        const sdt = document.querySelector(sdtSel) as HTMLElement | null;
        const label = document.querySelector(labelSel) as HTMLElement | null;
        const probe = document.querySelector('.superdoc-toolbar [data-item="btn-undo"]') as HTMLElement | null;
        if (!sdt || !probe) throw new Error('SDT or toolbar probe not found');

        // Activate the hover boost (z-index: 9999999).
        sdt.classList.remove('ProseMirror-selectednode');
        sdt.classList.add('sdt-hover');
        if (label) label.style.display = 'inline-flex';

        // Confirm the boost is active.
        const boost = getComputedStyle(sdt).zIndex;
        if (Number(boost) < 9999999) return `z-index-not-active:${boost}`;

        // Force the SDT to overlap the toolbar probe via fixed positioning.
        const probeRect = probe.getBoundingClientRect();
        const origPosition = sdt.style.position;
        const origZIndex = sdt.style.zIndex;
        const origTop = sdt.style.top;
        const origLeft = sdt.style.left;
        sdt.style.position = 'fixed';
        sdt.style.top = `${probeRect.top}px`;
        sdt.style.left = `${probeRect.left}px`;
        sdt.style.zIndex = '9999999';

        // Hit-test: the toolbar should still win because isolation: isolate
        // on the layout container scopes the SDT's z-index.
        const x = probeRect.left + probeRect.width / 2;
        const y = probeRect.top + probeRect.height / 2;
        const hit = document.elementFromPoint(x, y);

        // Restore the SDT's original styles.
        sdt.style.position = origPosition;
        sdt.style.zIndex = origZIndex;
        sdt.style.top = origTop;
        sdt.style.left = origLeft;

        if (!hit) return 'null';
        if (hit.closest('.superdoc-toolbar')) return 'toolbar';
        if (hit.closest(sdtSel)) return 'sdt';
        return hit.tagName.toLowerCase();
      },
      { sdtSel: BLOCK_SDT, labelSel: BLOCK_LABEL },
    );

    expect(hitTag).toBe('toolbar');

    await superdoc.snapshot('SD-2015 toolbar above SDT');
  });
});
