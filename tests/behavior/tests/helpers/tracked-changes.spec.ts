import { test, expect, type Page } from '@playwright/test';
import { rejectAllTrackedChanges } from '../../helpers/tracked-changes.js';

interface FakeEditor {
  doc?: {
    trackChanges?: {
      rejectAll?: (input: Record<string, never>) => void;
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

test('calls rejectAll on the trackChanges API', async () => {
  let called = false;
  const page = createMockPageFromEditor({
    doc: {
      trackChanges: {
        rejectAll: () => {
          called = true;
        },
      },
    },
  });

  await rejectAllTrackedChanges(page);
  expect(called).toBe(true);
});

test('throws when document-api trackChanges.rejectAll is missing', async () => {
  const page = createMockPageFromEditor({});
  await expect(rejectAllTrackedChanges(page)).rejects.toThrow(
    'Document API is unavailable: expected editor.doc.trackChanges.rejectAll.',
  );
});
