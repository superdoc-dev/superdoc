/**
 * Track-changes convenience wrappers — bridge track-change operations to
 * the plan engine's revision management and execution path.
 *
 * Discovery (list / get) is a thin passthrough over the host-level
 * {@link getTrackedChangeIndex} service, so there is a single owner for
 * tracked-change enumeration across every revision-capable story.
 *
 * Mutating operations (accept, reject, acceptAll, rejectAll) route through
 * the story runtime resolver so that non-body tracked changes execute in
 * the owning story editor and commit back through `mutatePart(...)`.
 */

import type { Editor } from '../../core/Editor.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  Receipt,
  RevisionGuardOptions,
  TextTarget,
  TrackChangeInfo,
  TrackChangeWordRevisionIds,
  TrackChangesAcceptAllInput,
  TrackChangesAcceptInput,
  TrackChangesGetInput,
  TrackChangesListInput,
  TrackChangesRejectAllInput,
  TrackChangesRejectInput,
  TrackChangeType,
  TrackChangesListResult,
  StoryLocator,
} from '@superdoc/document-api';
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';
import {
  type CommentEntityRecord,
  findCommentEntity,
  getCommentEntityStore,
  removeCommentEntityTree,
  stashRemovedCommentEntities,
} from '../helpers/comment-entity-store.js';
import { resolveCommentAnchorsById } from '../helpers/comment-target-resolver.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { paginate, validatePaginationInput } from '../helpers/adapter-utils.js';
import { resolveTextRangeInBlock } from '../helpers/text-offset-resolver.js';
import { checkRevision, getRevision } from './revision-tracker.js';
import {
  resolveTrackedChangeInStory,
  resolveTrackedChangeType,
  splitProjectedTrackedChangeId,
} from '../helpers/tracked-change-resolver.js';
import { getTrackedChangeIndex } from '../tracked-changes/tracked-change-index.js';
import type { TrackedChangeSnapshot } from '../tracked-changes/tracked-change-snapshot.js';
import { resolveStoryRuntime } from '../story-runtime/resolve-story-runtime.js';
import { BODY_STORY_KEY, buildStoryKey } from '../story-runtime/story-key.js';
import { makeTrackedChangeAnchorKey } from '../helpers/tracked-change-runtime-ref.js';
import { normalizeExcerpt, toNonEmptyString } from '../helpers/value-utils.js';

