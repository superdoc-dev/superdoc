import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, getDocumentText, listTrackChanges } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(
  __dirname,
  '../../../../packages/super-editor/src/tests/data/sd-1707-list-enter-track-changes-with-br.docx',
);

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('SD-1707 list item with trailing break keeps typed text in one tracked change', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const listText = 'Body copy for repro';
  const listTextPos = await superdoc.findTextPos(listText);
  await superdoc.setTextSelection(listTextPos + listText.length);
  await superdoc.waitForStable();

  await superdoc.newLine();
  await superdoc.waitForStable();

  await superdoc.type('abcdef');
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toContain('abcdef');
  await expect.poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total).toBe(1);

  const inserts = await listTrackChanges(superdoc.page, { type: 'insert' });
  expect(inserts.changes?.[0]?.excerpt).toBe('abcdef');
});
