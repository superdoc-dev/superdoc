/**
 * Headless Comment Bridge
 *
 * Bridges Editor comment/tracked-change events to Yjs collaboration arrays,
 * providing the headless equivalent of the browser's SuperDoc.vue + comments-store
 * + collaboration/helpers.js orchestration.
 *
 * Yjs write helpers replicate the trivially small logic from:
 *   packages/superdoc/src/core/collaboration/collaboration-comments.js
 * We cannot import from that Vue package into the CLI app.
 */

import { Map as YMap } from 'yjs';
import type { Doc as YDoc, Array as YArray } from 'yjs';
import type { UserIdentity } from './types';

// ---------------------------------------------------------------------------
// Yjs write helpers (mirrors collaboration-comments.js)
// ---------------------------------------------------------------------------

function getCommentIndex(yArray: YArray<YMap<unknown>>, commentId: string): number {
  const arr = yArray.toJSON() as Array<Record<string, unknown>>;
  return arr.findIndex((c) => c.commentId === commentId);
}

function getCommentById(yArray: YArray<YMap<unknown>>, commentId: string): Record<string, unknown> | null {
  const arr = yArray.toJSON() as Array<Record<string, unknown>>;
  return arr.find((c) => c.commentId === commentId) ?? null;
}

function addYComment(
  yArray: YArray<YMap<unknown>>,
  ydoc: YDoc,
  comment: Record<string, unknown>,
  user?: Record<string, unknown>,
): void {
  const yComment = new YMap(Object.entries(comment));
  ydoc.transact(
    () => {
      yArray.push([yComment]);
    },
    { user },
  );
}

function updateYComment(
  yArray: YArray<YMap<unknown>>,
  ydoc: YDoc,
  comment: Record<string, unknown>,
  user?: Record<string, unknown>,
): void {
  const commentId = comment.commentId as string;
  const idx = getCommentIndex(yArray, commentId);
  if (idx === -1) return;

  const yComment = new YMap(Object.entries(comment));
  ydoc.transact(
    () => {
      yArray.delete(idx, 1);
      yArray.insert(idx, [yComment]);
    },
    { user },
  );
}

function deleteYComment(
  yArray: YArray<YMap<unknown>>,
  ydoc: YDoc,
  comment: Record<string, unknown>,
  user?: Record<string, unknown>,
): void {
  const commentId = comment.commentId as string;
  const idx = getCommentIndex(yArray, commentId);
  if (idx === -1) return;

  ydoc.transact(
    () => {
      yArray.delete(idx, 1);
    },
    { user },
  );
}

// ---------------------------------------------------------------------------
// Tracked-change normalization
// ---------------------------------------------------------------------------

/**
 * Maps a tracked-change event from the Editor's commentsUpdate emission
 * into a comment-shaped object suitable for Yjs sync.
 *
 * Mirrors the shape produced by comments-store.js handleTrackedChangeUpdate().
 */
function normalizeTrackedChangeToComment(params: Record<string, unknown>): Record<string, unknown> {
  return {
    commentId: params.changeId as string,
    trackedChange: true,
    trackedChangeText: (params.trackedChangeText as string) ?? null,
    trackedChangeType: (params.trackedChangeType as string) ?? null,
    deletedText: (params.deletedText as string) ?? null,
    creatorName: (params.author as string) ?? null,
    creatorEmail: (params.authorEmail as string) ?? null,
    creatorImage: (params.authorImage as string) ?? null,
    createdTime: (params.date as string) ?? null,
    ...(params.importedAuthor != null ? { importedAuthor: params.importedAuthor } : {}),
    documentId: (params.documentId as string) ?? null,
    isInternal: false,
  };
}