function normalizeWordRevisionIds(
  wordRevisionIds: TrackChangeWordRevisionIds | undefined,
): TrackChangeWordRevisionIds | undefined {
  if (!wordRevisionIds) return undefined;

  const normalized: TrackChangeWordRevisionIds = {};
  if (wordRevisionIds.insert) normalized.insert = wordRevisionIds.insert;
  if (wordRevisionIds.delete) normalized.delete = wordRevisionIds.delete;
  if (wordRevisionIds.format) normalized.format = wordRevisionIds.format;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

type ProjectedTrackChange = {
  info: TrackChangeInfo;
  handleKey: string;
  snapshot: TrackedChangeSnapshot;
};

type ProjectedTrackedChangeCacheEntry = {
  revision: string;
  byProjectedId: Map<string, TrackedChangeSnapshot>;
};

const projectedTrackedChangeCache = new WeakMap<Editor, ProjectedTrackedChangeCacheEntry>();
type ReplacementsMode = 'paired' | 'independent';

function readReplacementsMode(editor: Editor): ReplacementsMode {
  return editor?.options?.trackedChanges?.replacements === 'independent' ? 'independent' : 'paired';
}

function buildChangedTextFields(
  type: TrackChangeType,
  excerpt: string | undefined,
): Pick<TrackChangeInfo, 'insertedText' | 'deletedText'> | Record<never, never> {
  if (!excerpt) return {};
  if (type === 'insert') return { insertedText: excerpt };
  if (type === 'delete') return { deletedText: excerpt };
  return {};
}

function buildProjectedInfo(
  snapshot: TrackedChangeSnapshot,
  options: {
    id?: string;
    type?: TrackChangeType;
    grouping?: TrackChangeInfo['grouping'];
    pairedWithChangeId?: string | null;
    handleSuffix?: string;
  } = {},
): ProjectedTrackChange {
  const id = options.id ?? snapshot.address.entityId;
  const type = options.type ?? snapshot.type;
  return {
    info: {
      address: {
        ...snapshot.address,
        entityId: id,
      },
      id,
      type,
      grouping: options.grouping,
      pairedWithChangeId: options.pairedWithChangeId ?? undefined,
      wordRevisionIds: normalizeWordRevisionIds(snapshot.wordRevisionIds),
      overlap: snapshot.overlap,
      author: snapshot.author,
      authorEmail: snapshot.authorEmail,
      authorImage: snapshot.authorImage,
      date: snapshot.date,
      excerpt: snapshot.excerpt,
      ...buildChangedTextFields(type, snapshot.excerpt),
      origin: snapshot.origin,
      imported: snapshot.imported,
    },
    handleKey: `${snapshot.anchorKey}${options.handleSuffix ?? ''}`,
    snapshot,
  };
}

function isCombinedReplacementSnapshot(snapshot: TrackedChangeSnapshot): boolean {
  return snapshot.hasInsert && snapshot.hasDelete;
}

function replacementPairKey(snapshot: TrackedChangeSnapshot): string | null {
  if (snapshot.type !== 'insert' && snapshot.type !== 'delete') return null;
  if (snapshot.replacementGroupId) {
    return `group:${snapshot.runtimeRef.storyKey}:${snapshot.replacementGroupId}`;
  }
  if (snapshot.commandRawId) {
    return `command:${snapshot.runtimeRef.storyKey}:${snapshot.commandRawId}`;
  }
  return null;
}

function projectedSnapshotType(snapshot: TrackedChangeSnapshot): TrackChangeType {
  return isCombinedReplacementSnapshot(snapshot) ? 'replacement' : snapshot.type;
}

function snapshotGrouping(snapshot: TrackedChangeSnapshot): TrackChangeInfo['grouping'] {
  return isCombinedReplacementSnapshot(snapshot) ? 'replacement-pair' : 'standalone';
}

function snapshotToProjected(snapshot: TrackedChangeSnapshot): ProjectedTrackChange {
  return buildProjectedInfo(snapshot, {
    type: projectedSnapshotType(snapshot),
    grouping: snapshotGrouping(snapshot),
    pairedWithChangeId: null,
  });
}

function snapshotToInfo(snapshot: TrackedChangeSnapshot): TrackChangeInfo {
  return snapshotToProjected(snapshot).info;
}

function mergeWordRevisionIdsFromPair(
  inserted: TrackedChangeSnapshot,
  deleted: TrackedChangeSnapshot,
): TrackChangeWordRevisionIds | undefined {
  return normalizeWordRevisionIds({
    insert: inserted.wordRevisionIds?.insert,
    delete: deleted.wordRevisionIds?.delete,
    format: inserted.wordRevisionIds?.format ?? deleted.wordRevisionIds?.format,
  });
}

function projectSplitReplacementPair(group: ReadonlyArray<TrackedChangeSnapshot>): ProjectedTrackChange | null {
  const inserted = group.find((snapshot) => snapshot.type === 'insert');
  const deleted = group.find((snapshot) => snapshot.type === 'delete');
  if (!inserted || !deleted) return null;

  const projected = buildProjectedInfo(inserted, {
    type: 'replacement',
    grouping: 'replacement-pair',
    pairedWithChangeId: null,
  });

  projected.info.wordRevisionIds = mergeWordRevisionIdsFromPair(inserted, deleted);
  projected.info.insertedText = inserted.excerpt;
  projected.info.deletedText = deleted.excerpt;

  return projected;
}

export function projectSnapshots(
  snapshots: ReadonlyArray<TrackedChangeSnapshot>,
  replacements: ReplacementsMode = 'paired',
): ProjectedTrackChange[] {
  const byPairKey = new Map<string, TrackedChangeSnapshot[]>();
  for (const snapshot of snapshots) {
    if (isCombinedReplacementSnapshot(snapshot)) continue;
    const key = replacementPairKey(snapshot);
    if (!key) continue;
    const group = byPairKey.get(key) ?? [];
    group.push(snapshot);
    byPairKey.set(key, group);
  }

  const collapsedByPairKey = new Map<string, ProjectedTrackChange>();
  if (replacements === 'paired') {
    for (const [key, group] of byPairKey.entries()) {
      const collapsed = projectSplitReplacementPair(group);
      if (collapsed) collapsedByPairKey.set(key, collapsed);
    }
  }

  const projected: ProjectedTrackChange[] = [];
  const emittedPairKeys = new Set<string>();
  for (const snapshot of snapshots) {
    if (isCombinedReplacementSnapshot(snapshot)) {
      projected.push(snapshotToProjected(snapshot));
      continue;
    }

    const pairKey = replacementPairKey(snapshot);
    if (pairKey && replacements === 'paired') {
      const collapsed = collapsedByPairKey.get(pairKey);
      if (collapsed) {
        if (!emittedPairKeys.has(pairKey)) {
          emittedPairKeys.add(pairKey);
          projected.push(collapsed);
        }
        continue;
      }
    }

    projected.push(buildProjectedInfo(snapshot, { grouping: 'standalone', pairedWithChangeId: null }));
  }

  return projected;
}

function cacheProjectedTrackedChanges(
  editor: Editor,
  projected: ReadonlyArray<ProjectedTrackChange>,
  revision = getRevision(editor),
): void {
  projectedTrackedChangeCache.set(editor, {
    revision,
    byProjectedId: new Map(projected.map((row) => [row.info.id, row.snapshot])),
  });
}

export function getCachedProjectedTrackedChangeSnapshot(
  editor: Editor,
  projectedId: string,
): TrackedChangeSnapshot | null {
  const cache = projectedTrackedChangeCache.get(editor);
  if (!cache) return null;
  if (cache.revision !== getRevision(editor)) return null;
  return cache.byProjectedId.get(projectedId) ?? null;
}

function filterProjectedByType(
  rows: ReadonlyArray<ProjectedTrackChange>,
  requestedType?: TrackChangeType,
): ProjectedTrackChange[] {
  if (!requestedType) return [...rows];
  return rows.filter((row) => row.info.type === requestedType);
}

function toNoOpReceipt(message: string, details?: unknown): Receipt {
  return {
    success: false,
    failure: {
      code: 'NO_OP',
      message,
      details,
    },
  };
}

function decisionFailureReceipt(editor: Editor, fallbackMessage: string, fallbackDetails?: unknown): Receipt {
  const storage = (
    editor as {
      storage?: {
        trackChanges?: {
          lastDecisionFailure?: { code?: string; message?: string; details?: unknown } | null;
        };
      };
    }
  ).storage;
  const failureInfo = storage?.trackChanges?.lastDecisionFailure ?? null;
  if (!failureInfo?.code) {
    return toNoOpReceipt(fallbackMessage, fallbackDetails);
  }
  return {
    success: false,
    failure: {
      code: failureInfo.code as Extract<Receipt, { success: false }>['failure']['code'],
      message: failureInfo.message ?? fallbackMessage,
      details: failureInfo.details ?? fallbackDetails,
    },
  };
}

type DecisionCommentEffectReceipt = {
  deletedComments?: Array<{ id?: string | null }>;
  detachedComments?: Array<{ id?: string | null }>;
};

function commentEntityId(record: CommentEntityRecord): string | null {
  return toNonEmptyString(record.commentId) ?? toNonEmptyString(record.importedId);
}

function isTrackedChangeLinkedRootComment(record: CommentEntityRecord): boolean {
  return (
    !toNonEmptyString(record.parentCommentId) &&
    (record.trackedChange === true ||
      toNonEmptyString(record.trackedChangeParentId) != null ||
      record.trackedChangeType != null ||
      record.trackedChangeAnchorKey != null)
  );
}

function trackedCommentRootHasLiveAnchors(editor: Editor, commentId: string, record: CommentEntityRecord): boolean {
  const aliases = new Set([commentId, toNonEmptyString(record.importedId)].filter((value): value is string => !!value));
  for (const alias of aliases) {
    if (resolveCommentAnchorsById(editor, alias).length > 0) return true;
  }
  return false;
}

function emitDeletedCommentUpdate(editor: Editor, commentId: string): void {
  const emitter = (editor as unknown as { emit?: (event: string, payload: unknown) => void }).emit;
  if (typeof emitter !== 'function') return;

  const documentId = toNonEmptyString(editor.options?.documentId) ?? null;
  emitter.call(editor, 'commentsUpdate', {
    type: 'deleted',
    comment: {
      commentId,
      documentId,
      fileId: documentId,
    },
  });
}

function pruneMissingTrackedCommentRoots(editor: Editor): string[] {
  const store = getCommentEntityStore(editor);
  const rootIds = Array.from(
    new Set(
      store
        .filter(isTrackedChangeLinkedRootComment)
        .map((record) => commentEntityId(record))
        .filter((commentId): commentId is string => commentId != null),
    ),
  );
  const removedIds = new Set<string>();

  for (const commentId of rootIds) {
    const record = findCommentEntity(store, commentId);
    if (!record) continue;
    if (trackedCommentRootHasLiveAnchors(editor, commentId, record)) continue;
    const removed = removeCommentEntityTree(store, commentId);
    stashRemovedCommentEntities(editor, removed);
    for (const removedRecord of removed) {
      const removedId = commentEntityId(removedRecord);
      if (removedId) removedIds.add(removedId);
    }
  }

  return Array.from(removedIds);
}

function applyDecisionCommentEffects(hostEditor: Editor, decisionEditor: Editor): void {
  const storage = (
    decisionEditor as {
      storage?: {
        trackChanges?: {
          lastDecisionReceipt?: DecisionCommentEffectReceipt | null;
        };
      };
    }
  ).storage;
  const store = getCommentEntityStore(hostEditor);
  const receipt = storage?.trackChanges?.lastDecisionReceipt ?? null;
  const deletedCommentIds = new Set(
    (receipt?.deletedComments ?? []).map((entry) => toNonEmptyString(entry?.id)).filter(Boolean),
  );
  const detachedCommentIds = new Set(
    (receipt?.detachedComments ?? [])
      .map((entry) => toNonEmptyString(entry?.id))
      .filter((id): id is string => Boolean(id) && !deletedCommentIds.has(id)),
  );

  for (const commentId of deletedCommentIds) {
    const removed = removeCommentEntityTree(store, commentId);
    stashRemovedCommentEntities(hostEditor, removed);
  }

  for (const commentId of detachedCommentIds) {
    const record = findCommentEntity(store, commentId);
    if (!record) continue;
    record.trackedChange = false;
    record.trackedChangeParentId = null;
    record.trackedChangeType = null;
    record.trackedChangeDisplayType = null;
    record.trackedChangeStory = null;
    record.trackedChangeStoryKind = null;
    record.trackedChangeStoryLabel = null;
    record.trackedChangeAnchorKey = null;
    record.trackedChangeText = null;
    record.deletedText = null;
  }

  const prunedCommentIds = pruneMissingTrackedCommentRoots(hostEditor);
  for (const commentId of prunedCommentIds) {
    emitDeletedCommentUpdate(hostEditor, commentId);
  }
}

function resolveListScope(input: TrackChangesListInput | undefined): 'body' | 'all' | { story: StoryLocator } {
  if (!input || input.in === undefined) return 'body';
  if (input.in === 'all') return 'all';
  return { story: input.in };
}

export function trackChangesListWrapper(editor: Editor, input?: TrackChangesListInput): TrackChangesListResult {
  validatePaginationInput(input?.offset, input?.limit);

  const index = getTrackedChangeIndex(editor);
  const scope = resolveListScope(input);

  let rawSnapshots: ReadonlyArray<TrackedChangeSnapshot>;
  if (scope === 'all') {
    rawSnapshots = index.getAll();
  } else if (scope === 'body') {
    rawSnapshots = index.get({ kind: 'story', storyType: 'body' });
  } else {
    rawSnapshots = index.get(scope.story);
  }

  const projected = projectSnapshots(rawSnapshots, readReplacementsMode(editor));
  const evaluatedRevision = getRevision(editor);
  cacheProjectedTrackedChanges(editor, projected, evaluatedRevision);
  const filtered = filterProjectedByType(projected, input?.type);
  const paged = paginate(filtered, input?.offset, input?.limit);
  // Track-changes discovery uses a document-level revision token across every
  // scope. Part commits also advance the host revision, so one shared token
  // correctly guards body, story-scoped, and replacement-aware review flows.

  const items = paged.items.map((row) => {
    const info = row.info;
    const handle = buildResolvedHandle(row.handleKey, 'stable', 'trackedChange');
    const {
      address,
      type,
      grouping,
      pairedWithChangeId,
      wordRevisionIds,
      overlap,
      author,
      authorEmail,
      authorImage,
      date,
      excerpt,
      insertedText,
      deletedText,
      origin,
      imported,
    } = info;
    return buildDiscoveryItem(info.id, handle, {
      address,
      type,
      grouping,
      pairedWithChangeId,
      wordRevisionIds,
      overlap,
      author,
      authorEmail,
      authorImage,
      date,
      excerpt,
      insertedText,
      deletedText,
      origin,
      imported,
    });
  });

  return buildDiscoveryResult({
    evaluatedRevision,
    total: paged.total,
    items,
    page: { limit: input?.limit ?? paged.total, offset: input?.offset ?? 0, returned: items.length },
  });
}

export function trackChangesGetWrapper(editor: Editor, input: TrackChangesGetInput): TrackChangeInfo {
  const { id, story } = input;
  const resolved = resolveTrackedChangeInStory(editor, {
    kind: 'entity',
    entityType: 'trackedChange',
    entityId: id,
    ...(story ? { story } : {}),
  });
  if (!resolved) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Tracked change "${id}" was not found.`, { id });
  }

  const index = getTrackedChangeIndex(editor);
  const storyKey = buildStoryKey(resolved.story);
  const anchorKey = makeTrackedChangeAnchorKey(resolved.runtimeRef);
  const snapshots =
    storyKey === BODY_STORY_KEY ? index.get({ kind: 'story', storyType: 'body' }) : index.get(resolved.story);
  const projected = projectSnapshots(snapshots, readReplacementsMode(editor));
  const projectedMatch = projected.find((row) => row.info.id === id);

  if (projectedMatch) return projectedMatch.info;

  const { baseId } = splitProjectedTrackedChangeId(id);
  const snapshot = snapshots.find((item) => item.anchorKey === anchorKey || item.address.entityId === baseId);

  if (snapshot) return snapshotToInfo(snapshot);

  const type = resolveTrackedChangeType(resolved.change);
  const excerpt =
    (resolved.change.excerpt !== undefined ? resolved.change.excerpt : undefined) ??
    normalizeExcerpt(resolved.editor.state.doc.textBetween(resolved.change.from, resolved.change.to, ' ', '\ufffc'));
  const grouping =
    resolved.change.hasInsert && resolved.change.hasDelete && !resolved.change.hasFormat
      ? 'replacement-pair'
      : undefined;

  return {
    address: {
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: resolved.change.id,
      ...(storyKey === BODY_STORY_KEY ? {} : { story: resolved.story }),
    },
    id: resolved.change.id,
    type,
    grouping,
    wordRevisionIds: normalizeWordRevisionIds(resolved.change.wordRevisionIds),
    overlap: resolved.change.overlap,
    author: toNonEmptyString(resolved.change.attrs.author),
    authorEmail: toNonEmptyString(resolved.change.attrs.authorEmail),
    authorImage: toNonEmptyString(resolved.change.attrs.authorImage),
    date: toNonEmptyString(resolved.change.attrs.date),
    excerpt,
    ...buildChangedTextFields(type, excerpt),
    origin: toNonEmptyString(resolved.change.attrs.origin) as TrackChangeInfo['origin'],
    imported: Boolean(toNonEmptyString(resolved.change.attrs.sourceId)),
  };
}

type ReviewDecision = 'accept' | 'reject';

function decideSingle(
  hostEditor: Editor,
  decision: ReviewDecision,
  id: string,
  story: StoryLocator | undefined,
  options: RevisionGuardOptions | undefined,
): Receipt {
  const resolved = resolveTrackedChangeInStory(hostEditor, {
    kind: 'entity',
    entityType: 'trackedChange',
    entityId: id,
    ...(story ? { story } : {}),
  });

  if (!resolved) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Tracked change "${id}" was not found.`, { id, story });
  }

  const commandName = decision === 'accept' ? 'acceptTrackedChangeById' : 'rejectTrackedChangeById';
  const command = (resolved.editor.commands as Record<string, ((rawId: string) => boolean) | undefined>)[commandName];
  if (typeof command !== 'function') {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      `${decision === 'accept' ? 'Accept' : 'Reject'} tracked change command is not available on the story editor.`,
      { reason: 'missing_command' },
    );
  }

  checkRevision(hostEditor, options?.expectedRevision);

  const commandRawId = resolved.change.commandRawId ?? resolved.change.rawId;
  const receipt = executeDomainCommand(resolved.editor, () => Boolean(command(commandRawId)));

  if (receipt.steps[0]?.effect !== 'changed') {
    return decisionFailureReceipt(
      resolved.editor,
      `${decision === 'accept' ? 'Accept' : 'Reject'} tracked change "${id}" produced no change.`,
      {
        id,
        story,
      },
    );
  }

  if (resolved.commit) {
    resolved.commit(hostEditor);
  }

  getTrackedChangeIndex(hostEditor).invalidate(resolved.story);
  applyDecisionCommentEffects(hostEditor, resolved.editor);

  return { success: true };
}

