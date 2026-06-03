/**
 * Host-level tracked-change index service.
 *
 * Owns every aspect of tracked-change discovery across revision-capable
 * stories:
 *
 * - Discovery: walks body + headers + footers + footnotes + endnotes.
 * - Caching:   per-story snapshot array keyed by `storyKey`.
 * - Invalidation: targeted — `mutatePart` commits only invalidate the one
 *   part they touched; body edits only refresh the body cache.
 * - Broadcast: emits `tracked-changes-changed` on the host editor so
 *   comments-store, navigation, and review surfaces can resync.
 */

import type { StoryLocator, TrackChangeOverlapInfo, TrackChangeOverlapLayer } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { PartChangedEvent } from '../../core/parts/types.js';
import { buildStoryKey, BODY_STORY_KEY, parseStoryKeyType } from '../story-runtime/story-key.js';
import { resolveStoryRuntime } from '../story-runtime/resolve-story-runtime.js';
import {
  groupTrackedChanges,
  resolveTrackedChangeType,
  type GroupedTrackedChange,
} from '../helpers/tracked-change-resolver.js';
import { makeTrackedChangeAnchorKey, type TrackedChangeRuntimeRef } from '../helpers/tracked-change-runtime-ref.js';
import { normalizeExcerpt, toNonEmptyString } from '../helpers/value-utils.js';
import { enumerateRevisionCapableStories } from './enumerate-stories.js';
import { classifyStoryKind, describeStoryLocation } from './story-labels.js';
import type { TrackedChangeSnapshot } from './tracked-change-snapshot.js';
import { isHeaderFooterPartId } from '../../core/parts/adapters/header-footer-part-descriptor.js';
import { resolveRIdFromRelsData } from '../../core/parts/adapters/header-footer-sync.js';

export type TrackedChangeIndexListener = (snapshots: ReadonlyArray<TrackedChangeSnapshot>) => void;

export interface TrackedChangeIndex {
  get(locator: StoryLocator): ReadonlyArray<TrackedChangeSnapshot>;
  getAll(): ReadonlyArray<TrackedChangeSnapshot>;
  invalidate(locator: StoryLocator): void;
  invalidateAll(): void;
  subscribe(listener: TrackedChangeIndexListener): () => void;
  dispose(): void;
}

const indexByHost = new WeakMap<Editor, TrackedChangeIndexImpl>();

export function getTrackedChangeIndex(hostEditor: Editor): TrackedChangeIndex {
  let index = indexByHost.get(hostEditor);
  if (!index) {
    index = new TrackedChangeIndexImpl(hostEditor);
    indexByHost.set(hostEditor, index);
  }
  return index;
}

function buildTrackedChangeAddress(
  locator: StoryLocator,
  storyKey: string,
  canonicalId: string,
): TrackedChangeSnapshot['address'] {
  return {
    kind: 'entity',
    entityType: 'trackedChange',
    entityId: canonicalId,
    ...(storyKey === BODY_STORY_KEY ? {} : { story: locator }),
  };
}

type OverlapLayerWithAliases = TrackChangeOverlapLayer & {
  rawId?: string;
  commandRawId?: string;
};

function addCanonicalAlias(map: Map<string, string>, alias: unknown, canonicalId: string): void {
  const normalized = toNonEmptyString(alias);
  if (!normalized || map.has(normalized)) return;
  map.set(normalized, canonicalId);
}

function buildCanonicalIdByAlias(grouped: readonly GroupedTrackedChange[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const change of grouped) {
    addCanonicalAlias(map, change.id, change.id);
    addCanonicalAlias(map, change.rawId, change.id);
    addCanonicalAlias(map, change.commandRawId, change.id);
    addCanonicalAlias(map, change.attrs.id, change.id);
    addCanonicalAlias(map, change.attrs.sourceId, change.id);
  }
  return map;
}

function resolveCanonicalId(alias: unknown, canonicalIdByAlias: ReadonlyMap<string, string>): string | undefined {
  const normalized = toNonEmptyString(alias);
  if (!normalized) return undefined;
  return canonicalIdByAlias.get(normalized) ?? normalized;
}

