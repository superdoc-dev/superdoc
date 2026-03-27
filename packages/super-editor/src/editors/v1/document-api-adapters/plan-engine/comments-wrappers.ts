/**
 * Comments convenience wrappers — bridge comments operations to the plan
 * engine's revision management and execution path.
 *
 * Read operations (list, get, goTo) are pure queries or non-mutating navigation.
 * Mutating operations (add, edit, reply, move, resolve, remove, setInternal, setActive)
 * delegate to editor commands with plan-engine revision tracking.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  AddCommentInput,
  CommentInfo,
  CommentsAdapter,
  CommentsListQuery,
  CommentsListResult,
  EditCommentInput,
  GetCommentInput,
  GoToCommentInput,
  MoveCommentInput,
  Receipt,
  RemoveCommentInput,
  ReplyToCommentInput,
  ResolveCommentInput,
  RevisionGuardOptions,
  SetCommentActiveInput,
  SetCommentInternalInput,
  TextSegment,
  TextTarget,
} from '@superdoc/document-api';
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import { TextSelection } from 'prosemirror-state';
import { v4 as uuidv4 } from 'uuid';
import { DocumentApiAdapterError } from '../errors.js';
import { requireEditorCommand } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { getRevision } from './revision-tracker.js';
import { resolveTextTarget, paginate, validatePaginationInput } from '../helpers/adapter-utils.js';
import { executeDomainCommand } from './plan-wrappers.js';
import {
  buildCommentJsonFromText,
  extractCommentText,
  findCommentEntity,
  getCommentEntityStore,
  isCommentResolved,
  removeCommentEntityTree,
  toCommentInfo,
  upsertCommentEntity,
} from '../helpers/comment-entity-store.js';
import { listCommentAnchors, resolveCommentAnchorsById } from '../helpers/comment-target-resolver.js';
import { normalizeExcerpt, toNonEmptyString } from '../helpers/value-utils.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type EditorUserIdentity = {
  name?: string;
  email?: string;
  image?: string;
};

function toCommentAddress(commentId: string): { kind: 'entity'; entityType: 'comment'; entityId: string } {
  return {
    kind: 'entity',
    entityType: 'comment',
    entityId: commentId,
  };
}

function toNotFoundError(input: unknown): DocumentApiAdapterError {
  return new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Comment target could not be resolved.', {
    target: input,
  });
}

function isSameTarget(
  left: { blockId: string; range: { start: number; end: number } },
  right: { blockId: string; range: { start: number; end: number } },
): boolean {
  return left.blockId === right.blockId && left.range.start === right.range.start && left.range.end === right.range.end;
}

function listCommentAnchorsSafe(editor: Editor): ReturnType<typeof listCommentAnchors> {
  try {
    return listCommentAnchors(editor);
  } catch {
    return [];
  }
}

function applyTextSelection(editor: Editor, from: number, to: number): boolean {
  const setTextSelection = editor.commands?.setTextSelection;
  if (typeof setTextSelection === 'function') {
    if (setTextSelection({ from, to }) === true) return true;
  }

  if (editor.state?.tr && typeof editor.dispatch === 'function') {
    try {
      const tr = editor.state.tr
        .setSelection(TextSelection.create(editor.state.doc, from, to))
        .setMeta('inputType', 'programmatic');
      editor.dispatch(tr);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function resolveCommentIdentity(
  editor: Editor,
  commentId: string,
): {
  commentId: string;
  importedId?: string;
  anchors: ReturnType<typeof resolveCommentAnchorsById>;
} {
  const store = getCommentEntityStore(editor);
  const record = findCommentEntity(store, commentId);
  const canonicalCommentIdFromRecord = toNonEmptyString(record?.commentId);
  const importedIdFromRecord = toNonEmptyString(record?.importedId);

  const anchorCandidates = [
    ...resolveCommentAnchorsById(editor, commentId),
    ...(canonicalCommentIdFromRecord && canonicalCommentIdFromRecord !== commentId
      ? resolveCommentAnchorsById(editor, canonicalCommentIdFromRecord)
      : []),
    ...(importedIdFromRecord &&
    importedIdFromRecord !== commentId &&
    importedIdFromRecord !== canonicalCommentIdFromRecord
      ? resolveCommentAnchorsById(editor, importedIdFromRecord)
      : []),
  ];

  const seen = new Set<string>();
  const anchors = anchorCandidates.filter((anchor) => {
    const key = `${anchor.commentId}|${anchor.importedId ?? ''}|${anchor.pos}|${anchor.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const canonicalCommentId = canonicalCommentIdFromRecord ?? anchors[0]?.commentId;

  if (!canonicalCommentId) {
    throw toNotFoundError({ commentId });
  }

  const importedId = importedIdFromRecord ?? anchors[0]?.importedId;

  return {
    commentId: canonicalCommentId,
    importedId,
    anchors,
  };
}

/**
 * A canonicalized anchor with merged same-block overlapping/adjacent ranges.
 * Carries both block-relative segment data (for TextTarget output) and
 * absolute PM positions (for text extraction).
 */
