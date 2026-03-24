import { test, expect } from '../../fixtures/superdoc.js';

test('new line does not inherit bold+italic after formatting is removed from line end (SD-2228)', async ({
  superdoc,
}) => {
  await superdoc.type("This line doesn't have formatting");
  await superdoc.newLine();

  await superdoc.bold();
  await superdoc.italic();
  await superdoc.type('but this one does');
  await superdoc.newLine();

  await superdoc.type("this one initially does but it's removed from end");
  await superdoc.waitForStable();

  const removedText = 'removed from end';
  const removedStart = await superdoc.findTextPos(removedText);
  await superdoc.setTextSelection(removedStart, removedStart + removedText.length);

  await superdoc.bold();
  await superdoc.italic();
  await superdoc.waitForStable();

  await superdoc.assertTextLacksMarks(removedText, ['bold', 'italic']);

  await superdoc.press('ArrowRight');
  await superdoc.newLine();
  await superdoc.waitForStable();

  await superdoc.assertMarkNotActive('bold');
  await superdoc.assertMarkNotActive('italic');

  await superdoc.type('This line should not have formatting');
  await superdoc.waitForStable();

  await superdoc.assertTextLacksMarks('This line should not have formatting', ['bold', 'italic']);

  await superdoc.assertTextLacksMarks("This line doesn't have formatting", ['bold', 'italic']);
  await superdoc.assertTextHasMarks('but this one does', ['bold', 'italic']);
  await superdoc.assertTextHasMarks("this one initially does but it's", ['bold', 'italic']);

  expect(await superdoc.getTextContent()).toContain('This line should not have formatting');
});
