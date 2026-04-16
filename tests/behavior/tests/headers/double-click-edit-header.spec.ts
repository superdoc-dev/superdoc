import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/pagination/longer-header.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');
test.use({ config: { useHiddenHostForStoryParts: true, showCaret: true, showSelection: true } });

test('double-click header to enter edit mode, type, and exit', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Header should be visible
  const header = superdoc.page.locator('.superdoc-page-header').first();
  await header.waitFor({ state: 'visible', timeout: 15_000 });

  // Double-click at the header's coordinates (header has pointer-events:none,
  // so we must use raw mouse to reach the viewport host's dblclick handler)
  const box = await header.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  const storyHost = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"]')
    .first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  // Editing runs through the hidden-host PM while the visible header remains painted.
  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' - Edited');
  await superdoc.waitForStable();
  await expect(header).toContainText('Edited');

  // Press Escape to exit header edit mode
  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();

  // After exiting, the static header is re-rendered with the edited content
  await expect(header).toContainText('Edited');

  await superdoc.snapshot('header-edited');
});

test('double-click footer to enter edit mode, type, and exit', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Footer should be visible — scroll into view first since it's at page bottom
  const footer = superdoc.page.locator('.superdoc-page-footer').first();
  await footer.scrollIntoViewIfNeeded();
  await footer.waitFor({ state: 'visible', timeout: 15_000 });

  // Double-click at the footer's coordinates
  const box = await footer.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  const storyHost = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"]')
    .first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' - Edited');
  await superdoc.waitForStable();
  await expect(footer).toContainText('Edited');

  // Press Escape to exit footer edit mode
  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();

  // After exiting, the static footer is re-rendered with the edited content
  await expect(footer).toContainText('Edited');

  await superdoc.snapshot('footer-edited');
});