function applyTrackedChangeUpdate(
  existing: Record<string, unknown>,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const updated: Record<string, unknown> = {
    ...existing,
    trackedChange: true,
    // Keep parity with comments-store.js: update tracked-change fields explicitly
    // and clear missing values to null for partial replacements.
    trackedChangeText: (params.trackedChangeText as string) ?? null,
    trackedChangeType: (params.trackedChangeType as string) ?? null,
    deletedText: (params.deletedText as string) ?? null,
  };

  if (params.author != null) updated.creatorName = params.author as string;
  if (params.authorEmail != null) updated.creatorEmail = params.authorEmail as string;
  if (params.authorImage != null) updated.creatorImage = params.authorImage as string;
  if (params.date != null) updated.createdTime = params.date as string;
  if (params.documentId != null) updated.documentId = params.documentId as string;
  if (params.importedAuthor !== undefined) updated.importedAuthor = params.importedAuthor;

  return updated;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HeadlessCommentBridgeResult {
  /** Options to spread into Editor.open() call */
  editorOptions: {
    isCommentsEnabled: true;
    documentMode: 'editing';
    onCommentsUpdate: (params: Record<string, unknown>) => void;
    onCommentsLoaded: (params: { editor: unknown; comments: unknown[] }) => void;
  };
  /** Cleanup — clears internal registry */
  dispose(): void;
}

export function buildHeadlessCommentBridge(ydoc: unknown, user?: UserIdentity): HeadlessCommentBridgeResult {
  const yDoc = ydoc as YDoc;
  const yArray = yDoc.getArray('comments') as YArray<YMap<unknown>>;
  const userOrigin = user ? { name: user.name, email: user.email } : undefined;

  // Internal registry for dedup and update lookups.
  // Seed from existing Yjs array so we don't duplicate comments already in the room.
  const registry = new Map<string, Record<string, unknown>>();
  for (const entry of yArray.toJSON() as Array<Record<string, unknown>>) {
    const id = entry.commentId as string | undefined;
    if (id) registry.set(id, entry);
  }

  function getCurrentComment(commentId: string): Record<string, unknown> | null {
    const fromYjs = getCommentById(yArray, commentId);
    if (fromYjs) {
      registry.set(commentId, fromYjs);
      return fromYjs;
    }

    // Yjs is the source of truth; remove stale registry entries when absent.
    registry.delete(commentId);
    return null;
  }

  // ---- Event handler (mirrors syncCommentsToClients) ----

  function handleCommentsUpdate(params: Record<string, unknown>): void {
    const type = params.type as string;

    if (type === 'trackedChange') {
      const event = params.event as string;
      const changeId = params.changeId as string;
      if (!changeId) return;

      const comment = normalizeTrackedChangeToComment(params);

      if (event === 'add') {
        const existing = getCurrentComment(changeId);
        if (existing) {
          // Dedup: update instead of re-adding.
          const updated = applyTrackedChangeUpdate(existing, params);
          registry.set(changeId, updated);
          updateYComment(yArray, yDoc, updated, userOrigin);
        } else {
          registry.set(changeId, comment);
          addYComment(yArray, yDoc, comment, userOrigin);
        }
      } else if (event === 'update') {
        const existing = getCurrentComment(changeId);
        if (existing) {
          const updated = applyTrackedChangeUpdate(existing, params);
          registry.set(changeId, updated);
          updateYComment(yArray, yDoc, updated, userOrigin);
        }
      } else if (event === 'resolve') {
        // Resolve payloads are sparse — only apply resolution fields,
        // preserving all existing tracked-change metadata.
        // Mirrors comments-store.js:380 resolveComment() behavior.
        const existing = getCurrentComment(changeId);
        if (existing) {
          if (existing.resolvedTime) return;
          const updated = {
            ...existing,
            resolvedTime: existing.resolvedTime ?? new Date().toISOString(),
            resolvedByEmail: (params.resolvedByEmail as string) ?? userOrigin?.email ?? null,
            resolvedByName: (params.resolvedByName as string) ?? userOrigin?.name ?? null,
          };
          registry.set(changeId, updated);
          updateYComment(yArray, yDoc, updated, userOrigin);
        }
      }
      return;
    }

    // Standard comment events
    const comment = params.comment as Record<string, unknown> | undefined;
    if (!comment) return;
    const commentId = comment.commentId as string;
    if (!commentId) return;

    switch (type) {
      case 'add':
        if (!getCurrentComment(commentId)) {
          registry.set(commentId, comment);
          addYComment(yArray, yDoc, comment, userOrigin);
        }
        break;
      case 'update':
      case 'resolved': {
        const existing = getCurrentComment(commentId);
        if (!existing) break;
        const updated = { ...existing, ...comment };
        registry.set(commentId, updated);
        updateYComment(yArray, yDoc, updated, userOrigin);
        break;
      }
      case 'deleted':
        registry.delete(commentId);
        deleteYComment(yArray, yDoc, comment, userOrigin);
        break;
    }
  }

  // ---- onCommentsLoaded handler ----

  function handleCommentsLoaded(params: { editor: unknown; comments: unknown[] }): void {
    const { comments } = params;
    if (!Array.isArray(comments) || comments.length === 0) return;

    yDoc.transact(
      () => {
        for (const raw of comments) {
          const comment = raw as Record<string, unknown>;
          const commentId = comment.commentId as string;
          if (!commentId || registry.has(commentId)) continue;

          registry.set(commentId, comment);
          const yComment = new YMap(Object.entries(comment));
          yArray.push([yComment]);
        }
      },
      { user: userOrigin },
    );
  }

  return {
    editorOptions: {
      isCommentsEnabled: true,
      documentMode: 'editing',
      onCommentsUpdate: handleCommentsUpdate,
      onCommentsLoaded: handleCommentsLoaded,
    },
    dispose() {
      registry.clear();
    },
  };
}

// Exported for testing
export const __test__ = {
  normalizeTrackedChangeToComment,
  addYComment,
  updateYComment,
  deleteYComment,
  getCommentIndex,
};
