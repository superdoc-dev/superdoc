/**
 * Tracked changes processing logic for PM adapter
 *
 * Handles rendering modes (review/original/final), metadata extraction,
 * and priority selection for overlapping tracked change marks.
 */
import type {
  Run,
  TextRun,
  TrackedChangeMeta,
  TrackedChangeKind,
  TrackedChangesMode,
  RunMark,
} from '@superdoc/contracts';
import type { PMMark, TrackedChangesConfig, HyperlinkConfig, ThemeColorPalette } from './types.js';
/**
 * Type guard to validate that a value is a valid TrackedChangesMode.
 * Prevents unsafe type casts and ensures runtime type safety.
 *
 * @param value - The value to check
 * @returns True if value is a valid TrackedChangesMode
 */
export declare const isValidTrackedMode: (value: unknown) => value is TrackedChangesMode;
/**
 * Type guard to check if a run is a text run.
 * Safely distinguishes TextRun from TabRun by checking for 'text' property.
 *
 * @param run - The run to check
 * @returns True if the run is a TextRun
 */
export declare const isTextRun: (run: Run) => run is TextRun;
/**
 * Strips tracked change metadata from a run
 *
 * @param run - The run to strip tracked change from
 */
export declare const stripTrackedChangeFromRun: (run: Run) => void;
/**
 * Maps a ProseMirror mark type to a tracked change kind
 *
 * @param markType - The PM mark type string
 * @returns The corresponding TrackedChangeKind, or undefined
 */
export declare const pickTrackedChangeKind: (markType: string) => TrackedChangeKind | undefined;
/**
 * Normalizes and validates run mark lists from trackFormat metadata.
 * Applies security limits to prevent DoS attacks from malicious payloads.
 *
 * @param value - Raw mark list (string JSON or array)
 * @returns Normalized RunMark array, or undefined if validation fails
 */
export declare const normalizeRunMarkList: (value: unknown) => RunMark[] | undefined;
/**
 * Derives a unique tracked change ID from mark attributes.
 * Falls back to generating a unique ID from author/date/timestamp if not provided.
 *
 * Fallback ID format: `{kind}-{authorEmail}-{date}-{timestamp}-{random}`
 * where:
 * - kind: insert/delete/format
 * - authorEmail: author's email or 'unknown'
 * - date: ISO date string or 'unknown'
 * - timestamp: current milliseconds since epoch
 * - random: 9-character base-36 random string
 *
 * Uniqueness is guaranteed by combining timestamp and random components,
 * ensuring collision-free IDs even when author/date are missing.
 *
 * @param kind - The tracked change kind (insert/delete/format)
 * @param attrs - Mark attributes containing id, author, and date
 * @returns A unique tracked change ID
 *
 * @example
 * // With provided ID
 * deriveTrackedChangeId('insert', { id: 'custom-123' })
 * // => 'custom-123'
 *
 * @example
 * // Fallback generation with full metadata
 * deriveTrackedChangeId('insert', { authorEmail: 'user@example.com', date: '2025-01-15' })
 * // => 'insert-user@example.com-2025-01-15-1736956800000-abc123def'
 *
 * @example
 * // Fallback generation with missing metadata
 * deriveTrackedChangeId('format', {})
 * // => 'format-unknown-unknown-1736956800000-xyz789ghi'
 */
export declare const deriveTrackedChangeId: (
  kind: TrackedChangeKind,
  attrs: Record<string, unknown> | undefined,
) => string;
/**
 * Builds tracked change metadata from a ProseMirror mark.
 * Extracts author info, timestamps, and before/after formatting for trackFormat marks.
 *
 * @param mark - ProseMirror mark containing tracked change attributes
 * @returns TrackedChangeMeta object, or undefined if not a tracked change mark
 */
export declare const buildTrackedChangeMetaFromMark: (mark: PMMark) => TrackedChangeMeta | undefined;
/**
 * Selects the higher-priority tracked change metadata when multiple marks overlap.
 * Insert/delete marks (priority 3) take precedence over format marks (priority 1).
 *
 * @param existing - Current tracked change metadata, if any
 * @param next - New tracked change metadata to consider
 * @returns The higher-priority metadata
 */
