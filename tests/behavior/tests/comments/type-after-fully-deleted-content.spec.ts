import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, getDocumentText, listTrackChanges } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('typing after fully track-deleted content produces correct text', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Hello World');
  await superdoc.waitForStable();
  await expect.poll(() => getDocumentText(superdoc.page)).toBe('Hello World');

  // Switch to suggesting mode
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select all and delete
  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.press('Backspace');
  await superdoc.waitForStable();

  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'delete' })).total)
    .toBeGreaterThanOrEqual(1);

  // Type new text — a cursor-positioning bug would produce "TSET" instead of "TEST"
  await superdoc.type('TEST');
  await superdoc.waitForStable();

  // Assert "TEST" appears in the document (not "TSET")
  await expect.poll(() => getDocumentText(superdoc.page)).toContain('TEST');
  await expect.poll(() => getDocumentText(superdoc.page)).not.toContain('TSET');

  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total)
    .toBeGreaterThanOrEqual(1);

  await superdoc.snapshot('type-after-fully-deleted-content');
});
