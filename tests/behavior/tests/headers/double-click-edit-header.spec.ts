import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/pagination/longer-header.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

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

  // After dblclick, SuperDoc creates a separate editor host for the header
  const editorHost = superdoc.page.locator('.superdoc-header-editor-host').first();
  await editorHost.waitFor({ state: 'visible', timeout: 10_000 });

  // Focus the PM editor inside the host, select all, move to end, then insert text
  const pm = editorHost.locator('.ProseMirror');
  await pm.click();
  await superdoc.page.keyboard.press('End');
  // Use insertText instead of type() to avoid character-by-character key events
  // which may trigger PM shortcuts
  await superdoc.page.keyboard.insertText(' - Edited');
  await superdoc.waitForStable();

  // Editor host should contain the typed text
  await expect(editorHost).toContainText('Edited');

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

  // After dblclick, SuperDoc creates a separate editor host for the footer
  const editorHost = superdoc.page.locator('.superdoc-footer-editor-host').first();
  await editorHost.waitFor({ state: 'visible', timeout: 10_000 });

  // Focus the PM editor inside the host, select all, move to end, then insert text
  const pm = editorHost.locator('.ProseMirror');
  await pm.click();
  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' - Edited');
  await superdoc.waitForStable();

  // Editor host should contain the typed text
  await expect(editorHost).toContainText('Edited');

  // Press Escape to exit footer edit mode
  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();

  // After exiting, the static footer is re-rendered with the edited content
  await expect(footer).toContainText('Edited');

  await superdoc.snapshot('footer-edited');
});
