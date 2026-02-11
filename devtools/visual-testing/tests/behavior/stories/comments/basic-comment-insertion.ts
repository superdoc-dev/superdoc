import { defineStory } from '@superdoc-testing/helpers';

const WAIT_SHORT_MS = 200;
const WAIT_MEDIUM_MS = 300;
const SELECT_WORLD_CHARS = 5;
const SELECT_ELL_CHARS = 3;

export default defineStory({
  name: 'basic-comment-insertion',
  description: 'Type text, select "world", then insert a comment via command.',
  startDocument: null,
  includeComments: true,

  async run(_page, helpers): Promise<void> {
    const {
      type,
      newLine,
      waitForStable,
      milestone,
      press,
      pressShortcut,
      pressTimes,
      executeCommand,
      setDocumentMode,
    } = helpers;

    await type('hello');
    await newLine();
    await newLine();
    await type('world');
    await waitForStable(WAIT_SHORT_MS);
    await milestone('typed', "Typed 'hello' + blank line + 'world'");

    await setDocumentMode('suggesting');
    await waitForStable(WAIT_SHORT_MS);

    await pressShortcut('ArrowRight');
    await pressTimes('Shift+ArrowLeft', SELECT_WORLD_CHARS);
    await waitForStable(WAIT_SHORT_MS);
    await milestone('select-world', "Selected the word 'world'");

    await executeCommand('addComment', { text: 'my comment text' });
    await waitForStable(WAIT_MEDIUM_MS);
    await milestone('comment-added', 'Inserted a comment on the selection');

    await pressShortcut('ArrowLeft');
    await press('ArrowRight');
    await pressTimes('Shift+ArrowRight', SELECT_ELL_CHARS);
    await waitForStable(100);
    await milestone('select-ell', "Selected 'ell' within 'hello'");

    await type('change');
    await waitForStable(WAIT_SHORT_MS);
    await milestone('after-change', "Typed 'change' to replace the selection");
  },
});
