import type { Page } from '@playwright/test';

interface EditorLike {
  doc?: {
    trackChanges?: {
      list?: (input?: Record<string, never>) => {
        matches?: Array<{ entityId?: string }>;
        changes?: Array<{ id?: string }>;
      };
      reject?: (input: { id: string }) => void;
    };
  };
}

type WindowWithEditor = Window & typeof globalThis & { editor?: EditorLike };

/**
 * Reject all tracked changes in the document via document-api.
 */
export async function rejectAllTrackedChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as WindowWithEditor).editor;
    const docApi = editor?.doc;
    const trackChangesApi = docApi?.trackChanges;
    const listTrackedChanges = trackChangesApi?.list;
    const rejectTrackedChange = trackChangesApi?.reject;

    if (typeof listTrackedChanges !== 'function' || typeof rejectTrackedChange !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.trackChanges.list/reject.');
    }

    const listed = listTrackedChanges({});
    const ids = new Set<string>();

    if (Array.isArray(listed?.changes)) {
      for (const change of listed.changes) {
        if (change?.id) ids.add(change.id);
      }
    }

    if (Array.isArray(listed?.matches)) {
      for (const match of listed.matches) {
        if (match?.entityId) ids.add(match.entityId);
      }
    }

    for (const id of ids) {
      rejectTrackedChange({ id });
    }
  });
}
