import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../../../test-corpus/comments-tcs/GD Tracked style change.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Tracked style change fixture is not available.');

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

async function loadDocumentAndWait(superdoc: SuperDocFixture, filePath: string): Promise<void> {
  await superdoc.loadDocument(filePath);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);
}

async function assertTrackedStyleChangeState(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.assertTextContains('Here is some text with updated styles');
  await superdoc.assertTrackedChangeExists('format');
  await superdoc.assertTextHasMarks('styles', ['bold', 'italic']);
  await superdoc.assertTextLacksMarks('Here is some text with updated', ['bold', 'italic']);

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBe(1);
  await expect.poll(async () => (await listTrackChanges(superdoc.page, { type: 'format' })).total).toBe(1);
  await expect.poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total).toBe(0);
  await expect.poll(async () => (await listTrackChanges(superdoc.page, { type: 'delete' })).total).toBe(0);

  const formatChanges = await listTrackChanges(superdoc.page, { type: 'format' });
  expect(formatChanges.changes).toHaveLength(1);
  expect(formatChanges.changes[0]?.excerpt).toBe('styles');
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

test('SD-1460 tracked format change survives DOCX export and re-import', async ({ superdoc }, testInfo) => {
  await loadDocumentAndWait(superdoc, DOC_PATH);
  await assertTrackedStyleChangeState(superdoc);

  const exportedPath = testInfo.outputPath('sd-1460-tracked-style-change-roundtrip.docx');
  await exportCurrentDocument(superdoc, exportedPath);

  await loadDocumentAndWait(superdoc, exportedPath);
  await assertTrackedStyleChangeState(superdoc);
});
