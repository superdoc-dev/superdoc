import { describe, expect, test } from 'bun:test';
import { InMemorySessionPool, type SessionPoolDeps } from './session-pool';
import type { OpenedDocument } from '../lib/document';
import type { CliIO } from '../lib/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const NOOP = () => undefined;

const TEST_IO: CliIO = {
  now: () => Date.now(),
  readStdinBytes: async () => new Uint8Array(),
  stdout: NOOP,
  stderr: NOOP,
};

function createFakeOpened(label = 'default'): {
  opened: OpenedDocument;
  disposeCount: { count: number };
} {
  const disposeCount = { count: 0 };
  return {
    opened: {
      editor: { id: label } as unknown as OpenedDocument['editor'],
      meta: { source: 'path', path: `/tmp/${label}.docx`, byteLength: 1 },
      dispose: () => {
        disposeCount.count += 1;
      },
    },
    disposeCount,
  };
}

function createPool(overrides: SessionPoolDeps = {}): {
  pool: InMemorySessionPool;
  openLocalCalls: number[];
  openCollabCalls: number[];
} {
  const openLocalCalls: number[] = [];
  const openCollabCalls: number[] = [];

  const pool = new InMemorySessionPool({
    openLocal: async () => {
      openLocalCalls.push(1);
      return createFakeOpened(`local-${openLocalCalls.length}`).opened;
    },
    openCollaborative: async () => {
      openCollabCalls.push(1);
      return createFakeOpened(`collab-${openCollabCalls.length}`).opened;
    },
    exportToPath: async (_editor, docPath) => ({ path: docPath, byteLength: 100 }),
    now: () => 1000,
    createTimer: overrides.createTimer ?? (() => 0 as unknown as ReturnType<typeof setTimeout>),
    clearTimer: overrides.clearTimer ?? NOOP,
    ...overrides,
  });

  return { pool, openLocalCalls, openCollabCalls };
}

const LOCAL_METADATA = {
  sessionType: 'local' as const,
  workingDocPath: '/tmp/working.docx',
  metadataRevision: 1,
};

const COLLAB_PROFILE = {
  providerType: 'hocuspocus' as const,
  url: 'ws://example.test',
  documentId: 'doc-1',
};

