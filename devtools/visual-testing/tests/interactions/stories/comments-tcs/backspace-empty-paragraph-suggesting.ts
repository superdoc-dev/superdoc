import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;

/**
 * SD-1810: Backspace doesn't delete empty paragraph in suggesting mode
 *
 * Bug: When a user creates a new paragraph (Enter) in suggesting mode and
 * immediately presses Backspace, nothing happens — the empty paragraph stays.
 *
 * Root cause: The track changes system intercepts the ReplaceStep via
 * replaceStep() → markDeletion(). An empty paragraph has no inline content,
 * so markDeletion finds nothing to mark and the step is silently swallowed.
 *
 * This test recreates the exact bug scenario:
 * 1. Type text, press Enter to create an empty paragraph
 * 2. Press Backspace — empty paragraph should be removed
 * 3. Also tests the Enter → Enter → Backspace → Backspace flow (paragraph join)
 */
export default defineStory({
  name: 'backspace-empty-paragraph-suggesting',
  description: 'Test Backspace on empty paragraphs and paragraph joins in suggesting mode',
  tickets: ['SD-1810'],
  startDocument: null,
  layout: true,
  comments: 'off',
  hideCaret: false,
  hideSelection: false,

  async run(_page, helpers): Promise<void> {
    const { type, press, setDocumentMode, waitForStable, milestone } = helpers;

    // Step 1: Type initial content
    await type('Hello World');
    await waitForStable(WAIT_MS);
    await milestone('initial-text', 'Document with initial text');

    // Step 2: Switch to suggesting mode
    await setDocumentMode('suggesting');
    await waitForStable(WAIT_MS);
    await milestone('suggesting-mode', 'Switched to suggesting mode');

    // Step 3: Press Enter to create an empty paragraph
    await press('Enter');
    await waitForStable(WAIT_MS);
    await milestone('after-enter', 'New empty paragraph created below');

    // Step 4: Press Backspace — should delete the empty paragraph
    await press('Backspace');
    await waitForStable(WAIT_MS);
    await milestone('after-backspace', 'Empty paragraph removed, cursor back at end of "Hello World"');

    // Step 5: Test Enter → Enter → Backspace → Backspace (join flow)
    await press('Enter');
    await waitForStable(WAIT_MS);
    await press('Enter');
    await waitForStable(WAIT_MS);
    await milestone('after-two-enters', 'Two new paragraphs created');

    // Step 6: First Backspace — removes the second empty paragraph
    await press('Backspace');
    await waitForStable(WAIT_MS);
    await milestone('after-first-backspace', 'One empty paragraph removed');

    // Step 7: Second Backspace — joins back with the original paragraph
    await press('Backspace');
    await waitForStable(WAIT_MS);
    await milestone('after-second-backspace', 'Joined back to original paragraph — cursor at end of "Hello World"');
  },
});
