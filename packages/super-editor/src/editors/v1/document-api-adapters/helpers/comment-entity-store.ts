import type { Editor } from '../../core/Editor.js';
import type { CommentInfo, CommentStatus, TextTarget } from '@superdoc/document-api';

const FALLBACK_STORE_KEY = '__documentApiComments';

export interface CommentEntityRecord {
  commentId?: string;
  importedId?: string;
  parentCommentId?: string;
  commentText?: string;
  commentJSON?: unknown;
  elements?: unknown;
  isInternal?: boolean;
  isDone?: boolean;
  resolvedTime?: number | null;
  resolvedByEmail?: string | null;
  resolvedByName?: string | null;
  creatorName?: string;
  creatorEmail?: string;
  creatorImage?: string;
  createdTime?: number;
  [key: string]: unknown;
}

type ConverterWithComments = {
  comments?: CommentEntityRecord[];
};

type EditorWithCommentStorage = Editor & {
  converter?: ConverterWithComments;
  storage?: Record<string, unknown>;
};

function ensureFallbackStore(editor: EditorWithCommentStorage): CommentEntityRecord[] {
  if (!editor.storage) {
    (editor as unknown as Record<string, unknown>).storage = {};
  }
  const storage = editor.storage as Record<string, unknown>;

  if (!Array.isArray(storage[FALLBACK_STORE_KEY])) {
    storage[FALLBACK_STORE_KEY] = [];
  }

  return storage[FALLBACK_STORE_KEY] as CommentEntityRecord[];
}

export function getCommentEntityStore(editor: Editor): CommentEntityRecord[] {
  const mutableEditor = editor as EditorWithCommentStorage;
  const converter = mutableEditor.converter as ConverterWithComments | undefined;

  if (converter) {
    if (!Array.isArray(converter.comments)) {
      converter.comments = [];
    }
    return converter.comments as CommentEntityRecord[];
  }

  return ensureFallbackStore(mutableEditor);
}

export function findCommentEntity(store: CommentEntityRecord[], commentId: string): CommentEntityRecord | undefined {
  return store.find((entry) => entry.commentId === commentId || entry.importedId === commentId);
}

export function upsertCommentEntity(
  store: CommentEntityRecord[],
  commentId: string,
  patch: Partial<CommentEntityRecord>,
): CommentEntityRecord {
  const existing = findCommentEntity(store, commentId);
  if (existing) {
    const resolvedId =
      typeof existing.commentId === 'string' && existing.commentId.length > 0 ? existing.commentId : commentId;
    Object.assign(existing, patch, { commentId: resolvedId });
    return existing;
  }

  const created: CommentEntityRecord = {
    ...patch,
    commentId,
  };
  store.push(created);
  return created;
}

export function removeCommentEntityTree(store: CommentEntityRecord[], commentId: string): CommentEntityRecord[] {
  const root = findCommentEntity(store, commentId);
  if (!root || typeof root.commentId !== 'string' || root.commentId.length === 0) return [];

  const removeIds = new Set<string>([root.commentId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const entry of store) {
      if (typeof entry.commentId !== 'string' || entry.commentId.length === 0) continue;
      if (typeof entry.parentCommentId !== 'string' || entry.parentCommentId.length === 0) continue;
      if (removeIds.has(entry.parentCommentId) && !removeIds.has(entry.commentId)) {
        removeIds.add(entry.commentId);
        changed = true;
      }
    }
  }

  const removed = store.filter((entry) => typeof entry.commentId === 'string' && removeIds.has(entry.commentId));
  const kept = store.filter((entry) => !(typeof entry.commentId === 'string' && removeIds.has(entry.commentId)));

  store.splice(0, store.length, ...kept);
  return removed;
}

/**
 * Strips HTML tags from a comment text string using simple regex replacement.
 *
 * This is only intended for normalizing comment content that was already authored
 * within the editor. It is NOT a security sanitizer and must not be used to
 * neutralize untrusted or user-supplied HTML.
 */
