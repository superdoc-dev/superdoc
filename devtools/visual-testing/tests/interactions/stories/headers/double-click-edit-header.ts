import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;

export default defineStory({
  name: 'double-click-edit-header',
  description: 'Test double-clicking on header area to enter edit mode (SD-1593 fix)',
  startDocument: 'test-docs/basic/longer-header.docx',
  layout: true,

  async run(page, helpers): Promise<void> {
    const { type, waitForStable, milestone, press } = helpers;

    // Wait for document to fully load with layout
    await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
    await waitForStable(WAIT_MS);
    await milestone('document-loaded', 'Initial document state showing header');

    // Find the header element on the first page and double-click it
    // Headers are rendered with class 'superdoc-page-header'
    const headerElement = page.locator('.superdoc-page-header').first();
    await headerElement.waitFor({ state: 'visible', timeout: 10_000 });

    // Double-click on the header element to enter edit mode
    // Note: force: true is needed because headers have pointer-events: none
    // and the page element intercepts clicks. The app handles this by detecting
    // click coordinates and determining if they're in the header region.
    await headerElement.dblclick({ force: true });
    await waitForStable(WAIT_MS);
    await milestone('header-editing', 'After double-clicking header to enter edit mode');

    // Type some text in the header
    await type(' - Edited');
    await waitForStable(WAIT_MS);
    await milestone('typed-in-header', 'After typing text in the header');

    // Press Escape to exit header editing mode
    await press('Escape');
    await waitForStable(WAIT_MS);
    await milestone('exited-header', 'After pressing Escape to exit header editing');

    // Find the footer element on the first page and double-click it
    // Footers are rendered with class 'superdoc-page-footer'
    const footerElement = page.locator('.superdoc-page-footer').first();
    await footerElement.waitFor({ state: 'visible', timeout: 10_000 });

    // Double-click on the footer element to enter edit mode
    await footerElement.dblclick({ force: true });
    await waitForStable(WAIT_MS);
    await milestone('footer-editing', 'After double-clicking footer to enter edit mode');

    // Type some text in the footer
    await type(' - Edited');
    await waitForStable(WAIT_MS);
    await milestone('typed-in-footer', 'After typing text in the footer');

    // Press Escape to exit footer editing mode
    await press('Escape');
    await waitForStable(WAIT_MS);
    await milestone('exited-footer', 'After pressing Escape to exit footer editing');
  },
});