type CanonicalAnchor = {
  blockId: string;
  range: { start: number; end: number };
  pos: number;
  end: number;
};

/**
 * Merges same-block adjacent/overlapping anchors into canonical segments.
 *
 * Anchors MUST be pre-sorted in document order (by pos, then end).
 * Two same-block anchors merge when `next.range.start <= current.range.end`
 * (covers both overlap and adjacency). Cross-block anchors are always kept
 * as separate segments.
 */
function canonicalizeAnchors(sorted: ReturnType<typeof listCommentAnchors>): CanonicalAnchor[] {
  if (sorted.length === 0) return [];

  const result: CanonicalAnchor[] = [];
  let current: CanonicalAnchor = {
    blockId: sorted[0].target.blockId,
    range: { start: sorted[0].target.range.start, end: sorted[0].target.range.end },
    pos: sorted[0].pos,
    end: sorted[0].end,
  };

  for (let i = 1; i < sorted.length; i++) {
    const anchor = sorted[i];
    const sameBlock = anchor.target.blockId === current.blockId;
    const overlapsOrAdjacent = anchor.target.range.start <= current.range.end;

    if (sameBlock && overlapsOrAdjacent) {
      current.range.end = Math.max(current.range.end, anchor.target.range.end);
      current.end = Math.max(current.end, anchor.end);
    } else {
      result.push(current);
      current = {
        blockId: anchor.target.blockId,
        range: { start: anchor.target.range.start, end: anchor.target.range.end },
        pos: anchor.pos,
        end: anchor.end,
      };
    }
  }

  result.push(current);
  return result;
}

/**
 * Extracts and normalizes text for a single canonical anchor span.
 * Strips object-replacement characters (\ufffc) emitted for atom nodes
 * (e.g. commentRangeStart/commentRangeEnd).
 */