function stripHtmlToText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectTextFragments(value: unknown, sink: string[]): void {
  if (!value) return;

  if (typeof value === 'string') {
    if (value.length > 0) sink.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTextFragments(item, sink);
    return;
  }

  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string' && record.text.length > 0) sink.push(record.text);

  if (record.content) collectTextFragments(record.content, sink);
  if (record.elements) collectTextFragments(record.elements, sink);
  if (record.nodes) collectTextFragments(record.nodes, sink);
}

export function extractCommentText(entry: CommentEntityRecord): string | undefined {
  if (typeof entry.commentText === 'string') return entry.commentText;

  const fragments: string[] = [];
  if (entry.commentJSON) collectTextFragments(entry.commentJSON, fragments);
  if (entry.elements) collectTextFragments(entry.elements, fragments);

  if (!fragments.length) return undefined;
  return fragments.join('').trim();
}

export function buildCommentJsonFromText(text: string): unknown[] {
  const normalized = stripHtmlToText(text);

  return [
    {
      type: 'paragraph',
      content: [
        {
          type: 'run',
          content: [
            {
              type: 'text',
              text: normalized,
            },
          ],
        },
      ],
    },
  ];
}

export function isCommentResolved(entry: CommentEntityRecord): boolean {
  return Boolean(entry.isDone || entry.resolvedTime);
}

/**
 * Sync remote comment metadata from a collaboration channel (e.g. the Yjs
 * `ydoc.getArray('comments')` used by browser SuperDoc clients) into the
 * editor's CommentEntityStore.
 *
 * Without this sync, the headless SDK only sees PM-anchor-derived fields
 * (id, target, anchoredText, status) for browser-authored comments — the
 * Y.Array metadata (text, creatorName, creatorEmail, createdTime) never
 * reaches `doc.comments.list()`. See SD-3214.
 *
 * Behavior:
 *   - Each entry with a `commentId` is upserted into the store. Existing
 *     entries are merged (collaborator-authored fields override locally
 *     captured ones; missing fields are left alone).
 *   - Entries flagged `trackedChange: true` are skipped — those belong to
 *     the tracked-changes domain, not the comments store.
 *   - When `options.previouslySynced` is provided, any id present in the
 *     prior set but absent from the current entries is treated as a remote
 *     deletion and pruned via `removeCommentEntityTree`. Locally-authored
 *     entries that were never collab-synced are left alone.
 *   - Returns the set of commentIds observed during the sync. Callers should
 *     pass this back as `previouslySynced` on the next call to detect
 *     subsequent remote deletions.
 */
