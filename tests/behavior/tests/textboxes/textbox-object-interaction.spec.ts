import { test, expect } from '../../fixtures/superdoc.js';
import path from 'node:path';

const TEXT_BOXES = path.resolve(import.meta.dirname, 'fixtures/text-boxes.docx');
const TABLE_TEXTBOX = path.resolve(import.meta.dirname, 'fixtures/contract-acc-tbl-padding.docx');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the bounding box of the first body drawing fragment that contains a
 * textbox shape (excludes header/footer fragments).
 */
async function getBodyTextboxFragmentBox(page: any) {
  const handle = await page.evaluateHandle(() => {
    const frags = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-drawing-fragment'));
    for (const frag of frags) {
      const story = frag.dataset.layoutStory ?? '';
      if (story.startsWith('header:') || story.startsWith('footer:')) continue;
      if (frag.querySelector('.superdoc-textbox-shape')) return frag;
    }
    return null;
  });
  const el = handle.asElement();
  if (!el) throw new Error('No body textbox drawing fragment found');
  const box = await el.boundingBox();
  if (!box) throw new Error('Body textbox fragment not visible');
  return box;
}

/**
 * Click the top-left border of the first body textbox (within 6px BORDER_HIT_MARGIN).
 * This triggers NodeSelection on the shapeContainer, not a content caret.
 */
async function clickTextboxBorder(superdoc: any) {
  const box = await getBodyTextboxFragmentBox(superdoc.page);
  // Click 3px inside from top-left — within the 6px border hit margin
  await superdoc.page.mouse.click(box.x + 3, box.y + 3);
}

/** Returns true if a shapeContainer NodeSelection is active on the body editor. */
async function hasShapeContainerNodeSelection(page: any): Promise<boolean> {
  return page.evaluate(() => {
    const { state } = (window as any).editor;
    const sel = state.selection;
    return sel.constructor.name === 'NodeSelection' && sel.node?.type?.name === 'shapeContainer';
  });
}

/** Returns the attrs of the first shapeContainer in the body document. */
async function getFirstShapeContainerAttrs(page: any): Promise<Record<string, any>> {
  return page.evaluate(() => {
    const { state } = (window as any).editor;
    let attrs: any = null;
    state.doc.descendants((node: any) => {
      if (!attrs && node.type?.name === 'shapeContainer') {
        attrs = { ...node.attrs };
        return false;
      }
    });
    if (!attrs) throw new Error('No shapeContainer found in document');
    return attrs;
  });
}

/**
 * Drag the SE resize handle of the TextboxResizeOverlay by (dx, dy).
 * Assumes the textbox is already selected (NodeSelection).
 */
async function dragSeResizeHandle(superdoc: any, dx: number, dy: number) {
  const handle = superdoc.page.locator('.superdoc-textbox-resize-overlay .resize-handle--se');
  await expect(handle).toBeAttached({ timeout: 5000 });

  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error('SE resize handle not visible');

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await superdoc.page.mouse.move(startX, startY);
  await superdoc.page.mouse.down();
  await superdoc.page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();
}

/**
 * Drag the overlay body (not a handle) to trigger a move.
 * Assumes the textbox is already selected (NodeSelection).
 */
async function dragTextboxOverlayBody(superdoc: any, dx: number, dy: number) {
  const overlay = superdoc.page.locator('.superdoc-textbox-resize-overlay');
  await expect(overlay).toBeAttached({ timeout: 5000 });

  const overlayBox = await overlay.boundingBox();
  if (!overlayBox) throw new Error('Textbox overlay not visible');

  // Click in the center of the overlay — far from the corner handles
  const startX = overlayBox.x + overlayBox.width / 2;
  const startY = overlayBox.y + overlayBox.height / 2;

  await superdoc.page.mouse.move(startX, startY);
  await superdoc.page.mouse.down();
  await superdoc.page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();
}

// ---------------------------------------------------------------------------
// Tests: object selection
// ---------------------------------------------------------------------------

