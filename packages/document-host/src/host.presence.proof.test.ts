/**
 * Presence proof: document-host exposes a typed, provider-agnostic presence
 * surface (`session.presence`) over the injected collaboration provider's
 * awareness, and no longer leaks the engine editor. Proves the contract, not
 * just the happy path:
 *   - presence throws clearly when there is no collaboration provider
 *   - setUser / setStatus write the awareness `user` / `status` fields
 *   - setSelection writes a valid relative `cursor` payload from a SelectionTarget
 *   - setSelection works on a freshly opened session BEFORE it mutates (the
 *     demo's "jump to Section 2" happens before any streamed edit)
 *   - clearStatus / clearSelection null their fields
 *   - document-host bundles no collaboration provider packages
 */

import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';
import { openDocument } from './index';
import type { CollaborationProvider } from 'superdoc/super-editor';

const FIXTURE = join(import.meta.dir, '../../../evals/fixtures/docs/employment-offer.docx');

const collapsedTarget = (blockId: string, offset: number) => ({
  kind: 'selection' as const,
  start: { kind: 'text' as const, blockId, offset },
  end: { kind: 'text' as const, blockId, offset },
});

const firstNonEmptyBlock = async (session: Awaited<ReturnType<typeof openDocument>>) => {
  const list = (await session.invoke('blocks.list', { includeText: true })) as {
    blocks: Array<{ nodeId: string; isEmpty: boolean }>;
  };
  return list.blocks.find((b) => !b.isEmpty) ?? list.blocks[0];
};