export declare const selectTrackedChangeMeta: (
  existing: TrackedChangeMeta | undefined,
  next: TrackedChangeMeta,
) => TrackedChangeMeta;
/**
 * Checks if two text runs have compatible tracked change metadata for merging.
 * Runs are compatible if they have the same kind and ID, or both have no metadata.
 *
 * @param a - First text run
 * @param b - Second text run
 * @returns true if runs can be merged, false otherwise
 */
export declare const trackedChangesCompatible: (a: TextRun, b: TextRun) => boolean;
/**
 * Collects and prioritizes tracked change metadata from an array of ProseMirror marks.
 * When multiple tracked change marks are present, returns the highest-priority one.
 *
 * @param marks - Array of ProseMirror marks to process
 * @returns The highest-priority TrackedChangeMeta, or undefined if none found
 */
export declare const collectTrackedChangeFromMarks: (marks?: PMMark[]) => TrackedChangeMeta | undefined;
/**
 * Determines if a tracked node should be hidden based on the viewing mode
 *
 * @param meta - Tracked change metadata
 * @param config - Tracked changes configuration
 * @returns true if the node should be hidden
 */
export declare const shouldHideTrackedNode: (
  meta: TrackedChangeMeta | undefined,
  config?: TrackedChangesConfig,
) => boolean;
/**
 * Annotates a block with tracked change metadata if applicable
 *
 * @param block - The block to annotate
 * @param meta - Tracked change metadata to apply
 * @param config - Tracked changes configuration
 */
export declare const annotateBlockWithTrackedChange: (
  block: {
    attrs?: Record<string, unknown>;
  },
  meta: TrackedChangeMeta | undefined,
  config?: TrackedChangesConfig,
) => void;
/**
 * Reset all formatting properties on a run to defaults, preserving text and metadata.
 * Clears bold, italic, color, underline, strike, highlight, link, and letterSpacing.
 *
 * NOTE: fontFamily and fontSize are intentionally preserved, as they represent
 * default text properties rather than explicit formatting changes. These values
 * may come from paragraph or document defaults and should not be removed when
 * reverting tracked format changes.
 *
 * @param run - The text run to reset
 */
export declare const resetRunFormatting: (run: TextRun) => void;
/**
 * Apply format change marks to a run based on tracked changes mode.
 * For 'original' mode, applies the 'before' marks to show original formatting.
 * For 'review' and 'final' modes, the run already has 'after' marks applied.
 *
 * Includes error handling for invalid mark data. If applying marks fails,
 * the run's formatting is reset to defaults to prevent partial/corrupted state.
 *
 * NOTE: This function requires applyMarksToRun from marks.ts, which creates a circular dependency.
 * The actual implementation is in the main conversion logic.
 *
 * @param run - The text run to modify
 * @param config - Tracked changes configuration
 * @param hyperlinkConfig - Hyperlink configuration
 * @param applyMarksToRun - Function to apply marks to run (injected to avoid circular dependency)
 */
export declare const applyFormatChangeMarks: (
  run: TextRun,
  config: TrackedChangesConfig,
  hyperlinkConfig: HyperlinkConfig,
  applyMarksToRun: (
    run: TextRun,
    marks: PMMark[],
    config: HyperlinkConfig,
    themeColors?: ThemeColorPalette,
    backgroundColor?: string,
    enableComments?: boolean,
  ) => void,
  themeColors?: ThemeColorPalette,
  enableComments?: boolean,
) => void;
/**
 * Applies tracked changes mode filtering and metadata stripping to runs.
 * Filters out runs based on mode (original/final) and strips metadata when disabled.
 *
 * @param runs - Array of runs to process
 * @param config - Tracked changes configuration
 * @param hyperlinkConfig - Hyperlink configuration
 * @param applyMarksToRun - Function to apply marks to run (injected to avoid circular dependency)
 * @returns Filtered and processed array of runs
 */
export declare const applyTrackedChangesModeToRuns: (
  runs: Run[],
  config: TrackedChangesConfig | undefined,
  hyperlinkConfig: HyperlinkConfig,
  applyMarksToRun: (
    run: TextRun,
    marks: PMMark[],
    config: HyperlinkConfig,
    themeColors?: ThemeColorPalette,
    backgroundColor?: string,
    enableComments?: boolean,
  ) => void,
  themeColors?: ThemeColorPalette,
  enableComments?: boolean,
) => Run[];
