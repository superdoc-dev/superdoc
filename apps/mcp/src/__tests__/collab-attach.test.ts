import { describe, it, expect, mock, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { SessionManager } from '../session-manager.js';

/**
 * `openRoom` orchestration (provider sync, sync timeout, awareness presence) and
 * the `save()` room-guard run against a live Yjs WebSocket server in production,
 * but the orchestration itself is socket-independent. Following the repo's collab
 * test idiom (createProviderStub in Editor.replace-file.test.ts), we inject a stub
 * provider so the logic is exercised without a server. The real socket transport
 * is the only part left to the end-to-end check in the PR description.
 */

type ProviderEvent = 'sync' | 'synced';
type SyncHandler = (synced?: boolean) => void;

/**
 * Provider stub mirroring the repo's collab test idiom (`createProviderStub` in
 * `Editor.replace-file.test.ts`): inert `on()`/`off()` that only register/deregister,
 * an explicit `emit()` the test drives by hand, and `synced`/`isSynced` fields. This is
 * what lets the suite exercise the real sync contract — the prior stub auto-emitted
 * `sync(true)` from inside `on()` and exposed no `synced`/`isSynced`, so it could only
 * test the one event shape and silently passed regardless of how the wait was wired.
 *
 * `synced: true` seeds an already-synced provider (pooled/reused) so openRoom's
 * already-synced precheck resolves with no emit.
 */
function providerStub({ synced = false }: { synced?: boolean } = {}) {
  const listeners: Record<ProviderEvent, Set<SyncHandler>> = {
    sync: new Set(),
    synced: new Set(),
  };
  const setLocalStateField = mock((_field: string, _value: unknown) => {});
  const destroy = mock(() => {});

  const provider = {
    awareness: {
      setLocalStateField,
      getStates: () => new Map(),
      on() {},
      off() {},
    },
    synced,
    isSynced: synced,
    on(event: ProviderEvent, handler: SyncHandler) {
      listeners[event]?.add(handler);
    },
    off(event: ProviderEvent, handler: SyncHandler) {
      listeners[event]?.delete(handler);
    },
    emit(event: ProviderEvent, value?: boolean) {
      for (const handler of listeners[event]) handler(value);
    },
    destroy,
  };

  return provider;
}

/** Flush microtasks so openRoom reaches its suspended sync await and wires listeners. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('superdoc_attach openRoom orchestration (stubbed provider)', () => {
  const sm = new SessionManager();
  const opened: string[] = [];
  const tempFiles: string[] = [];

  afterEach(async () => {
    for (const id of opened.splice(0)) await sm.close(id).catch(() => {});
    for (const f of tempFiles.splice(0)) await unlink(f).catch(() => {});
  });

  type Stub = ReturnType<typeof providerStub>;
  type AttachUser = { id?: string; name?: string; email?: string };

  /**
   * Kick off openRoom, let it reach its suspended sync await and wire the provider
   * listener, then drive the provider to synced. `drive` defaults to the `sync(true)`
   * edge; pass a custom driver to exercise the `synced` (no-arg) path.
   */
  async function attach(
    documentId: string,
    stub: Stub,
    { user, drive = (s: Stub) => s.emit('sync', true) }: { user?: AttachUser; drive?: (s: Stub) => void } = {},
  ) {
    const p = sm.openRoom('ws://test/doc', documentId, undefined, user, {
      createProvider: () => stub as unknown as never,
    });
    await tick();
    drive(stub);
    return p;
  }

  it('returns a registered room session once the provider syncs', async () => {
    const stub = providerStub();
    const session = await attach('room-sync', stub);
    opened.push(session.id);

    expect(session.id).toMatch(/^room-/);
    expect(session.filePath).toBeNull();
    expect(sm.list().some((s) => s.id === session.id)).toBe(true);
  });

  it('returns immediately when the provider is already synced before attach', async () => {
    // Pooled/reused providers can be synced when handed to openRoom — no `sync`/`synced`
    // re-emit follows. The bespoke wait would hang here until a spurious timeout; the
    // helper's already-synced precheck resolves with no event. No emit is driven.
    const stub = providerStub({ synced: true });
    const session = await sm.openRoom('ws://test/doc', 'room-presynced', undefined, undefined, {
      createProvider: () => stub as unknown as never,
    });
    opened.push(session.id);

    expect(session.id).toMatch(/^room-/);
    expect(sm.list().some((s) => s.id === session.id)).toBe(true);
    expect(stub.destroy).not.toHaveBeenCalled();
  });

  it('resolves when the provider emits a no-arg synced event without a sync edge', async () => {
    // Some providers emit only `synced` (no boolean), never `sync(boolean)`. The prior
    // `sync`-only wait never resolved for these — this case is what makes the suite catch
    // that regression. The helper listens to `synced` too.
    const stub = providerStub();
    const session = await attach('room-synced-only', stub, { drive: (s) => s.emit('synced') });
    opened.push(session.id);

    expect(session.id).toMatch(/^room-/);
    expect(sm.list().some((s) => s.id === session.id)).toBe(true);
  });

  it('broadcasts awareness presence when a user is supplied', async () => {
    const stub = providerStub();
    const user = { id: 'reviewer-1', name: 'Reviewer', email: 'reviewer@example.com' };
    const session = await attach('room-presence', stub, { user });
    opened.push(session.id);

    expect(stub.awareness.setLocalStateField).toHaveBeenCalledWith('user', user);
  });

  it('does not touch awareness when no user is supplied', async () => {
    const stub = providerStub();
    const session = await attach('room-nopresence', stub);
    opened.push(session.id);

    expect(stub.awareness.setLocalStateField).not.toHaveBeenCalled();
  });

  it('rejects and tears down the provider when initial sync times out', async () => {
    // Never synced, never emits — openRoom's own timeout fires.
    const stub = providerStub();
    await expect(
      sm.openRoom('ws://test/doc', 'room-timeout', undefined, undefined, {
        createProvider: () => stub as unknown as never,
        syncTimeoutMs: 10,
      }),
    ).rejects.toThrow(/sync timeout/);

    expect(stub.destroy).toHaveBeenCalled();
  });

  it('refuses to save a room session without an explicit output path', async () => {
    const stub = providerStub();
    const session = await attach('room-save-guard', stub);
    opened.push(session.id);

    await expect(sm.save(session.id)).rejects.toThrow(/without specifying an output path/);
  });

  it('saves a room session to an explicit output path', async () => {
    const stub = providerStub();
    const session = await attach('room-save-ok', stub);
    opened.push(session.id);

    const out = join(tmpdir(), `mcp-collab-${randomBytes(6).toString('hex')}.docx`);
    tempFiles.push(out);

    const result = await sm.save(session.id, out);
    expect(result.path).toBe(out);
    expect(result.byteLength).toBeGreaterThan(0);

    const bytes = await readFile(out);
    expect(bytes[0]).toBe(0x50); // 'P' — PK zip magic
    expect(bytes[1]).toBe(0x4b); // 'K'
  });
});
