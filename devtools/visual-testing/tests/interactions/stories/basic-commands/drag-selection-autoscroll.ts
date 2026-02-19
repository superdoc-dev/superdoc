import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;
const WAIT_LONG_MS = 1000;

export default defineStory({
  name: 'drag-selection-autoscroll',
  description: 'Test drag selection with auto-scroll across pages.',
  tickets: ['SD-1551'],
  startDocument: 'pagination/h_f-normal-odd-even.docx',
  layout: true,
  viewport: { width: 1600, height: 800 },
  hideSelection: false,

  async run(page, helpers): Promise<void> {
    const { drag, waitForStable, milestone } = helpers;

    // Wait for document to fully load
    await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
    await waitForStable(WAIT_LONG_MS);
    await milestone('document-loaded', 'Document loaded showing first page');

    // Get the editor bounding box for coordinates
    const editorBox = await page.locator('#editor').first().boundingBox();
    if (!editorBox) throw new Error('Editor not found');

    // Perform a basic drag selection within the visible viewport
    await drag({ x: 100, y: 150 }, { x: 500, y: 300 });
    await waitForStable(WAIT_MS);
    await milestone('drag-selection-basic', 'Basic drag selection within viewport');

    // Now test auto-scroll by dragging from top towards the bottom edge
    // Start from near the top of the document
    await page.mouse.move(editorBox.x + 100, editorBox.y + 100);
    await page.mouse.down();

    // Move downward gradually to simulate dragging towards edge
    await page.mouse.move(editorBox.x + 200, editorBox.y + 400, { steps: 5 });
    await waitForStable(WAIT_MS);

    // Continue to the very bottom of the viewport to trigger auto-scroll
    // Auto-scroll activates within 32px of the edge
    await page.mouse.move(editorBox.x + 200, editorBox.y + editorBox.height - 10, { steps: 10 });

    // Hold at the edge to let auto-scroll work
    await waitForStable(WAIT_LONG_MS);

    await page.mouse.up();
    await waitForStable(WAIT_MS);
    await milestone('autoscroll-selection', 'Selection after dragging to bottom edge (auto-scroll)');
  },
});
