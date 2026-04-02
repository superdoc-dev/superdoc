import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentViaUI } from '../../helpers/comments.js';
import { clickAtDocPos } from '../../helpers/editor-interactions.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('SD-2442: clicking inside commented text places a caret and allows typing', async ({ superdoc }) => {
  await superdoc.type('alpha beta gamma');
  await superdoc.waitForStable();

  await addCommentViaUI(superdoc, {
    textToSelect: 'beta gamma',
    commentText: 'outer comment',
  });

  await superdoc.assertCommentHighlightExists({ text: 'beta gamma' });

  const betaStart = await superdoc.findTextPos('beta');
  const insertionPos = betaStart + 2;

  await superdoc.clickOnLine(0, 5);
  await superdoc.waitForStable();
  await expect((await superdoc.getSelection()).from).not.toBe(insertionPos);

  await clickAtDocPos(superdoc.page, insertionPos);
  await superdoc.waitForStable();

  await superdoc.assertSelection(insertionPos);

  await superdoc.page.keyboard.type('X');
  await superdoc.waitForStable();

  await expect.poll(() => superdoc.getTextContent()).toContain('alpha beXta gamma');
});