test.describe('Textbox object interaction — text-boxes', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(TEXT_BOXES);
  });

  test('@behavior textbox: clicking textbox border produces NodeSelection on shapeContainer', async ({ superdoc }) => {
    await clickTextboxBorder(superdoc);
    await superdoc.waitForStable();

    expect(await hasShapeContainerNodeSelection(superdoc.page)).toBe(true);
  });

  test('@behavior textbox: clicking textbox border adds selection ring CSS class', async ({ superdoc }) => {
    await clickTextboxBorder(superdoc);
    await superdoc.waitForStable();

    const hasRing = await superdoc.page.evaluate(() => {
      return !!document.querySelector('.superdoc-textbox-selected');
    });
    expect(hasRing).toBe(true);
  });

  test('@behavior textbox: clicking outside selected textbox removes selection ring', async ({ superdoc }) => {
    await clickTextboxBorder(superdoc);
    await superdoc.waitForStable();
    expect(await hasShapeContainerNodeSelection(superdoc.page)).toBe(true);

    // Click on a body paragraph line that is outside any drawing fragment
    const bodyLineBox = await superdoc.page.evaluateHandle(() => {
      return (
        Array.from(document.querySelectorAll<HTMLElement>('.superdoc-line')).find(
          (el) => !el.closest('.superdoc-drawing-fragment') && !el.closest('.superdoc-table-drawing'),
        ) ?? null
      );
    });
    const bodyLineEl = bodyLineBox.asElement();
    if (!bodyLineEl) throw new Error('No body paragraph line found outside drawing fragments');
    const lineBox = await bodyLineEl.boundingBox();
    if (!lineBox) throw new Error('Body line not visible');
    await superdoc.page.mouse.click(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2);
    await superdoc.waitForStable();

    const hasRing = await superdoc.page.evaluate(() => {
      return !!document.querySelector('.superdoc-textbox-selected');
    });
    expect(hasRing).toBe(false);
  });

  test('@behavior textbox: TextboxResizeOverlay renders when textbox is border-selected', async ({ superdoc }) => {
    await clickTextboxBorder(superdoc);
    await superdoc.waitForStable();

    const overlay = superdoc.page.locator('.superdoc-textbox-resize-overlay');
    await expect(overlay).toBeAttached({ timeout: 3000 });

    // All four corner handles are present
    const handles = superdoc.page.locator('.superdoc-textbox-resize-overlay .resize-handle');
    await expect(handles).toHaveCount(4);
  });

  // ---------------------------------------------------------------------------
  // Tests: resize
  // ---------------------------------------------------------------------------

  test('@behavior textbox: dragging SE resize handle updates shapeContainer width and height', async ({ superdoc }) => {
    await clickTextboxBorder(superdoc);
    await superdoc.waitForStable();

    const before = await getFirstShapeContainerAttrs(superdoc.page);
    await dragSeResizeHandle(superdoc, 40, 30);

    const after = await getFirstShapeContainerAttrs(superdoc.page);
    expect(after.width).toBeGreaterThan(before.width ?? 0);
    expect(after.height).toBeGreaterThan(before.height ?? 0);
  });

  test('@behavior textbox: resize does not delete or flatten textbox content', async ({ superdoc }) => {
    await clickTextboxBorder(superdoc);
    await superdoc.waitForStable();

    await dragSeResizeHandle(superdoc, 40, 30);

    // shapeTextbox with paragraph content must still exist in the PM document
    const hasContent = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      let found = false;
      state.doc.descendants((node: any) => {
        if (node.type?.name === 'shapeTextbox') {
          found = node.content?.childCount > 0;
          return false;
        }
      });
      return found;
    });
    expect(hasContent).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Tests: move
  // ---------------------------------------------------------------------------

  test('@behavior textbox: dragging overlay body updates shapeContainer marginOffset', async ({ superdoc }) => {
    const initialAttrs = await getFirstShapeContainerAttrs(superdoc.page);

    // Skip if the textbox uses align-based positioning (no marginOffset)
    if (initialAttrs.marginOffset?.horizontal == null && initialAttrs.marginOffset?.top == null) {
      test.skip();
      return;
    }

    await clickTextboxBorder(superdoc);
    await superdoc.waitForStable();

    await dragTextboxOverlayBody(superdoc, 30, 20);

    const after = await getFirstShapeContainerAttrs(superdoc.page);
    const hBefore = initialAttrs.marginOffset.horizontal ?? 0;
    const tBefore = initialAttrs.marginOffset.top ?? 0;
    expect(Math.abs((after.marginOffset?.horizontal ?? 0) - hBefore)).toBeGreaterThan(2);
    expect(Math.abs((after.marginOffset?.top ?? 0) - tBefore)).toBeGreaterThan(2);
  });

  test('@behavior textbox: move does not delete or flatten textbox content', async ({ superdoc }) => {
    const initialAttrs = await getFirstShapeContainerAttrs(superdoc.page);
    if (initialAttrs.marginOffset?.horizontal == null && initialAttrs.marginOffset?.top == null) {
      test.skip();
      return;
    }

    await clickTextboxBorder(superdoc);
    await superdoc.waitForStable();

    await dragTextboxOverlayBody(superdoc, 30, 20);

    const hasContent = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      let found = false;
      state.doc.descendants((node: any) => {
        if (node.type?.name === 'shapeTextbox') {
          found = node.content?.childCount > 0;
          return false;
        }
      });
      return found;
    });
    expect(hasContent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: table cell textbox — regression for versionSignature fix
//
// Drawings inside table cells are rendered inside the table fragment (not as
// standalone DrawingFragment elements). Before the versionSignature fix, moving
// a table-cell textbox did not bust the table fragment paint cache, so the
// visual position only updated after a subsequent resize. This suite guards
// against that regression.
// ---------------------------------------------------------------------------

/**
 * Returns the bounding box of the first textbox shape rendered inside a table
 * (i.e. NOT inside a standalone .superdoc-drawing-fragment).
 */
async function getTableCellTextboxBox(page: any) {
  const handle = await page.evaluateHandle(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-textbox-shape'));
    return all.find((el) => !el.closest('.superdoc-drawing-fragment')) ?? null;
  });
  const el = handle.asElement();
  if (!el) throw new Error('No table-cell textbox found');
  const box = await el.boundingBox();
  if (!box) throw new Error('Table-cell textbox not visible');
  return box;
}

