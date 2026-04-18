import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrackChanges } from './track-changes.js';

vi.mock('../comment/comments-plugin.js', () => ({
  CommentsPluginKey: {
    getState: vi.fn(),
  },
}));

vi.mock('./permission-helpers.js', () => ({
  collectTrackedChanges: vi.fn(),
}));

vi.mock('./trackChangesHelpers/getTrackChanges.js', () => ({
  getTrackChanges: vi.fn(),
}));

describe('Track Changes Shared Resolution Commands', () => {
  let commands;
  let mockState;
  let mockCommands;
  let mockCommentsPluginGetState;
  let mockCollectTrackedChanges;
  let mockGetTrackChanges;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { CommentsPluginKey } = await import('../comment/comments-plugin.js');
    const { collectTrackedChanges } = await import('./permission-helpers.js');
    const { getTrackChanges } = await import('./trackChangesHelpers/getTrackChanges.js');
    mockCommentsPluginGetState = CommentsPluginKey.getState;
    mockCollectTrackedChanges = collectTrackedChanges;
    mockGetTrackChanges = getTrackChanges;

    commands = TrackChanges.config.addCommands();

    mockCommands = {
      acceptTrackedChangesBetween: vi.fn().mockReturnValue(true),
      acceptTrackedChangeById: vi.fn().mockReturnValue(true),
      acceptTrackedChangeBySelection: vi.fn().mockReturnValue(true),
      rejectTrackedChangesBetween: vi.fn().mockReturnValue(true),
      rejectTrackedChangeById: vi.fn().mockReturnValue(true),
      rejectTrackedChangeOnSelection: vi.fn().mockReturnValue(true),
    };

    mockState = {
      selection: { from: 10, to: 10 },
    };

    mockCollectTrackedChanges.mockReturnValue([]);
    mockGetTrackChanges.mockReturnValue([]);
  });

  describe('acceptTrackedChangeFromToolbar', () => {
    it('uses acceptTrackedChangeById when active tracked change exists (collapsed selection)', () => {
      // Mock CommentsPlugin state with active tracked change
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-123',
        trackedChanges: {
          'tracked-change-123': {
            insertion: 'tracked-change-123',
          },
        },
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeById).toHaveBeenCalledWith('tracked-change-123');
      expect(mockCommands.acceptTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });

    it('uses selection-based accept when text is selected, even with an active tracked change', () => {
      mockState.selection = { from: 10, to: 15 };
      mockCollectTrackedChanges.mockReturnValue([{ id: 'tracked-change-456' }]);

      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-456',
        trackedChanges: {
          'tracked-change-456': {
            deletion: 'tracked-change-456',
          },
        },
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangesBetween).toHaveBeenCalledWith(10, 15);
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });

    it('uses acceptTrackedChangeById when a stale expanded selection does not touch the active tracked change', () => {
      mockState.selection = { from: 10, to: 15 };
      mockCollectTrackedChanges.mockReturnValue([{ id: 'different-change' }]);

      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-456',
        trackedChanges: {
          'tracked-change-456': {
            deletion: 'tracked-change-456',
          },
        },
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeById).toHaveBeenCalledWith('tracked-change-456');
      expect(mockCommands.acceptTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });

    it('falls back to acceptTrackedChangeBySelection when no active tracked change', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: null,
        trackedChanges: {},
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeBySelection).toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
    });

    it('falls back to acceptTrackedChangeBySelection when active ID is a regular comment', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'regular-comment-789',
        // Empty - the active thread is a comment, not a tracked change
        trackedChanges: {},
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeBySelection).toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
    });

    it('handles missing CommentsPlugin state gracefully', () => {
      mockCommentsPluginGetState.mockReturnValue(undefined);

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeBySelection).toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
    });

    it('uses preserved toolbar selection when the live selection has collapsed', () => {
      mockCollectTrackedChanges.mockReturnValue([{ id: 'tracked-change-456' }]);

      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-456',
        trackedChanges: {
          'tracked-change-456': {
            deletion: 'tracked-change-456',
          },
        },
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({
        state: mockState,
        commands: mockCommands,
        editor: { options: { lastSelection: { from: 12, to: 16 } } },
      });

      expect(result).toBe(true);
      expect(mockCollectTrackedChanges).toHaveBeenCalledWith({ state: mockState, from: 12, to: 16 });
      expect(mockCommands.acceptTrackedChangesBetween).toHaveBeenCalledWith(12, 16);
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });

    it('ignores malformed preserved selections and falls back to by-id resolution', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-456',
        trackedChanges: {
          'tracked-change-456': {
            deletion: 'tracked-change-456',
          },
        },
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({
        state: mockState,
        commands: mockCommands,
        editor: { options: { lastSelection: { from: undefined, to: 16 } } },
      });

      expect(result).toBe(true);
      expect(mockCollectTrackedChanges).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeById).toHaveBeenCalledWith('tracked-change-456');
      expect(mockCommands.acceptTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });
  });

  describe('rejectTrackedChangeFromToolbar', () => {
    it('uses rejectTrackedChangeById when active tracked change exists (collapsed selection)', () => {
      // Mock CommentsPlugin state with active tracked change
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-789',
        trackedChanges: {
          'tracked-change-789': {
            format: 'tracked-change-789',
          },
        },
      });

      const command = commands.rejectTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeById).toHaveBeenCalledWith('tracked-change-789');
      expect(mockCommands.rejectTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeOnSelection).not.toHaveBeenCalled();
    });

    it('uses selection-based reject when text is selected, even with an active tracked change', () => {
      mockState.selection = { from: 20, to: 25 };
      mockCollectTrackedChanges.mockReturnValue([{ id: 'tracked-change-999' }]);

      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-999',
        trackedChanges: {
          'tracked-change-999': {
            insertion: 'tracked-change-999',
          },
        },
      });

      const command = commands.rejectTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangesBetween).toHaveBeenCalledWith(20, 25);
      expect(mockCommands.rejectTrackedChangeById).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeOnSelection).not.toHaveBeenCalled();
    });

    it('falls back to rejectTrackedChangeOnSelection when no active tracked change', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: null,
        trackedChanges: {},
      });

      const command = commands.rejectTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeOnSelection).toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeById).not.toHaveBeenCalled();
    });

    it('falls back to rejectTrackedChangeOnSelection when active ID is a regular comment', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'regular-comment-555',
        trackedChanges: {},
      });

      const command = commands.rejectTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeOnSelection).toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeById).not.toHaveBeenCalled();
    });

    it('uses rejectTrackedChangeById when a stale expanded selection does not touch the active tracked change', () => {
      mockState.selection = { from: 20, to: 25 };
      mockCollectTrackedChanges.mockReturnValue([{ id: 'different-change' }]);

      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-999',
        trackedChanges: {
          'tracked-change-999': {
            insertion: 'tracked-change-999',
          },
        },
      });

      const command = commands.rejectTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands, editor: { options: {} } });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeById).toHaveBeenCalledWith('tracked-change-999');
      expect(mockCommands.rejectTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeOnSelection).not.toHaveBeenCalled();
    });

    it('uses preserved toolbar selection when the live selection has collapsed', () => {
      mockCollectTrackedChanges.mockReturnValue([{ id: 'tracked-change-999' }]);

      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'tracked-change-999',
        trackedChanges: {
          'tracked-change-999': {
            insertion: 'tracked-change-999',
          },
        },
      });

      const command = commands.rejectTrackedChangeFromToolbar;
      const result = command()({
        state: mockState,
        commands: mockCommands,
        editor: { options: { preservedSelection: { from: 21, to: 24 } } },
      });

      expect(result).toBe(true);
      expect(mockCollectTrackedChanges).toHaveBeenCalledWith({ state: mockState, from: 21, to: 24 });
      expect(mockCommands.rejectTrackedChangesBetween).toHaveBeenCalledWith(21, 24);
      expect(mockCommands.rejectTrackedChangeById).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeOnSelection).not.toHaveBeenCalled();
    });
  });

  describe('acceptTrackedChangeFromContextMenu', () => {
    it('uses the explicit context-menu selection even when the live selection has collapsed', () => {
      mockCollectTrackedChanges.mockReturnValue([{ id: 'tracked-change-456' }]);

      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'different-active-thread',
        trackedChanges: {
          'tracked-change-456': {
            insertion: 'tracked-change-456',
          },
        },
      });

      const command = commands.acceptTrackedChangeFromContextMenu;
      const result = command({ from: 12, to: 16, trackedChangeId: 'tracked-change-456' })({
        state: mockState,
        commands: mockCommands,
        editor: { options: {} },
      });

      expect(result).toBe(true);
      expect(mockCollectTrackedChanges).toHaveBeenCalledWith({ state: mockState, from: 12, to: 16 });
      expect(mockCommands.acceptTrackedChangesBetween).toHaveBeenCalledWith(12, 16);
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });

    it('falls back to by-id resolution when no explicit range is provided', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: null,
        trackedChanges: {
          'tracked-change-456': {
            insertion: 'tracked-change-456',
          },
        },
      });

      const command = commands.acceptTrackedChangeFromContextMenu;
      const result = command({ trackedChangeId: 'tracked-change-456' })({
        state: mockState,
        commands: mockCommands,
        editor: { options: {} },
      });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeById).toHaveBeenCalledWith('tracked-change-456');
      expect(mockCommands.acceptTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });

    it('falls back to by-id resolution when the comment cache is empty but the document still has the tracked change', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: null,
        trackedChanges: {},
      });
      mockGetTrackChanges.mockReturnValue([
        {
          from: 12,
          to: 16,
          mark: {
            type: { name: 'trackInsert' },
            attrs: { id: 'tracked-change-456' },
          },
        },
      ]);

      const command = commands.acceptTrackedChangeFromContextMenu;
      const result = command({ trackedChangeId: 'tracked-change-456' })({
        state: mockState,
        commands: mockCommands,
        editor: { options: {} },
      });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeById).toHaveBeenCalledWith('tracked-change-456');
      expect(mockCommands.acceptTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });
  });

  describe('rejectTrackedChangeFromContextMenu', () => {
    it('uses the explicit context-menu selection even when the live selection has collapsed', () => {
      mockCollectTrackedChanges.mockReturnValue([{ id: 'tracked-change-999' }]);

      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'different-active-thread',
        trackedChanges: {
          'tracked-change-999': {
            insertion: 'tracked-change-999',
          },
        },
      });

      const command = commands.rejectTrackedChangeFromContextMenu;
      const result = command({ from: 21, to: 24, trackedChangeId: 'tracked-change-999' })({
        state: mockState,
        commands: mockCommands,
        editor: { options: {} },
      });

      expect(result).toBe(true);
      expect(mockCollectTrackedChanges).toHaveBeenCalledWith({ state: mockState, from: 21, to: 24 });
      expect(mockCommands.rejectTrackedChangesBetween).toHaveBeenCalledWith(21, 24);
      expect(mockCommands.rejectTrackedChangeById).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeOnSelection).not.toHaveBeenCalled();
    });

    it('falls back to by-id resolution when no explicit range is provided', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: null,
        trackedChanges: {
          'tracked-change-999': {
            insertion: 'tracked-change-999',
          },
        },
      });

      const command = commands.rejectTrackedChangeFromContextMenu;
      const result = command({ trackedChangeId: 'tracked-change-999' })({
        state: mockState,
        commands: mockCommands,
        editor: { options: {} },
      });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeById).toHaveBeenCalledWith('tracked-change-999');
      expect(mockCommands.rejectTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeOnSelection).not.toHaveBeenCalled();
    });

    it('falls back to by-id resolution when the comment cache is empty but the document still has the tracked change', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: null,
        trackedChanges: {},
      });
      mockGetTrackChanges.mockReturnValue([
        {
          from: 21,
          to: 24,
          mark: {
            type: { name: 'trackDelete' },
            attrs: { id: 'tracked-change-999' },
          },
        },
      ]);

      const command = commands.rejectTrackedChangeFromContextMenu;
      const result = command({ trackedChangeId: 'tracked-change-999' })({
        state: mockState,
        commands: mockCommands,
        editor: { options: {} },
      });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeById).toHaveBeenCalledWith('tracked-change-999');
      expect(mockCommands.rejectTrackedChangesBetween).not.toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeOnSelection).not.toHaveBeenCalled();
    });
  });
});