function copyOverlapLayer(
  layer: TrackChangeOverlapLayer,
  canonicalIdByAlias: ReadonlyMap<string, string>,
): TrackChangeOverlapLayer {
  const layerWithAliases = layer as OverlapLayerWithAliases;
  const id =
    resolveCanonicalId(layerWithAliases.rawId, canonicalIdByAlias) ??
    resolveCanonicalId(layerWithAliases.commandRawId, canonicalIdByAlias) ??
    resolveCanonicalId(layerWithAliases.id, canonicalIdByAlias) ??
    layer.id;

  return {
    id,
    type: layer.type,
    relationship: layer.relationship,
  };
}

function copyOverlapInfo(
  overlap: TrackChangeOverlapInfo | undefined,
  canonicalIdByAlias: ReadonlyMap<string, string>,
): TrackChangeOverlapInfo | undefined {
  if (!overlap) return undefined;

  const visualLayers = overlap.visualLayers?.map((layer) => copyOverlapLayer(layer, canonicalIdByAlias));
  const preferredContextTarget = overlap.preferredContextTarget
    ? copyOverlapLayer(overlap.preferredContextTarget, canonicalIdByAlias)
    : undefined;
  const preferredContextTargetId =
    preferredContextTarget?.id ?? resolveCanonicalId(overlap.preferredContextTargetId, canonicalIdByAlias);

  return {
    ...(visualLayers && visualLayers.length > 0 ? { visualLayers } : {}),
    ...(preferredContextTargetId ? { preferredContextTargetId } : {}),
    ...(preferredContextTarget ? { preferredContextTarget } : {}),
  };
}

class TrackedChangeIndexImpl implements TrackedChangeIndex {
  readonly #hostEditor: Editor;
  readonly #snapshots = new Map<string, TrackedChangeSnapshot[]>();
  #aggregated: TrackedChangeSnapshot[] | null = null;
  readonly #dirtyStoryKeys = new Set<string>();
  readonly #listeners = new Set<TrackedChangeIndexListener>();
  readonly #teardowns: Array<() => void> = [];
  #broadcastScheduled = false;
  #pendingBroadcastStories: StoryLocator[] | undefined | null = null;
  #pendingBroadcastSource: string | undefined | null = null;
  #bodyDirty = true;

  constructor(hostEditor: Editor) {
    this.#hostEditor = hostEditor;
    this.#attachHostListeners();
  }

  get(locator: StoryLocator): ReadonlyArray<TrackedChangeSnapshot> {
    const storyKey = buildStoryKey(locator);
    return this.#getByKey(storyKey, locator);
  }

