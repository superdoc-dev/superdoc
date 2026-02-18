import { test } from '../../fixtures/superdoc.js';

test('@behavior clear formatting and undo restores it', async ({ superdoc }) => {
  // Type formatted text
  await superdoc.bold();
  await superdoc.type('Bold text here.');
  await superdoc.bold();
  await superdoc.newLine();

  await superdoc.italic();
  await superdoc.type('Italic text here.');
  await superdoc.italic();
  await superdoc.newLine();

  await superdoc.type('Plain text here.');
  await superdoc.screenshot('clear-format-formatted');

  // Clear formatting
  await superdoc.selectAll();
  await superdoc.executeCommand('clearFormat');
  await superdoc.screenshot('clear-format-cleared');

  // Undo should restore formatting
  await superdoc.undo();
  await superdoc.screenshot('clear-format-after-undo');
});