function extractSegmentText(editor: Editor, pos: number, end: number): string | undefined {
  try {
    const raw = editor.state.doc.textBetween(pos, end, ' ', '\ufffc');
    const cleaned = raw.replace(/\ufffc/g, '').trim();
    return cleaned.length > 0 ? cleaned : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds anchoredText from canonicalized anchors, joining segment texts
 * with spaces and normalizing the combined result.
 */
function buildAnchoredText(editor: Editor, canonical: CanonicalAnchor[]): string | undefined {
  const parts: string[] = [];
  for (const anchor of canonical) {
    const text = extractSegmentText(editor, anchor.pos, anchor.end);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? normalizeExcerpt(parts.join(' ')) : undefined;
}

/**
 * Converts canonicalized anchors into a TextTarget with segments
 * in document order.
 */
function buildTextTarget(canonical: CanonicalAnchor[]): TextTarget | undefined {
  if (canonical.length === 0) return undefined;

  const segments: TextSegment[] = canonical.map((a) => ({
    blockId: a.blockId,
    range: { start: a.range.start, end: a.range.end },
  }));

  return { kind: 'text', segments: segments as [TextSegment, ...TextSegment[]] };
}

/**
 * Groups all comment anchors by commentId, then merges anchor data (target,
 * anchoredText, status) into the corresponding CommentInfo records.
 *
 * Unlike the single-anchor approach, this collects ALL anchors per comment
 * into a multi-segment TextTarget, preserving cross-block and discontinuous
 * anchor fidelity.
 */
function mergeAnchorData(
  editor: Editor,
  infosById: Map<string, CommentInfo>,
  anchors: ReturnType<typeof listCommentAnchors>,
): void {
  const grouped = new Map<string, typeof anchors>();
  for (const anchor of anchors) {
    const group = grouped.get(anchor.commentId) ?? [];
    group.push(anchor);
    grouped.set(anchor.commentId, group);
  }

  for (const [commentId, commentAnchors] of grouped.entries()) {
    const sorted = [...commentAnchors].sort((a, b) => (a.pos === b.pos ? a.end - b.end : a.pos - b.pos));
    const firstAnchor = sorted[0];
    const status = sorted.every((anchor) => anchor.status === 'resolved') ? 'resolved' : 'open';
    const canonical = canonicalizeAnchors(sorted);
    const target = buildTextTarget(canonical);
    const anchoredText = buildAnchoredText(editor, canonical);
    const existing = infosById.get(commentId);

    if (existing) {
      if (!existing.target && target) existing.target = target;
      if (!existing.importedId && firstAnchor.importedId) existing.importedId = firstAnchor.importedId;
      if (existing.isInternal == null && firstAnchor.isInternal != null) existing.isInternal = firstAnchor.isInternal;
      if (status === 'open') existing.status = 'open';
      if (existing.anchoredText == null && anchoredText != null) existing.anchoredText = anchoredText;
      continue;
    }

    infosById.set(
      commentId,
      toCommentInfo(
        {
          commentId,
          importedId: firstAnchor.importedId,
          isInternal: firstAnchor.isInternal,
          isDone: status === 'resolved',
        },
        {
          target,
          status,
          anchoredText,
        },
      ),
    );
  }
}

function buildCommentInfos(editor: Editor): CommentInfo[] {
  const store = getCommentEntityStore(editor);
  const infosById = new Map<string, CommentInfo>();

  for (const entry of store) {
    const commentId = toNonEmptyString(entry.commentId) ?? toNonEmptyString(entry.importedId) ?? null;
    if (!commentId) continue;
    infosById.set(commentId, toCommentInfo({ ...entry, commentId }));
  }

  mergeAnchorData(editor, infosById, listCommentAnchorsSafe(editor));

  // Inherit target + anchoredText from nearest anchored ancestor for replies.
  // Walks up the parent chain so deep threads resolve regardless of iteration order.
  for (const info of infosById.values()) {
    if ((info.target != null && info.anchoredText != null) || !info.parentCommentId) continue;
    const visited = new Set<string>();
    let cursor: CommentInfo | undefined = info;
    while (cursor?.parentCommentId && !visited.has(cursor.parentCommentId)) {
      visited.add(cursor.parentCommentId);
      const ancestor = infosById.get(cursor.parentCommentId);
      if (ancestor?.target != null) {
        if (info.target == null) info.target = ancestor.target;
        if (info.anchoredText == null && ancestor.anchoredText != null) info.anchoredText = ancestor.anchoredText;
        break;
      }
      cursor = ancestor;
    }
  }

  const infos = Array.from(infosById.values());
  infos.sort((left, right) => {
    const leftCreated = left.createdTime ?? 0;
    const rightCreated = right.createdTime ?? 0;
    if (leftCreated !== rightCreated) return leftCreated - rightCreated;

    const leftStart = left.target?.segments[0]?.range.start ?? Number.MAX_SAFE_INTEGER;
    const rightStart = right.target?.segments[0]?.range.start ?? Number.MAX_SAFE_INTEGER;
    if (leftStart !== rightStart) return leftStart - rightStart;

    return left.commentId.localeCompare(right.commentId);
  });

  return infos;
}

// ---------------------------------------------------------------------------
// Mutation handlers
// ---------------------------------------------------------------------------

function addCommentHandler(editor: Editor, input: AddCommentInput, options?: RevisionGuardOptions): Receipt {
  requireEditorCommand(editor.commands?.addComment, 'comments.create (addComment)');

  if (input.target.range.start === input.target.range.end) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Comment target range must be non-collapsed.',
      },
    };
  }

  const resolved = resolveTextTarget(editor, input.target);
  if (!resolved) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Comment target could not be resolved.', {
      target: input.target,
    });
  }
  if (resolved.from === resolved.to) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Comment target range must be non-collapsed.',
      },
    };
  }

  if (!applyTextSelection(editor, resolved.from, resolved.to)) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Comment target selection could not be applied.',
        details: { target: input.target },
      },
    };
  }

  const commentId = uuidv4();

  const receipt = executeDomainCommand(
    editor,
    () => {
      const addComment = requireEditorCommand(editor.commands?.addComment, 'comments.create (addComment)');
      const didInsert = addComment({ content: input.text, isInternal: false, commentId }) === true;
      if (didInsert) {
        clearIndexCache(editor);
        const store = getCommentEntityStore(editor);
        const now = Date.now();
        const user = (editor.options?.user ?? {}) as EditorUserIdentity;
        upsertCommentEntity(store, commentId, {
          commentId,
          commentText: input.text,
          commentJSON: buildCommentJsonFromText(input.text),
          parentCommentId: undefined,
          createdTime: now,
          creatorName: user.name,
          creatorEmail: user.email,
          creatorImage: user.image,
          isDone: false,
          isInternal: false,
          fileId: editor.options?.documentId,
          documentId: editor.options?.documentId,
        });
      }
      return didInsert;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment insertion produced no change.' },
    };
  }

  return { success: true, inserted: [toCommentAddress(commentId)] };
}

