import { test, expect } from '../../fixtures/superdoc.js';

test('clear formatting removes marks and undo restores them', async ({ superdoc }) => {
  // Type all text first as plain
  await superdoc.type('Bold text here.');
  await superdoc.newLine();
  await superdoc.type('Italic text here.');
  await superdoc.newLine();
  await superdoc.type('Plain text here.');
  await superdoc.waitForStable();

  // Apply bold to line 0
  await superdoc.tripleClickLine(0);
  await superdoc.bold();
  await superdoc.waitForStable();

  // Apply italic to line 1
  await superdoc.tripleClickLine(1);
  await superdoc.italic();
  await superdoc.waitForStable();

  // Verify formatting before clear
  await superdoc.assertTextHasMarks('Bold text', ['bold']);
  await superdoc.assertTextLacksMarks('Bold text', ['italic']);
  await superdoc.assertTextHasMarks('Italic text', ['italic']);
  await superdoc.assertTextLacksMarks('Italic text', ['bold']);
  await superdoc.assertTextLacksMarks('Plain text', ['bold', 'italic']);

  // Clear formatting on all text
  await superdoc.selectAll();
  await superdoc.executeCommand('clearFormat');
  await superdoc.waitForStable();

  // All text should now lack bold and italic
  await superdoc.assertTextLacksMarks('Bold text', ['bold']);
  await superdoc.assertTextLacksMarks('Italic text', ['italic']);

  // Undo should restore formatting
  await superdoc.undo();
  await superdoc.waitForStable();

  await superdoc.assertTextHasMarks('Bold text', ['bold']);
  await superdoc.assertTextHasMarks('Italic text', ['italic']);
  await superdoc.assertTextLacksMarks('Plain text', ['bold', 'italic']);

  await superdoc.snapshot('clear-format-undo');
});
