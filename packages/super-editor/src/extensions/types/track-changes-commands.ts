/**
 * Command type augmentations for track changes operations.
 *
 * @module TrackChangesCommands
 */

import type { User } from '../../core/types/EditorConfig.js';

/** Tracked change object with position info */
export type TrackedChange = {
  /** Start position of the change */
  start: number;
  /** End position of the change */
  end: number;
  /** The change type */
  type?: 'insert' | 'delete' | 'format';
  /** Change ID */
  id?: string;
};

/** Options for acceptTrackedChange/rejectTrackedChange */
export type TrackedChangeOptions = {
  /** The tracked change to accept/reject */
  trackedChange: TrackedChange;
};

/** Options for programmatic tracked change insertion */
export type InsertTrackedChangeOptions = {
  /** Start position (defaults to selection start) */
  from?: number;
  /** End position (defaults to selection end) */
  to?: number;
  /** Replacement text */
  text?: string;
  /** Author override for the tracked change (defaults to editor user if not provided) */
  user?: Partial<User>;
  /** Optional comment reply to attach to the tracked change */
  comment?: string;
  /** Whether to add the change to the undo history (defaults to true) */
  addToHistory?: boolean;
  /** Whether to emit commentsUpdate event for the tracked change (defaults to true).
   * Set to false to apply the mark without creating a sidebar entry/bubble. */
  emitCommentEvent?: boolean;
};

export interface TrackChangesCommands {
  // ============================================
  // ACCEPT COMMANDS
  // ============================================

  /**
   * Accept tracked changes in a range
   * @param from - Start position
   * @param to - End position
   */
  acceptTrackedChangesBetween: (from: number, to: number) => boolean;

  /**
   * Accept a specific tracked change
   * @param options - Object containing the tracked change
   */
  acceptTrackedChange: (options: TrackedChangeOptions) => boolean;

  /**
   * Accept tracked changes in the current selection
   */
  acceptTrackedChangeBySelection: () => boolean;

  /**
   * Accept tracked change from toolbar (uses active thread or selection)
   */
  acceptTrackedChangeFromToolbar: () => boolean;

  /**
   * Accept tracked change by its ID
   * @param id - The tracked change ID
   */
  acceptTrackedChangeById: (id: string) => boolean;

  /**
   * Accept all tracked changes in the document
   */
  acceptAllTrackedChanges: () => boolean;

  // ============================================
  // REJECT COMMANDS
  // ============================================

  /**
   * Reject tracked changes in a range
   * @param from - Start position
   * @param to - End position
   */
  rejectTrackedChangesBetween: (from: number, to: number) => boolean;

  /**
   * Reject a specific tracked change
   * @param options - Object containing the tracked change
   */
  rejectTrackedChange: (options: TrackedChangeOptions) => boolean;

  /**
   * Reject tracked changes in the current selection
   */
  rejectTrackedChangeOnSelection: () => boolean;

  /**
   * Reject tracked change from toolbar (uses active thread or selection)
   */
  rejectTrackedChangeFromToolbar: () => boolean;

  /**
   * Reject tracked change by its ID
   * @param id - The tracked change ID
   */
  rejectTrackedChangeById: (id: string) => boolean;

  /**
   * Reject all tracked changes in the document
   */
  rejectAllTrackedChanges: () => boolean;

  /**
   * Insert a tracked change without toggling editor mode.
   * Optionally attaches a comment reply to the change.
   */
  insertTrackedChange: (options?: InsertTrackedChangeOptions) => boolean;

  // ============================================
  // TRACK CHANGES MODE COMMANDS
  // ============================================

  /**
   * Toggle track changes mode on/off
   */
  toggleTrackChanges: () => boolean;

  /**
   * Enable track changes mode
   */
  enableTrackChanges: () => boolean;

  /**
   * Disable track changes mode
   */
  disableTrackChanges: () => boolean;

  // ============================================
  // VIEW MODE COMMANDS
  // ============================================

  /**
   * Toggle showing only original content (before changes)
   */
  toggleTrackChangesShowOriginal: () => boolean;

  /**
   * Enable showing only original content
   */
  enableTrackChangesShowOriginal: () => boolean;

  /**
   * Disable showing only original content
   */
  disableTrackChangesShowOriginal: () => boolean;

  /**
   * Toggle showing only final content (after changes)
   */
  toggleTrackChangesShowFinal: () => boolean;

  /**
   * Enable showing only final content
   */
  enableTrackChangesShowFinal: () => boolean;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends TrackChangesCommands {}
}
