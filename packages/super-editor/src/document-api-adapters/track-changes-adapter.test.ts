import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '../core/Editor.js';
import {
  trackChangesAcceptAdapter,
  trackChangesAcceptAllAdapter,
  trackChangesGetAdapter,
  trackChangesListAdapter,
  trackChangesRejectAdapter,
  trackChangesRejectAllAdapter,
} from './track-changes-adapter.js';
import { TrackDeleteMarkName, TrackInsertMarkName } from '../extensions/track-changes/constants.js';
import { getTrackChanges } from '../extensions/track-changes/trackChangesHelpers/getTrackChanges.js';

vi.mock('../extensions/track-changes/trackChangesHelpers/getTrackChanges.js', () => ({
  getTrackChanges: vi.fn(),
}));

function makeEditor(overrides: Partial<Editor> = {}): Editor {
  return {
    state: {
      doc: {
        content: { size: 100 },
        textBetween(from: number, to: number) {
          return `excerpt-${from}-${to}`;
        },
      },
    },
    commands: {
      acceptTrackedChangeById: vi.fn(() => true),
      rejectTrackedChangeById: vi.fn(() => true),
      acceptAllTrackedChanges: vi.fn(() => true),
      rejectAllTrackedChanges: vi.fn(() => true),
    },
    ...overrides,
  } as unknown as Editor;
}

