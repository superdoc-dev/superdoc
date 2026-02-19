import { test, expect, type Page } from '@playwright/test';
import { rejectAllTrackedChanges } from '../../helpers/tracked-changes.js';

interface FakeEditor {
  doc?: {
    trackChanges?: {
      list: () => { changes?: Array<{ id?: string }>; matches?: Array<{ entityId?: string }> } | undefined;
      reject: (input: { id: string }) => void;
    };
  };
}

type WindowWithEditor = Window & typeof globalThis & { editor: FakeEditor };

function createMockPageFromEditor(editor: FakeEditor): Page {
  (globalThis as { window?: WindowWithEditor }).window = { editor } as WindowWithEditor;

  const pageLike = {
    evaluate: async <T>(fn: () => T): Promise<T> => fn(),
  };

  return pageLike as unknown as Page;
}

test.afterEach(() => {
  delete (globalThis as { window?: Window }).window;
});

test('rejects each unique tracked change id once from changes[]', async () => {
  const rejectedIds: string[] = [];
  const page = createMockPageFromEditor({
    doc: {
      trackChanges: {
        list: () => ({
          changes: [{ id: 'tc-1' }, { id: 'tc-1' }, { id: 'tc-2' }],
        }),
        reject: ({ id }) => rejectedIds.push(id),
      },
    },
  });

  await rejectAllTrackedChanges(page);

  expect(rejectedIds).toEqual(['tc-1', 'tc-2']);
});

test('rejects each unique tracked change id once from matches[]', async () => {
  const rejectedIds: string[] = [];
  const page = createMockPageFromEditor({
    doc: {
      trackChanges: {
        list: () => ({
          matches: [{ entityId: 'tc-3' }, { entityId: 'tc-3' }, { entityId: 'tc-4' }],
        }),
        reject: ({ id }) => rejectedIds.push(id),
      },
    },
  });

  await rejectAllTrackedChanges(page);

  expect(rejectedIds).toEqual(['tc-3', 'tc-4']);
});

test('merges ids from changes[] and matches[]', async () => {
  const rejectedIds: string[] = [];
  const page = createMockPageFromEditor({
    doc: {
      trackChanges: {
        list: () => ({
          changes: [{ id: 'tc-1' }, { id: undefined }],
          matches: [{ entityId: 'tc-2' }, { entityId: 'tc-1' }, {}],
        }),
        reject: ({ id }) => rejectedIds.push(id),
      },
    },
  });

  await rejectAllTrackedChanges(page);

  expect(rejectedIds).toEqual(['tc-1', 'tc-2']);
});

test('no-ops when document-api returns no ids', async () => {
  const rejectedIds: string[] = [];

  const page = createMockPageFromEditor({
    doc: {
      trackChanges: {
        list: () => undefined,
        reject: ({ id }) => rejectedIds.push(id),
      },
    },
  });

  await expect(rejectAllTrackedChanges(page)).resolves.toBeUndefined();
  expect(rejectedIds).toEqual([]);
});

test('throws when document-api trackChanges is missing', async () => {
  const page = createMockPageFromEditor({});
  await expect(rejectAllTrackedChanges(page)).rejects.toThrow(
    'Document API is unavailable: expected editor.doc.trackChanges.list/reject.',
  );
});

test('throws when document-api trackChanges.list throws', async () => {
  const page = createMockPageFromEditor({
    doc: {
      trackChanges: {
        list: () => {
          throw new Error('list failed');
        },
        reject: () => {
          /* noop */
        },
      },
    },
  });

  await expect(rejectAllTrackedChanges(page)).rejects.toThrow('list failed');
});
