import { test, expect } from '../../fixtures/superdoc.js';

test('bold and italic formatting applied per-line', async ({ superdoc }) => {
  await superdoc.type('This text will be bold.');
  await superdoc.newLine();
  await superdoc.type('This text will be italic.');
  await superdoc.newLine();
  await superdoc.type('This text will be both bold and italic.');
  await superdoc.waitForStable();

  // Select line 0 and apply bold
  await superdoc.tripleClickLine(0);
  await superdoc.bold();
  await superdoc.waitForStable();

  // Select line 1 and apply italic
  await superdoc.tripleClickLine(1);
  await superdoc.italic();
  await superdoc.waitForStable();

  // Select line 2 and apply bold + italic
  await superdoc.tripleClickLine(2);
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
