import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/pagination/longer-header.docx');
const MOD_KEY = process.platform === 'darwin' ? 'Meta' : 'Control';

test.use({ config: { showSelection: true } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

async function enterHeaderFooterEditMode(
  page: Page,
  surfaceSelector: string,
  editorHostSelector: string,
): Promise<Locator> {
  const surface = page.locator(surfaceSelector).first();
  await surface.scrollIntoViewIfNeeded();
  await surface.waitFor({ state: 'visible', timeout: 15_000 });

  const box = await surface.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);

  const editorHost = page.locator(editorHostSelector).first();
  await editorHost.waitFor({ state: 'visible', timeout: 10_000 });

  const pm = editorHost.locator('.ProseMirror');
  await pm.click();

  return pm;
}

async function assertSelectionOverlayRenders(
  page: Page,
  editor: Locator,
  expectedSelectionText: string,
): Promise<void> {
  await editor.click();
  await page.keyboard.press(`${MOD_KEY}+A`);

  await expect
    .poll(async () => page.evaluate(() => document.getSelection()?.toString().trim() ?? ''))
    .toBe(expectedSelectionText);

  await expect.poll(async () => page.locator('.presentation-editor__selection-rect').count()).toBeGreaterThan(0);

  const selectionRect = page.locator('.presentation-editor__selection-rect');
  await expect(selectionRect.first()).toBeVisible();
}

test('layout engine renders selection rectangles while editing a header', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const editor = await enterHeaderFooterEditMode(
    superdoc.page,
    '.superdoc-page-header',
    '.superdoc-header-editor-host',
  );

  await assertSelectionOverlayRenders(superdoc.page, editor, 'Generic content header');
});

test('layout engine renders selection rectangles while editing a footer', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const editor = await enterHeaderFooterEditMode(
    superdoc.page,
    '.superdoc-page-footer',
    '.superdoc-footer-editor-host',
  );

  await assertSelectionOverlayRenders(superdoc.page, editor, 'Footer');
});