  getAll(): ReadonlyArray<TrackedChangeSnapshot> {
    if (this.#aggregated && this.#dirtyStoryKeys.size === 0) {
      return this.#aggregated;
    }

    const stories = enumerateRevisionCapableStories(this.#hostEditor);
    const flat: TrackedChangeSnapshot[] = [];
    for (const story of stories) {
      const storyKey = buildStoryKey(story);
      const snapshots = this.#getByKey(storyKey, story);
      flat.push(...snapshots);
    }

    this.#aggregated = flat;
    return flat;
  }

  invalidate(locator: StoryLocator): void {
    const storyKey = buildStoryKey(locator);
    this.#invalidateKey(storyKey);
    this.#scheduleBroadcast([locator], 'invalidate');
  }

  invalidateAll(): void {
    this.#snapshots.clear();
    this.#dirtyStoryKeys.clear();
    this.#aggregated = null;
    this.#bodyDirty = true;
    this.#scheduleBroadcast(undefined, 'invalidateAll');
  }

  subscribe(listener: TrackedChangeIndexListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  dispose(): void {
    for (const teardown of this.#teardowns) {
      try {
        teardown();
      } catch {
        // Teardown errors during host disposal are non-fatal.
      }
    }
    this.#teardowns.length = 0;
    this.#listeners.clear();
    this.#snapshots.clear();
    this.#dirtyStoryKeys.clear();
    this.#aggregated = null;
    indexByHost.delete(this.#hostEditor);
  }

  #getByKey(storyKey: string, locator: StoryLocator): TrackedChangeSnapshot[] {
    if (storyKey === BODY_STORY_KEY) {
      if (this.#bodyDirty || !this.#snapshots.has(storyKey)) {
        const bodySnapshots = this.#buildSnapshotsFromEditor(this.#hostEditor, storyKey, locator);
        this.#snapshots.set(storyKey, bodySnapshots);
        this.#bodyDirty = false;
        this.#dirtyStoryKeys.delete(storyKey);
        this.#aggregated = null;
      }
      return this.#snapshots.get(storyKey) ?? [];
    }

    if (this.#dirtyStoryKeys.has(storyKey) || !this.#snapshots.has(storyKey)) {
      const snapshots = this.#computeStorySnapshots(locator, storyKey);
      this.#snapshots.set(storyKey, snapshots);
      this.#dirtyStoryKeys.delete(storyKey);
      this.#aggregated = null;
    }

    return this.#snapshots.get(storyKey) ?? [];
  }

  #computeStorySnapshots(locator: StoryLocator, storyKey: string): TrackedChangeSnapshot[] {
    let runtime;
    try {
      runtime = resolveStoryRuntime(this.#hostEditor, locator);
    } catch {
      return [];
    }

    return this.#buildSnapshotsFromEditor(runtime.editor, storyKey, locator);
  }

  #buildSnapshotsFromEditor(editor: Editor, storyKey: string, locator: StoryLocator): TrackedChangeSnapshot[] {
    const grouped = groupTrackedChanges(editor);
    if (grouped.length === 0) return [];

    const storyKind = classifyStoryKind(locator);
    const storyLabel = describeStoryLocation(locator);
    const canonicalIdByAlias = buildCanonicalIdByAlias(grouped);

    return grouped.map((change) =>
      this.#buildSnapshot(editor, change, storyKey, locator, storyKind, storyLabel, canonicalIdByAlias),
    );
  }

  #buildSnapshot(
    editor: Editor,
    change: GroupedTrackedChange,
    storyKey: string,
    locator: StoryLocator,
    storyKind: TrackedChangeSnapshot['storyKind'],
    storyLabel: string,
    canonicalIdByAlias: ReadonlyMap<string, string>,
  ): TrackedChangeSnapshot {
    const runtimeRef: TrackedChangeRuntimeRef = { storyKey, rawId: change.rawId };
    const address = buildTrackedChangeAddress(locator, storyKey, change.id);
    const type = resolveTrackedChangeType(change);
    const excerpt =
      (change.excerpt !== undefined ? change.excerpt : undefined) ??
      normalizeExcerpt(editor.state.doc.textBetween(change.from, change.to, ' ', '\ufffc'));

    return {
      address,
      runtimeRef,
      story: locator,
      type,
      author: toNonEmptyString(change.attrs.author),
      authorEmail: toNonEmptyString(change.attrs.authorEmail),
      authorImage: toNonEmptyString(change.attrs.authorImage),
      date: toNonEmptyString(change.attrs.date),
      excerpt,
      wordRevisionIds: change.wordRevisionIds ? { ...change.wordRevisionIds } : undefined,
      origin: toNonEmptyString(change.attrs.origin) as TrackedChangeSnapshot['origin'],
      imported: Boolean(toNonEmptyString(change.attrs.sourceId)),
      overlap: copyOverlapInfo(change.overlap, canonicalIdByAlias),
      storyLabel,
      storyKind,
      anchorKey: makeTrackedChangeAnchorKey(runtimeRef),
      commandRawId: change.commandRawId,
      replacementGroupId: toNonEmptyString(change.attrs.replacementGroupId),
      replacementSideId: toNonEmptyString(change.attrs.replacementSideId),
      hasInsert: change.hasInsert,
      hasDelete: change.hasDelete,
      hasFormat: change.hasFormat,
      range: { from: change.from, to: change.to },
    };
  }

