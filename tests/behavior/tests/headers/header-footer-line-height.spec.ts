import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/pagination/longer-header.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('header editor uses line-height 1, not the default 1.2', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const header = superdoc.page.locator('.superdoc-page-header').first();
  await header.waitFor({ state: 'visible', timeout: 15_000 });

  // Double-click to enter header edit mode
  const box = await header.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  const editorHost = superdoc.page.locator('.superdoc-header-editor-host').first();
  await editorHost.waitFor({ state: 'visible', timeout: 10_000 });

  // The ProseMirror element inside the header editor should have lineHeight: 1
  // (matching OOXML Header style w:line="240" w:lineRule="auto" = 240/240 = 1.0)
  const pm = editorHost.locator('.ProseMirror');
  await expect(pm).toHaveCSS('line-height', /^\d+(\.\d+)?px$/);

  const lineHeight = await pm.evaluate((el) => el.style.lineHeight);
  expect(lineHeight).toBe('1');
});

test('footer editor uses line-height 1, not the default 1.2', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const footer = superdoc.page.locator('.superdoc-page-footer').first();
  await footer.scrollIntoViewIfNeeded();
  await footer.waitFor({ state: 'visible', timeout: 15_000 });

  // Double-click to enter footer edit mode
  const box = await footer.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  const editorHost = superdoc.page.locator('.superdoc-footer-editor-host').first();
  await editorHost.waitFor({ state: 'visible', timeout: 10_000 });

  const pm = editorHost.locator('.ProseMirror');
  const lineHeight = await pm.evaluate((el) => el.style.lineHeight);
  expect(lineHeight).toBe('1');
});

test('body editor still uses default line-height 1.2', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // The body editor's ProseMirror should retain the default 1.2 line height
  const lineHeight = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const pm = editor?.view?.dom as HTMLElement | undefined;
    return pm?.style.lineHeight;
  });
  expect(lineHeight).toBe('1.2');
});

test('header content is not clipped when entering edit mode', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const header = superdoc.page.locator('.superdoc-page-header').first();
  await header.waitFor({ state: 'visible', timeout: 15_000 });

  // Double-click to enter header edit mode
  const box = await header.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  const editorHost = superdoc.page.locator('.superdoc-header-editor-host').first();
  await editorHost.waitFor({ state: 'visible', timeout: 10_000 });

  // The ProseMirror content should not overflow the editor host container
  const overflow = await editorHost.evaluate((host) => {
    const pm = host.querySelector('.ProseMirror') as HTMLElement;
    if (!pm) return { error: 'no PM' };
    return {
      pmScrollHeight: pm.scrollHeight,
      pmOffsetHeight: pm.offsetHeight,
      hostHeight: host.offsetHeight,
      isOverflowing: pm.scrollHeight > host.offsetHeight,
    };
  });
  expect(overflow).not.toHaveProperty('error');
  expect(overflow.isOverflowing).toBe(false);
});
