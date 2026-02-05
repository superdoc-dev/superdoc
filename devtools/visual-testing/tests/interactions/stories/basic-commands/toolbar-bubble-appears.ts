import { defineStory } from '@superdoc-testing/helpers';

const WAIT_SHORT_MS = 200;
const WAIT_TYPED_MS = 300;
const MOVE_TO_WORD = 5;
const SELECT_CHARS = 4;

export default defineStory({
  name: 'toolbar-bubble-appears',
  description: 'Select a word to show the toolbar bubble, then move the caret.',
  startDocument: null,
  includeComments: true,

  async run(_page, helpers): Promise<void> {
    const { type, press, pressShortcut, pressTimes, waitForStable, milestone } = helpers;

    await type('I am some text');
    await waitForStable(WAIT_TYPED_MS);
    await milestone('typed', 'Typed "I am some text".');

    await pressShortcut('ArrowLeft');
    await pressTimes('ArrowRight', MOVE_TO_WORD);
    await pressTimes('Shift+ArrowRight', SELECT_CHARS);
    await waitForStable(WAIT_SHORT_MS);
    await milestone('select-some', 'Selected the word "some" to show the toolbar bubble.');

    await pressTimes('ArrowRight', 2);
    await waitForStable(WAIT_SHORT_MS);
    await milestone('caret-in-text', 'Moved the caret to clear the selection.');
  },
});
