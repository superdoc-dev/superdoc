import { test } from '../../fixtures/superdoc.js';

test('@behavior bold and italic formatting', async ({ superdoc }) => {
  await superdoc.type('This text will be bold.');
  await superdoc.newLine();
  await superdoc.type('This text will be italic.');
  await superdoc.newLine();
  await superdoc.type('This text will be both bold and italic.');

  await superdoc.waitForStable();

  // Select line 0 via Home → Shift+Down and apply bold
  await superdoc.shortcut('Home'); // go to start of doc
  await superdoc.press('Home');
  await superdoc.press('Shift+ArrowDown');
  await superdoc.bold();

  // Move to line 1, select it, apply italic
  await superdoc.press('ArrowDown');
  await superdoc.press('Home');
  await superdoc.press('Shift+End');
  await superdoc.italic();

  // Move to line 2, select it, apply bold + italic
  await superdoc.press('ArrowDown');
  await superdoc.press('Home');
  await superdoc.press('Shift+End');
  await superdoc.bold();
  await superdoc.italic();

  await superdoc.screenshot('bold-italic-formatting');
});