  #attachHostListeners(): void {
    const editor = this.#hostEditor;
    if (typeof editor.on !== 'function') return;

    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (!transaction.docChanged) return;
      this.#bodyDirty = true;
      this.#aggregated = null;
      this.#scheduleBroadcast([{ kind: 'story', storyType: 'body' }], 'body-edit');
    };
    editor.on('transaction', onTransaction);
    this.#teardowns.push(() => editor.off?.('transaction', onTransaction));

    const onPartChanged = (event: PartChangedEvent): void => {
      const invalidatedStories = this.#storiesFromPartChange(event);
      if (invalidatedStories.length === 0) return;
      for (const story of invalidatedStories) {
        this.#invalidateKey(buildStoryKey(story));
      }
      this.#scheduleBroadcast(invalidatedStories, 'partChanged');
    };
    editor.on('partChanged', onPartChanged);
    this.#teardowns.push(() => editor.off?.('partChanged', onPartChanged));

    const onNotesChanged = (): void => {
      const wiped: StoryLocator[] = [];
      for (const key of Array.from(this.#snapshots.keys())) {
        if (!key.startsWith('fn:') && !key.startsWith('en:')) continue;
        this.#invalidateKey(key);
        const storyType: 'footnote' | 'endnote' = key.startsWith('fn:') ? 'footnote' : 'endnote';
        const noteId = key.slice(storyType === 'footnote' ? 'fn:'.length : 'en:'.length);
        wiped.push({ kind: 'story', storyType, noteId });
      }

      if (wiped.length > 0) {
        this.#scheduleBroadcast(wiped, 'notes-part-changed');
        return;
      }

      this.#aggregated = null;
      this.#scheduleBroadcast(undefined, 'notes-part-changed');
    };
    editor.on('notes-part-changed', onNotesChanged);
    this.#teardowns.push(() => editor.off?.('notes-part-changed', onNotesChanged));

    const onDestroy = (): void => {
      this.dispose();
    };
    editor.on('destroy', onDestroy);
    this.#teardowns.push(() => editor.off?.('destroy', onDestroy));
  }

  #storiesFromPartChange(event: PartChangedEvent): StoryLocator[] {
    const stories: StoryLocator[] = [];
    const converter = (this.#hostEditor as unknown as { converter?: { convertedXml?: Record<string, unknown> } })
      .converter;
    const relsData = converter?.convertedXml?.['word/_rels/document.xml.rels'];

    for (const part of event.parts) {
      if (!isHeaderFooterPartId(part.partId)) continue;
      const refId = resolveRIdFromRelsData(relsData, part.partId);
      if (!refId) continue;
      stories.push({ kind: 'story', storyType: 'headerFooterPart', refId });
    }

    return stories;
  }

  #invalidateKey(storyKey: string): void {
    if (storyKey === BODY_STORY_KEY) {
      this.#bodyDirty = true;
    } else {
      this.#dirtyStoryKeys.add(storyKey);
      this.#snapshots.delete(storyKey);
    }
    this.#aggregated = null;
  }

  #scheduleBroadcast(stories: StoryLocator[] | undefined, source: string): void {
    this.#pendingBroadcastStories = this.#mergePendingStories(this.#pendingBroadcastStories, stories);
    this.#pendingBroadcastSource = this.#mergePendingSource(this.#pendingBroadcastSource, source);

    if (this.#broadcastScheduled) return;

    this.#broadcastScheduled = true;
    void Promise.resolve().then(() => {
      this.#broadcastScheduled = false;
      const pendingStories = this.#pendingBroadcastStories;
      const pendingSource = this.#pendingBroadcastSource;
      this.#pendingBroadcastStories = null;
      this.#pendingBroadcastSource = null;

      this.#emitHostEvent(pendingStories ?? undefined, pendingSource ?? undefined);
      this.#notifySubscribers();
    });
  }

  #mergePendingStories(
    current: StoryLocator[] | undefined | null,
    next: StoryLocator[] | undefined,
  ): StoryLocator[] | undefined {
    if (current === undefined || next === undefined) return undefined;

    const merged = new Map<string, StoryLocator>();
    for (const story of current ?? []) {
      merged.set(buildStoryKey(story), story);
    }
    for (const story of next ?? []) {
      merged.set(buildStoryKey(story), story);
    }
    return Array.from(merged.values());
  }

  #mergePendingSource(current: string | undefined | null, next: string): string | undefined {
    if (current === null) return next;
    if (current === undefined || current === next) return current;
    return undefined;
  }

  #emitHostEvent(stories: StoryLocator[] | undefined, source?: string): void {
    const editor = this.#hostEditor;
    if (typeof editor.emit !== 'function') return;
    editor.emit('tracked-changes-changed', {
      editor,
      stories,
      source,
    });
  }

  #notifySubscribers(): void {
    if (this.#listeners.size === 0) return;
    const snapshot = this.getAll();
    for (const listener of Array.from(this.#listeners)) {
      try {
        listener(snapshot);
      } catch {
        // Listener failures must not prevent other subscribers from syncing.
      }
    }
  }
}

export { classifyStoryKind, describeStoryLocation } from './story-labels.js';
export type { TrackedChangeSnapshot } from './tracked-change-snapshot.js';
export { parseStoryKeyType as parseStoryKind };