export function trackChangesAcceptWrapper(
  editor: Editor,
  input: TrackChangesAcceptInput,
  options?: RevisionGuardOptions,
): Receipt {
  return decideSingle(editor, 'accept', input.id, input.story, options);
}

export function trackChangesRejectWrapper(
  editor: Editor,
  input: TrackChangesRejectInput,
  options?: RevisionGuardOptions,
): Receipt {
  return decideSingle(editor, 'reject', input.id, input.story, options);
}

function decideAll(
  editor: Editor,
  decision: ReviewDecision,
  input: TrackChangesAcceptAllInput | TrackChangesRejectAllInput,
  options: RevisionGuardOptions | undefined,
): Receipt {
  const index = getTrackedChangeIndex(editor);
  const requestedStoryKey = input.story && input.story !== 'all' ? buildStoryKey(input.story) : null;
  const allSnapshots = index.getAll();
  const matchingSnapshots = requestedStoryKey
    ? allSnapshots.filter((snapshot) => snapshot.runtimeRef.storyKey === requestedStoryKey)
    : allSnapshots;

  if (matchingSnapshots.length === 0) {
    return toNoOpReceipt(`${decision === 'accept' ? 'Accept' : 'Reject'} all tracked changes produced no change.`);
  }

  checkRevision(editor, options?.expectedRevision);

  const byStoryKey = new Map<string, { story: StoryLocator; snapshots: TrackedChangeSnapshot[] }>();
  for (const snapshot of matchingSnapshots) {
    const key = snapshot.runtimeRef.storyKey;
    const entry = byStoryKey.get(key);
    if (entry) {
      entry.snapshots.push(snapshot);
      continue;
    }
    byStoryKey.set(key, { story: snapshot.story, snapshots: [snapshot] });
  }

  let anyApplied = false;

  for (const { story, snapshots } of byStoryKey.values()) {
    const runtime = resolveStoryRuntime(editor, story);
    const commandName = decision === 'accept' ? 'acceptAllTrackedChanges' : 'rejectAllTrackedChanges';
    const bulkCommand = (runtime.editor.commands as Record<string, (() => boolean) | undefined>)[commandName];

    const receipt = executeDomainCommand(runtime.editor, (): boolean => {
      if (typeof bulkCommand === 'function') return Boolean(bulkCommand());

      const perChangeCommand = (runtime.editor.commands as Record<string, ((rawId: string) => boolean) | undefined>)[
        decision === 'accept' ? 'acceptTrackedChangeById' : 'rejectTrackedChangeById'
      ];
      if (typeof perChangeCommand !== 'function') return false;

      let applied = false;
      for (const snapshot of snapshots) {
        const resolved = resolveTrackedChangeInStory(editor, snapshot.address);
        const commandRawId = resolved?.change.commandRawId ?? snapshot.runtimeRef.rawId;
        if (perChangeCommand(commandRawId)) {
          applied = true;
        }
      }
      return applied;
    });

    const changed = receipt.steps[0]?.effect === 'changed';
    if (!changed) continue;

    anyApplied = true;
    if (runtime.commit) {
      runtime.commit(editor);
    }
    index.invalidate(story);
    applyDecisionCommentEffects(editor, runtime.editor);
  }

  if (!anyApplied) {
    return decisionFailureReceipt(
      editor,
      `${decision === 'accept' ? 'Accept' : 'Reject'} all tracked changes produced no change.`,
    );
  }

  return { success: true };
}

