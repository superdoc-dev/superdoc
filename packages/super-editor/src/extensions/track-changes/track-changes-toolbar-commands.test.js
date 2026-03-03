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

describe('Track Changes Toolbar Commands', () => {
  let commands;
  let mockState;
  let mockCommands;
  let mockCommentsPluginGetState;
  let mockCollectTrackedChanges;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { CommentsPluginKey } = await import('../comment/comments-plugin.js');
    const { collectTrackedChanges } = await import('./permission-helpers.js');
    mockCommentsPluginGetState = CommentsPluginKey.getState;
    mockCollectTrackedChanges = collectTrackedChanges;

    commands = TrackChanges.config.addCommands();

    mockCommands = {
      acceptTrackedChangeById: vi.fn().mockReturnValue(true),
      acceptTrackedChangeBySelection: vi.fn().mockReturnValue(true),
      rejectTrackedChangeById: vi.fn().mockReturnValue(true),
      rejectTrackedChangeOnSelection: vi.fn().mockReturnValue(true),
    };

    mockState = {
      selection: { from: 10, to: 10 },
    };

    mockCollectTrackedChanges.mockReturnValue([]);
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
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeById).toHaveBeenCalledWith('tracked-change-123');
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
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeBySelection).toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
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
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeById).toHaveBeenCalledWith('tracked-change-456');
      expect(mockCommands.acceptTrackedChangeBySelection).not.toHaveBeenCalled();
    });

    it('falls back to acceptTrackedChangeBySelection when no active tracked change', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: null,
        trackedChanges: {},
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeBySelection).toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
    });

    it('falls back to acceptTrackedChangeBySelection when active ID is a regular comment', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'regular-comment-789',
        // Empty - the active thread is a comment, not a tracked change
        trackedChanges: {},
      });

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeBySelection).toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
    });

    it('handles missing CommentsPlugin state gracefully', () => {
      mockCommentsPluginGetState.mockReturnValue(undefined);

      const command = commands.acceptTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.acceptTrackedChangeBySelection).toHaveBeenCalled();
      expect(mockCommands.acceptTrackedChangeById).not.toHaveBeenCalled();
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
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeById).toHaveBeenCalledWith('tracked-change-789');
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
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeOnSelection).toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeById).not.toHaveBeenCalled();
    });

    it('falls back to rejectTrackedChangeOnSelection when no active tracked change', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: null,
        trackedChanges: {},
      });

      const command = commands.rejectTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeOnSelection).toHaveBeenCalled();
      expect(mockCommands.rejectTrackedChangeById).not.toHaveBeenCalled();
    });

    it('falls back to rejectTrackedChangeOnSelection when active ID is a regular comment', () => {
      mockCommentsPluginGetState.mockReturnValue({
        activeThreadId: 'regular-comment-555',
        trackedChanges: {},
      });

      const command = commands.rejectTrackedChangeFromToolbar;
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeOnSelection).toHaveBeenCalled();
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
      const result = command()({ state: mockState, commands: mockCommands });

      expect(result).toBe(true);
      expect(mockCommands.rejectTrackedChangeById).toHaveBeenCalledWith('tracked-change-999');
      expect(mockCommands.rejectTrackedChangeOnSelection).not.toHaveBeenCalled();
    });
  });
});
