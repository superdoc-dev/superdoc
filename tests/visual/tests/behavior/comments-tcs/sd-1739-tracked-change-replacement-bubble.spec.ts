import { test } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'on', trackChanges: true, hideSelection: false } });

test('@behavior SD-1739 tracked change replacement does not duplicate text in bubble', async ({ superdoc }) => {
  await superdoc.type('editing');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');

  // Select "editing" and replace with "redlining"
  await superdoc.tripleClickLine(0);
  await superdoc.type('redlining');
  await superdoc.waitForStable();

  // The bubble should show "Added: redlining" not "Added: redliningg"
  await superdoc.screenshot('tracked-change-replacement-bubble');
});
