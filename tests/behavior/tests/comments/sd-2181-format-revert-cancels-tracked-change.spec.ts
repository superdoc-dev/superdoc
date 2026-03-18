import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

/**
 * SD-2181: Tracked format changes should cancel out when reverted to original.
 *
 * When a format change (e.g., superscript) is applied in track changes mode
 * and then reverted (e.g., baseline), the two changes should cancel out
 * instead of leaving ghost TrackFormat marks.
 */

test('superscript then baseline revert cancels tracked format change', async ({ superdoc }) => {
  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select "world" and apply superscript
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let from = 0;
    let to = 0;
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text?.includes('world')) {
        const offset = node.text.indexOf('world');
        from = pos + offset;
        to = from + 'world'.length;
      }
    });
    editor.commands.setTextSelection({ from, to });
    editor.commands.setMark('textStyle', { vertAlign: 'superscript' });
  });
  await superdoc.waitForStable();

  // Verify tracked change was created
  await superdoc.assertTrackedChangeExists('format');

  // Revert to baseline on the same selection
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let from = 0;
    let to = 0;
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text?.includes('world')) {
        const offset = node.text.indexOf('world');
        from = pos + offset;
        to = from + 'world'.length;
      }
    });
    editor.commands.setTextSelection({ from, to });
    editor.commands.setMark('textStyle', { vertAlign: 'baseline' });
  });
  await superdoc.waitForStable();

  // No tracked format changes should remain — the revert cancels out
  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);

  // Text should be unchanged
  await superdoc.assertTextContent('Hello world');
});

test('color change then revert cancels tracked format change', async ({ superdoc }) => {
  // Type text and set initial color in editing mode
  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let from = 0;
    let to = 0;
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text?.includes('world')) {
        const offset = node.text.indexOf('world');
        from = pos + offset;
        to = from + 'world'.length;
      }
    });
    editor.commands.setTextSelection({ from, to });
    editor.commands.setColor('#112233');
  });
  await superdoc.waitForStable();

  // Switch to suggesting mode
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Change color
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let from = 0;
    let to = 0;
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text?.includes('world')) {
        const offset = node.text.indexOf('world');
        from = pos + offset;
        to = from + 'world'.length;
      }
    });
    editor.commands.setTextSelection({ from, to });
    editor.commands.setColor('#FF0000');
  });
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  // Revert to original color
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let from = 0;
    let to = 0;
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text?.includes('world')) {
        const offset = node.text.indexOf('world');
        from = pos + offset;
        to = from + 'world'.length;
      }
    });
    editor.commands.setTextSelection({ from, to });
    editor.commands.setColor('#112233');
  });
  await superdoc.waitForStable();

  // Tracked change should be gone — color is back to original
  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
});

test('bold on then off cancels tracked format change on single word', async ({ superdoc }) => {
  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select "world" and toggle bold on
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let from = 0;
    let to = 0;
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text?.includes('world')) {
        const offset = node.text.indexOf('world');
        from = pos + offset;
        to = from + 'world'.length;
      }
    });
    editor.commands.setTextSelection({ from, to });
    editor.commands.toggleBold();
  });
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  // Toggle bold off (revert)
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let from = 0;
    let to = 0;
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text?.includes('world')) {
        const offset = node.text.indexOf('world');
        from = pos + offset;
        to = from + 'world'.length;
      }
    });
    editor.commands.setTextSelection({ from, to });
    editor.commands.toggleBold();
  });
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.assertTextLacksMarks('world', ['bold']);
});
