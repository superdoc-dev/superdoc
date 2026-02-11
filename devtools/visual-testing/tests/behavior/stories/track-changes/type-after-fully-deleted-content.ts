import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;

/**
 * SD-1624: Fix cursor position after typing in fully track-deleted content
 *
 * Bug: When ALL content in a text node is track-deleted and the user types new
 * text in suggesting mode, characters appeared in reverse order (e.g., typing
 * "TEST" produced "TSET").
 *
 * Root cause: Each new character was inserted after the deletion span (correct),
 * but the cursor was mapped back to the original position (incorrect), so each
 * subsequent character was inserted at the same position.
 *
 * This test recreates the exact bug scenario:
 * 1. Create content, then fully delete it in suggesting mode
 * 2. Type new text where the bug would cause reverse character order
 * 3. Visual milestones verify correct text order and cursor position
 */
export default defineStory({
  name: 'type-after-fully-deleted-content',
  description: 'Test cursor positioning when typing after fully track-deleted content',
  tickets: ['SD-1624'],
  startDocument: null,
  layout: true,
  comments: 'off',
  hideCaret: false,
  hideSelection: false,

  async run(_page, helpers): Promise<void> {
    const { type, press, selectAll, setDocumentMode, waitForStable, milestone } = helpers;

    // Step 1: Create initial content
    await type('Hello World');
    await waitForStable(WAIT_MS);
    await milestone('initial-text', 'Document with initial text before deletion');

    // Step 2: Enable suggesting mode (required to reproduce the bug)
    await setDocumentMode('suggesting');
    await waitForStable(WAIT_MS);

    // Step 3: Select all text
    await selectAll();
    await waitForStable(WAIT_MS);
    await milestone('text-selected', 'All text selected, ready for deletion');

    // Step 4: Delete all content (creates fully track-deleted state)
    await press('Backspace');
    await waitForStable(WAIT_MS);
    await milestone('fully-deleted', 'All content is now track-deleted (strikethrough)');

    // Step 5: Type new text - the bug would produce "TSET" instead of "TEST"
    await type('TEST');
    await waitForStable(WAIT_MS);
    await milestone('after-typing-test', 'After typing "TEST" - should show "TEST" not "TSET", cursor at end');
  },
});
