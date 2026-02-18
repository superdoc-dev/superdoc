import { test, expect, type Page } from '@playwright/test';
import { rejectAllTrackedChanges } from '../../helpers/tracked-changes.js';

interface FakeMark {
  type: { name: string };
  attrs: { id?: string };
}

interface FakeTextNode {
  isText: true;
  marks: FakeMark[];
}

interface FakeDoc {
  descendants: (cb: (node: FakeTextNode) => void) => void;
}

interface FakeEditor {
  state: { doc: FakeDoc };
  commands: { rejectTrackedChangeById: (id: string) => void };
}

type WindowWithEditor = Window & typeof globalThis & { editor: FakeEditor };

function createMockPage(nodes: FakeTextNode[], onReject: (id: string) => void): Page {
  const editor: FakeEditor = {
    state: {
      doc: {
        descendants: (cb) => {
          for (const node of nodes) cb(node);
        },
      },
    },
    commands: {
      rejectTrackedChangeById: onReject,
    },
  };

  (globalThis as { window?: WindowWithEditor }).window = { editor } as WindowWithEditor;

  const pageLike = {
    evaluate: async <T>(fn: () => T): Promise<T> => fn(),
  };

  return pageLike as unknown as Page;
}

test.afterEach(() => {
  delete (globalThis as { window?: Window }).window;
});

test('rejects each unique tracked change id once', async () => {
  const rejectedIds: string[] = [];
  const page = createMockPage(
    [
      {
        isText: true,
        marks: [
          { type: { name: 'trackInsert' }, attrs: { id: 'tc-1' } },
          { type: { name: 'trackInsert' }, attrs: { id: 'tc-1' } },
          { type: { name: 'bold' }, attrs: {} },
        ],
      },
      {
        isText: true,
        marks: [{ type: { name: 'trackDelete' }, attrs: { id: 'tc-2' } }],
      },
    ],
    (id) => rejectedIds.push(id),
  );

  await rejectAllTrackedChanges(page);

  expect(rejectedIds).toEqual(['tc-1', 'tc-2']);
});

test('no-ops when there are no tracked change marks', async () => {
  const rejectedIds: string[] = [];
  const page = createMockPage(
    [
      { isText: true, marks: [{ type: { name: 'bold' }, attrs: {} }] },
      { isText: true, marks: [{ type: { name: 'italic' }, attrs: {} }] },
    ],
    (id) => rejectedIds.push(id),
  );

  await expect(rejectAllTrackedChanges(page)).resolves.toBeUndefined();
  expect(rejectedIds).toHaveLength(0);
});

test('ignores tracked marks without ids', async () => {
  const rejectedIds: string[] = [];
  const page = createMockPage(
    [
      { isText: true, marks: [{ type: { name: 'trackInsert' }, attrs: {} }] },
      { isText: true, marks: [{ type: { name: 'trackDelete' }, attrs: { id: 'tc-2' } }] },
    ],
    (id) => rejectedIds.push(id),
  );

  await rejectAllTrackedChanges(page);

  expect(rejectedIds).toEqual(['tc-2']);
});
