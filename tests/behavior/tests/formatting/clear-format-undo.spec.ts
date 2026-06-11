import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

const BOLD_LINE = 'Bold text here.';
const ITALIC_LINE = 'Italic text here.';
const PLAIN_LINE = 'Plain text here.';

// Selection is not the behavior under test, so select deterministically instead of
// via triple-click (see behavior CLAUDE.md on click-based selection).
async function selectExactText(superdoc: SuperDocFixture, text: string): Promise<void> {
  const pos = await superdoc.findTextPos(text);
  await superdoc.setTextSelection(pos, pos + text.length);
  await superdoc.waitForStable();
}

test('clear formatting removes marks and undo restores them', async ({ superdoc }) => {
  // Type all text first as plain
  await superdoc.type(BOLD_LINE);
  await superdoc.newLine();
  await superdoc.type(ITALIC_LINE);
  await superdoc.newLine();
  await superdoc.type(PLAIN_LINE);
  await superdoc.waitForStable();

  // Apply bold to line 0
  await selectExactText(superdoc, BOLD_LINE);
  await superdoc.bold();
  await superdoc.waitForStable();

  // Apply italic to line 1
  await selectExactText(superdoc, ITALIC_LINE);
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
