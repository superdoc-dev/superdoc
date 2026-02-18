import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;
const START_DOC = 'other/sd-1778-apply-font.docx';
const FONT_NAME = 'Courier New';

export default defineStory({
  name: 'apply-font',
  description: 'Select all content and apply the Courier New font.',
  tickets: ['SD-1778'],
  startDocument: START_DOC,
  layout: true,
  toolbar: 'full',
  waitForFonts: true,

  async run(_, helpers): Promise<void> {
    const { selectAll, focus, executeCommand, waitForStable, milestone } = helpers;
    await waitForStable(WAIT_MS);
    await focus();

    await selectAll();

    await waitForStable(WAIT_MS);
    await executeCommand('setFontFamily', FONT_NAME);
    await waitForStable(WAIT_MS);
    await milestone('font-applied', `Applied ${FONT_NAME} to document.`);
  },
});
