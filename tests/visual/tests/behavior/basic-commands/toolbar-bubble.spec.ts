import { test } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', hideSelection: false } });

test('@behavior toolbar bubble appears on text selection', async ({ superdoc }) => {
  await superdoc.type('I am some text');
  await superdoc.screenshot('toolbar-before-select');

  // Select "some" using keyboard
  await superdoc.press('Home');
  for (let i = 0; i < 5; i++) await superdoc.press('ArrowRight'); // move past "I am "
  for (let i = 0; i < 4; i++) await superdoc.press('Shift+ArrowRight'); // select "some"
  await superdoc.waitForStable();
  await superdoc.screenshot('toolbar-text-selected');

  // Deselect — toolbar should disappear
  await superdoc.press('ArrowRight');
  await superdoc.waitForStable();
  await superdoc.screenshot('toolbar-deselected');
});
