import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import {
  assertDocumentApiReady,
  deleteText,
  findFirstTextRange,
  getDocumentText,
  insertText,
  listTrackChanges,
  replaceText,
} from '../../helpers/document-api.js';
import type { TextAddress, TextMutationReceipt } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

async function assertTrackChangeTypeCount(
  superdoc: { page: Page },
  type: 'insert' | 'delete' | 'format',
  minimumCount = 1,
): Promise<void> {
  await expect
    .poll(async () => {
      const listed = await listTrackChanges(superdoc.page, { type });
      return listed.total;
    })
    .toBeGreaterThanOrEqual(minimumCount);
}

function requireTextTarget(target: TextAddress | null, pattern: string): TextAddress {
  if (target == null) {
    throw new Error(`Could not find a text target for pattern "${pattern}".`);
  }
  return target;
}

function assertMutationSucceeded(
  operationName: string,
  receipt: TextMutationReceipt,
): asserts receipt is Extract<TextMutationReceipt, { success: true }> {
  if (receipt.success) {
    return;
  }

  throw new Error(`${operationName} failed (${receipt.failure.code}): ${receipt.failure.message}`);
}

test('tracked replace via document-api', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Here is a tracked style change');
  await superdoc.waitForStable();

  const target = requireTextTarget(await findFirstTextRange(superdoc.page, 'a tracked style'), 'a tracked style');

  const receipt = await replaceText(superdoc.page, { target, text: 'new fancy' }, { changeMode: 'tracked' });
  assertMutationSucceeded('replaceText', receipt);
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toContain('new fancy');
  await assertTrackChangeTypeCount(superdoc, 'insert');

  await superdoc.snapshot('programmatic-tc-replaced');
});

test('tracked delete via document-api', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Here is some text to delete');
  await superdoc.waitForStable();

  const target = requireTextTarget(await findFirstTextRange(superdoc.page, 'Here'), 'Here');

  const receipt = await deleteText(superdoc.page, { target }, { changeMode: 'tracked' });
  assertMutationSucceeded('deleteText', receipt);
  await superdoc.waitForStable();

  await assertTrackChangeTypeCount(superdoc, 'delete');

  await superdoc.snapshot('programmatic-tc-deleted');
});

test('direct insert via document-api', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Hello World');
  await superdoc.waitForStable();

  const target = requireTextTarget(await findFirstTextRange(superdoc.page, 'World'), 'World');

  // insert requires a collapsed target range in the write adapter.
  const insertionTarget: TextAddress = {
    ...target,
    range: {
      start: target.range.start,
      end: target.range.start,
    },
  };

  const receipt = await insertText(superdoc.page, { text: 'Beautiful ', target: insertionTarget });
  assertMutationSucceeded('insertText', receipt);
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toContain('Beautiful');

  await superdoc.snapshot('programmatic-direct-insert');
});

test('tracked insert at cursor position in suggesting mode', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Hello World');
  await superdoc.waitForStable();

  // Place cursor right before "World"
  const pos = await superdoc.findTextPos('World');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  // Switch to suggesting mode and type — produces a tracked insertion
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type('ABC ');
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toContain('ABC');
  await assertTrackChangeTypeCount(superdoc, 'insert');

  await superdoc.snapshot('programmatic-tc-inserted');
});

test('tracked insert with addToHistory:false survives undo', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Hello World');
  await superdoc.waitForStable();

  // addToHistory is a PM-level option not exposed through document-api,
  // so this test uses the editor command directly to verify undo behavior.
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

  await expect.poll(() => getDocumentText(superdoc.page)).toContain('PERSISTENT');

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toContain('PERSISTENT');

  await superdoc.snapshot('programmatic-tc-persistent-after-undo');
});
