/**
 * Story template — copy this file into the appropriate category folder:
 *
 *   editing/          Typing, undo/redo, selection, clipboard
 *   tables/           Table insertion, row/column operations
 *   formatting/       Bold, italic, underline, text styling
 *   comments/         Comment insertion, editing, nesting
 *   track-changes/    Track changes mode, accept/reject
 *   field-annotations/ Field highlighting, carets, annotations
 *   headers/          Header/footer editing
 *   lists/            List indentation, markers, nesting
 *   search/           Find & replace
 *   importing/        Document import behavior
 */
import { defineStory } from '@superdoc-testing/helpers';

const WAIT_SHORT_MS = 200;
const WAIT_LONG_MS = 600;

export default defineStory({
  name: 'story-name',
  description: 'One sentence describing the purpose of the story.',
  startDocument: null,
  includeComments: false,

  async run(_page, helpers): Promise<void> {
    const { step, type, newLine, waitForStable, milestone } = helpers;

    await step('Type the first line', async () => {
      await type('Hello from SuperDoc.');
      await newLine();
    });

    await step('Type the second line', async () => {
      await type('This is the second line.');
      await waitForStable(WAIT_SHORT_MS);
    });

    await step('Capture', async () => {
      await waitForStable(WAIT_LONG_MS);
      await milestone('after-typing', 'Example snapshot after typing two lines.');
    });
  },
});