export function syncCommentEntitiesFromCollaboration(
  editor: Editor,
  entries: ReadonlyArray<Record<string, unknown>>,
  options: { previouslySynced?: ReadonlySet<string> } = {},
): Set<string> {
  const store = getCommentEntityStore(editor);
  const seen = new Set<string>();

  // Pre-pass: collect every id (commentId AND importedId) that exists in the
  // current upstream array, then transitively drop entries whose
  // `parentCommentId` is missing from the set. `deleteYComment` on the
  // browser side removes only the parent index from Y.Array — replies (and
  // replies-of-replies) linger upstream until the browser flushes them. A
  // single-pass filter handles A→B (B skipped when A is gone) but breaks on
  // A→B→C: B would be skipped, yet B's id is still in `upstreamIds`, so C
  // survives and dangles as an orphan whose chain leads nowhere. The
  // fixed-point loop below removes orphan ids from the set until stable, so
  // any depth of orphan chain collapses in one go.
  const upstreamIds = new Set<string>();
  const validEntries: Array<Record<string, unknown>> = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.trackedChange === true) continue;
    const cid = toNonEmptyString(raw.commentId);
    const iid = toNonEmptyString(raw.importedId);
    if (cid) upstreamIds.add(cid);
    if (iid) upstreamIds.add(iid);
    validEntries.push(raw);
  }

  // Iteratively drop orphan ids until the set is stable. Each pass removes
  // entries whose declared parent is no longer represented in `upstreamIds`;
  // the next pass then re-evaluates entries that were transitively orphaned
  // by the previous removal. Worst-case cost is O(depth × validEntries),
  // bounded by document size — Y.Array of comments is small in practice.
  let changed = true;
  while (changed) {
    changed = false;
    for (const raw of validEntries) {
      const parentRef = toNonEmptyString(raw.parentCommentId);
      if (!parentRef) continue;
      if (upstreamIds.has(parentRef)) continue;
      const cid = toNonEmptyString(raw.commentId);
      const iid = toNonEmptyString(raw.importedId);
      if (cid && upstreamIds.delete(cid)) changed = true;
      if (iid && upstreamIds.delete(iid)) changed = true;
    }
  }

  for (const raw of validEntries) {
    const commentId = toNonEmptyString(raw.commentId) ?? toNonEmptyString(raw.importedId);
    if (!commentId) continue;

    // After the fixed-point pass, an entry is an orphan iff its own id was
    // dropped from `upstreamIds`. Skip it so the prune step can cascade-
    // delete the local record without `seen` re-marking the orphan as live.
    if (!upstreamIds.has(commentId)) continue;

    seen.add(commentId);

    const patch: Partial<CommentEntityRecord> = {};
    // Identity fields
    if (typeof raw.importedId === 'string') patch.importedId = raw.importedId;
    if (typeof raw.parentCommentId === 'string') patch.parentCommentId = raw.parentCommentId;
    // Body
    const commentText =
      typeof raw.commentText === 'string' ? raw.commentText : typeof raw.text === 'string' ? raw.text : undefined;
    if (commentText !== undefined) patch.commentText = commentText;
    if (raw.commentJSON !== undefined) patch.commentJSON = raw.commentJSON;
    if (raw.elements !== undefined) patch.elements = raw.elements;
    // Authoring metadata
    if (typeof raw.creatorName === 'string') patch.creatorName = raw.creatorName;
    if (typeof raw.creatorEmail === 'string') patch.creatorEmail = raw.creatorEmail;
    if (typeof raw.creatorImage === 'string') patch.creatorImage = raw.creatorImage;
    if (typeof raw.createdTime === 'number') patch.createdTime = raw.createdTime;
    // Status
    if (typeof raw.isInternal === 'boolean') patch.isInternal = raw.isInternal;
    if (typeof raw.isDone === 'boolean') patch.isDone = raw.isDone;
    if (typeof raw.resolvedTime === 'number') patch.resolvedTime = raw.resolvedTime;
    if (raw.resolvedTime === null) patch.resolvedTime = null;
    if (typeof raw.resolvedByEmail === 'string') patch.resolvedByEmail = raw.resolvedByEmail;
    if (typeof raw.resolvedByName === 'string') patch.resolvedByName = raw.resolvedByName;

    upsertCommentEntity(store, commentId, patch);
  }

  // Prune entries previously known to come from collab sync but now absent
  // from the upstream Y.Array. Locally-authored entries that were never in
  // `previouslySynced` are intentionally left alone.
  if (options.previouslySynced) {
    for (const priorId of options.previouslySynced) {
      if (!seen.has(priorId)) {
        removeCommentEntityTree(store, priorId);
      }
    }
  }

  return seen;
}

/** Local helper: trim+narrow a value to a non-empty string. */
function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toCommentInfo(
  entry: CommentEntityRecord,
  options: {
    target?: TextTarget;
    status?: CommentStatus;
    anchoredText?: string;
  } = {},
): CommentInfo {
  const resolvedId = typeof entry.commentId === 'string' ? entry.commentId : String(entry.importedId ?? '');
  const status = options.status ?? (isCommentResolved(entry) ? 'resolved' : 'open');

  return {
    address: {
      kind: 'entity',
      entityType: 'comment',
      entityId: resolvedId,
    },
    commentId: resolvedId,
    importedId: typeof entry.importedId === 'string' ? entry.importedId : undefined,
    parentCommentId: typeof entry.parentCommentId === 'string' ? entry.parentCommentId : undefined,
    text: extractCommentText(entry),
    isInternal: typeof entry.isInternal === 'boolean' ? entry.isInternal : undefined,
    status,
    target: options.target,
    anchoredText: options.anchoredText,
    createdTime: typeof entry.createdTime === 'number' ? entry.createdTime : undefined,
    creatorName: typeof entry.creatorName === 'string' ? entry.creatorName : undefined,
    creatorEmail: typeof entry.creatorEmail === 'string' ? entry.creatorEmail : undefined,
  };
}
