import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;

export default defineStory({
  name: 'indent-list-items',
  description: 'Test creating, indenting, and outdenting list items',
  tickets: ['SD-1594'],
  startDocument: null,
  layout: true,
  hideCaret: true,

  async run(_page, helpers): Promise<void> {
    const { type, press, waitForStable, milestone } = helpers;

    // 1. Type '1. ' to trigger list creation
    await type('1. ');
    await waitForStable(WAIT_MS);
    await milestone('list-created', 'List marker visible after typing "1. "');

    // 2. Type 'item 1'
    await type('item 1');
    await waitForStable(WAIT_MS);
    await milestone('item-1-typed', 'First list item typed');

    // 3. Hit Enter - should show "2."
    await press('Enter');
    await waitForStable(WAIT_MS);
    await milestone('after-enter-1', 'After Enter - "2." marker should show');

    // 4. Type 'item 2'
    await type('item 2');
    await waitForStable(WAIT_MS);
    await milestone('item-2-typed', 'Second list item typed');

    // 5. Hit Enter (should show "3.") then Tab (should become "a.")
    await press('Enter');
    await waitForStable(WAIT_MS);
    await milestone('after-enter-2', 'After Enter - "3." marker should show');

    await press('Tab');
    await waitForStable(WAIT_MS);
    await milestone('after-indent', 'After Tab - "3." becomes "a." (indented)');

    // 6. Type 'item a'
    await type('item a');
    await waitForStable(WAIT_MS);
    await milestone('item-a-typed', 'Indented item "a" typed');

    // 7. Hit Enter - should show "b."
    await press('Enter');
    await waitForStable(WAIT_MS);
    await milestone('after-enter-3', 'After Enter - "b." marker should show');

    // 8. Hit Shift+Tab - "b." should become "3."
    await _page.keyboard.press('Shift+Tab');
    await waitForStable(WAIT_MS);
    await milestone('after-outdent', 'After Shift+Tab - "b." becomes "3." (outdented)');

    // 9. Type 'item 3'
    await type('item 3');
    await waitForStable(WAIT_MS);
    await milestone('item-3-typed', 'Final item "3" typed after outdent');
  },
});
