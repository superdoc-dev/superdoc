import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

/**
 * Behavior test: images inserted into a table cell must be
 * constrained to the cell's content width.
 *
 * Flow:
 *  1. Insert a 1-column table with an explicit, narrow column width (200 px).
 *  2. Click into the only cell so the cursor lands inside it.
 *  3. Simulate a drag-drop of an image that is much wider than the cell.
 *  4. Assert the image node's stored width is ≤ the cell's colwidth.
 *
 * The constraint is applied by Editor.getMaxContentSize(), which, when the
 * selection is inside a tableCell / tableHeader, returns the cell's colwidth
 * minus cell margins instead of the full page content width.
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

// ─── helpers ────────────────────────────────────────────────────────────────

type PlacementSnapshot = {
  imageCount: number;
  imageWidth: number | null;
};

async function getImageSnapshot(superdoc: SuperDocFixture): Promise<PlacementSnapshot> {
  return superdoc.page.evaluate(() => {
    const doc = (window as any).editor?.state?.doc;
    if (!doc) throw new Error('Editor document is unavailable.');

    let imageCount = 0;
    let imageWidth: number | null = null;

    doc.descendants((node: any) => {
      if (node.type?.name === 'image') {
        imageCount += 1;
        if (imageWidth === null) {
          imageWidth = node.attrs?.size?.width ?? null;
        }
      }
    });

    return { imageCount, imageWidth };
  });
}

/**
 * Move the editor cursor into the first table cell by using the ProseMirror
 * command API, so the selection is deterministic regardless of layout.
 */
async function placeCursorInFirstTableCell(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const doc = editor?.state?.doc;
    if (!doc) throw new Error('Editor document is unavailable.');

    let cellPos: number | null = null;

    doc.descendants((node: any, pos: number) => {
      if (cellPos !== null) return false;
      if (node.type?.name === 'tableCell' || node.type?.name === 'tableHeader') {
        // pos points at the cell node; pos+1 is the start of its content
        cellPos = pos + 1;
        return false;
      }
    });

    if (cellPos === null) throw new Error('No table cell found in document.');

    editor.commands.setTextSelection({ from: cellPos, to: cellPos });
  });
  await superdoc.waitForStable();
}

/**
 * Dispatch a synthetic drag-drop carrying a canvas-generated PNG of the given
 * pixel dimensions inside the first table cell.  Returns the number of files
 * the drop handler saw, mirroring the pattern in drag-drop-image-insertion.spec.ts.
 */
async function dropOversizedImageInFirstCell(
  superdoc: SuperDocFixture,
  imageWidthPx: number,
  imageHeightPx: number,
): Promise<{ droppedFileCount: number }> {
  return superdoc.page.evaluate(
    async ({ w, h }) => {
      // Find drop target — prefer the presentation viewport, fall back to #editor.
      const host = document.querySelector('.presentation-editor__viewport') ?? document.querySelector('#editor');
      if (!host) throw new Error('Could not locate drop target element.');

      // Build a File from a canvas so the image plugin can read real pixel data.
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D canvas context.');
      ctx.fillStyle = '#0055ff';
      ctx.fillRect(0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to generate PNG blob.');

      const file = new File([blob], 'wide-test-image.png', { type: 'image/png' });

      const dt = new DataTransfer();
      dt.items.add(file);
      dt.effectAllowed = 'copy';

      // Drop inside the rendered table fragment rather than the viewport
      // centre, which may land in the trailing separator paragraph.
      const tableFragment = host.querySelector('.superdoc-table-fragment');
      const targetEl = tableFragment ?? host;
      const rect = targetEl.getBoundingClientRect();
      const dropX = Math.round(rect.left + rect.width / 2);
      const dropY = Math.round(rect.top + rect.height / 2);

      let droppedFileCount = 0;

      host.addEventListener(
        'drop',
        (ev: Event) => {
          droppedFileCount = (ev as DragEvent).dataTransfer?.files?.length ?? 0;
        },
        { once: true },
      );

      host.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: dropX,
          clientY: dropY,
        }),
      );

      host.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: dropX,
          clientY: dropY,
        }),
      );

      return { droppedFileCount };
    },
    { w: imageWidthPx, h: imageHeightPx },
  );
}

// ─── test ────────────────────────────────────────────────────────────────────

test('image dropped into a narrow table cell is constrained to the cell width', async ({ superdoc, browserName }) => {
  // Synthetic DataTransfer file drops are only fully supported in Chromium.
  test.skip(browserName !== 'chromium', 'Synthetic file DataTransfer drag/drop is deterministic in Chromium only.');

  // ── 1. Insert a single-column table with a well-known, narrow column width.
  //       200 px is much narrower than a typical page content width (~580 px),
  //       so any image wider than 200 px exercises the constraint path.
  const CELL_WIDTH_PX = 200;

  await superdoc.executeCommand('insertTable', {
    rows: 1,
    cols: 1,
    withHeaderRow: false,
    columnWidths: [CELL_WIDTH_PX],
  });
  await superdoc.waitForStable();

  await superdoc.assertTableExists(1, 1);

  // ── 2. Place the cursor inside the cell so getMaxContentSize() picks up the
  //       cell context.
  await placeCursorInFirstTableCell(superdoc);

  // ── 3. Drop an image that is far wider than the cell.
  //       We use a 1 200 × 900 px image — well over 200 px — so any pass-through
  //       would leave the image clearly wider than the cell.
  const IMAGE_WIDTH_PX = 1200;
  const IMAGE_HEIGHT_PX = 900;

  const { droppedFileCount } = await dropOversizedImageInFirstCell(superdoc, IMAGE_WIDTH_PX, IMAGE_HEIGHT_PX);

  // If the drop handler did not receive any files the test environment does not
  // support synthetic drops; skip rather than fail.
  if (droppedFileCount === 0) {
    test.skip(true, 'Synthetic drop did not deliver files in this environment.');
    return;
  }

  // ── 4. Wait for the image node to appear in the document (the upload pipeline
  //       is async — it processes the file, resizes it, then commits the node).
  await expect
    .poll(async () => (await getImageSnapshot(superdoc)).imageCount, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1);

  await superdoc.waitForStable();

  const { imageCount, imageWidth } = await getImageSnapshot(superdoc);

  // Skip gracefully when the environment drops the file but the plugin does not
  // complete the insert (e.g. missing canvas support in headless mode).
  if (imageCount === 0) {
    test.skip(true, 'Image drop was received but no image node was inserted; skipping.');
    return;
  }

  expect(imageCount).toBe(1);

  // The stored width must be present and must not exceed the cell's colwidth.
  expect(imageWidth).not.toBeNull();
  expect(imageWidth as number).toBeGreaterThan(0);
  expect(imageWidth as number).toBeLessThanOrEqual(CELL_WIDTH_PX);
});
