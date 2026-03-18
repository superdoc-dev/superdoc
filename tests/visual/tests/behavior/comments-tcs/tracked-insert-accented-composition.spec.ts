import { test, expect } from '../../fixtures/superdoc.js';
import { getMarkedText } from '../../../../behavior/helpers/tracked-changes.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'off',
    trackChanges: true,
    hideCaret: true,
    hideSelection: true,
  },
});

const PLAIN_WORD = 'resume';
const ACCENTED_WORD = 'résumé';
const FULL_TEXT = `${PLAIN_WORD} ${ACCENTED_WORD}`;

test('@behavior suggesting inline composition keeps accented word fully tracked', async ({ superdoc }) => {
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type(`${PLAIN_WORD} `);
  await superdoc.waitForStable();

  await superdoc.composeText(ACCENTED_WORD);
  await superdoc.waitForStable();

  await expect.poll(() => superdoc.page.evaluate(() => (window as any).editor.state.doc.textContent)).toBe(FULL_TEXT);
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe(FULL_TEXT);
  await expect(superdoc.page.locator('.track-insert-dec').filter({ hasText: FULL_TEXT }).first()).toBeVisible();

  await superdoc.screenshot('behavior-comments-tcs-tracked-insert-accented-composition');
});
