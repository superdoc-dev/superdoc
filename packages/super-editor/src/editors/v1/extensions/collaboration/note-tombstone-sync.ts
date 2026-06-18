/**
 * Collaborative sync for SD-3400 note tombstones.
 *
 * Interactive footnote/endnote inserts and deletes register the note id as
 * "session-managed" on the local converter (`converter.sessionManagedNoteIds`).
 * Export prunes ids that are registered AND unreferenced in the body, and
 * revision-story enumeration hides them the same way. For a single-client
 * session that local registry is sufficient.
 *
 * In a collaborative room the marker delete propagates through y-prosemirror,
 * so every peer's body loses the reference, but the provenance ("this id was
 * managed by this session") lives only on the originating peer's converter.
 * Without sharing it, peer B — and any late joiner — would re-export the now
 * orphaned note text and re-enumerate the dead note as a revision-capable
 * story.
 *
 * This module shares that provenance through the Yjs `meta` map using flat,
 * add-only keys (`noteTombstone:<type>:<id>`). Flat per-id keys merge cleanly
 * under Yjs CRDT semantics — concurrent adds from different peers touch
 * different keys, and repeated adds of the same id are idempotent — and late
 * joiners hydrate simply by reading the existing keys.
 *
 * The `meta` map is collaboration-only state; it is never written into the
 * exported DOCX, so tombstone bookkeeping stays out of the file.
 */

import type * as Y from 'yjs';
import type { Editor } from '../../core/Editor.js';
import {
  isCollaborationProviderSynced,
  onCollaborationProviderSynced,
} from '../../core/helpers/collaboration-provider-sync.js';
import type { CollaborationProvider } from '../../core/types/EditorConfig.js';
import { NOTE_TOMBSTONE_EVENT, type SessionManagedNoteIds } from '../../core/parts/adapters/notes-part-descriptor.js';

export { NOTE_TOMBSTONE_EVENT };

const META_MAP_KEY = 'meta';

/** Meta-map key prefix for a single shared note tombstone. */
export const NOTE_TOMBSTONE_META_PREFIX = 'noteTombstone:';

export type NoteType = 'footnote' | 'endnote';

interface ConverterWithRegistry {
  sessionManagedNoteIds?: SessionManagedNoteIds;
}

function getConverter(editor: Editor): ConverterWithRegistry | undefined {
  return (editor as unknown as { converter?: ConverterWithRegistry }).converter;
}

function bucketFor(type: NoteType): 'footnotes' | 'endnotes' {
  return type === 'endnote' ? 'endnotes' : 'footnotes';
}

function ensureRegistry(converter: ConverterWithRegistry): SessionManagedNoteIds {
  if (!converter.sessionManagedNoteIds) {
    converter.sessionManagedNoteIds = { footnotes: new Set(), endnotes: new Set() };
  }
  return converter.sessionManagedNoteIds;
}

/** Build the meta-map key for a note tombstone. */
export function noteTombstoneKey(type: NoteType, noteId: string): string {
  return `${NOTE_TOMBSTONE_META_PREFIX}${type}:${noteId}`;
}

/** Parse a meta-map key back into a note tombstone, or `null` when it is not one. */
export function parseNoteTombstoneKey(key: string): { type: NoteType; noteId: string } | null {
  if (!key.startsWith(NOTE_TOMBSTONE_META_PREFIX)) return null;
  const rest = key.slice(NOTE_TOMBSTONE_META_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) return null;
  const type = rest.slice(0, sep);
  const noteId = rest.slice(sep + 1);
  if ((type !== 'footnote' && type !== 'endnote') || noteId.length === 0) return null;
  return { type, noteId };
}

/** Publish one tombstone to the shared meta map (add-only, idempotent). */
export function publishNoteTombstone(ydoc: Y.Doc, type: NoteType, noteId: string): void {
  const metaMap = ydoc.getMap(META_MAP_KEY);
  metaMap.set(noteTombstoneKey(type, String(noteId)), true);
}

/**
 * Remove every shared tombstone key from the meta map.
 *
 * Used by authoritative room/file replacement so note tombstones from the
 * previous document cannot leak into the next one when a collaborative Y.Doc
 * instance is reused.
 */
