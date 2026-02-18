import { test, expect } from '../../fixtures/superdoc.js';
import type { Page } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const BLOCK_SDT = '.superdoc-structured-content-block';
const BLOCK_LABEL = '.superdoc-structured-content__label';
const INLINE_SDT = '.superdoc-structured-content-inline';
const INLINE_LABEL = '.superdoc-structured-content-inline__label';
const HOVER_CLASS = 'sdt-hover';
const SELECTED_CLASS = 'ProseMirror-selectednode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a block SDT with a paragraph of text via the editor command. */
async function insertBlockSdt(page: Page, alias: string, text: string) {
  await page.evaluate(
    ({ alias, text }) => {
      (window as any).editor.commands.insertStructuredContentBlock({
        attrs: { alias },
        html: `<p>${text}</p>`,
      });
    },
    { alias, text },
  );
}

/** Insert an inline SDT with text via the editor command. */
async function insertInlineSdt(page: Page, alias: string, text: string) {
  await page.evaluate(
    ({ alias, text }) => {
      (window as any).editor.commands.insertStructuredContentInline({
        attrs: { alias },
        text,
      });
    },
    { alias, text },
  );
}

/** Get the bounding box center of an element. */
async function getCenter(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);
}

/** Check whether an element has a given CSS class. */
async function hasClass(page: Page, selector: string, className: string): Promise<boolean> {
  return page.evaluate(
    ({ sel, cls }) => {
      const el = document.querySelector(sel);
      return el ? el.classList.contains(cls) : false;
    },
    { sel: selector, cls: className },
  );
}

/** Check whether the PM selection targets or is inside a structuredContentBlock node. */
async function isSelectionOnBlockSdt(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const { state } = (window as any).editor;
    const { selection } = state;
    // NodeSelection wrapping the block SDT
    if (selection.node?.type.name === 'structuredContentBlock') return true;
    // TextSelection inside the block SDT
    const $pos = selection.$from;
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.name === 'structuredContentBlock') return true;
    }
    return false;
  });
}

/** Deselect the SDT by placing the cursor on the first line via PM command. */
async function deselectSdt(page: Page) {
  await page.evaluate(() => {
    const editor = (window as any).editor;
    editor.commands.setTextSelection({ from: 5, to: 5 });
  });
}

// ==========================================================================
// Block SDT Tests
// ==========================================================================

