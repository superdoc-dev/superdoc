import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

const BOLD_LINE = 'This text will be bold.';
const ITALIC_LINE = 'This text will be italic.';
const BOTH_LINE = 'This text will be both bold and italic.';

// Selection is not the behavior under test, so select deterministically instead of
// via triple-click (see behavior CLAUDE.md on click-based selection).
async function selectExactText(superdoc: SuperDocFixture, text: string): Promise<void> {
  const pos = await superdoc.findTextPos(text);
  await superdoc.setTextSelection(pos, pos + text.length);
  await superdoc.waitForStable();
}

test('bold and italic formatting applied per-line', async ({ superdoc }) => {
  await superdoc.type(BOLD_LINE);
  await superdoc.newLine();
  await superdoc.type(ITALIC_LINE);
  await superdoc.newLine();
  await superdoc.type(BOTH_LINE);
  await superdoc.waitForStable();

  // Select line 0 and apply bold
  await selectExactText(superdoc, BOLD_LINE);
  await superdoc.bold();
  await superdoc.waitForStable();

  // Select line 1 and apply italic
  await selectExactText(superdoc, ITALIC_LINE);
  await superdoc.italic();
  await superdoc.waitForStable();

  // Select line 2 and apply bold + italic
  await selectExactText(superdoc, BOTH_LINE);
  await superdoc.bold();
  await superdoc.italic();
  await superdoc.waitForStable();

  // Assert marks
  await superdoc.assertTextHasMarks('This text will be bold', ['bold']);
  await superdoc.assertTextLacksMarks('This text will be bold', ['italic']);

  await superdoc.assertTextHasMarks('This text will be italic', ['italic']);
  await superdoc.assertTextLacksMarks('This text will be italic', ['bold']);

  await superdoc.assertTextHasMarks('This text will be both', ['bold', 'italic']);

  await superdoc.snapshot('bold-italic-formatting');
});
