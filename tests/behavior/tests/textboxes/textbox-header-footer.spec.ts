import { test, expect } from '../../fixtures/superdoc.js';
import { activateHeader, activateFooter } from '../../helpers/story-surfaces.js';
import path from 'node:path';

const HF_TEXTBOX = path.resolve(import.meta.dirname, 'fixtures/header_footer_textbox.docx');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the bounding box of the first drawing fragment containing a textbox shape
 * for the given story kind ('header' | 'footer').
 *
 * behindDoc fragments are rendered on the page element (data-behind-doc-section),
 * not inside .superdoc-page-header/footer, so we search both locations.
 */
async function getTextboxFragmentBoxForStory(page: any, kind: 'header' | 'footer') {
  const handle = await page.evaluateHandle((storyKind: string) => {
    // 1. Look inside the surface container
    const surface = document.querySelector(`.superdoc-page-${storyKind}`);
    const inSurface = surface
      ?.querySelector('.superdoc-drawing-fragment .superdoc-textbox-shape')
      ?.closest('.superdoc-drawing-fragment') as HTMLElement | null;
    if (inSurface) return inSurface;

    // 2. behindDoc fragments are on the page element with data-behind-doc-section
    const behindDoc = document
      .querySelector(`[data-behind-doc-section="${storyKind}"] .superdoc-textbox-shape`)
      ?.closest('[data-behind-doc-section]') as HTMLElement | null;
    return behindDoc ?? null;
  }, kind);
  const el = handle.asElement();
  if (!el) throw new Error(`No textbox drawing fragment found for ${kind}`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`Textbox fragment for ${kind} not visible`);
  return box;
}

/** Click the border of a textbox fragment (within 6px BORDER_HIT_MARGIN). */
async function clickTextboxBorderAt(page: any, box: { x: number; y: number }) {
  await page.mouse.click(box.x + 3, box.y + 3);
}

/** Returns true if the active editor has a NodeSelection on shapeContainer. */
async function hasShapeContainerNodeSelection(page: any): Promise<boolean> {
  return page.evaluate(() => {
    function resolveActiveState() {
      const active = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      return active?.state ?? active?.view?.state ?? null;
    }
    const state = resolveActiveState();
    const sel = state?.selection;
    return sel?.constructor?.name === 'NodeSelection' && sel?.node?.type?.name === 'shapeContainer';
  });
}

/** Returns attrs of the first shapeContainer in the active editor's document. */
async function getFirstShapeContainerAttrs(page: any): Promise<Record<string, any>> {
  return page.evaluate(() => {
    function resolveActiveState() {
      const active = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      return active?.state ?? active?.view?.state ?? null;
    }
    const state = resolveActiveState();
    if (!state) throw new Error('No active editor state');
    let attrs: any = null;
    state.doc.descendants((node: any) => {
      if (!attrs && node.type?.name === 'shapeContainer') {
        attrs = { ...node.attrs };
        return false;
      }
    });
    if (!attrs) throw new Error('No shapeContainer found in active editor document');
    return attrs;
  });
}

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

async function dragTextboxOverlayBody(superdoc: any, dx: number, dy: number) {
  const overlay = superdoc.page.locator('.superdoc-textbox-resize-overlay');
  await expect(overlay).toBeAttached({ timeout: 5000 });
  const overlayBox = await overlay.boundingBox();
  if (!overlayBox) throw new Error('Textbox overlay not visible');
  const startX = overlayBox.x + overlayBox.width / 2;
  const startY = overlayBox.y + overlayBox.height / 2;
  await superdoc.page.mouse.move(startX, startY);
  await superdoc.page.mouse.down();
  await superdoc.page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();
}

// ---------------------------------------------------------------------------
// Tests: header textbox
// ---------------------------------------------------------------------------

