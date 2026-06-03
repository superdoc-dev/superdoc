import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

const TEXT = 'Agreement signed by both parties';

type EditorCommand = [name: string, ...args: unknown[]];

async function runCommands(page: Page, commands: EditorCommand[]): Promise<void> {
  for (const [name, ...args] of commands) {
    await page.evaluate(
      ({ commandName, commandArgs }) => (window as any).editor.commands[commandName](...commandArgs),
      {
        commandName: name,
        commandArgs: args,
      },
    );
  }
}

test('@behavior reject all tracked mixed formatting restores original visual state', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await runCommands(superdoc.page, [
    ['setFontFamily', 'Times New Roman, serif'],
    ['setColor', '#112233'],
  ]);
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await runCommands(superdoc.page, [
    ['toggleBold'],
    ['toggleUnderline'],
    ['setColor', '#FF00AA'],
    ['setFontFamily', 'Arial, sans-serif'],
  ]);
  await superdoc.waitForStable();

  const trackedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text'),
  });
  await expect(trackedDialog).toHaveCount(1);

  await superdoc.screenshot('reject-mixed-track-format-before-reject');

  await superdoc.executeCommand('rejectTrackedChangeFromToolbar');
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.screenshot('reject-mixed-track-format-after-reject');
});
