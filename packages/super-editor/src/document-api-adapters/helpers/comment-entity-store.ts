import type { Editor } from '../../core/Editor.js';
import type { CommentInfo, CommentStatus, TextAddress } from '@superdoc/document-api';

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

export function toCommentInfo(
  entry: CommentEntityRecord,
  options: {
    target?: TextAddress;
    status?: CommentStatus;
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
    createdTime: typeof entry.createdTime === 'number' ? entry.createdTime : undefined,
    creatorName: typeof entry.creatorName === 'string' ? entry.creatorName : undefined,
    creatorEmail: typeof entry.creatorEmail === 'string' ? entry.creatorEmail : undefined,
  };
}
