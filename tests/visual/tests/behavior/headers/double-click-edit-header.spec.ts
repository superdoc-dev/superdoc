import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/headers/longer-header.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test('@behavior double-click header to enter edit mode', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.screenshot('header-edit-loaded');

  // Double-click on header
  const header = superdoc.page.locator('.superdoc-page-header').first();
  await header.waitFor({ state: 'visible', timeout: 15_000 });
  await header.dblclick({ force: true });
  await superdoc.waitForStable();
  await superdoc.screenshot('header-edit-editing');

  await superdoc.type(' - Edited');
  await superdoc.waitForStable();
  await superdoc.screenshot('header-edit-typed');

  await superdoc.press('Escape');
  await superdoc.waitForStable();
  await superdoc.screenshot('header-edit-exited');

  // Double-click on footer
  const footer = superdoc.page.locator('.superdoc-page-footer').first();
  await footer.waitFor({ state: 'visible', timeout: 15_000 });
  await footer.dblclick({ force: true });
  await superdoc.waitForStable();
  await superdoc.screenshot('footer-edit-editing');

  await superdoc.type(' - Edited');
  await superdoc.waitForStable();
  await superdoc.screenshot('footer-edit-typed');

  await superdoc.press('Escape');
  await superdoc.waitForStable();
  await superdoc.screenshot('footer-edit-exited');
});