/** Awareness that actually stores local state, so presence writes are observable. */
class StatefulAwareness {
  clientID = 1;
  #state: Record<string, unknown> = {};
  setLocalStateField(field: string, value: unknown): void {
    this.#state = { ...this.#state, [field]: value };
  }
  setLocalState(state: Record<string, unknown> | null): void {
    this.#state = state ?? {};
  }
  getLocalState(): Record<string, unknown> {
    return this.#state;
  }
  getStates(): Map<number, unknown> {
    return new Map([[this.clientID, this.#state]]);
  }
  on(): void {}
  off(): void {}
}

/** In-memory provider with a stateful awareness and peer-to-peer Y.Doc bridging. */
class MemoryCollaborationProvider implements CollaborationProvider {
  synced = true;
  isSynced = true;
  awareness = new StatefulAwareness();
  #peer: MemoryCollaborationProvider | null = null;
  #closed = false;

  constructor(readonly ydoc: YDoc) {
    this.ydoc.on('update', this.#forwardUpdate);
  }

  connect(peer: MemoryCollaborationProvider): void {
    this.#peer = peer;
  }

  syncToPeer(): void {
    if (!this.#peer) return;
    applyUpdate(this.#peer.ydoc, encodeStateAsUpdate(this.ydoc), this.#peer);
  }

  receive(update: Uint8Array): void {
    applyUpdate(this.ydoc, update, this);
  }

  on(): void {}
  off(): void {}

  disconnect(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.ydoc.off('update', this.#forwardUpdate);
    this.#peer = null;
  }

  destroy(): void {
    this.disconnect();
  }

  #forwardUpdate = (update: Uint8Array, origin: unknown) => {
    if (this.#closed || origin === this) return;
    this.#peer?.receive(update);
  };
}

test('presence throws a clear error when opened without a collaboration provider', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  const session = await openDocument(source);
  try {
    expect(() => session.presence.setUser({ id: 'u1', name: 'Nobody' })).toThrow(
      /Presence requires a collaboration provider/,
    );
    expect(() => session.presence.setSelection(collapsedTarget('whatever', 0))).toThrow(
      /Presence requires a collaboration provider/,
    );
  } finally {
    session.close();
  }
});

test('setUser / setStatus / clearStatus write and clear the awareness fields', async () => {
  const ydoc = new YDoc({ gc: false });
  const provider = new MemoryCollaborationProvider(ydoc);
  const session = await openDocument(undefined, {
    documentId: 'presence-status',
    collaboration: { ydoc, collaborationProvider: provider },
  });
  try {
    const user = { id: 'agent-1', name: 'SuperDoc Agent', color: '#7c3aed' };
    session.presence.setUser(user);
    expect(provider.awareness.getLocalState().user).toEqual(user);

    session.presence.setStatus({ state: 'thinking', label: 'Reading your request' });
    expect(provider.awareness.getLocalState().status).toEqual({ state: 'thinking', label: 'Reading your request' });

    // label is optional and normalizes to null
    session.presence.setStatus({ state: 'editing' });
    expect(provider.awareness.getLocalState().status).toEqual({ state: 'editing', label: null });

    session.presence.clearStatus();
    expect(provider.awareness.getLocalState().status).toBeNull();
  } finally {
    session.close();
  }
});

test('setSelection encodes a SelectionTarget into a relative cursor payload; clearSelection nulls it', async () => {
  const ydoc = new YDoc({ gc: false });
  const provider = new MemoryCollaborationProvider(ydoc);
  const session = await openDocument(undefined, {
    documentId: 'presence-selection',
    collaboration: { ydoc, collaborationProvider: provider },
  });
  try {
    // The collaborative doc hydrates from the (empty) Y.Doc, so create content first.
    await session.invoke('insert', { value: 'Section text for presence.', type: 'text' });

    const block = await firstNonEmptyBlock(session);
    expect(block?.nodeId).toBeTruthy();

    session.presence.setSelection(collapsedTarget(block.nodeId, 0));
    const cursor = provider.awareness.getLocalState().cursor as { anchor: unknown; head: unknown } | null;
    expect(cursor).toBeTruthy();
    expect(cursor!.anchor).toBeTruthy();
    expect(cursor!.head).toBeTruthy();

    session.presence.clearSelection();
    expect(provider.awareness.getLocalState().cursor).toBeNull();
  } finally {
    session.close();
  }
});

test('setSelection works on a freshly opened session before it mutates (the pre-edit caret jump)', async () => {
  // This mirrors the demo: a session joins a room that already has content and
  // moves its caret to a section BEFORE performing any edit. The headless
  // collaborative binding must therefore be ready right after open, not only
  // after the first transaction.
  const ydocA = new YDoc({ gc: false });
  const ydocB = new YDoc({ gc: false });
  const providerA = new MemoryCollaborationProvider(ydocA);
  const providerB = new MemoryCollaborationProvider(ydocB);
  providerA.connect(providerB);
  providerB.connect(providerA);

  let sessionA: Awaited<ReturnType<typeof openDocument>> | undefined;
  let sessionB: Awaited<ReturnType<typeof openDocument>> | undefined;
  try {
    // Seed shared content through session A, then push it to B's Y.Doc.
    sessionA = await openDocument(undefined, {
      documentId: 'presence-preedit',
      collaboration: { ydoc: ydocA, collaborationProvider: providerA },
    });
    await sessionA.invoke('insert', { value: 'Obligations of the receiving party.', type: 'text' });
    providerA.syncToPeer();

    // Session B opens fresh against the populated Y.Doc and never mutates.
    sessionB = await openDocument(undefined, {
      documentId: 'presence-preedit',
      collaboration: { ydoc: ydocB, collaborationProvider: providerB },
    });
    const block = await firstNonEmptyBlock(sessionB);
    expect(block?.nodeId).toBeTruthy();

    // setSelection BEFORE session B performs any insert/mutation.
    sessionB.presence.setSelection(collapsedTarget(block.nodeId, 0));
    const cursor = providerB.awareness.getLocalState().cursor as { anchor: unknown; head: unknown } | null;
    expect(cursor).toBeTruthy();
    expect(cursor!.anchor).toBeTruthy();
    expect(cursor!.head).toBeTruthy();
  } finally {
    sessionB?.close();
    sessionA?.close();
    providerB.disconnect();
    providerA.disconnect();
  }
});

test('document-host bundles no collaboration provider packages', async () => {
  const pkg = JSON.parse(await readFile(join(import.meta.dir, '../package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  const forbidden = names.filter(
    (n) => n.startsWith('@hocuspocus/') || n.startsWith('@liveblocks/') || n === 'y-websocket' || n === 'y-webrtc',
  );
  expect(forbidden).toEqual([]);
});
