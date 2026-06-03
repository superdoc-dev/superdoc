import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

/**
 * Regression test for the multi-node cancel scenario:
 * When bold is toggled on then off across nodes with different pre-existing marks,
 * no ghost TrackFormat marks should remain.
 */
test('no ghost TrackFormat after toggling bold on then off across mixed-mark nodes', async ({ superdoc }) => {
  // Type two words — we'll make only the second one italic to create mixed marks
  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  // Select "world" and make it italic in editing mode
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    // Find "world" position (after "Hello ")
    let worldFrom = 0;
    let worldTo = 0;
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text?.includes('world')) {
        const offset = node.text.indexOf('world');
        worldFrom = pos + offset;
        worldTo = worldFrom + 'world'.length;
      }
    });
    editor.commands.setTextSelection({ from: worldFrom, to: worldTo });
    editor.commands.toggleItalic();
  });
  await superdoc.waitForStable();

  // Switch to suggesting mode
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select all and toggle bold ON
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => (window as any).editor.commands.toggleBold());
  await superdoc.waitForStable();

  // Verify a format tracked change was created
  await superdoc.assertTrackedChangeExists('format');

  // Toggle bold OFF (cancel the suggestion)
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => (window as any).editor.commands.toggleBold());
  await superdoc.waitForStable();

  // No track-format decorations should remain — the cancel was a no-op
  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);

  // Text should be unchanged
  await superdoc.assertTextContent('Hello world');

  // "world" should still have italic (it was never touched)
  await superdoc.assertTextHasMarks('world', ['italic']);

  // Neither word should have bold
  await superdoc.assertTextLacksMarks('Hello', ['bold']);
  await superdoc.assertTextLacksMarks('world', ['bold']);
});