test.describe('block structured content', () => {
  test.beforeEach(async ({ superdoc }) => {
    // Type initial text then insert a block SDT
    await superdoc.type('Before SDT');
    await superdoc.newLine();
    await superdoc.waitForStable();
    await insertBlockSdt(superdoc.page, 'Test Block', 'Block content here');
    await superdoc.waitForStable();
  });

  test('block SDT container renders with correct class and label', async ({ superdoc }) => {
    // The block SDT container should exist
    await superdoc.assertElementExists(BLOCK_SDT);

    // The label should exist (but not be visible until hover)
    await superdoc.assertElementExists(BLOCK_LABEL);

    // Verify the label text
    const labelText = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      return label?.textContent?.trim() ?? '';
    }, BLOCK_LABEL);
    expect(labelText).toBe('Test Block');

    await superdoc.snapshot('block SDT rendered');
  });

  test('block SDT shows hover state on mouse enter', async ({ superdoc }) => {
    // Deselect the SDT first — hover is suppressed while ProseMirror-selectednode is active
    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, BLOCK_SDT);

    // Move mouse over the block SDT
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();

    // The hover class should be applied
    const hovered = await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS);
    expect(hovered).toBe(true);

    // The label should become visible on hover
    const labelVisible = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      if (!label) return false;
      const style = getComputedStyle(label);
      return style.display !== 'none';
    }, BLOCK_LABEL);
    expect(labelVisible).toBe(true);

    await superdoc.snapshot('block SDT hovered');
  });

  test('block SDT removes hover state on mouse leave', async ({ superdoc }) => {
    // Deselect first so hover class can apply
    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, BLOCK_SDT);

    // Hover over the SDT
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();
    expect(await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS)).toBe(true);
    await superdoc.snapshot('block SDT hovered before leave');

    // Move mouse away (top-left corner of the viewport)
    await superdoc.page.mouse.move(0, 0);
    await superdoc.waitForStable();

    // Hover class should be removed
    expect(await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS)).toBe(false);

    await superdoc.snapshot('block SDT hover removed');
  });

  test('clicking inside block SDT places cursor within the block', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, BLOCK_SDT);

    // Click on the block SDT content
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    // Cursor should be inside the structuredContentBlock node
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await superdoc.snapshot('block SDT cursor placed');
  });

  test('moving cursor outside block SDT leaves the block', async ({ superdoc }) => {
    // SDT is auto-selected after insertion
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);
    await superdoc.snapshot('cursor inside block SDT');

    // Move cursor to the text before the SDT
    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    // Cursor should no longer be inside the block SDT
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(false);

    await superdoc.snapshot('cursor outside block SDT');
  });

  test('block SDT cursor persists through hover cycle', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, BLOCK_SDT);

    // Click inside the block SDT
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);
    await superdoc.snapshot('block SDT cursor before hover cycle');

    // Move mouse away and back — cursor should stay inside the block
    await superdoc.page.mouse.move(0, 0);
    await superdoc.waitForStable();

    // Cursor should still be inside (mouse move doesn't change selection)
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await superdoc.snapshot('block SDT cursor after hover cycle');
  });

  test('block SDT has correct boundary data attributes', async ({ superdoc }) => {
    // Single-fragment SDT should be both start and end
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
    // Type text, then insert an inline SDT
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
    // Deselect the inline SDT so hover styles can apply
    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, INLINE_SDT);

    // Hover over the inline SDT
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();

    // Inline uses CSS :hover — check that background changes to indicate hover
    const hasBg = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const bg = getComputedStyle(el).backgroundColor;
      return bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    }, INLINE_SDT);
    expect(hasBg).toBe(true);

    // Inline label stays hidden on hover (display: none) — it only shows on selection
    const labelHidden = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      if (!label) return true;
      return getComputedStyle(label).display === 'none';
    }, INLINE_LABEL);
    expect(labelHidden).toBe(true);

    await superdoc.snapshot('inline SDT hovered');
  });

  test('first click inside inline SDT selects all content', async ({ superdoc }) => {
    // The select plugin should select all content on first click from outside
    const center = await getCenter(superdoc.page, INLINE_SDT);
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    // The selection should span the entire inline SDT content
    const selection = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      const { from, to } = state.selection;
      const text = state.doc.textBetween(from, to);
      return { from, to, text };
    });

    expect(selection.text).toBe('inline value');

    await superdoc.snapshot('inline SDT content selected');
  });

  test('second click inside inline SDT allows cursor placement', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, INLINE_SDT);

    // First click — selects all
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();
    await superdoc.snapshot('inline SDT all selected before second click');

    // Second click — should place cursor, not select all
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    const selection = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      return { from: state.selection.from, to: state.selection.to };
    });

    // Selection should be collapsed (cursor) or at least smaller than full content
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
    await superdoc.snapshot('block SDT in editing mode');

    // Switch to viewing mode
    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();

    // Border should be none and label hidden
    const styles = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { border: cs.borderStyle, padding: cs.padding };
    }, BLOCK_SDT);

    expect(styles).not.toBeNull();
    // In viewing mode, border is removed
    expect(styles!.border).toBe('none');
    await superdoc.assertElementHidden(BLOCK_LABEL);

    await superdoc.snapshot('block SDT viewing mode');
  });

  test('inline SDT border and label are hidden in viewing mode', async ({ superdoc }) => {
    await superdoc.type('Hello ');
    await superdoc.waitForStable();
    await insertInlineSdt(superdoc.page, 'Hidden Inline', 'value');
    await superdoc.waitForStable();
    await superdoc.snapshot('inline SDT in editing mode');

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
