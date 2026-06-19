import { describe, expect, it, vi } from 'vitest';

import { createV2EditorRuntimeAdapter } from './v2-editor-runtime-adapter.js';

function createReadyHost(overrides: Record<string, unknown> = {}) {
  return {
    getSnapshot: () => ({
      state: 'ready',
      documentMode: 'editing',
      editableSubset: {
        editingMounted: true,
        commands: [
          { command: 'review.trackedChangeDecide', status: 'supported', rejectionCode: null, detail: null },
        ],
      },
      commentCommandsReason: null,
    }),
    subscribe: () => () => {},
    getDocumentMode: () => 'editing',
    setDocumentMode: vi.fn(),
    dispatch: vi.fn(async () => ({ status: 'committed', receipt: { success: true } })),
    save: vi.fn(async () => new ArrayBuffer(0)),
    dispose: vi.fn(async () => {}),
    getHandles: () => ({ editing: null }),
    getPageMetricsSnapshot: () => ({ pages: [], zoom: { percent: 100 } }),
    setZoom: vi.fn(() => ({ status: 'ok' })),
    ...overrides,
  };
}

describe('createV2EditorRuntimeAdapter review mutation route', () => {
  it('routes tracked-change decisions through the synchronous Document API facade', async () => {
    const decide = vi.fn(() => ({ success: true, txId: 'tx-1' }));
    const host = createReadyHost({
      getDocumentFacade: () => ({
        available: true,
        doc: {
          comments: {},
          trackChanges: { decide },
        },
      }),
    });
    const { runtime } = createV2EditorRuntimeAdapter({
      id: 'v2-runtime',
      documentId: 'doc-1',
      root: document.createElement('div'),
      host,
    });

    await expect(runtime.dispatch({ kind: 'trackedChanges.accept', id: 'tc-1' })).resolves.toMatchObject({
      status: 'committed',
    });
    expect(decide).toHaveBeenCalledWith({ decision: 'accept', target: { kind: 'id', id: 'tc-1' } });
    expect(host.dispatch).not.toHaveBeenCalled();
  });

  it('advertises and routes bulk tracked-change decisions when the host publishes bulk support rows', async () => {
    const decide = vi.fn(() => ({ success: true, txId: 'tx-1' }));
    const host = createReadyHost({
      getSnapshot: () => ({
        state: 'ready',
        documentMode: 'editing',
        editableSubset: {
          editingMounted: true,
          commands: [
            { command: 'review.trackedChangeDecide', status: 'supported', rejectionCode: null, detail: null },
            { command: 'trackedChanges.acceptAll', status: 'supported', rejectionCode: null, detail: null },
            { command: 'trackedChanges.rejectAll', status: 'supported', rejectionCode: null, detail: null },
          ],
        },
        commentCommandsReason: null,
      }),
      getDocumentFacade: () => ({
        available: true,
        doc: {
          comments: {},
          trackChanges: { decide },
        },
      }),
    });
    const { runtime } = createV2EditorRuntimeAdapter({
      id: 'v2-runtime',
      documentId: 'doc-1',
      root: document.createElement('div'),
      host,
    });

    expect(runtime.getCapabilities().commands.supportedCommands).toContain('trackedChanges.acceptAll');
    await expect(runtime.dispatch({ kind: 'trackedChanges.acceptAll' })).resolves.toMatchObject({
      status: 'committed',
    });
    expect(decide).toHaveBeenCalledWith({ decision: 'accept', target: { kind: 'all' } });
    expect(host.dispatch).not.toHaveBeenCalled();
  });

  it('does not advertise or dispatch review mutations when the host marks them read-only', async () => {
    const decide = vi.fn(() => ({ success: true, txId: 'tx-1' }));
    const host = createReadyHost({
      getSnapshot: () => ({
        state: 'ready',
        documentMode: 'viewing',
        editableSubset: {
          editingMounted: false,
          commands: [
            {
              command: 'review.trackedChangeDecide',
              status: 'unsupported',
              rejectionCode: 'review-surface-read-only',
              detail: 'review-mutations-disabled-in-review-mode',
            },
          ],
        },
        commentCommandsReason: null,
      }),
      getDocumentMode: () => 'viewing',
      getDocumentFacade: () => ({
        available: true,
        doc: {
          comments: {},
          trackChanges: { decide },
        },
      }),
    });
    const { runtime } = createV2EditorRuntimeAdapter({
      id: 'v2-runtime',
      documentId: 'doc-1',
      root: document.createElement('div'),
      host,
    });

    expect(runtime.getSnapshot().state).toBe('review-ready');
    expect(runtime.getCapabilities().trackedChanges.canDecide).toBe(false);
    expect(runtime.getCapabilities().commands.supportedCommands).not.toContain('trackedChanges.accept');
    await expect(runtime.dispatch({ kind: 'trackedChanges.accept', id: 'tc-1' })).resolves.toEqual({
      status: 'rejected',
      reason: 'document-readonly',
      detail: 'review-mutations-disabled-in-review-mode',
    });
    expect(decide).not.toHaveBeenCalled();
    expect(host.dispatch).not.toHaveBeenCalled();
  });

  it('fails review mutations closed when the sync Document API facade is unavailable', async () => {
    const host = createReadyHost({
      getDocumentFacade: () => ({
        available: false,
        reason: 'sync-document-api-unavailable-in-worker-mode',
      }),
    });
    const { runtime } = createV2EditorRuntimeAdapter({
      id: 'v2-runtime',
      documentId: 'doc-1',
      root: document.createElement('div'),
      host,
    });

    await expect(runtime.dispatch({ kind: 'trackedChanges.reject', id: 'tc-1' })).resolves.toEqual({
      status: 'rejected',
      reason: 'review-command-unavailable',
    });
    expect(host.dispatch).not.toHaveBeenCalled();
  });
});