test.describe('Textbox object interaction — header/footer', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(HF_TEXTBOX);
  });

  test('@behavior textbox header: clicking textbox border produces NodeSelection on shapeContainer', async ({
    superdoc,
  }) => {
    await activateHeader(superdoc);

    const box = await getTextboxFragmentBoxForStory(superdoc.page, 'header');
    await clickTextboxBorderAt(superdoc.page, box);
    await superdoc.waitForStable();

    expect(await hasShapeContainerNodeSelection(superdoc.page)).toBe(true);
  });

  test('@behavior textbox header: clicking textbox border shows selection ring', async ({ superdoc }) => {
    await activateHeader(superdoc);

    const box = await getTextboxFragmentBoxForStory(superdoc.page, 'header');
    await clickTextboxBorderAt(superdoc.page, box);
    await superdoc.waitForStable();

    const hasRing = await superdoc.page.evaluate(() => {
      return !!document.querySelector('.superdoc-textbox-selected');
    });
    expect(hasRing).toBe(true);
  });

  test('@behavior textbox header: TextboxResizeOverlay renders with 4 handles', async ({ superdoc }) => {
    await activateHeader(superdoc);

    const box = await getTextboxFragmentBoxForStory(superdoc.page, 'header');
    await clickTextboxBorderAt(superdoc.page, box);
    await superdoc.waitForStable();

    const overlay = superdoc.page.locator('.superdoc-textbox-resize-overlay');
    await expect(overlay).toBeAttached({ timeout: 3000 });
    await expect(superdoc.page.locator('.superdoc-textbox-resize-overlay .resize-handle')).toHaveCount(4);
  });

  test('@behavior textbox header: dragging SE resize handle updates shapeContainer width and height', async ({
    superdoc,
  }) => {
    await activateHeader(superdoc);

    const box = await getTextboxFragmentBoxForStory(superdoc.page, 'header');
    await clickTextboxBorderAt(superdoc.page, box);
    await superdoc.waitForStable();

    const before = await getFirstShapeContainerAttrs(superdoc.page);
    await dragSeResizeHandle(superdoc, 30, 20);

    const after = await getFirstShapeContainerAttrs(superdoc.page);
    expect(after.width).toBeGreaterThan(before.width ?? 0);
    expect(after.height).toBeGreaterThan(before.height ?? 0);
  });

  test('@behavior textbox header: dragging overlay body updates shapeContainer marginOffset', async ({ superdoc }) => {
    await activateHeader(superdoc);

    const initialAttrs = await getFirstShapeContainerAttrs(superdoc.page);
    if (initialAttrs.marginOffset?.horizontal == null && initialAttrs.marginOffset?.top == null) {
      test.skip();
      return;
    }

    const box = await getTextboxFragmentBoxForStory(superdoc.page, 'header');
    await clickTextboxBorderAt(superdoc.page, box);
    await superdoc.waitForStable();

    await dragTextboxOverlayBody(superdoc, 25, 15);

    const after = await getFirstShapeContainerAttrs(superdoc.page);
    expect(
      Math.abs((after.marginOffset?.horizontal ?? 0) - (initialAttrs.marginOffset.horizontal ?? 0)),
    ).toBeGreaterThan(2);
    expect(Math.abs((after.marginOffset?.top ?? 0) - (initialAttrs.marginOffset.top ?? 0))).toBeGreaterThan(2);
  });

  // ---------------------------------------------------------------------------
  // Tests: footer textbox
  // ---------------------------------------------------------------------------

  test('@behavior textbox footer: clicking textbox border produces NodeSelection on shapeContainer', async ({
    superdoc,
  }) => {
    await activateFooter(superdoc);

    const box = await getTextboxFragmentBoxForStory(superdoc.page, 'footer');
    await clickTextboxBorderAt(superdoc.page, box);
    await superdoc.waitForStable();

    expect(await hasShapeContainerNodeSelection(superdoc.page)).toBe(true);
  });

  test('@behavior textbox footer: resize handle updates shapeContainer width and height', async ({ superdoc }) => {
    await activateFooter(superdoc);

    const box = await getTextboxFragmentBoxForStory(superdoc.page, 'footer');
    await clickTextboxBorderAt(superdoc.page, box);
    await superdoc.waitForStable();

    const before = await getFirstShapeContainerAttrs(superdoc.page);
    await dragSeResizeHandle(superdoc, 30, 20);

    const after = await getFirstShapeContainerAttrs(superdoc.page);
    expect(after.width).toBeGreaterThan(before.width ?? 0);
    expect(after.height).toBeGreaterThan(before.height ?? 0);
  });
});
