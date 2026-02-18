import { defineStory } from '@superdoc-testing/helpers';

const WAIT_ACTION_MS = 300;

export default defineStory({
  name: 'undo-redo',
  description: 'Type text, undo it, then redo it.',
  startDocument: null,

  async run(_page, helpers): Promise<void> {
    const { type, newLine, undo, redo, waitForStable, milestone } = helpers;

    await type('First paragraph.');
    await newLine();
    await type('Second paragraph.');
    await waitForStable(WAIT_ACTION_MS);

    await milestone('before-undo', 'Typed two paragraphs before undo.');

    await undo();
    await waitForStable(WAIT_ACTION_MS);
    await milestone('after-undo', 'Undo removed the second paragraph.');

    await redo();
    await waitForStable(WAIT_ACTION_MS);
    await milestone('after-redo', 'Redo restored the second paragraph.');
  },
});
