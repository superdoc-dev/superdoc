import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;

export default defineStory({
  name: 'document-mode-dropdown-sync',
  description: 'Test that document mode dropdown label/icon syncs when mode changes.',
  tickets: ['SD-1662'],
  startDocument: null,
  layout: true,
  toolbar: 'full',

  async run(_page, helpers): Promise<void> {
    const { setDocumentMode, waitForStable, milestone } = helpers;

    // Initial state - should show "Editing" mode
    await waitForStable(WAIT_MS);
    await milestone('initial-editing', 'Initial state with dropdown showing Editing mode.');

    // Change to suggesting mode
    await setDocumentMode('suggesting');
    await waitForStable(WAIT_MS);
    await milestone('changed-to-suggesting', 'Dropdown label updated to Suggesting.');

    // Change to viewing mode
    await setDocumentMode('viewing');
    await waitForStable(WAIT_MS);
    await milestone('changed-to-viewing', 'Dropdown label updated to Viewing.');

    // Change back to editing mode
    await setDocumentMode('editing');
    await waitForStable(WAIT_MS);
    await milestone('changed-back-to-editing', 'Dropdown label updated back to Editing.');
  },
});