const COLLAB_METADATA = {
  sessionType: 'collab' as const,
  workingDocPath: '/tmp/working.docx',
  metadataRevision: 1,
  collaboration: COLLAB_PROFILE,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InMemorySessionPool', () => {
  // -----------------------------------------------------------------------
  // acquire
  // -----------------------------------------------------------------------

  describe('acquire', () => {
    test('returns same editor for same sessionId (local reuse)', async () => {
      const { pool, openLocalCalls } = createPool();

      const first = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      first.dispose(); // release lease
      const second = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);

      expect(openLocalCalls.length).toBe(1);
      expect(first.editor).toBe(second.editor);
    });

    test('opens fresh on first call', async () => {
      const { pool, openLocalCalls } = createPool();

      await pool.acquire('s1', LOCAL_METADATA, TEST_IO);

      expect(openLocalCalls.length).toBe(1);
    });

    test('discards and reopens collab session on fingerprint mismatch', async () => {
      const { pool, openCollabCalls } = createPool();

      await pool.acquire('s1', COLLAB_METADATA, TEST_IO);

      const differentProfile = { ...COLLAB_PROFILE, documentId: 'doc-2' };
      await pool.acquire('s1', { ...COLLAB_METADATA, collaboration: differentProfile }, TEST_IO);

      expect(openCollabCalls.length).toBe(2);
    });

    test('reuses collab session when fingerprint matches', async () => {
      const { pool, openCollabCalls } = createPool();

      const first = await pool.acquire('s1', COLLAB_METADATA, TEST_IO);
      first.dispose();
      const second = await pool.acquire('s1', COLLAB_METADATA, TEST_IO);

      expect(openCollabCalls.length).toBe(1);
      expect(first.editor).toBe(second.editor);
    });

    test('discards and reopens local session on metadataRevision drift (no checkpoint)', async () => {
      const { pool, openLocalCalls } = createPool({
        openLocal: async () => {
          openLocalCalls.push(1);
          return createFakeOpened(`local-${openLocalCalls.length}`).opened;
        },
      });

      // Acquire with revision 1
      const first = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      pool.markDirty('s1');
      first.dispose();

      // Acquire with drifted revision (revision 5 — out-of-band mutation)
      const driftedMetadata = { ...LOCAL_METADATA, metadataRevision: 5 };
      const second = await pool.acquire('s1', driftedMetadata, TEST_IO);

      // Should have opened a fresh session, not checkpointed the stale one
      expect(first.editor).not.toBe(second.editor);
    });

    test('reuses local session when metadataRevision matches', async () => {
      const { pool, openLocalCalls } = createPool();

      const first = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      first.dispose();
      const second = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);

      expect(openLocalCalls.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // updateMetadataRevision
  // -----------------------------------------------------------------------

  describe('updateMetadataRevision', () => {
    test('keeps pool in sync — no spurious drift-triggered reopens', async () => {
      const { pool, openLocalCalls } = createPool();

      const first = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      first.dispose();

      // Simulate mutation: bump revision in pool
      pool.updateMetadataRevision('s1', 2);

      // Next acquire with updated revision should reuse
      const second = await pool.acquire('s1', { ...LOCAL_METADATA, metadataRevision: 2 }, TEST_IO);

      expect(openLocalCalls.length).toBe(1);
      expect(first.editor).toBe(second.editor);
    });
  });

  // -----------------------------------------------------------------------
  // markDirty / checkpoint
  // -----------------------------------------------------------------------

  describe('markDirty and checkpoint', () => {
    test('markDirty + checkpoint writes to disk and clears dirty', async () => {
      const exportCalls: string[] = [];

      const pool = new InMemorySessionPool({
        openLocal: async () => createFakeOpened('local').opened,
        exportToPath: async (_editor, docPath) => {
          exportCalls.push(docPath);
          return { path: docPath, byteLength: 100 };
        },
        now: () => 1000,
        createTimer: () => 0 as unknown as ReturnType<typeof setTimeout>,
        clearTimer: NOOP,
      });

      await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      pool.markDirty('s1');
      expect(pool.isDirty('s1')).toBe(true);

      await pool.checkpoint('s1');

      expect(pool.isDirty('s1')).toBe(false);
      expect(exportCalls).toEqual([LOCAL_METADATA.workingDocPath]);
    });

    test('disposeSession without discard flushes dirty state', async () => {
      const exportCalls: string[] = [];

      const pool = new InMemorySessionPool({
        openLocal: async () => createFakeOpened('local').opened,
        exportToPath: async (_editor, docPath) => {
          exportCalls.push(docPath);
          return { path: docPath, byteLength: 100 };
        },
        now: () => 1000,
        createTimer: () => 0 as unknown as ReturnType<typeof setTimeout>,
        clearTimer: NOOP,
      });

      const opened = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      pool.markDirty('s1');
      opened.dispose();

      await pool.disposeSession('s1');

      // Should have checkpointed before destroying
      expect(exportCalls).toEqual([LOCAL_METADATA.workingDocPath]);
      // Session is gone after dispose
      expect(pool.isDirty('s1')).toBe(false);
    });

    test('disposeSession with discard does NOT checkpoint', async () => {
      const { pool } = createPool();

      const opened = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      pool.markDirty('s1');
      opened.dispose();

      // After discard dispose, session is removed — isDirty returns false (no session)
      await pool.disposeSession('s1', { discard: true });
      expect(pool.isDirty('s1')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // adoptFromOpen
  // -----------------------------------------------------------------------

  describe('adoptFromOpen', () => {
    test('adopts and reuses editor on next acquire', async () => {
      const { pool, openLocalCalls } = createPool();
      const { opened } = createFakeOpened('adopted');

      pool.adoptFromOpen('s1', opened, {
        sessionType: 'local',
        workingDocPath: '/tmp/working.docx',
        metadataRevision: 1,
      });

      const acquired = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      expect(openLocalCalls.length).toBe(0);
      expect(acquired.editor).toBe(opened.editor);
    });

    test('replaces existing session', async () => {
      const { pool } = createPool();
      const { opened: first, disposeCount: firstDispose } = createFakeOpened('first');
      const { opened: second } = createFakeOpened('second');

      pool.adoptFromOpen('s1', first, {
        sessionType: 'local',
        workingDocPath: '/tmp/working.docx',
        metadataRevision: 1,
      });

      pool.adoptFromOpen('s1', second, {
        sessionType: 'local',
        workingDocPath: '/tmp/working.docx',
        metadataRevision: 1,
      });

      expect(firstDispose.count).toBe(1);

      const acquired = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      expect(acquired.editor).toBe(second.editor);
    });
  });

  // -----------------------------------------------------------------------
  // Lease behavior
  // -----------------------------------------------------------------------

  describe('lease', () => {
    test('dispose() does not destroy editor, sets leased = false', async () => {
      const { pool } = createPool();
      const { opened: fake, disposeCount } = createFakeOpened('test');

      pool.adoptFromOpen('s1', fake, {
        sessionType: 'local',
        workingDocPath: '/tmp/working.docx',
        metadataRevision: 1,
      });

      const leased = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      leased.dispose(); // lease release, not real dispose

      expect(disposeCount.count).toBe(0); // editor NOT destroyed

      // Can still acquire again
      const again = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      expect(again.editor).toBe(fake.editor);
    });
  });

  // -----------------------------------------------------------------------
  // disposeAll
  // -----------------------------------------------------------------------

  describe('disposeAll', () => {
    test('disposes all sessions', async () => {
      const { pool, openLocalCalls, openCollabCalls } = createPool();

      const a = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      const b = await pool.acquire('s2', COLLAB_METADATA, TEST_IO);
      a.dispose();
      b.dispose();

      await pool.disposeAll();

      // After disposeAll, re-acquiring on the same pool should open fresh sessions
      expect(openLocalCalls.length).toBe(1);
      expect(openCollabCalls.length).toBe(1);

      const c = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      expect(openLocalCalls.length).toBe(2); // fresh open, not reused
      c.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Autosave timer
  // -----------------------------------------------------------------------

  describe('autosave timer', () => {
    test('fires after debounce period', async () => {
      const timerCallbacks: Array<() => void> = [];
      const { pool } = createPool({
        createTimer: (cb) => {
          timerCallbacks.push(cb);
          return timerCallbacks.length as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: NOOP,
      });

      const opened = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      opened.dispose();
      pool.markDirty('s1');

      expect(timerCallbacks.length).toBe(1);
    });

    test('resets on repeated markDirty (debounce)', async () => {
      let clearCount = 0;
      const timerCallbacks: Array<() => void> = [];
      const { pool } = createPool({
        createTimer: (cb) => {
          timerCallbacks.push(cb);
          return timerCallbacks.length as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: () => {
          clearCount += 1;
        },
      });

      const opened = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      opened.dispose();

      pool.markDirty('s1');
      pool.markDirty('s1');
      pool.markDirty('s1');

      // Each markDirty after the first clears the previous timer
      expect(clearCount).toBe(2);
      expect(timerCallbacks.length).toBe(3);
    });

    test('disposeSession clears autosave timer', async () => {
      let clearCount = 0;
      const { pool } = createPool({
        createTimer: () => 42 as unknown as ReturnType<typeof setTimeout>,
        clearTimer: () => {
          clearCount += 1;
        },
      });

      const opened = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      opened.dispose();
      pool.markDirty('s1');

      await pool.disposeSession('s1', { discard: true });
      expect(clearCount).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // flushPendingCheckpoints
  // -----------------------------------------------------------------------

  describe('flushPendingCheckpoints', () => {
    test('clears pending timers and attempts checkpoint', async () => {
      let clearCount = 0;
      const exportCalls: string[] = [];

      const pool = new InMemorySessionPool({
        openLocal: async () => createFakeOpened('flush-test').opened,
        exportToPath: async (_editor, docPath) => {
          exportCalls.push(docPath);
          return { path: docPath, byteLength: 100 };
        },
        now: () => 1000,
        createTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
        clearTimer: () => {
          clearCount += 1;
        },
      });

      const opened = await pool.acquire('s1', LOCAL_METADATA, TEST_IO);
      opened.dispose();
      pool.markDirty('s1');

      await pool.flushPendingCheckpoints();

      expect(clearCount).toBeGreaterThan(0);
      expect(exportCalls).toEqual([LOCAL_METADATA.workingDocPath]);
      expect(pool.isDirty('s1')).toBe(false);
    });
  });
});
