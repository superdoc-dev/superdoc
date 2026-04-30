import { test, expect } from '../../fixtures/superdoc.js';
import { H_F_NORMAL_DOC_PATH as DOC_PATH } from '../../helpers/story-fixtures.js';

test.use({ config: { showCaret: true, showSelection: true } });

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

  const pm = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"] .ProseMirror')
    .first();
  const lineHeight = await pm.evaluate((el) => (el as HTMLElement).style.lineHeight);
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

  const pm = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"] .ProseMirror')
    .first();
  const lineHeight = await pm.evaluate((el) => (el as HTMLElement).style.lineHeight);
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

test('header content remains visible while hidden-host editing is active', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const header = superdoc.page.locator('.superdoc-page-header').first();
  await header.waitFor({ state: 'visible', timeout: 15_000 });
  const beforeBox = await header.boundingBox();
  expect(beforeBox).toBeTruthy();

  // Double-click to enter header edit mode
  const box = await header.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  const storyHost = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"]')
    .first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  const afterBox = await header.boundingBox();
  expect(afterBox).toBeTruthy();
  expect(afterBox!.height).toBeGreaterThan(0);
  expect(Math.abs((afterBox?.height ?? 0) - (beforeBox?.height ?? 0))).toBeLessThan(1);
});