test.describe('Textbox object interaction — table cell', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(TABLE_TEXTBOX);
  });

  test('@behavior textbox table-cell: move updates visual position immediately without requiring resize', async ({
    superdoc,
  }) => {
    const before = await getTableCellTextboxBox(superdoc.page);

    // Click the border of the table-cell textbox to get NodeSelection
    await superdoc.page.mouse.click(before.x + 3, before.y + 3);
    await superdoc.waitForStable();

    const overlay = superdoc.page.locator('.superdoc-textbox-resize-overlay');
    await expect(overlay).toBeAttached({ timeout: 5000 });

    // Drag the overlay body to move the textbox
    const overlayBox = await overlay.boundingBox();
    if (!overlayBox) throw new Error('Overlay not visible');
    const startX = overlayBox.x + overlayBox.width / 2;
    const startY = overlayBox.y + overlayBox.height / 2;
    await superdoc.page.mouse.move(startX, startY);
    await superdoc.page.mouse.down();
    await superdoc.page.mouse.move(startX + 30, startY + 20, { steps: 10 });
    await superdoc.page.mouse.up();
    await superdoc.waitForStable();

    // Visual position must update without an additional resize
    const after = await getTableCellTextboxBox(superdoc.page);
    const moved = Math.abs(after.x - before.x) > 2 || Math.abs(after.y - before.y) > 2;
    expect(moved).toBe(true);
  });
});
