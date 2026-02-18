import type { Page } from '@playwright/test';

interface TrackMark {
  type?: { name?: string };
  attrs?: { id?: string };
}

interface TextNodeLike {
  isText?: boolean;
  marks?: TrackMark[];
}

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
  state?: {
    doc?: {
      descendants: (cb: (node: TextNodeLike) => void) => void;
    };
  };
  commands?: {
    rejectTrackedChangeById?: (id: string) => void;
  };
}

type WindowWithEditor = Window & typeof globalThis & { editor?: EditorLike };

/**
 * Reject all tracked changes in the document by iterating over track marks
 * and calling `rejectTrackedChangeById` for each unique ID.
 *
 * This mirrors the comment bubble "reject" flow (CommentDialog.vue handleReject).
 */
export async function rejectAllTrackedChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as WindowWithEditor).editor;
    const docApi = editor?.doc;
    const trackChangesApi = docApi?.trackChanges;
    const listTrackedChanges = trackChangesApi?.list;
    const rejectTrackedChange = trackChangesApi?.reject;

    if (typeof listTrackedChanges === 'function' && typeof rejectTrackedChange === 'function') {
      try {
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
        return;
      } catch {
        // Fall through to PM-state fallback if doc-api rejects.
      }
    }

    const doc = editor?.state?.doc;
    const rejectById = editor?.commands?.rejectTrackedChangeById;
    if (!doc || typeof rejectById !== 'function') return;

    const ids = new Set<string>();
    doc.descendants((node) => {
      if (node.isText) {
        node.marks?.forEach((mark) => {
          const name = mark.type?.name;
          const id = mark.attrs?.id;
          if (name?.startsWith('track') && id) ids.add(id);
        });
      }
    });

    for (const id of ids) {
      rejectById(id);
    }
  });
}