function editCommentHandler(editor: Editor, input: EditCommentInput, options?: RevisionGuardOptions): Receipt {
  const editComment = requireEditorCommand(editor.commands?.editComment, 'comments.patch (editComment)');

  const store = getCommentEntityStore(editor);
  const identity = resolveCommentIdentity(editor, input.commentId);
  const existing = findCommentEntity(store, identity.commentId);
  const existingText = existing ? extractCommentText(existing) : undefined;
  if (existingText === input.text) {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment edit produced no change.' },
    };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const didEdit = editComment({
        commentId: identity.commentId,
        importedId: identity.importedId,
        content: input.text,
      });
      if (didEdit) {
        upsertCommentEntity(store, identity.commentId, {
          commentText: input.text,
          commentJSON: buildCommentJsonFromText(input.text),
          importedId: identity.importedId,
        });
      }
      return Boolean(didEdit);
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment edit produced no change.' },
    };
  }

  return { success: true, updated: [toCommentAddress(identity.commentId)] };
}

function replyToCommentHandler(editor: Editor, input: ReplyToCommentInput, options?: RevisionGuardOptions): Receipt {
  const addCommentReply = requireEditorCommand(editor.commands?.addCommentReply, 'comments.create (addCommentReply)');

  if (!input.parentCommentId) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Reply target requires a non-empty parent comment id.',
      },
    };
  }

  const parentIdentity = resolveCommentIdentity(editor, input.parentCommentId);
  const replyId = uuidv4();

  const receipt = executeDomainCommand(
    editor,
    () => {
      const didReply = addCommentReply({
        parentId: parentIdentity.commentId,
        content: input.text,
        commentId: replyId,
      });
      if (didReply) {
        const now = Date.now();
        const user = (editor.options?.user ?? {}) as EditorUserIdentity;
        const store = getCommentEntityStore(editor);
        upsertCommentEntity(store, replyId, {
          commentId: replyId,
          parentCommentId: parentIdentity.commentId,
          commentText: input.text,
          commentJSON: buildCommentJsonFromText(input.text),
          createdTime: now,
          creatorName: user.name,
          creatorEmail: user.email,
          creatorImage: user.image,
          isDone: false,
          isInternal: false,
          fileId: editor.options?.documentId,
          documentId: editor.options?.documentId,
        });
      }
      return Boolean(didReply);
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return {
      success: false,
      failure: { code: 'INVALID_TARGET', message: 'Comment reply could not be applied.' },
    };
  }

  return { success: true, inserted: [toCommentAddress(replyId)] };
}

function moveCommentHandler(editor: Editor, input: MoveCommentInput, options?: RevisionGuardOptions): Receipt {
  const moveComment = requireEditorCommand(editor.commands?.moveComment, 'comments.patch (moveComment)');

  if (input.target.range.start === input.target.range.end) {
    return {
      success: false,
      failure: { code: 'INVALID_TARGET', message: 'Comment target range must be non-collapsed.' },
    };
  }

  const resolved = resolveTextTarget(editor, input.target);
  if (!resolved) {
    throw toNotFoundError(input.target);
  }
  if (resolved.from === resolved.to) {
    return {
      success: false,
      failure: { code: 'INVALID_TARGET', message: 'Comment target range must be non-collapsed.' },
    };
  }

  const identity = resolveCommentIdentity(editor, input.commentId);
  if (!identity.anchors.length) {
    return {
      success: false,
      failure: { code: 'INVALID_TARGET', message: 'Comment cannot be moved because it has no resolvable anchor.' },
    };
  }

  if (identity.anchors.length > 1) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Comment move target is ambiguous for comments with multiple anchors.',
      },
    };
  }

  const currentTarget = identity.anchors[0]?.target;
  if (currentTarget && isSameTarget(currentTarget, input.target)) {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment move produced no change.' },
    };
  }

  const receipt = executeDomainCommand(
    editor,
    () => Boolean(moveComment({ commentId: identity.commentId, from: resolved.from, to: resolved.to })),
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment move produced no change.' },
    };
  }

  return { success: true, updated: [toCommentAddress(identity.commentId)] };
}

