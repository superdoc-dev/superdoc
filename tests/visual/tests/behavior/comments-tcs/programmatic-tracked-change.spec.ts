import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/comments-tcs/sd-tracked-style-change.docx');

test.use({ config: { comments: 'panel', hideSelection: false } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available (R2)');

test('@behavior programmatic insertTrackedChange commands', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.screenshot('programmatic-tc-loaded');

  // Replacement: search + replace via insertTrackedChange
  const matches = await superdoc.page.evaluate((query: string) => {
    const editor = (window as any).editor;
    return editor?.commands?.search?.(query) ?? [];
  }, 'a tracked style');

  if (matches.length > 0) {
    await superdoc.page.evaluate((match: any) => {
      (window as any).editor.commands.goToSearchResult(match);
    }, matches[0]);
    await superdoc.waitForStable();

    await superdoc.page.evaluate(() => {
      (window as any).editor.commands.insertTrackedChange({
        text: 'new fancy',
        user: { name: 'AI Bot', email: 'ai@superdoc.dev' },
      });
    });
    await superdoc.waitForStable();
    await superdoc.screenshot('programmatic-tc-replaced');
  }

  // Deletion with comment
  const deleteMatches = await superdoc.page.evaluate((query: string) => {
    return (window as any).editor?.commands?.search?.(query) ?? [];
  }, 'Here');

  if (deleteMatches.length > 0) {
    await superdoc.page.evaluate((match: any) => {
      (window as any).editor.commands.goToSearchResult(match);
    }, deleteMatches[0]);
    await superdoc.waitForStable();

    await superdoc.page.evaluate(() => {
      (window as any).editor.commands.insertTrackedChange({
        text: '',
        comment: 'Removing unnecessary word',
        user: { name: 'Deletion Bot' },
      });
    });
    await superdoc.waitForStable();
    await superdoc.screenshot('programmatic-tc-deleted');
  }

  // Insertion at position
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertTrackedChange({
      from: 9,
      to: 9,
      text: 'ABC',
      user: { name: 'Insert Bot' },
    });
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('programmatic-tc-inserted');

  // addToHistory: false — undo should NOT revert this
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertTrackedChange({
      from: 1,
      to: 1,
      text: 'PERSISTENT ',
      user: { name: 'No-History Bot' },
      addToHistory: false,
    });
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('programmatic-tc-persistent-before-undo');

  await superdoc.undo();
  await superdoc.waitForStable();
  await superdoc.screenshot('programmatic-tc-persistent-after-undo');
});