describe('track-changes adapters', () => {
  it('lists tracked changes with stable trackedChange entity addresses', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      {
        mark: {
          type: { name: TrackInsertMarkName },
          attrs: { id: 'tc-1', author: 'Ada', authorEmail: 'ada@example.com' },
        },
        from: 2,
        to: 5,
      },
      {
        mark: {
          type: { name: TrackDeleteMarkName },
          attrs: { id: 'tc-1' },
        },
        from: 5,
        to: 8,
      },
    ] as never);

    const result = trackChangesListAdapter(makeEditor());
    expect(result.total).toBe(1);
    expect(result.matches[0]).toMatchObject({
      kind: 'entity',
      entityType: 'trackedChange',
    });
    expect(typeof result.matches[0]?.entityId).toBe('string');
    expect(result.changes?.[0]?.id).toBe(result.matches[0]?.entityId);
    expect(result.changes?.[0]?.type).toBe('insert');
    expect(result.changes?.[0]?.excerpt).toContain('excerpt-2-8');
  });

  it('respects list type filters and pagination', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      {
        mark: {
          type: { name: TrackInsertMarkName },
          attrs: { id: 'tc-1' },
        },
        from: 1,
        to: 2,
      },
      {
        mark: {
          type: { name: TrackDeleteMarkName },
          attrs: { id: 'tc-2' },
        },
        from: 3,
        to: 4,
      },
    ] as never);

    const result = trackChangesListAdapter(makeEditor(), { type: 'delete', limit: 1, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.matches).toHaveLength(1);
    expect(result.changes?.[0]?.type).toBe('delete');
  });

  it('gets a tracked change by id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      {
        mark: {
          type: { name: TrackInsertMarkName },
          attrs: { id: 'tc-1' },
        },
        from: 2,
        to: 5,
      },
    ] as never);

    const editor = makeEditor();
    const listed = trackChangesListAdapter(editor, { limit: 1 });
    const id = listed.matches[0]?.entityId;
    expect(typeof id).toBe('string');
    const change = trackChangesGetAdapter(editor, { id: id as string });
    expect(change.id).toBe(id);
  });

  it('throws for unknown tracked change ids', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);
    expect(() => trackChangesGetAdapter(makeEditor(), { id: 'missing' })).toThrow('was not found');

    try {
      trackChangesGetAdapter(makeEditor(), { id: 'missing' });
    } catch (error) {
      expect((error as { code?: string }).code).toBe('TARGET_NOT_FOUND');
    }
  });

  it('maps accept/reject commands to receipts', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      {
        mark: {
          type: { name: TrackInsertMarkName },
          attrs: { id: 'tc-1' },
        },
        from: 1,
        to: 2,
      },
    ] as never);

    const acceptTrackedChangeById = vi.fn(() => true);
    const rejectTrackedChangeById = vi.fn(() => true);
    const acceptAllTrackedChanges = vi.fn(() => true);
    const rejectAllTrackedChanges = vi.fn(() => true);
    const editor = makeEditor({
      commands: {
        acceptTrackedChangeById,
        rejectTrackedChangeById,
        acceptAllTrackedChanges,
        rejectAllTrackedChanges,
      } as never,
    });

    const listed = trackChangesListAdapter(editor, { limit: 1 });
    const id = listed.matches[0]?.entityId as string;
    expect(typeof id).toBe('string');

    expect(trackChangesAcceptAdapter(editor, { id }).success).toBe(true);
    expect(trackChangesRejectAdapter(editor, { id }).success).toBe(true);
    expect(trackChangesAcceptAllAdapter(editor, {}).success).toBe(true);
    expect(trackChangesRejectAllAdapter(editor, {}).success).toBe(true);
    expect(acceptTrackedChangeById).toHaveBeenCalledWith('tc-1');
    expect(rejectTrackedChangeById).toHaveBeenCalledWith('tc-1');
  });

  it('throws TARGET_NOT_FOUND when accepting/rejecting an unknown id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);

    expect(() => trackChangesAcceptAdapter(makeEditor(), { id: 'missing' })).toThrow('was not found');
    expect(() => trackChangesRejectAdapter(makeEditor(), { id: 'missing' })).toThrow('was not found');

    try {
      trackChangesAcceptAdapter(makeEditor(), { id: 'missing' });
    } catch (error) {
      expect((error as { code?: string }).code).toBe('TARGET_NOT_FOUND');
    }
  });

  it('throws CAPABILITY_UNAVAILABLE when accept/reject commands are missing', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      {
        mark: {
          type: { name: TrackInsertMarkName },
          attrs: { id: 'tc-1' },
        },
        from: 1,
        to: 2,
      },
    ] as never);

    const editor = makeEditor({
      commands: {
        acceptTrackedChangeById: undefined,
        rejectTrackedChangeById: undefined,
        acceptAllTrackedChanges: vi.fn(() => true),
        rejectAllTrackedChanges: vi.fn(() => true),
      } as never,
    });

    const listed = trackChangesListAdapter(editor, { limit: 1 });
    const id = listed.matches[0]?.entityId as string;

    expect(() => trackChangesAcceptAdapter(editor, { id })).toThrow('Accept tracked change command is not available');
    expect(() => trackChangesRejectAdapter(editor, { id })).toThrow('Reject tracked change command is not available');
  });

  it('returns NO_OP failure when accept/reject commands do not apply', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      {
        mark: {
          type: { name: TrackInsertMarkName },
          attrs: { id: 'tc-1' },
        },
        from: 1,
        to: 2,
      },
    ] as never);

    const editor = makeEditor({
      commands: {
        acceptTrackedChangeById: vi.fn(() => false),
        rejectTrackedChangeById: vi.fn(() => false),
        acceptAllTrackedChanges: vi.fn(() => true),
        rejectAllTrackedChanges: vi.fn(() => true),
      } as never,
    });

    const listed = trackChangesListAdapter(editor, { limit: 1 });
    const id = listed.matches[0]?.entityId as string;

    const acceptReceipt = trackChangesAcceptAdapter(editor, { id });
    const rejectReceipt = trackChangesRejectAdapter(editor, { id });
    expect(acceptReceipt.success).toBe(false);
    expect(acceptReceipt.failure?.code).toBe('NO_OP');
    expect(rejectReceipt.success).toBe(false);
    expect(rejectReceipt.failure?.code).toBe('NO_OP');
  });

  it('throws CAPABILITY_UNAVAILABLE for missing accept-all/reject-all commands', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);

    const editor = makeEditor({
      commands: {
        acceptTrackedChangeById: vi.fn(() => true),
        rejectTrackedChangeById: vi.fn(() => true),
        acceptAllTrackedChanges: undefined,
        rejectAllTrackedChanges: undefined,
      } as never,
    });

    expect(() => trackChangesAcceptAllAdapter(editor, {})).toThrow(
      'Accept all tracked changes command is not available',
    );
    expect(() => trackChangesRejectAllAdapter(editor, {})).toThrow(
      'Reject all tracked changes command is not available',
    );
  });

  it('returns NO_OP failure when accept-all/reject-all do not apply', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);

    const editor = makeEditor({
      commands: {
        acceptTrackedChangeById: vi.fn(() => true),
        rejectTrackedChangeById: vi.fn(() => true),
        acceptAllTrackedChanges: vi.fn(() => false),
        rejectAllTrackedChanges: vi.fn(() => false),
      } as never,
    });

    const acceptAllReceipt = trackChangesAcceptAllAdapter(editor, {});
    const rejectAllReceipt = trackChangesRejectAllAdapter(editor, {});
    expect(acceptAllReceipt.success).toBe(false);
    expect(acceptAllReceipt.failure?.code).toBe('NO_OP');
    expect(rejectAllReceipt.success).toBe(false);
    expect(rejectAllReceipt.failure?.code).toBe('NO_OP');
  });

  it('returns NO_OP failure when accept-all/reject-all report true but no tracked changes exist', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);

    const editor = makeEditor({
      commands: {
        acceptTrackedChangeById: vi.fn(() => true),
        rejectTrackedChangeById: vi.fn(() => true),
        acceptAllTrackedChanges: vi.fn(() => true),
        rejectAllTrackedChanges: vi.fn(() => true),
      } as never,
    });

    const acceptAllReceipt = trackChangesAcceptAllAdapter(editor, {});
    const rejectAllReceipt = trackChangesRejectAllAdapter(editor, {});
    expect(acceptAllReceipt.success).toBe(false);
    expect(acceptAllReceipt.failure?.code).toBe('NO_OP');
    expect(rejectAllReceipt.success).toBe(false);
    expect(rejectAllReceipt.failure?.code).toBe('NO_OP');
  });

  it('resolves stable ids across calls when raw ids differ', () => {
    const marks = [
      {
        mark: {
          type: { name: TrackInsertMarkName },
          attrs: { id: 'raw-1', date: '2026-02-11T00:00:00.000Z' },
        },
        from: 2,
        to: 5,
      },
    ];

    vi.mocked(getTrackChanges).mockImplementation(() => marks as never);
    const editor = makeEditor();

    const listed = trackChangesListAdapter(editor, { limit: 1 });
    const stableId = listed.matches[0]?.entityId;
    expect(typeof stableId).toBe('string');

    marks[0] = {
      ...marks[0],
      mark: {
        ...marks[0].mark,
        attrs: { ...marks[0].mark.attrs, id: 'raw-2' },
      },
    };

    const resolved = trackChangesGetAdapter(editor, { id: stableId as string });
    expect(resolved.id).toBe(stableId);
  });

  it('throws TARGET_NOT_FOUND when accepting an id that was already processed', () => {
    const marks = [
      {
        mark: {
          type: { name: TrackInsertMarkName },
          attrs: { id: 'raw-1' },
        },
        from: 2,
        to: 5,
      },
    ];

    vi.mocked(getTrackChanges).mockImplementation(() => marks as never);

    const state = {
      doc: {
        content: { size: 100 },
        textBetween(from: number, to: number) {
          return `excerpt-${from}-${to}`;
        },
      },
    };
    const acceptTrackedChangeById = vi.fn(() => {
      marks.splice(0, marks.length);
      // Simulate ProseMirror creating a new doc reference after mutation
      state.doc = { ...state.doc };
      return true;
    });

    const editor = makeEditor({
      state: state as never,
      commands: {
        acceptTrackedChangeById,
        rejectTrackedChangeById: vi.fn(() => true),
        acceptAllTrackedChanges: vi.fn(() => true),
        rejectAllTrackedChanges: vi.fn(() => true),
      } as never,
    });

    const listed = trackChangesListAdapter(editor, { limit: 1 });
    const stableId = listed.matches[0]?.entityId as string;

    expect(trackChangesAcceptAdapter(editor, { id: stableId }).success).toBe(true);
    expect(() => trackChangesAcceptAdapter(editor, { id: stableId })).toThrow('was not found');
  });
});