function resolveCommentHandler(editor: Editor, input: ResolveCommentInput, options?: RevisionGuardOptions): Receipt {
  const resolveComment = requireEditorCommand(editor.commands?.resolveComment, 'comments.patch (resolveComment)');

  const store = getCommentEntityStore(editor);
  const identity = resolveCommentIdentity(editor, input.commentId);
  const existing = findCommentEntity(store, identity.commentId);
  const alreadyResolved =
    (existing ? isCommentResolved(existing) : false) ||
    (identity.anchors.length > 0 && identity.anchors.every((a) => a.status === 'resolved'));
  if (alreadyResolved) {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment is already resolved.' },
    };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const didResolve = resolveComment({
        commentId: identity.commentId,
        importedId: identity.importedId,
      });
      if (didResolve) {
        upsertCommentEntity(store, identity.commentId, {
          importedId: identity.importedId,
          isDone: true,
          resolvedTime: Date.now(),
        });
      }
      return Boolean(didResolve);
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment resolve produced no change.' },
    };
  }

  return { success: true, updated: [toCommentAddress(identity.commentId)] };
}

function removeCommentHandler(editor: Editor, input: RemoveCommentInput, options?: RevisionGuardOptions): Receipt {
  const removeComment = requireEditorCommand(editor.commands?.removeComment, 'comments.remove (removeComment)');

  const store = getCommentEntityStore(editor);
  const identity = resolveCommentIdentity(editor, input.commentId);

  let didRemove = false;
  let removedRecords: ReturnType<typeof removeCommentEntityTree> = [];

  const receipt = executeDomainCommand(
    editor,
    () => {
      didRemove = removeComment({ commentId: identity.commentId, importedId: identity.importedId }) === true;
      removedRecords = removeCommentEntityTree(store, identity.commentId);
      return didRemove || removedRecords.length > 0;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment remove produced no change.' },
    };
  }

  const removedIds = new Set<string>();
  for (const record of removedRecords) {
    const removedId = toNonEmptyString(record.commentId);
    if (removedId) {
      removedIds.add(removedId);
    }
  }
  if (!removedIds.size && didRemove) {
    removedIds.add(identity.commentId);
  }

  return {
    success: true,
    removed: Array.from(removedIds).map((id) => toCommentAddress(id)),
  };
}

function setCommentInternalHandler(
  editor: Editor,
  input: SetCommentInternalInput,
  options?: RevisionGuardOptions,
): Receipt {
  const setCommentInternal = requireEditorCommand(
    editor.commands?.setCommentInternal,
    'comments.setInternal (setCommentInternal)',
  );

  const store = getCommentEntityStore(editor);
  const identity = resolveCommentIdentity(editor, input.commentId);
  const existing = findCommentEntity(store, identity.commentId);
  const currentInternal =
    (typeof existing?.isInternal === 'boolean' ? existing.isInternal : undefined) ?? identity.anchors[0]?.isInternal;

  if (typeof currentInternal === 'boolean' && currentInternal === input.isInternal) {
    return {
      success: false,
      failure: { code: 'NO_OP', message: 'Comment internal state is already set to the requested value.' },
    };
  }

  const hasOpenAnchor = identity.anchors.some((anchor) => anchor.status === 'open');

  const receipt = executeDomainCommand(
    editor,
    () => {
      if (hasOpenAnchor) {
        const didApply = setCommentInternal({
          commentId: identity.commentId,
          importedId: identity.importedId,
          isInternal: input.isInternal,
        });
        if (!didApply) return false;
      }
      upsertCommentEntity(store, identity.commentId, {
        importedId: identity.importedId,
        isInternal: input.isInternal,
      });
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Comment internal state could not be updated on the current anchor.',
      },
    };
  }

  return { success: true, updated: [toCommentAddress(identity.commentId)] };
}

