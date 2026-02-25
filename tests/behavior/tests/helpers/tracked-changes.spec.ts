import { test, expect, type Page } from '@playwright/test';
import { rejectAllTrackedChanges } from '../../helpers/tracked-changes.js';

interface FakeEditor {
  doc?: {
    review?: {
      decide?: (input: Record<string, unknown>) => void;
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

test('calls review.decide on the review API', async () => {
  let called = false;
  const page = createMockPageFromEditor({
    doc: {
      review: {
        decide: () => {
          called = true;
        },
      },
    },
  });

  await rejectAllTrackedChanges(page);
  expect(called).toBe(true);
});

test('throws when document-api review.decide is missing', async () => {
  const page = createMockPageFromEditor({});
  await expect(rejectAllTrackedChanges(page)).rejects.toThrow(
    'Document API is unavailable: expected editor.doc.review.decide.',
  );
});