export function clearNoteTombstonesFromMeta(ydoc: Y.Doc): void {
  const metaMap = ydoc.getMap(META_MAP_KEY);
  for (const key of [...metaMap.keys()]) {
    if (key.startsWith(NOTE_TOMBSTONE_META_PREFIX)) {
      metaMap.delete(key);
    }
  }
}

/** Publish every locally tracked session-managed note id into the shared meta map. */
export function publishSessionManagedNoteIds(ydoc: Y.Doc, registry: SessionManagedNoteIds | null | undefined): void {
  if (!registry) return;
  for (const noteId of registry.footnotes) {
    publishNoteTombstone(ydoc, 'footnote', noteId);
  }
  for (const noteId of registry.endnotes) {
    publishNoteTombstone(ydoc, 'endnote', noteId);
  }
}

/** Merge every shared tombstone from the meta map into the local converter registry. */
export function hydrateNoteTombstonesFromMeta(editor: Editor, ydoc: Y.Doc): void {
  const converter = getConverter(editor);
  if (!converter) return;

  const metaMap = ydoc.getMap(META_MAP_KEY);
  let registry: SessionManagedNoteIds | null = null;
  for (const key of metaMap.keys()) {
    const parsed = parseNoteTombstoneKey(key);
    if (!parsed) continue;
    registry = registry ?? ensureRegistry(converter);
    registry[bucketFor(parsed.type)].add(parsed.noteId);
  }
}

export interface NoteTombstoneSyncHandle {
  destroy(): void;
}

/**
 * Wire collaborative note-tombstone sharing for one editor session.
 *
 * - Local inserts/deletes emit `note-tombstoned`; we publish the id to `meta`.
 * - Remote tombstone keys merge into this peer's converter registry.
 * - Initial hydration (deferred until the provider is synced) seeds late
 *   joiners from tombstones already present in the room.
 */
export function registerNoteTombstoneSync(editor: Editor, ydoc: Y.Doc): NoteTombstoneSyncHandle {
  const metaMap = ydoc.getMap(META_MAP_KEY);

  // 1. Local inserts/deletes publish their id to the shared meta map. The
  //    editor emitter passes handlers a variadic arg list; the payload is first.
  const onTombstoned = (...args: unknown[]) => {
    const payload = args[0] as { type?: unknown; noteId?: unknown } | undefined;
    const type = payload?.type;
    if (type !== 'footnote' && type !== 'endnote') return;
    if (payload?.noteId == null) return;
    publishNoteTombstone(ydoc, type, String(payload.noteId));
  };
  editor.on?.(NOTE_TOMBSTONE_EVENT, onTombstoned);

  // 2. Remote tombstone updates converge this peer's converter registry.
  const observer = (event: Y.YMapEvent<unknown>) => {
    const converter = getConverter(editor);
    if (!converter) return;
    let registry: SessionManagedNoteIds | null = null;
    event.changes.keys.forEach((change, key) => {
      const parsed = parseNoteTombstoneKey(key);
      if (!parsed) return;
      if (change.action === 'delete') {
        const existing = converter.sessionManagedNoteIds;
        existing?.[bucketFor(parsed.type)]?.delete(parsed.noteId);
        return;
      }
      registry = registry ?? ensureRegistry(converter);
      registry[bucketFor(parsed.type)].add(parsed.noteId);
    });
  };
  metaMap.observe(observer);

  // 3. Initial hydration covers late joiners — tombstones already in the room
  //    must be merged before the first local export / enumeration.
  let pendingProviderCleanup: (() => void) | undefined;
  const provider = (editor as unknown as { options?: { collaborationProvider?: CollaborationProvider } }).options
    ?.collaborationProvider;
  const hydrate = () => {
    if ((editor as unknown as { isDestroyed?: boolean }).isDestroyed) return;
    hydrateNoteTombstonesFromMeta(editor, ydoc);
  };
  if (!provider || isCollaborationProviderSynced(provider)) {
    hydrate();
  } else {
    pendingProviderCleanup = onCollaborationProviderSynced(provider, hydrate);
  }

  return {
    destroy() {
      editor.off?.(NOTE_TOMBSTONE_EVENT, onTombstoned);
      metaMap.unobserve(observer);
      pendingProviderCleanup?.();
    },
  };
}
