import { test } from '../../fixtures/superdoc.js';

test('new line after toggling bold off does not apply bold to newly typed text', async ({ superdoc }) => {
  await superdoc.bold();
  await superdoc.type('This text is bold');
  await superdoc.waitForStable();

  await superdoc.assertTextHasMarks('This text is bold', ['bold']);

  await superdoc.bold();
  await superdoc.waitForStable();

  await superdoc.newLine();
  await superdoc.waitForStable();

  await superdoc.type('This text should not be bold');
  await superdoc.waitForStable();

  await superdoc.assertTextLacksMarks('This text should not be bold', ['bold']);
});