function setCommentActiveHandler(
  editor: Editor,
  input: SetCommentActiveInput,
  options?: RevisionGuardOptions,
): Receipt {
  const setActiveComment = requireEditorCommand(
    editor.commands?.setActiveComment,
    'comments.setActive (setActiveComment)',
  );

  let resolvedCommentId: string | null = null;
  if (input.commentId != null) {
    resolvedCommentId = resolveCommentIdentity(editor, input.commentId).commentId;
  }

  const receipt = executeDomainCommand(editor, () => Boolean(setActiveComment({ commentId: resolvedCommentId })), {
    expectedRevision: options?.expectedRevision,
  });

  if (receipt.steps[0]?.effect !== 'changed') {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Active comment could not be updated.',
      },
    };
  }

  return {
    success: true,
    updated: resolvedCommentId ? [toCommentAddress(resolvedCommentId)] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Read handlers
// ---------------------------------------------------------------------------

function goToCommentHandler(editor: Editor, input: GoToCommentInput): Receipt {
  const setCursorById = requireEditorCommand(editor.commands?.setCursorById, 'comments.goTo (setCursorById)');

  const identity = resolveCommentIdentity(editor, input.commentId);
  let didSetCursor = setCursorById(identity.commentId);
  if (!didSetCursor && identity.importedId && identity.importedId !== identity.commentId) {
    didSetCursor = setCursorById(identity.importedId);
  }
  if (!didSetCursor) {
    throw toNotFoundError({ commentId: identity.commentId });
  }

  return {
    success: true,
    updated: [toCommentAddress(identity.commentId)],
  };
}

function getCommentHandler(editor: Editor, input: GetCommentInput): CommentInfo {
  const comments = buildCommentInfos(editor);
  const found = comments.find(
    (comment) => comment.commentId === input.commentId || comment.importedId === input.commentId,
  );
  if (!found) {
    throw toNotFoundError({ commentId: input.commentId });
  }
  return found;
}

function listCommentsHandler(editor: Editor, query?: CommentsListQuery): CommentsListResult {
  validatePaginationInput(query?.offset, query?.limit);

  const comments = buildCommentInfos(editor);
  const includeResolved = query?.includeResolved ?? true;
  const filtered = includeResolved ? comments : comments.filter((comment) => comment.status !== 'resolved');
  const evaluatedRevision = getRevision(editor);

  const paged = paginate(filtered, query?.offset, query?.limit);

  const items = paged.items.map((comment) => {
    const handle = buildResolvedHandle(`comment:${comment.commentId}`, 'stable', 'comment');
    const {
      importedId,
      parentCommentId,
      text,
      isInternal,
      status,
      target,
      anchoredText,
      createdTime,
      creatorName,
      creatorEmail,
      address,
    } = comment;
    return buildDiscoveryItem(comment.commentId, handle, {
      address,
      importedId,
      parentCommentId,
      text,
      isInternal,
      status,
      target,
      anchoredText,
      createdTime,
      creatorName,
      creatorEmail,
    });
  });

  return buildDiscoveryResult({
    evaluatedRevision,
    total: paged.total,
    items,
    page: { limit: query?.limit ?? paged.total, offset: query?.offset ?? 0, returned: items.length },
  });
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export function createCommentsWrapper(editor: Editor): CommentsAdapter {
  return {
    add: (input: AddCommentInput, options?: RevisionGuardOptions) => addCommentHandler(editor, input, options),
    edit: (input: EditCommentInput, options?: RevisionGuardOptions) => editCommentHandler(editor, input, options),
    reply: (input: ReplyToCommentInput, options?: RevisionGuardOptions) =>
      replyToCommentHandler(editor, input, options),
    move: (input: MoveCommentInput, options?: RevisionGuardOptions) => moveCommentHandler(editor, input, options),
    resolve: (input: ResolveCommentInput, options?: RevisionGuardOptions) =>
      resolveCommentHandler(editor, input, options),
    remove: (input: RemoveCommentInput, options?: RevisionGuardOptions) => removeCommentHandler(editor, input, options),
    setInternal: (input: SetCommentInternalInput, options?: RevisionGuardOptions) =>
      setCommentInternalHandler(editor, input, options),
    setActive: (input: SetCommentActiveInput, options?: RevisionGuardOptions) =>
      setCommentActiveHandler(editor, input, options),
    goTo: (input: GoToCommentInput) => goToCommentHandler(editor, input),
    get: (input: GetCommentInput) => getCommentHandler(editor, input),
    list: (query?: CommentsListQuery) => listCommentsHandler(editor, query),
  };
}
