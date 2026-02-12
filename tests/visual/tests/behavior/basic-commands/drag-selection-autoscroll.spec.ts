import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/basic-commands/h_f-normal-odd-even.docx');

test.use({ config: { hideSelection: false, height: 800 } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test.fixme('@behavior drag selection with autoscroll across pages', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.screenshot('drag-autoscroll-loaded');

  const editorBox = await superdoc.page.locator('#editor').first().boundingBox();
  if (!editorBox) throw new Error('Editor not found');

  // Basic drag selection within viewport
  await superdoc.page.mouse.move(editorBox.x + 100, editorBox.y + 150);
  await superdoc.page.mouse.down();
  await superdoc.page.mouse.move(editorBox.x + 500, editorBox.y + 300, { steps: 5 });
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();
  await superdoc.screenshot('drag-autoscroll-basic');

  // Drag towards bottom edge to trigger autoscroll
  await superdoc.page.mouse.move(editorBox.x + 100, editorBox.y + 100);
  await superdoc.page.mouse.down();
  await superdoc.page.mouse.move(editorBox.x + 200, editorBox.y + editorBox.height - 10, { steps: 10 });
  await superdoc.waitForStable(1000);
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();
  await superdoc.screenshot('drag-autoscroll-scrolled');
});
