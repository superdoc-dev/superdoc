import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../core/Editor.js';
import { createHistoryAdapter } from './history-adapter.js';

const { undoDepthMock, redoDepthMock, yGetStateMock } = vi.hoisted(() => ({
  undoDepthMock: vi.fn(() => 0),
  redoDepthMock: vi.fn(() => 0),
  yGetStateMock: vi.fn(() => undefined),
}));

vi.mock('prosemirror-history', () => ({
  undoDepth: undoDepthMock,
  redoDepth: redoDepthMock,
}));

vi.mock('y-prosemirror', () => ({
  yUndoPluginKey: {
    getState: yGetStateMock,
  },
}));

function makeEditor(overrides: Partial<Editor> = {}): Editor {
  return {
    options: {},
    state: { tr: {} } as Editor['state'],
    commands: {
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
    } as unknown as Editor['commands'],
    ...overrides,
  } as unknown as Editor;
}

describe('createHistoryAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undoDepthMock.mockReturnValue(0);
    redoDepthMock.mockReturnValue(0);
    yGetStateMock.mockReturnValue(undefined);
  });

  it('reads undo/redo depth from PM history in non-collab mode', () => {
    undoDepthMock.mockReturnValue(2);
    redoDepthMock.mockReturnValue(1);

    const adapter = createHistoryAdapter(makeEditor());
    const result = adapter.get();

    expect(undoDepthMock).toHaveBeenCalledOnce();
    expect(redoDepthMock).toHaveBeenCalledOnce();
    expect(result.undoDepth).toBe(2);
    expect(result.redoDepth).toBe(1);
    expect(result.canUndo).toBe(true);
    expect(result.canRedo).toBe(true);
    expect(result.historyUnsafeOperations).toContain('styles.apply');
  });

  it('reads undo/redo depth from yUndoPlugin in collab mode', () => {
    yGetStateMock.mockReturnValue({
      undoManager: {
        undoStack: [1, 2, 3],
        redoStack: [1],
      },
    });

    const adapter = createHistoryAdapter(
      makeEditor({
        options: {
          collaborationProvider: {},
          ydoc: {},
        } as Editor['options'],
      }),
    );

    const result = adapter.get();

    expect(yGetStateMock).toHaveBeenCalledTimes(2);
    expect(result.undoDepth).toBe(3);
    expect(result.redoDepth).toBe(1);
    expect(result.canUndo).toBe(true);
    expect(result.canRedo).toBe(true);
  });

  it('throws CAPABILITY_UNAVAILABLE when undo command is missing', () => {
    const adapter = createHistoryAdapter(
      makeEditor({
        commands: {
          undo: undefined,
          redo: vi.fn(() => true),
        } as unknown as Editor['commands'],
      }),
    );

    try {
      adapter.undo();
      expect.fail('Expected undo to throw');
    } catch (error: unknown) {
      expect(error).toMatchObject({ name: 'DocumentApiAdapterError', code: 'CAPABILITY_UNAVAILABLE' });
    }
  });

  it('throws CAPABILITY_UNAVAILABLE when redo command is missing', () => {
    const adapter = createHistoryAdapter(
      makeEditor({
        commands: {
          undo: vi.fn(() => true),
          redo: undefined,
        } as unknown as Editor['commands'],
      }),
    );

    try {
      adapter.redo();
      expect.fail('Expected redo to throw');
    } catch (error: unknown) {
      expect(error).toMatchObject({ name: 'DocumentApiAdapterError', code: 'CAPABILITY_UNAVAILABLE' });
    }
  });

  it('returns noop=false when undo/redo commands succeed', () => {
    undoDepthMock.mockReturnValue(1);
    redoDepthMock.mockReturnValue(1);
    const adapter = createHistoryAdapter(makeEditor());

    const undoResult = adapter.undo();
    const redoResult = adapter.redo();

    expect(undoResult.noop).toBe(false);
    expect(undoResult.reason).toBeUndefined();
    expect(redoResult.noop).toBe(false);
    expect(redoResult.reason).toBeUndefined();
    expect(undoResult.revision.before).toBeDefined();
    expect(undoResult.revision.after).toBeDefined();
    expect(redoResult.revision.before).toBeDefined();
    expect(redoResult.revision.after).toBeDefined();
  });

  it('returns EMPTY_UNDO_STACK reason when undo stack is empty', () => {
    undoDepthMock.mockReturnValue(0);
    const adapter = createHistoryAdapter(makeEditor());

    const result = adapter.undo();

    expect(result.noop).toBe(true);
    expect(result.reason).toBe('EMPTY_UNDO_STACK');
  });

  it('returns EMPTY_REDO_STACK reason when redo stack is empty', () => {
    redoDepthMock.mockReturnValue(0);
    const adapter = createHistoryAdapter(makeEditor());

    const result = adapter.redo();

    expect(result.noop).toBe(true);
    expect(result.reason).toBe('EMPTY_REDO_STACK');
  });

  it('returns NO_EFFECT when command returns false with non-empty stack', () => {
    undoDepthMock.mockReturnValue(1);
    const adapter = createHistoryAdapter(
      makeEditor({
        commands: {
          undo: vi.fn(() => false),
          redo: vi.fn(() => true),
        } as unknown as Editor['commands'],
      }),
    );

    const result = adapter.undo();

    expect(result.noop).toBe(true);
    expect(result.reason).toBe('NO_EFFECT');
  });
});
