import { test } from '../../fixtures/superdoc.js';

test('@behavior pasting html with rgb() background-color applies highlight', async ({ superdoc }) => {
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertContent(
      '<span style="background-color: rgb(255, 255, 0)">Yellow highlighted text</span>',
    );
  });
  await superdoc.screenshot('paste-rgb-background-color-highlight');
});

test('@behavior pasting html with transparent background-color applies no highlight', async ({ superdoc }) => {
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertContent(
      '<span style="background-color: transparent">No highlight text</span>',
    );
  });
  await superdoc.screenshot('paste-transparent-background-no-highlight');
});

test('@behavior pasting html with hex background-color applies highlight', async ({ superdoc }) => {
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertContent(
      '<span style="background-color: #ffff00">Yellow highlighted text</span>',
    );
  });
  await superdoc.screenshot('paste-hex-background-color-highlight');
});

test('@behavior pasting html with rgba zero-alpha background applies no highlight', async ({ superdoc }) => {
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertContent(
      '<span style="background-color: rgba(255, 0, 0, 0)">No highlight text</span>',
    );
  });
  await superdoc.screenshot('paste-rgba-zero-alpha-no-highlight');
});

test('@behavior pasting html with rgb() text color is applied', async ({ superdoc }) => {
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertContent('<span style="color: rgb(255, 0, 0)">Red text</span>');
  });
  await superdoc.screenshot('paste-rgb-text-color');
});

test('@behavior pasting html with hex text color is applied', async ({ superdoc }) => {
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertContent('<span style="color: #ff0000">Red text</span>');
  });
  await superdoc.screenshot('paste-hex-text-color');
});