export function trackChangesAcceptAllWrapper(
  editor: Editor,
  input: TrackChangesAcceptAllInput,
  options?: RevisionGuardOptions,
): Receipt {
  return decideAll(editor, 'accept', input, options);
}

export function trackChangesRejectAllWrapper(
  editor: Editor,
  input: TrackChangesRejectAllInput,
  options?: RevisionGuardOptions,
): Receipt {
  return decideAll(editor, 'reject', input, options);
}

// ---------------------------------------------------------------------------
// trackChanges.decide range targets
// ---------------------------------------------------------------------------

/**
 * Resolve a {@link TextTarget} into a single contiguous PM range within the
 * body story. Multi-segment ranges are deferred (CAPABILITY_UNAVAILABLE)
 * until fixtures land — partial decisions per phase0-004 only need a single
 * contiguous selection.
 */
function resolveRangeToPmCoords(editor: Editor, range: TextTarget): { from: number; to: number } | null {
  if (!range.segments?.length) return null;
  if (range.segments.length > 1) return null; // multi-segment ranges deferred.
  const seg = range.segments[0];
  const doc = editor.state.doc;
  const block = findBlockStart(doc, seg.blockId);
  if (!block) return null;
  return resolveTextRangeInBlock(block.node, block.pos, seg.range);
}

