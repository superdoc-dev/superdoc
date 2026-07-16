/**
 * Milestone 1 proof: the structured host can open a real .docx, run one
 * operation directly by operationId (no argv), export, and the exported file
 * reflects the change after a clean round-trip re-open.
 */

import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';
import { openDocument } from './index';
import type { CollaborationProvider } from 'superdoc/super-editor';

const FIXTURE = join(import.meta.dir, '../../../evals/fixtures/docs/employment-offer.docx');
const MARKER = 'SUPERDOC_HOST_PROOF_MARKER_42';
const COLLAB_MARKER = 'SUPERDOC_HOST_COLLAB_MARKER_43';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForText(readText: () => Promise<string>, marker: string): Promise<string> {
  const deadline = Date.now() + 1500;
  let lastText = '';
  while (Date.now() < deadline) {
    lastText = await readText();
    if (lastText.includes(marker)) return lastText;
    await wait(20);
  }
  throw new Error(`Timed out waiting for collaborative text marker ${marker}. Last text: ${lastText}`);
}

class MemoryCollaborationProvider implements CollaborationProvider {
  synced = true;
  isSynced = true;
  awareness = {
    setLocalStateField() {},
    setLocalState() {},
    getLocalState() {
      return null;
    },
    getStates() {
      return new Map();
    },
    on() {},
    off() {},
  };

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

  on() {}

  off() {}

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

test('open real .docx -> invoke(operationId) -> export -> verify the file changed', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));

  // 1. Open + read text directly via operationId.
  const session = await openDocument(source);
  const before = JSON.stringify(await session.invoke('getText', {}));
  expect(before).not.toContain(MARKER);

  // 2. One direct structured mutation (append text at end of document).
  const receipt = await session.invoke('insert', { value: MARKER, type: 'text' });
  expect(receipt).toBeTruthy();

  // 3. Export the mutated document.
  const exported = await session.export();
  session.close();

  // The exported bytes are a different document than the input.
  expect(sha(exported)).not.toBe(sha(source));

  // 4. Round-trip: re-open the exported bytes and confirm the change persisted
  //    through serialization (the real proof the export is correct).
  const reopened = await openDocument(exported);
  const after = JSON.stringify(await reopened.invoke('getText', {}));
  reopened.close();

  expect(after).toContain(MARKER);
  expect(after).not.toBe(before);
});

test('a closed session rejects invoke() and export() instead of acting on a torn-down editor', async () => {
  const session = await openDocument();
  session.close();
  // Closed is inert: both surfaces fail clearly (mirrors the presence guard), so a no-op export
  // never returns bytes from a destroyed session and invoke never dispatches against it.
  await expect(session.invoke('getText', {})).rejects.toThrow(/closed/);
  await expect(session.export()).rejects.toThrow(/closed/);
});

test('openDocument accepts caller-owned collaboration bindings', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  const ydocA = new YDoc({ gc: false });
  const ydocB = new YDoc({ gc: false });
  const providerA = new MemoryCollaborationProvider(ydocA);
  const providerB = new MemoryCollaborationProvider(ydocB);
  providerA.connect(providerB);
  providerB.connect(providerA);

  let sessionA: Awaited<ReturnType<typeof openDocument>> | undefined;
  let sessionB: Awaited<ReturnType<typeof openDocument>> | undefined;

  try {
    sessionA = await openDocument(source, {
      documentId: 'collab-proof',
      collaboration: { ydoc: ydocA, collaborationProvider: providerA },
    });
    providerA.syncToPeer();

    sessionB = await openDocument(undefined, {
      documentId: 'collab-proof',
      collaboration: { ydoc: ydocB, collaborationProvider: providerB },
    });

    const before = JSON.stringify(await sessionB.invoke('getText', {}));
    expect(before).not.toContain(COLLAB_MARKER);

    await sessionA.invoke('insert', { value: COLLAB_MARKER, type: 'text' });

    const after = await waitForText(async () => JSON.stringify(await sessionB!.invoke('getText', {})), COLLAB_MARKER);
    expect(after).toContain(COLLAB_MARKER);

    // sessionB received the edit via Y.Doc sync, not a local invoke, so it is not "dirty".
    // Byte-preservation must NOT short-circuit export for a collaborative session: the Y.Doc is
    // authoritative, so export must serialize the live synced state (with the marker), not the
    // blank bytes sessionB opened from. Re-open the exported bytes to prove the content is there.
    const exportedB = await sessionB.export();
    const verify = await openDocument(exportedB);
    try {
      expect(JSON.stringify(await verify.invoke('getText', {}))).toContain(COLLAB_MARKER);
    } finally {
      verify.close();
    }
  } finally {
    sessionB?.close();
    sessionA?.close();
    providerB.disconnect();
    providerA.disconnect();
  }
});
