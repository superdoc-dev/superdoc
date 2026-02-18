import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

test('insertTrackedChange replaces selected text', async ({ superdoc }) => {
  await superdoc.type('Here is a tracked style change');
  await superdoc.waitForStable();

  // Select "a tracked style" and replace with "new fancy" via insertTrackedChange
  const pos = await superdoc.findTextPos('a tracked style');
  await superdoc.setTextSelection(pos, pos + 'a tracked style'.length);
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertTrackedChange({
      text: 'new fancy',
      user: { name: 'AI Bot', email: 'ai@superdoc.dev' },
    });
  });
  await superdoc.waitForStable();

  // New text should be in the document
  await superdoc.assertTextContains('new fancy');
  // Tracked change decorations should exist
  await superdoc.assertTrackedChangeExists('insert');
  await superdoc.assertTrackedChangeExists('delete');

  await superdoc.snapshot('programmatic-tc-replaced');
});

test('insertTrackedChange deletes selected text with comment', async ({ superdoc }) => {
  await superdoc.type('Here is some text to delete');
  await superdoc.waitForStable();

  // Select "Here" and delete it with a comment
  const pos = await superdoc.findTextPos('Here');
  await superdoc.setTextSelection(pos, pos + 'Here'.length);
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertTrackedChange({
      text: '',
      comment: 'Removing unnecessary word',
      user: { name: 'Deletion Bot' },
    });
  });
  await superdoc.waitForStable();

  // Tracked delete should exist
  await superdoc.assertTrackedChangeExists('delete');

  await superdoc.snapshot('programmatic-tc-deleted');
});

test('insertTrackedChange inserts at a specific position', async ({ superdoc }) => {
  await superdoc.type('Hello World');
  await superdoc.waitForStable();

  // Insert "ABC" at position 7 (after "Hello ")
  const pos = await superdoc.findTextPos('World');
  await superdoc.page.evaluate(
    ({ insertPos }) => {
      (window as any).editor.commands.insertTrackedChange({
        from: insertPos,
        to: insertPos,
        text: 'ABC ',
        user: { name: 'Insert Bot' },
      });
    },
    { insertPos: pos },
  );
  await superdoc.waitForStable();

  // Inserted text should be in the document
  await superdoc.assertTextContains('ABC');
  await superdoc.assertTrackedChangeExists('insert');

  await superdoc.snapshot('programmatic-tc-inserted');
});

test('insertTrackedChange with addToHistory:false survives undo', async ({ superdoc }) => {
  await superdoc.type('Hello World');
  await superdoc.waitForStable();

  // Insert "PERSISTENT " at position 1 with addToHistory: false
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertTrackedChange({
      from: 1,
      to: 1,
      text: 'PERSISTENT ',
      user: { name: 'No-History Bot' },
      addToHistory: false,
    });
  });
  await superdoc.waitForStable();

  // PERSISTENT should be in the document
  await superdoc.assertTextContains('PERSISTENT');

  // Undo should NOT remove it (since addToHistory: false)
  await superdoc.undo();
  await superdoc.waitForStable();

  await superdoc.assertTextContains('PERSISTENT');

  await superdoc.snapshot('programmatic-tc-persistent-after-undo');
});
