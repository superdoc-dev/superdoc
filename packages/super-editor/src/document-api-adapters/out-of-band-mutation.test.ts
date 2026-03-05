import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeOutOfBandMutation, type OutOfBandMutationResult } from './out-of-band-mutation.js';

const { closeHistoryMock, stopCapturingMock, yGetStateMock } = vi.hoisted(() => ({
  closeHistoryMock: vi.fn((tr) => tr),
  stopCapturingMock: vi.fn(),
  yGetStateMock: vi.fn(() => undefined),
}));

vi.mock('prosemirror-history', () => ({
  closeHistory: closeHistoryMock,
}));

vi.mock('y-prosemirror', () => ({
  yUndoPluginKey: {
    getState: yGetStateMock,
  },
}));

// ---------------------------------------------------------------------------
// Mock editor with revision tracking support
// ---------------------------------------------------------------------------

function createMockEditor(opts: { initialRevision?: number; guid?: string | null } = {}) {
  const converter = {
    documentModified: false,
    documentGuid: 'guid' in opts ? opts.guid : 'test-guid',
    promoteToGuid: vi.fn(() => 'promoted-guid'),
  };

  // Simulate the revision tracker's WeakMap by storing revision on the object
  const editor = {
    converter,
    options: {},
    state: { tr: { id: 'tx' } },
    view: { dispatch: vi.fn() },
    on: vi.fn(),
    _revision: opts.initialRevision ?? 0,
  };

  return editor;
}

// ---------------------------------------------------------------------------
// We need to mock the revision tracker module
// ---------------------------------------------------------------------------

vi.mock('./plan-engine/revision-tracker.js', () => {
  return {
    checkRevision: vi.fn((editor: { _revision: number }, expected: string | undefined) => {
      if (expected === undefined) return;
      if (expected !== String(editor._revision)) {
        throw Object.assign(new Error(`REVISION_MISMATCH — expected "${expected}" but at "${editor._revision}"`), {
          code: 'REVISION_MISMATCH',
        });
      }
    }),
    incrementRevision: vi.fn((editor: { _revision: number }) => {
      editor._revision += 1;
      return String(editor._revision);
    }),
  };
});

describe('executeOutOfBandMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    yGetStateMock.mockReturnValue(undefined);
  });

  it('runs revision guard before mutateFn', () => {
    const editor = createMockEditor({ initialRevision: 5 });
    const mutateFn = vi.fn((): OutOfBandMutationResult<string> => ({ changed: true, payload: 'ok' }));

    expect(() => executeOutOfBandMutation(editor as never, mutateFn, { dryRun: false, expectedRevision: '3' })).toThrow(
      /REVISION_MISMATCH/,
    );

    // mutateFn should NOT have been called
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('passes dryRun flag to mutateFn', () => {
    const editor = createMockEditor();
    const mutateFn = vi.fn((dryRun: boolean): OutOfBandMutationResult<boolean> => ({ changed: true, payload: dryRun }));

    const result = executeOutOfBandMutation(editor as never, mutateFn, { dryRun: true, expectedRevision: undefined });
    expect(result).toBe(true); // payload is the dryRun flag
    expect(mutateFn).toHaveBeenCalledWith(true);
  });

  it('skips dirty/GUID/revision on dryRun even when changed: true', () => {
    const editor = createMockEditor();
    const mutateFn = vi.fn((): OutOfBandMutationResult<string> => ({ changed: true, payload: 'ok' }));

    executeOutOfBandMutation(editor as never, mutateFn, { dryRun: true, expectedRevision: undefined });

    expect(editor.converter.documentModified).toBe(false);
    expect(editor._revision).toBe(0);
  });

  it('marks dirty, promotes GUID, increments revision on real mutation with changed: true', () => {
    const editor = createMockEditor({ guid: null });
    const mutateFn = vi.fn((): OutOfBandMutationResult<string> => ({ changed: true, payload: 'ok' }));

    executeOutOfBandMutation(editor as never, mutateFn, { dryRun: false, expectedRevision: undefined });

    expect(editor.converter.documentModified).toBe(true);
    expect(editor.converter.promoteToGuid).toHaveBeenCalled();
    expect(editor._revision).toBe(1);
  });

  it('does not promote GUID when one already exists', () => {
    const editor = createMockEditor({ guid: 'existing' });
    const mutateFn = vi.fn((): OutOfBandMutationResult<string> => ({ changed: true, payload: 'ok' }));

    executeOutOfBandMutation(editor as never, mutateFn, { dryRun: false, expectedRevision: undefined });

    expect(editor.converter.promoteToGuid).not.toHaveBeenCalled();
    expect(editor.converter.documentModified).toBe(true);
  });

  it('skips dirty/GUID/revision when mutateFn returns changed: false', () => {
    const editor = createMockEditor({ guid: null });
    const mutateFn = vi.fn((): OutOfBandMutationResult<string> => ({ changed: false, payload: 'no-op' }));

    const result = executeOutOfBandMutation(editor as never, mutateFn, {
      dryRun: false,
      expectedRevision: undefined,
    });

    expect(result).toBe('no-op');
    expect(editor.converter.documentModified).toBe(false);
    expect(editor.converter.promoteToGuid).not.toHaveBeenCalled();
    expect(editor._revision).toBe(0);
  });

  it('returns the payload from mutateFn', () => {
    const editor = createMockEditor();
    const mutateFn = vi.fn(
      (): OutOfBandMutationResult<{ receipt: string }> => ({
        changed: true,
        payload: { receipt: 'data' },
      }),
    );

    const result = executeOutOfBandMutation(editor as never, mutateFn, {
      dryRun: false,
      expectedRevision: undefined,
    });

    expect(result).toEqual({ receipt: 'data' });
  });

  it('closes PM history group before non-collab out-of-band mutation', () => {
    const editor = createMockEditor();
    const mutateFn = vi.fn((): OutOfBandMutationResult<string> => ({ changed: false, payload: 'ok' }));

    executeOutOfBandMutation(editor as never, mutateFn, {
      dryRun: false,
      expectedRevision: undefined,
    });

    expect(closeHistoryMock).toHaveBeenCalledWith(editor.state.tr);
    expect(editor.view.dispatch).toHaveBeenCalled();
    expect(stopCapturingMock).not.toHaveBeenCalled();
  });

  it('stops yjs capture before collab out-of-band mutation', () => {
    const editor = createMockEditor();
    editor.options = { collaborationProvider: {}, ydoc: {} };
    yGetStateMock.mockReturnValue({
      undoManager: {
        stopCapturing: stopCapturingMock,
      },
    });
    const mutateFn = vi.fn((): OutOfBandMutationResult<string> => ({ changed: false, payload: 'ok' }));

    executeOutOfBandMutation(editor as never, mutateFn, {
      dryRun: false,
      expectedRevision: undefined,
    });

    expect(stopCapturingMock).toHaveBeenCalledOnce();
    expect(closeHistoryMock).not.toHaveBeenCalled();
  });

  it('does not touch history grouping during dry-run', () => {
    const editor = createMockEditor();
    const mutateFn = vi.fn((): OutOfBandMutationResult<string> => ({ changed: false, payload: 'ok' }));

    executeOutOfBandMutation(editor as never, mutateFn, {
      dryRun: true,
      expectedRevision: undefined,
    });

    expect(closeHistoryMock).not.toHaveBeenCalled();
    expect(stopCapturingMock).not.toHaveBeenCalled();
    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });
});
