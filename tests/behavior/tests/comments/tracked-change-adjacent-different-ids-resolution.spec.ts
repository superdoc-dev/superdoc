import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import {
  assertDocumentApiReady,
  deleteText,
  findFirstSelectionTarget,
  findFirstTextRange,
  insertText,
  listTrackChanges,
} from '../../helpers/document-api.js';
import type { SelectionTarget, TextAddress, TextMutationReceipt, TrackChangeType } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

type SuperDocHarness = {
  page: Page;
  type: (text: string) => Promise<void>;
  waitForStable: () => Promise<void>;
};

type TrackedSegment = {
  from: number;
  id: string;
  text: string;
  to: number;
  type: TrackChangeType;
};

function requireTextTarget(target: TextAddress | null, pattern: string): TextAddress {
  if (target != null) {
    return target;
  }

  throw new Error(`Could not find a text target for pattern "${pattern}".`);
}

function requireSelectionTarget(target: SelectionTarget | null, pattern: string): SelectionTarget {
  if (target != null) {
    return target;
  }

  throw new Error(`Could not find a selection target for pattern "${pattern}".`);
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

async function createAdjacentTrackedDeleteAndInsert(superdoc: SuperDocHarness) {
  await superdoc.type('AB');
  await superdoc.waitForStable();

  const deleteTarget = requireSelectionTarget(await findFirstSelectionTarget(superdoc.page, 'A'), 'A');
  const deleteReceipt = await deleteText(superdoc.page, { target: deleteTarget }, { changeMode: 'tracked' });
  assertMutationSucceeded('deleteText', deleteReceipt);

  const beforeB = requireTextTarget(await findFirstTextRange(superdoc.page, 'B'), 'B');
  const insertTarget: TextAddress = {
    ...beforeB,
    range: {
      start: beforeB.range.start,
      end: beforeB.range.start,
    },
  };
  const insertReceipt = await insertText(
    superdoc.page,
    { value: 'X', target: insertTarget, type: 'text' },
    { changeMode: 'tracked' },
  );
  assertMutationSucceeded('insertText', insertReceipt);

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).changes.length).toBe(2);

  const listed = await listTrackChanges(superdoc.page);
  const deleteChange = listed.changes.find((change) => change.type === 'delete');
  const insertChange = listed.changes.find((change) => change.type === 'insert');
  const trackedSegments = await listTrackedSegments(superdoc.page);
  const deleteSegment = trackedSegments.find((segment) => segment.type === 'delete');
  const insertSegment = trackedSegments.find((segment) => segment.type === 'insert');

  expect(deleteChange).toBeTruthy();
  expect(insertChange).toBeTruthy();
  expect(deleteChange?.id).not.toBe(insertChange?.id);
  expect(deleteSegment).toBeTruthy();
  expect(insertSegment).toBeTruthy();
  expect(deleteSegment?.id).not.toBe(insertSegment?.id);
  expect(deleteSegment?.to).toBe(insertSegment?.from);
  expect(trackedSegments).toEqual([
    { from: expect.any(Number), id: expect.any(String), to: expect.any(Number), type: 'delete', text: 'A' },
    { from: expect.any(Number), id: expect.any(String), to: expect.any(Number), type: 'insert', text: 'X' },
  ]);

  return {
    deleteChange,
    deleteSegment: deleteSegment!,
    insertChange,
    insertSegment: insertSegment!,
  };
}

async function listTrackedSegments(page: Page): Promise<TrackedSegment[]> {
  return page.evaluate(() => {
    const segments: Array<{ from: number; id: string; text: string; to: number; type: TrackChangeType }> = [];
    const editor = (window as any).editor;

    editor.state.doc.descendants((node: any, pos: number) => {
      if (!node?.isText || !node.text) {
        return;
      }

      const trackedMark = (node.marks ?? []).find((mark: any) => {
        const name = mark.type?.name;
        return name === 'trackInsert' || name === 'trackDelete';
      });

      if (!trackedMark) {
        return;
      }

      segments.push({
        from: Number(pos),
        id: String(trackedMark.attrs?.id ?? ''),
        text: String(node.text),
        to: Number(pos + node.nodeSize),
        type: trackedMark.type.name === 'trackDelete' ? 'delete' : 'insert',
      });
    });

    return segments;
  });
}

async function resolveTrackedChangeByRawId(
  page: Page,
  input: { action: 'accept' | 'reject'; id: string },
): Promise<void> {
  await page.evaluate((payload) => {
    const editor = (window as any).editor;
    const command =
      payload.action === 'accept' ? editor.commands.acceptTrackedChangeById : editor.commands.rejectTrackedChangeById;
    command(payload.id);
  }, input);
}

test('accepting an adjacent tracked insertion by id keeps the separate tracked deletion', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  const { deleteSegment, insertSegment } = await createAdjacentTrackedDeleteAndInsert(superdoc);

  await resolveTrackedChangeByRawId(superdoc.page, { action: 'accept', id: insertSegment.id });

  await expect
    .poll(() => listTrackedSegments(superdoc.page))
    .toEqual([{ from: deleteSegment.from, id: deleteSegment.id, to: deleteSegment.to, type: 'delete', text: 'A' }]);
});

test('rejecting an adjacent tracked deletion by id keeps the separate tracked insertion', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  const { deleteSegment, insertSegment } = await createAdjacentTrackedDeleteAndInsert(superdoc);

  await resolveTrackedChangeByRawId(superdoc.page, { action: 'reject', id: deleteSegment.id });

  await expect
    .poll(() => listTrackedSegments(superdoc.page))
    .toEqual([{ from: insertSegment.from, id: insertSegment.id, to: insertSegment.to, type: 'insert', text: 'X' }]);
});
