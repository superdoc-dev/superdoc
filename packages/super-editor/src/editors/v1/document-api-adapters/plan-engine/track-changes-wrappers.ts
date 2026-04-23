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
import type {
  Receipt,
  RevisionGuardOptions,
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
import { executeDomainCommand } from './plan-wrappers.js';
import { paginate, validatePaginationInput } from '../helpers/adapter-utils.js';
import { checkRevision, getRevision } from './revision-tracker.js';
import { resolveTrackedChangeInStory, resolveTrackedChangeType } from '../helpers/tracked-change-resolver.js';
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

function snapshotToInfo(snapshot: TrackedChangeSnapshot): TrackChangeInfo {
  return {
    address: snapshot.address,
    id: snapshot.address.entityId,
    type: snapshot.type,
    wordRevisionIds: normalizeWordRevisionIds(snapshot.wordRevisionIds),
    author: snapshot.author,
    authorEmail: snapshot.authorEmail,
    authorImage: snapshot.authorImage,
    date: snapshot.date,
    excerpt: snapshot.excerpt,
  };
}

function filterByType(
  snapshots: ReadonlyArray<TrackedChangeSnapshot>,
  requestedType?: TrackChangeType,
): TrackedChangeSnapshot[] {
  if (!requestedType) return [...snapshots];
  return snapshots.filter((snapshot) => snapshot.type === requestedType);
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

  const filtered = filterByType(rawSnapshots, input?.type);
  const paged = paginate(filtered, input?.offset, input?.limit);
  // Track-changes discovery uses a document-level revision token across every
  // scope. Part commits also advance the host revision, so one shared token
  // correctly guards body, story-scoped, and aggregate review flows.
  const evaluatedRevision = getRevision(editor);

  const items = paged.items.map((snapshot) => {
    const info = snapshotToInfo(snapshot);
    const handle = buildResolvedHandle(snapshot.anchorKey, 'stable', 'trackedChange');
    const { address, type, wordRevisionIds, author, authorEmail, authorImage, date, excerpt } = info;
    return buildDiscoveryItem(info.id, handle, {
      address,
      type,
      wordRevisionIds,
      author,
      authorEmail,
      authorImage,
      date,
      excerpt,
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
  const snapshot = snapshots.find((item) => item.anchorKey === anchorKey);

  if (snapshot) return snapshotToInfo(snapshot);

  return {
    address: {
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: resolved.change.id,
      ...(storyKey === BODY_STORY_KEY ? {} : { story: resolved.story }),
    },
    id: resolved.change.id,
    type: resolveTrackedChangeType(resolved.change),
    wordRevisionIds: normalizeWordRevisionIds(resolved.change.wordRevisionIds),
    author: toNonEmptyString(resolved.change.attrs.author),
    authorEmail: toNonEmptyString(resolved.change.attrs.authorEmail),
    authorImage: toNonEmptyString(resolved.change.attrs.authorImage),
    date: toNonEmptyString(resolved.change.attrs.date),
    excerpt: normalizeExcerpt(
      resolved.editor.state.doc.textBetween(resolved.change.from, resolved.change.to, ' ', '\ufffc'),
    ),
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

  const receipt = executeDomainCommand(resolved.editor, () => Boolean(command(resolved.change.rawId)));

  if (receipt.steps[0]?.effect !== 'changed') {
    return toNoOpReceipt(`${decision === 'accept' ? 'Accept' : 'Reject'} tracked change "${id}" produced no change.`, {
      id,
      story,
    });
  }

  if (resolved.commit) {
    resolved.commit(hostEditor);
  }

  getTrackedChangeIndex(hostEditor).invalidate(resolved.story);

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

function decideAll(editor: Editor, decision: ReviewDecision, options: RevisionGuardOptions | undefined): Receipt {
  const index = getTrackedChangeIndex(editor);
  const allSnapshots = index.getAll();
  if (allSnapshots.length === 0) {
    return toNoOpReceipt(`${decision === 'accept' ? 'Accept' : 'Reject'} all tracked changes produced no change.`);
  }

  checkRevision(editor, options?.expectedRevision);

  const byStoryKey = new Map<string, { story: StoryLocator; snapshots: TrackedChangeSnapshot[] }>();
  for (const snapshot of allSnapshots) {
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
        if (perChangeCommand(snapshot.runtimeRef.rawId)) {
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
  }

  if (!anyApplied) {
    return toNoOpReceipt(`${decision === 'accept' ? 'Accept' : 'Reject'} all tracked changes produced no change.`);
  }

  return { success: true };
}

export function trackChangesAcceptAllWrapper(
  editor: Editor,
  _input: TrackChangesAcceptAllInput,
  options?: RevisionGuardOptions,
): Receipt {
  return decideAll(editor, 'accept', options);
}

export function trackChangesRejectAllWrapper(
  editor: Editor,
  _input: TrackChangesRejectAllInput,
  options?: RevisionGuardOptions,
): Receipt {
  return decideAll(editor, 'reject', options);
}
