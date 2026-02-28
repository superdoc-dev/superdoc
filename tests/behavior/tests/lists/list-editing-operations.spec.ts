import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

const MARKER = '.superdoc-paragraph-marker';

test.describe('list editing operations', () => {
  test('delete a list item by selecting and backspacing', async ({ superdoc }) => {
    // Create a 3-item bullet list
    await superdoc.type('- item one');
    await superdoc.newLine();
    await superdoc.type('item two');
    await superdoc.newLine();
    await superdoc.type('item three');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 3);

    // Select from the end of "item one" through the end of "item two" to merge/delete the middle item
    const endOfFirst = await superdoc.findTextPos('item one');
    const endOfSecond = await superdoc.findTextPos('item two');
    await superdoc.setTextSelection(endOfFirst + 'item one'.length, endOfSecond + 'item two'.length);
    await superdoc.waitForStable();
    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 2);
    await superdoc.assertTextContains('item one');
    await superdoc.assertTextContains('item three');
  });

  test('pressing Enter before first list item inserts empty item', async ({ superdoc }) => {
    // Create a 2-item ordered list
    await superdoc.type('1. first');
    await superdoc.newLine();
    await superdoc.type('second');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 2);

    // Place cursor at start of first item and press Enter
    await superdoc.clickOnLine(0, 10);
    await superdoc.waitForStable();
    await superdoc.press('Home');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 3);
  });

  test('pressing Enter inside a list item splits it', async ({ superdoc }) => {
    await superdoc.type('- HelloWorld');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 1);

    // Position cursor between "Hello" and "World"
    const pos = await superdoc.findTextPos('World');
    await superdoc.setTextSelection(pos);
    await superdoc.newLine();
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 2);
    await superdoc.assertTextContains('Hello');
    await superdoc.assertTextContains('World');
  });

  test('pressing Enter after last item adds new item', async ({ superdoc }) => {
    await superdoc.type('- alpha');
    await superdoc.newLine();
    await superdoc.type('beta');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 2);

    // Press Enter after last item and type
    await superdoc.newLine();
    await superdoc.type('gamma');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 3);
    await superdoc.assertTextContains('gamma');
  });

  test('pressing Enter twice exits the list', async ({ superdoc }) => {
    await superdoc.type('- only item');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 1);

    // Press Enter twice to exit list
    await superdoc.newLine();
    await superdoc.newLine();
    await superdoc.type('outside list');
    await superdoc.waitForStable();

    // Should still have just 1 marker (the original item)
    await superdoc.assertElementCount(MARKER, 1);
    await superdoc.assertTextContains('outside list');
  });

  test('insert text programmatically into a list item', async ({ superdoc }) => {
    await superdoc.type('- existing');
    await superdoc.waitForStable();

    // Insert text via PM transaction (reliable cross-browser)
    await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      const { state } = editor;
      editor.view.dispatch(state.tr.insertText(' pasted'));
    });
    await superdoc.waitForStable();

    await superdoc.assertTextContains('pasted');
    await superdoc.assertElementCount(MARKER, 1);
  });

  test('turn existing text paragraphs into a list', async ({ superdoc }) => {
    await superdoc.type('line one');
    await superdoc.newLine();
    await superdoc.type('line two');
    await superdoc.newLine();
    await superdoc.type('line three');
    await superdoc.waitForStable();

    // Select all and click numbered list button
    await superdoc.selectAll();
    await superdoc.waitForStable();
    await superdoc.page.locator('[data-item="btn-numberedlist"]').click();
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 3);
    await superdoc.assertTextContains('line one');
    await superdoc.assertTextContains('line two');
    await superdoc.assertTextContains('line three');
  });
});
