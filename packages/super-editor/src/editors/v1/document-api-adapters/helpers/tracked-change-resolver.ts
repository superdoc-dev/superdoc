import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type {
  StoryLocator,
  TrackChangeType,
  TrackChangeWordRevisionIds,
  TrackedChangeAddress,
} from '@superdoc/document-api';
import {
  TrackDeleteMarkName,
  TrackFormatMarkName,
  TrackInsertMarkName,
} from '../../extensions/track-changes/constants.js';
import { getTrackChanges } from '../../extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import { normalizeExcerpt, toNonEmptyString } from './value-utils.js';
import { resolveStoryRuntime } from '../story-runtime/resolve-story-runtime.js';
import { buildStoryKey, BODY_STORY_KEY } from '../story-runtime/story-key.js';
import type { TrackedChangeRuntimeRef } from './tracked-change-runtime-ref.js';

const DERIVED_ID_LENGTH = 24;

type RawTrackedMark = {
  mark: {
    type: { name: string };
    attrs?: Record<string, unknown>;
  };
  from: number;
  to: number;
};

export type GroupedTrackedChange = {
  rawId: string;
  id: string;
  from: number;
  to: number;
  hasInsert: boolean;
  hasDelete: boolean;
  hasFormat: boolean;
  attrs: Record<string, unknown>;
  wordRevisionIds?: TrackChangeWordRevisionIds;
};

type ChangeTypeInput = Pick<GroupedTrackedChange, 'hasInsert' | 'hasDelete' | 'hasFormat'>;

function getRawTrackedMarks(editor: Editor): RawTrackedMark[] {
  try {
    const marks = getTrackChanges(editor.state) as RawTrackedMark[];
    return Array.isArray(marks) ? marks : [];
  } catch {
    return [];
  }
}

/**
 * Browser-safe hash producing a {@link DERIVED_ID_LENGTH}-char hex string.
 *
 * Uses FNV-1a-inspired mixing across three independent accumulators to produce
 * a 96-bit (24-hex-char) digest. This is NOT cryptographic — it only needs to
 * be deterministic with low collision probability for tracked-change IDs.
 */
function portableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0xdeadbeef;

  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h3 = Math.imul(h3 ^ c, 0x1b873593);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 0xcc9e2d51);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 0x1b873593);

  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h3 >>> 0).toString(16).padStart(8, '0')
  ).slice(0, DERIVED_ID_LENGTH);
}

/**
 * Derives a deterministic ID for a tracked change from the current document state.
 *
 * The ID is computed from the change type, ProseMirror positions, author,
 * date, and a text excerpt. It is stable for a given document state but will
 * change if the document is edited, since positions shift. These are NOT
 * persistent identifiers — they are ephemeral keys valid only for the
 * current transaction snapshot.
 */
function deriveTrackedChangeId(editor: Editor, change: Omit<GroupedTrackedChange, 'id'>): string {
  const type = resolveTrackedChangeType(change);
  const excerpt = normalizeExcerpt(editor.state.doc.textBetween(change.from, change.to, ' ', '\ufffc')) ?? '';
  const author = toNonEmptyString(change.attrs.author) ?? '';
  const authorEmail = toNonEmptyString(change.attrs.authorEmail) ?? '';
  const date = toNonEmptyString(change.attrs.date) ?? '';
  const signature = `${type}|${change.from}|${change.to}|${author}|${authorEmail}|${date}|${excerpt}`;

  return portableHash(signature);
}

export function resolveTrackedChangeType(change: ChangeTypeInput): TrackChangeType {
  if (change.hasFormat) return 'format';
  if (change.hasDelete && !change.hasInsert) return 'delete';
  return 'insert';
}

const groupedCache = new WeakMap<Editor, { doc: ProseMirrorNode; grouped: GroupedTrackedChange[] }>();

function mergeWordRevisionId(
  target: TrackChangeWordRevisionIds | undefined,
  key: keyof TrackChangeWordRevisionIds,
  value: string | undefined,
): TrackChangeWordRevisionIds | undefined {
  if (!value) return target;

  if (!target) {
    return { [key]: value };
  }

  if (!target[key]) {
    target[key] = value;
  }

  return target;
}

function getWordRevisionIdKey(markType: string): keyof TrackChangeWordRevisionIds | null {
  if (markType === TrackInsertMarkName) return 'insert';
  if (markType === TrackDeleteMarkName) return 'delete';
  if (markType === TrackFormatMarkName) return 'format';
  return null;
}

