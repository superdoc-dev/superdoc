import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

const MARKER = '.superdoc-paragraph-marker';

test.describe('lists in complex contexts', () => {
  test('add a table inside a list item', async ({ superdoc }) => {
    // Create a list item
    await superdoc.type('- item with table');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 1);

    // Insert a table via command
    await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await superdoc.waitForStable();

    // Table should exist in the document
    await superdoc.assertTableExists(2, 2);

    // List marker should still be present
    const markerCount = await superdoc.page.locator(MARKER).count();
    expect(markerCount).toBeGreaterThanOrEqual(1);
  });

  test('create list inside a table cell', async ({ superdoc }) => {
    // Insert a table first
    await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await superdoc.waitForStable();

    // Type a bullet list trigger inside the first cell
    await superdoc.type('- cell list item');
    await superdoc.waitForStable();

    // Should have at least one list marker
    await superdoc.assertElementExists(MARKER);
    await superdoc.assertTextContains('cell list item');
  });

  test('inline images within list items', async ({ superdoc }) => {
    // Create a list item
    await superdoc.type('- image item');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 1);

    // Insert a small base64 image via editor command
    await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      const { schema, state } = editor;
      const { tr, selection } = state;
      // 1x1 transparent PNG
      const src =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const imageNode = schema.nodes.image.create({ src });
      editor.view.dispatch(tr.insert(selection.from, imageNode));
    });
    await superdoc.waitForStable();

    // Image should exist in the document
    await superdoc.assertElementExists('img');

    // List marker should still be present
    await superdoc.assertElementCount(MARKER, 1);
  });
});
