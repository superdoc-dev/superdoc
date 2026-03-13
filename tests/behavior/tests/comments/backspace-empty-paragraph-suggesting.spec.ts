import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, getDocumentText } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'off', trackChanges: true } });

test('backspace removes empty paragraphs in suggesting mode', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Hello World');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();
  await superdoc.assertDocumentMode('suggesting');

  // Enter creates an empty paragraph after the text.
  await superdoc.press('Enter');
  await superdoc.waitForStable();
  await superdoc.assertLineCount(2);

  // Backspace should remove the empty paragraph and return to one line.
  await superdoc.press('Backspace');
  await superdoc.waitForStable();
  await superdoc.assertLineCount(1);
  await expect.poll(() => getDocumentText(superdoc.page)).toBe('Hello World');

  // Regression flow: Enter -> Enter -> Backspace -> Backspace should join back.
  await superdoc.press('Enter');
  await superdoc.waitForStable();
  await superdoc.press('Enter');
  await superdoc.waitForStable();
  await superdoc.assertLineCount(3);

  await superdoc.press('Backspace');
  await superdoc.waitForStable();
  await superdoc.assertLineCount(2);

  await superdoc.press('Backspace');
  await superdoc.waitForStable();
  await superdoc.assertLineCount(1);
  await expect.poll(() => getDocumentText(superdoc.page)).toBe('Hello World');
});
