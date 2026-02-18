import { defineStory } from '@superdoc-testing/helpers';

const WAIT_SHORT_MS = 200;
const START_DOC = 'test-docs/comments-tcs/tracked-changes.docx';
const TARGET_WORD = 'some';

export default defineStory({
  name: 'basic-tracked-change-existing-doc',
  description: 'Load a tracked changes document and replace a word in suggesting mode.',
  startDocument: START_DOC,
  includeComments: false,

  async run(page, helpers): Promise<void> {
    const { step, focus, waitForStable, milestone, setDocumentMode, type } = helpers;

    await step('Capture initial state', async () => {
      await page.waitForSelector('.superdoc-fragment[data-block-id="1-paragraph"] span', { timeout: 10_000 });
      await waitForStable(WAIT_SHORT_MS);
      await milestone('start', 'Document loaded before enabling suggesting mode.');
    });

    await step('Enable suggesting mode', async () => {
      await setDocumentMode('suggesting');
      await waitForStable(WAIT_SHORT_MS);
    });

    await step('Select the word "some" in the first paragraph', async () => {
      await focus();
      await page.evaluate((word) => {
        const span = document.querySelector('.superdoc-fragment[data-block-id="1-paragraph"] span');
        if (!span) throw new Error('First paragraph span not found');

        const textNode = Array.from(span.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (!textNode || !textNode.textContent) {
          throw new Error('First paragraph text node not found');
        }

        const startIndex = textNode.textContent.indexOf(word);
        if (startIndex === -1) {
          throw new Error(`Target word "${word}" not found in first paragraph`);
        }

        const range = document.createRange();
        range.setStart(textNode, startIndex);
        range.setEnd(textNode, startIndex + word.length);

        const selection = window.getSelection();
        if (!selection) throw new Error('Selection API unavailable');
        selection.removeAllRanges();
        selection.addRange(range);
      }, TARGET_WORD);
      await waitForStable(WAIT_SHORT_MS);
    });

    await step('Replace selection', async () => {
      await type('programmatically inserted');
      await waitForStable(WAIT_SHORT_MS);
      await milestone(
        'programmatically-inserted',
        'Replaced "some" with "programmatically inserted" in suggesting mode.',
      );
    });
  },
});
