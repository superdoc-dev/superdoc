import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { Editor } from '../../core/Editor.js';
import {
  NOTE_TOMBSTONE_EVENT,
  clearNoteTombstonesFromMeta,
  hydrateNoteTombstonesFromMeta,
  noteTombstoneKey,
  parseNoteTombstoneKey,
  publishNoteTombstone,
  registerNoteTombstoneSync,
} from './note-tombstone-sync.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Minimal converter carrying the session-managed registry the wrappers use. */
interface FakeConverter {
  sessionManagedNoteIds?: { footnotes: Set<string>; endnotes: Set<string> };
}

/** Minimal editor with a synchronous event emitter and a converter. */
function makeEditor(): Editor & {
  converter: FakeConverter;
  emit(event: string, payload: unknown): void;
} {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const editor = {
    converter: {} as FakeConverter,
    isDestroyed: false,
    options: {},
    on(event: string, handler: (payload: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off(event: string, handler: (payload: unknown) => void) {
      listeners.get(event)?.delete(handler);
    },
    emit(event: string, payload: unknown) {
      listeners.get(event)?.forEach((handler) => handler(payload));
    },
  };
  return editor as unknown as Editor & { converter: FakeConverter; emit(event: string, payload: unknown): void };
}

function registry(editor: { converter: FakeConverter }, key: 'footnotes' | 'endnotes'): Set<string> {
  return editor.converter.sessionManagedNoteIds?.[key] ?? new Set();
}

/** Sync the full state of `from` into `to` (simulates the collaboration transport). */
function sync(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from));
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('note-tombstone meta key helpers', () => {
  it('round-trips footnote and endnote keys', () => {
    expect(noteTombstoneKey('footnote', '7')).toBe('noteTombstone:footnote:7');
    expect(parseNoteTombstoneKey('noteTombstone:footnote:7')).toEqual({ type: 'footnote', noteId: '7' });
    expect(parseNoteTombstoneKey('noteTombstone:endnote:2')).toEqual({ type: 'endnote', noteId: '2' });
  });

  it('ignores non-tombstone and malformed keys', () => {
    expect(parseNoteTombstoneKey('bodySectPr')).toBeNull();
    expect(parseNoteTombstoneKey('noteTombstone:bogus:1')).toBeNull();
    expect(parseNoteTombstoneKey('noteTombstone:footnote:')).toBeNull();
    expect(parseNoteTombstoneKey('noteTombstone:')).toBeNull();
  });

  it('preserves ids that contain a colon', () => {
    // The id is everything after the first separator, so colon-bearing ids survive.
    expect(parseNoteTombstoneKey('noteTombstone:footnote:a:b')).toEqual({ type: 'footnote', noteId: 'a:b' });
  });
});

describe('hydrateNoteTombstonesFromMeta', () => {
  it('merges existing meta tombstones into the local converter registry (late joiner)', () => {
    const ydoc = new Y.Doc();
    publishNoteTombstone(ydoc, 'footnote', '1');
    publishNoteTombstone(ydoc, 'endnote', '4');
    // A non-tombstone meta key must be ignored.
    ydoc.getMap('meta').set('bodySectPr', { foo: 'bar' });

    const editor = makeEditor();
    hydrateNoteTombstonesFromMeta(editor, ydoc);

    expect([...registry(editor, 'footnotes')]).toEqual(['1']);
    expect([...registry(editor, 'endnotes')]).toEqual(['4']);
  });
});

// ---------------------------------------------------------------------------
// Live two-peer propagation
// ---------------------------------------------------------------------------

describe('registerNoteTombstoneSync', () => {
  it('publishes local tombstones to the shared meta map on note-tombstoned', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor();
    const handle = registerNoteTombstoneSync(editor, ydoc);

    editor.emit(NOTE_TOMBSTONE_EVENT, { type: 'footnote', noteId: '3' });

    expect(ydoc.getMap('meta').get('noteTombstone:footnote:3')).toBe(true);
    handle.destroy();
  });

  it('propagates peer A tombstones into peer B and a late joiner (SD-3400)', () => {
    const ydocA = new Y.Doc();
    const ydocB = new Y.Doc();

    const peerA = makeEditor();
    const peerB = makeEditor();
    const handleA = registerNoteTombstoneSync(peerA, ydocA);
    const handleB = registerNoteTombstoneSync(peerB, ydocB);

    // Peer A deletes a footnote and an endnote — markSessionManagedNoteId emits.
    peerA.emit(NOTE_TOMBSTONE_EVENT, { type: 'footnote', noteId: '1' });
    peerA.emit(NOTE_TOMBSTONE_EVENT, { type: 'endnote', noteId: '9' });

    // Transport carries the meta update; peer B's observer merges it locally.
    sync(ydocA, ydocB);

    expect([...registry(peerB, 'footnotes')]).toEqual(['1']);
    expect([...registry(peerB, 'endnotes')]).toEqual(['9']);

    // A late joiner hydrates the same shared state from meta on registration.
    const ydocC = new Y.Doc();
    sync(ydocA, ydocC);
    const lateJoiner = makeEditor();
    const handleC = registerNoteTombstoneSync(lateJoiner, ydocC);

    expect([...registry(lateJoiner, 'footnotes')]).toEqual(['1']);
    expect([...registry(lateJoiner, 'endnotes')]).toEqual(['9']);

    handleA.destroy();
    handleB.destroy();
    handleC.destroy();
  });

  it('concurrent deletes on different peers converge (CRDT merge, no lost ids)', () => {
    const ydocA = new Y.Doc();
    const ydocB = new Y.Doc();
    const peerA = makeEditor();
    const peerB = makeEditor();
    const handleA = registerNoteTombstoneSync(peerA, ydocA);
    const handleB = registerNoteTombstoneSync(peerB, ydocB);

    // Each peer deletes a different note before any sync occurs.
    peerA.emit(NOTE_TOMBSTONE_EVENT, { type: 'footnote', noteId: '1' });
    peerB.emit(NOTE_TOMBSTONE_EVENT, { type: 'footnote', noteId: '2' });

    // Bidirectional sync; flat per-id keys merge without clobbering.
    sync(ydocA, ydocB);
    sync(ydocB, ydocA);

    expect(new Set(registry(peerA, 'footnotes'))).toEqual(new Set(['1', '2']));
    expect(new Set(registry(peerB, 'footnotes'))).toEqual(new Set(['1', '2']));

    handleA.destroy();
    handleB.destroy();
  });

  it('stops merging remote tombstones after destroy', () => {
    const ydocA = new Y.Doc();
    const ydocB = new Y.Doc();
    const peerA = makeEditor();
    const peerB = makeEditor();
    const handleA = registerNoteTombstoneSync(peerA, ydocA);
    const handleB = registerNoteTombstoneSync(peerB, ydocB);

    handleB.destroy();
    peerA.emit(NOTE_TOMBSTONE_EVENT, { type: 'footnote', noteId: '1' });
    sync(ydocA, ydocB);

    expect([...registry(peerB, 'footnotes')]).toEqual([]);
    handleA.destroy();
  });

  it('removes stale local tombstones when the shared meta keys are cleared', () => {
    const ydocA = new Y.Doc();
    const ydocB = new Y.Doc();
    const peerA = makeEditor();
    const peerB = makeEditor();
    const handleA = registerNoteTombstoneSync(peerA, ydocA);
    const handleB = registerNoteTombstoneSync(peerB, ydocB);

    peerA.emit(NOTE_TOMBSTONE_EVENT, { type: 'footnote', noteId: '1' });
    sync(ydocA, ydocB);
    expect([...registry(peerB, 'footnotes')]).toEqual(['1']);

    clearNoteTombstonesFromMeta(ydocA);
    sync(ydocA, ydocB);

    expect([...registry(peerA, 'footnotes')]).toEqual([]);
    expect([...registry(peerB, 'footnotes')]).toEqual([]);

    handleA.destroy();
    handleB.destroy();
  });
});