function findBlockStart(
  doc: {
    descendants: (fn: (node: ProseMirrorNode, pos: number) => boolean | void) => void;
  },
  blockId: string,
): { node: ProseMirrorNode; pos: number } | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    const attrs = node.attrs as Record<string, unknown>;
    if ((attrs?.blockId ?? attrs?.sdBlockId ?? attrs?.id) === blockId) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

export function trackChangesDecideRangeWrapper(
  editor: Editor,
  input: { decision: 'accept' | 'reject'; range: TextTarget; story?: StoryLocator },
  options?: RevisionGuardOptions,
): Receipt {
  // Story routing — for now partial-range decisions are implemented
  // for the body story only. Non-body stories require structural plumbing
  // owned by phase0-005 and fail closed here.
  const story = input.story;
  if (story && (story.kind !== 'story' || story.storyType !== 'body')) {
    return {
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'trackChanges.decide range targets currently support the body story only.',
        details: { story: input.story },
      },
    };
  }
  const resolved = resolveRangeToPmCoords(editor, input.range);
  if (!resolved) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'trackChanges.decide range could not be resolved to a contiguous PM coordinate.',
        details: { range: input.range },
      },
    };
  }
  checkRevision(editor, options?.expectedRevision);

  const commandName = input.decision === 'accept' ? 'acceptTrackedChangesBetween' : 'rejectTrackedChangesBetween';
  const command = (editor.commands as Record<string, ((from: number, to: number) => boolean) | undefined>)[commandName];
  if (typeof command !== 'function') {
    return {
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: `${commandName} command is not available on the editor.`,
      },
    };
  }
  const applied = Boolean(command(resolved.from, resolved.to));
  if (!applied) {
    return decisionFailureReceipt(editor, 'No tracked changes matched the requested decision target.', {
      range: input.range,
      story: input.story,
    });
  }
  getTrackedChangeIndex(editor).invalidate({ kind: 'story', storyType: 'body' });
  applyDecisionCommentEffects(editor, editor);
  return { success: true };
}
