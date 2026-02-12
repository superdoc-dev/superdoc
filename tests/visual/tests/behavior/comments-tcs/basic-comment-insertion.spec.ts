import { test } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'on', hideSelection: false } });

test('@behavior comment insertion and tracked change', async ({ superdoc }) => {
  await superdoc.type('hello');
  await superdoc.newLine();
  await superdoc.newLine();
  await superdoc.type('world');
  await superdoc.screenshot('comment-typed');

  // Switch to suggesting mode
  await superdoc.page.evaluate(() => {
    (window as any).superdoc.setDocumentMode('suggesting');
  });
  await superdoc.waitForStable();

  // Select "world" and add comment
  await superdoc.press('End');
  for (let i = 0; i < 5; i++) await superdoc.press('Shift+ArrowLeft');
  await superdoc.screenshot('comment-select-world');

  await superdoc.executeCommand('addComment', { text: 'my comment text' });
  await superdoc.waitForStable();
  await superdoc.screenshot('comment-added');
});
