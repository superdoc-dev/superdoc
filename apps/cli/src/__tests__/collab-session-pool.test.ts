import { describe, expect, test } from 'bun:test';
import { InMemoryCollaborationSessionPool } from '../host/collab-session-pool';
import type { CollaborationProfile } from '../lib/collaboration';
import type { OpenedDocument } from '../lib/document';

const NOOP = () => undefined;

const TEST_PROFILE: CollaborationProfile = {
  providerType: 'hocuspocus',
  url: 'ws://example.test',
  documentId: 'doc-1',
};

const TEST_IO = {
  now: () => Date.now(),
  readStdinBytes: async () => new Uint8Array(),
  stdout: NOOP,
  stderr: NOOP,
};

function createOpened(disposeCounter: { count: number }): OpenedDocument {
  return {
    editor: {} as OpenedDocument['editor'],
    meta: {
      source: 'path',
      path: '/tmp/working.docx',
      byteLength: 1,
    },
    dispose: () => {
      disposeCounter.count += 1;
    },
  };
}

describe('InMemoryCollaborationSessionPool', () => {
  test('acquire reuses matching session handles', async () => {
    const disposeCounter = { count: 0 };
    let openCount = 0;

    const pool = new InMemoryCollaborationSessionPool({
      openCollaborative: async () => {
        openCount += 1;
        return createOpened(disposeCounter);
      },
      now: () => 1,
    });

    const metadata = {
      contextId: 's1',
      sessionType: 'collab' as const,
      collaboration: TEST_PROFILE,
      sourcePath: '/tmp/source.docx',
      workingDocPath: '/tmp/working.docx',
    };

    const first = await pool.acquire('s1', '/tmp/working.docx', metadata, TEST_IO);
    const second = await pool.acquire('s1', '/tmp/working.docx', metadata, TEST_IO);

    expect(openCount).toBe(1);
    first.dispose();
    second.dispose();
    expect(disposeCounter.count).toBe(0);

    await pool.disposeSession('s1');
    expect(disposeCounter.count).toBe(1);
  });

  test('acquire recreates stale handles on fingerprint mismatch', async () => {
    const disposeCounter = { count: 0 };
    let openCount = 0;

    const pool = new InMemoryCollaborationSessionPool({
      openCollaborative: async () => {
        openCount += 1;
        return createOpened(disposeCounter);
      },
      now: () => 1,
    });

    const metadataA = {
      contextId: 's1',
      sessionType: 'collab' as const,
      collaboration: TEST_PROFILE,
      sourcePath: '/tmp/source-a.docx',
      workingDocPath: '/tmp/working.docx',
    };

    const metadataB = {
      ...metadataA,
      collaboration: {
        ...TEST_PROFILE,
        documentId: 'doc-2',
      },
    };

    await pool.acquire('s1', '/tmp/working.docx', metadataA, TEST_IO);
    await pool.acquire('s1', '/tmp/working.docx', metadataB, TEST_IO);

    expect(openCount).toBe(2);
    expect(disposeCounter.count).toBe(1);

    await pool.disposeAll();
    expect(disposeCounter.count).toBe(2);
  });

  test('acquire reuses handle when only source path changes', async () => {
    const disposeCounter = { count: 0 };
    let openCount = 0;

    const pool = new InMemoryCollaborationSessionPool({
      openCollaborative: async () => {
        openCount += 1;
        return createOpened(disposeCounter);
      },
      now: () => 1,
    });

    const metadataA = {
      contextId: 's1',
      sessionType: 'collab' as const,
      collaboration: TEST_PROFILE,
      sourcePath: '/tmp/source-a.docx',
      workingDocPath: '/tmp/working.docx',
    };

    const metadataB = {
      ...metadataA,
      sourcePath: '/tmp/source-b.docx',
    };

    await pool.acquire('s1', '/tmp/working.docx', metadataA, TEST_IO);
    await pool.acquire('s1', '/tmp/working.docx', metadataB, TEST_IO);

    expect(openCount).toBe(1);
    expect(disposeCounter.count).toBe(0);

    await pool.disposeAll();
    expect(disposeCounter.count).toBe(1);
  });

  test('adoptFromOpen replaces existing handle', async () => {
    const disposeCounter = { count: 0 };
    let openCount = 0;

    const pool = new InMemoryCollaborationSessionPool({
      openCollaborative: async () => {
        openCount += 1;
        return createOpened(disposeCounter);
      },
      now: () => 1,
    });

    const metadata = {
      contextId: 's1',
      sessionType: 'collab' as const,
      collaboration: TEST_PROFILE,
      sourcePath: '/tmp/source.docx',
      workingDocPath: '/tmp/working.docx',
    };

    await pool.acquire('s1', '/tmp/working.docx', metadata, TEST_IO);

    const adoptedDisposeCounter = { count: 0 };
    const adopted = createOpened(adoptedDisposeCounter);
    await pool.adoptFromOpen('s1', adopted, metadata, TEST_IO);

    expect(openCount).toBe(1);
    expect(disposeCounter.count).toBe(1);

    await pool.disposeSession('s1');
    expect(adoptedDisposeCounter.count).toBe(1);
  });
});
