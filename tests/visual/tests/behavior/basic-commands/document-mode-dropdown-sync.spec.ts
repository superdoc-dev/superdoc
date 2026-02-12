import { test } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

test('@behavior document mode dropdown syncs on mode change', async ({ superdoc }) => {
  await superdoc.waitForStable();
  await superdoc.screenshot('mode-initial-editing');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();
  await superdoc.screenshot('mode-suggesting');

  await superdoc.setDocumentMode('viewing');
  await superdoc.waitForStable();
  await superdoc.screenshot('mode-viewing');

  await superdoc.setDocumentMode('editing');
  await superdoc.waitForStable();
  await superdoc.screenshot('mode-back-to-editing');
});
