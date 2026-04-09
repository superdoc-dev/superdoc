import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, navigateToEntity } from '../../helpers/document-api.js';
import type { SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(
  __dirname,
  '../../../../packages/super-editor/src/editors/v1/tests/data/advanced-text.docx',
);

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

async function loadDocumentAndWait(superdoc: SuperDocFixture, filePath: string): Promise<void> {
  await superdoc.loadDocument(filePath);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);
}

async function exportCurrentDocument(superdoc: SuperDocFixture, outputPath: string): Promise<void> {
  const exportedBytes = await superdoc.page.evaluate(async () => {
    const exported = await (window as any).editor.exportDocx({ isFinalDoc: false });

    if (exported instanceof Blob) {
      return Array.from(new Uint8Array(await exported.arrayBuffer()));
    }
    if (exported instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(exported));
    }
    if (ArrayBuffer.isView(exported)) {
      return Array.from(new Uint8Array(exported.buffer, exported.byteOffset, exported.byteLength));
    }

    throw new Error(`Unexpected exportDocx() result: ${Object.prototype.toString.call(exported)}`);
  });

  await writeFile(outputPath, Buffer.from(exportedBytes));
}

test.describe('Bookmark round-trip stability', () => {
  test('@behavior bookmark survives DOCX export and re-import', async ({ superdoc }, testInfo) => {
    // --- Session 1: Create bookmark ---
    await loadDocumentAndWait(superdoc, DOC_PATH);

    const bookmarkName = 'stable-ref-roundtrip';

    // Find a text range to anchor the bookmark
    const insertResult = await superdoc.page.evaluate((name) => {
      const docApi = (window as any).editor?.doc;
      if (!docApi?.bookmarks?.insert || !docApi?.find) {
        throw new Error('Document API (bookmarks/find) is unavailable.');
      }

      const findResult = docApi.find({
        select: { type: 'text', pattern: 'Introduction', mode: 'contains' },
        limit: 1,
      });
      const item = findResult?.items?.[0];
      const blocks = Array.isArray(item?.blocks) ? item.blocks : [];
      const block = blocks[0];
      if (!block?.blockId || typeof block?.range?.start !== 'number') {
        throw new Error('Unable to find "Introduction" text in the document.');
      }

      return docApi.bookmarks.insert({
        name,
        at: {
          kind: 'text',
          segments: [
            { kind: 'text', blockId: block.blockId, range: { start: block.range.start, end: block.range.end } },
          ],
        },
      });
    }, bookmarkName);

    expect(insertResult.success).toBe(true);
    expect(insertResult.bookmark).toEqual(
      expect.objectContaining({ kind: 'entity', entityType: 'bookmark', name: bookmarkName }),
    );

    // Verify bookmark exists before export
    const preExportList = await superdoc.page.evaluate(() => {
      return (window as any).editor.doc.bookmarks.list();
    });
    const preExportNames: string[] = (preExportList?.items ?? []).map((item: any) => item?.name ?? item?.address?.name);
    expect(preExportNames).toContain(bookmarkName);

    // --- Export ---
    const exportedPath = testInfo.outputPath('bookmark-roundtrip.docx');
    await exportCurrentDocument(superdoc, exportedPath);

    // --- Session 2: Reimport and verify ---
    await loadDocumentAndWait(superdoc, exportedPath);

    // Verify bookmark persists after round-trip
    const postImportList = await superdoc.page.evaluate(() => {
      return (window as any).editor.doc.bookmarks.list();
    });
    const postImportNames: string[] = (postImportList?.items ?? []).map(
      (item: any) => item?.name ?? item?.address?.name,
    );
    expect(postImportNames).toContain(bookmarkName);

    // Verify bookmark can be resolved by name
    const getResult = await superdoc.page.evaluate((name) => {
      return (window as any).editor.doc.bookmarks.get({
        target: { kind: 'entity', entityType: 'bookmark', name },
      });
    }, bookmarkName);

    expect(getResult).toEqual(
      expect.objectContaining({
        name: bookmarkName,
        address: expect.objectContaining({
          kind: 'entity',
          entityType: 'bookmark',
          name: bookmarkName,
        }),
      }),
    );

    // Verify navigation works with the address from get()
    const navResult = await navigateToEntity(superdoc.page, getResult.address);
    expect(navResult).toBe(true);
  });
});
