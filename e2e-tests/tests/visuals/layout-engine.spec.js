import { test, expect } from '@playwright/test';
import config from '../../test-config.js';
import { goToPageAndWaitForEditor } from '../helpers.js';
import { loadDocumentsFromFolders } from './doc-loader.js';

// Layout-engine-only visual snapshots (pagination/layout on).
// Documents are auto-discovered from configured folders.

const shouldRun = process.env.LAYOUT_ENGINE === '1';

if (!shouldRun) {
  test.describe.skip('layout engine visuals (layout=1)', () => {
    test('skipped: set LAYOUT_ENGINE=1 to run these tests', () => {});
  });
} else {
  const ignore = new Set(config.ignoreDocuments || []);

  const folders = [
    { key: 'basic-documents', folder: config.basicDocumentsFolder },
    { key: 'comments-documents', folder: config.commentsDocumentsFolder },
  ];

  const layoutEngineDocs = loadDocumentsFromFolders(folders, ignore);

  test.describe('layout engine visuals (layout=1)', () => {
    layoutEngineDocs.forEach(({ id, filePath }) => {
      test(id, async ({ page }) => {
        test.setTimeout(50_000);

        await goToPageAndWaitForEditor(page, { layout: 1 });
        await page.locator('input[type="file"]').setInputFiles(filePath);

        await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
          polling: 100,
          timeout: 10_000,
        });

        await expect(page).toHaveScreenshot({
          name: `${id}.png`,
          fullPage: true,
          timeout: 30_000,
        });
      });
    });

    const loadStructuredContentDocument = async (page) => {
      const superEditor = await goToPageAndWaitForEditor(page, { layout: 1 });
      const fileInput = page.locator('input[type="file"]');

      await fileInput.setInputFiles('./test-data/structured-content/sdt-basic.docx');

      await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
        polling: 100,
        timeout: 10_000,
      });

      await page.waitForFunction(() => {
        const toolbar = document.querySelector('#toolbar');
        return toolbar && toolbar.children.length > 0;
      });

      return superEditor;
    };

    test('structured content: inline selection (sdt-basic.docx)', async ({ page }) => {
      const superEditor = await loadStructuredContentDocument(page);
      const inlineStructuredContent = page.locator('.superdoc-structured-content-inline').first();

      await expect(inlineStructuredContent).toBeVisible();
      await inlineStructuredContent.scrollIntoViewIfNeeded();
      await inlineStructuredContent.hover();
      await inlineStructuredContent.click({ force: true });
      await expect(inlineStructuredContent).toHaveClass(/ProseMirror-selectednode/);
      await page.waitForFunction(() => {
        return document.querySelectorAll('.superdoc-structured-content-block.sdt-group-hover').length === 0;
      });
      const inlineEditorBox = await superEditor.boundingBox();
      if (inlineEditorBox) {
        await page.mouse.move(inlineEditorBox.x - 10, inlineEditorBox.y - 10);
      }

      await expect(superEditor).toHaveScreenshot();
    });

    test('structured content: block selection (sdt-basic.docx)', async ({ page }) => {
      const superEditor = await loadStructuredContentDocument(page);
      const blockStructuredContent = page.locator('.superdoc-structured-content-block').first();

      await expect(blockStructuredContent).toBeVisible();
      await blockStructuredContent.scrollIntoViewIfNeeded();
      await blockStructuredContent.hover();
      await blockStructuredContent.click({ force: true });
      await expect(blockStructuredContent).toHaveClass(/ProseMirror-selectednode/);
      const blockEditorBox = await superEditor.boundingBox();
      if (blockEditorBox) {
        await page.mouse.move(blockEditorBox.x - 10, blockEditorBox.y - 10);
      }
      await page.waitForFunction(
        () => {
          const block = document.querySelector('.superdoc-structured-content-block');
          if (block?.matches(':hover')) return false;
          return document.querySelectorAll('.superdoc-structured-content-block.sdt-group-hover').length === 0;
        },
        null,
        { timeout: 2_000 },
      );

      await expect(superEditor).toHaveScreenshot();
    });
  });
}