export function groupTrackedChanges(editor: Editor): GroupedTrackedChange[] {
  const currentDoc = editor.state.doc;
  const cached = groupedCache.get(editor);
  if (cached && cached.doc === currentDoc) return cached.grouped;

  const marks = getRawTrackedMarks(editor);
  const byRawId = new Map<string, Omit<GroupedTrackedChange, 'id'>>();

  for (const item of marks) {
    const attrs = item.mark?.attrs ?? {};
    const id = toNonEmptyString(attrs.id);
    if (!id) continue;

    const existing = byRawId.get(id);
    const markType = item.mark.type.name;
    const nextHasInsert = markType === TrackInsertMarkName;
    const nextHasDelete = markType === TrackDeleteMarkName;
    const nextHasFormat = markType === TrackFormatMarkName;
    const wordRevisionId = toNonEmptyString(attrs.sourceId);
    const wordRevisionIdKey = getWordRevisionIdKey(markType);

    if (!existing) {
      byRawId.set(id, {
        rawId: id,
        from: item.from,
        to: item.to,
        hasInsert: nextHasInsert,
        hasDelete: nextHasDelete,
        hasFormat: nextHasFormat,
        attrs: { ...attrs },
        wordRevisionIds: wordRevisionIdKey
          ? mergeWordRevisionId(undefined, wordRevisionIdKey, wordRevisionId ?? undefined)
          : undefined,
      });
      continue;
    }

    existing.from = Math.min(existing.from, item.from);
    existing.to = Math.max(existing.to, item.to);
    existing.hasInsert = existing.hasInsert || nextHasInsert;
    existing.hasDelete = existing.hasDelete || nextHasDelete;
    existing.hasFormat = existing.hasFormat || nextHasFormat;
    if (Object.keys(existing.attrs).length === 0 && Object.keys(attrs).length > 0) {
      existing.attrs = { ...attrs };
    }
    if (wordRevisionIdKey) {
      existing.wordRevisionIds = mergeWordRevisionId(
        existing.wordRevisionIds,
        wordRevisionIdKey,
        wordRevisionId ?? undefined,
      );
    }
  }

  const grouped = Array.from(byRawId.values())
    .map((change) => ({
      ...change,
      id: deriveTrackedChangeId(editor, change),
    }))
    .sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      return a.id.localeCompare(b.id);
    });

  groupedCache.set(editor, { doc: currentDoc, grouped });
  return grouped;
}

export function resolveTrackedChange(editor: Editor, id: string): GroupedTrackedChange | null {
  const grouped = groupTrackedChanges(editor);
  return grouped.find((item) => item.id === id) ?? null;
}

export function toCanonicalTrackedChangeId(editor: Editor, rawId: string): string | null {
  const grouped = groupTrackedChanges(editor);
  return grouped.find((item) => item.rawId === rawId)?.id ?? null;
}

export function buildTrackedChangeCanonicalIdMap(editor: Editor): Map<string, string> {
  const grouped = groupTrackedChanges(editor);
  const map = new Map<string, string>();
  for (const change of grouped) {
    map.set(change.rawId, change.id);
    map.set(change.id, change.id);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Story-aware resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a tracked-change identity across stories.
 *
 * Accepts either:
 * - A bare canonical id string (body back-compat), OR
 * - A public {@link TrackedChangeAddress} (with optional `story`).
 *
 * Returns the grouped change AND the story editor that owns it, so callers
 * can apply mutations (accept/reject) against the correct runtime without
 * re-resolving.
 */
export interface ResolvedStoryTrackedChange {
  /** The owning story editor (body host editor OR a story runtime editor). */
  editor: Editor;
  /** Public story locator. */
  story: StoryLocator;
  /** Internal runtime ref. */
  runtimeRef: TrackedChangeRuntimeRef;
  /** The grouped change in the owning editor. */
  change: GroupedTrackedChange;
  /** Optional commit callback — present for non-body runtimes. */
  commit?: (hostEditor: Editor) => void;
}

type TrackedChangeLookupInput = string | TrackedChangeAddress;

function toAddress(input: TrackedChangeLookupInput): TrackedChangeAddress {
  if (typeof input === 'string') {
    return { kind: 'entity', entityType: 'trackedChange', entityId: input };
  }
  return input;
}

/**
 * Resolves a tracked-change id/address to the owning story editor and the
 * grouped change within it.
 *
 * For body addresses (no `story` field) this is an O(n) search against the
 * host editor's grouped marks — same as the legacy body-only resolver.
 *
 * For non-body addresses it resolves the correct story runtime, then performs
 * the lookup within that editor's state.
 *
 * Returns `null` if the address resolves to no matching tracked change.
 */
export function resolveTrackedChangeInStory(
  hostEditor: Editor,
  input: TrackedChangeLookupInput,
): ResolvedStoryTrackedChange | null {
  const address = toAddress(input);
  const entityId = address.entityId;

  const story: StoryLocator = address.story ?? { kind: 'story', storyType: 'body' };
  const storyKey = address.story ? buildStoryKey(address.story) : BODY_STORY_KEY;

  if (storyKey === BODY_STORY_KEY) {
    const match = findMatchingChange(hostEditor, entityId);
    if (!match) return null;
    return {
      editor: hostEditor,
      story,
      runtimeRef: { storyKey: BODY_STORY_KEY, rawId: match.rawId },
      change: match,
    };
  }

  let runtime;
  try {
    runtime = resolveStoryRuntime(hostEditor, story);
  } catch {
    return null;
  }

  const match = findMatchingChange(runtime.editor, entityId);
  if (!match) return null;
  return {
    editor: runtime.editor,
    story: runtime.locator,
    runtimeRef: { storyKey: runtime.storyKey, rawId: match.rawId },
    change: match,
    commit: runtime.commit,
  };
}

/**
 * Lookup helper — accepts both the canonical id and the raw mark id to
 * tolerate callers that stored whichever was convenient at the time.
 */
function findMatchingChange(editor: Editor, id: string): GroupedTrackedChange | null {
  const grouped = groupTrackedChanges(editor);
  return grouped.find((item) => item.id === id || item.rawId === id) ?? null;
}
