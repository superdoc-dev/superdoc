import { describe, expect, it } from 'bun:test';
import type { HistoryActionResult, HistoryAdapter } from './history.js';
describe('HistoryActionResult additive fields', () => {
  it('accepts v1-shaped results unchanged', () => {
    const v1: HistoryActionResult = {
      noop: false,
      revision: { before: '5', after: '6' },
    };
    expect(v1.inserted).toBeUndefined();
    expect(v1.removed).toBeUndefined();
    expect(v1.invalidatedRefs).toBeUndefined();
    expect(v1.remappedRefs).toBeUndefined();
    expect(v1.affectedStories).toBeUndefined();
  });
  it('accepts extended results with populated optional fields', () => {
    const extended: HistoryActionResult = {
      noop: false,
      revision: { before: '5', after: '6' },
      removed: [{ kind: 'entity', entityType: 'comment', entityId: '42' }],
      invalidatedRefs: [{ kind: 'entity', entityType: 'comment', entityId: '42' }],
      affectedStories: [{ kind: 'story', storyType: 'body' }],
      remappedRefs: [],
      inserted: [],
      updated: [],
    };
    expect(extended.removed?.[0]).toEqual({ kind: 'entity', entityType: 'comment', entityId: '42' });
    expect(extended.invalidatedRefs?.[0]).toEqual({ kind: 'entity', entityType: 'comment', entityId: '42' });
    expect(extended.affectedStories?.[0]).toEqual({ kind: 'story', storyType: 'body' });
  });
  it('accepts additive noop reasons', () => {
    const r: HistoryActionResult = {
      noop: true,
      reason: 'no-undo-available',
      revision: { before: '3', after: '3' },
    };
    expect(r.reason).toBe('no-undo-available');
  });
  it('keeps HistoryAdapter satisfied by v1-shape implementations', () => {
    const v1Adapter: HistoryAdapter = {
      get: () => ({
        undoDepth: 0,
        redoDepth: 0,
        canUndo: false,
        canRedo: false,
        historyUnsafeOperations: [],
      }),
      undo: () => ({ noop: true, reason: 'EMPTY_UNDO_STACK', revision: { before: '1', after: '1' } }),
      redo: () => ({ noop: true, reason: 'EMPTY_REDO_STACK', revision: { before: '1', after: '1' } }),
    };
    expect(v1Adapter.undo().noop).toBe(true);
    expect(v1Adapter.redo().noop).toBe(true);
  });
});
