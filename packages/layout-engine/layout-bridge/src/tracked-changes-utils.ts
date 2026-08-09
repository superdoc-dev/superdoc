import type { Run, TrackedChangeMeta, TextRun, ParagraphBlock } from '@superdoc/contracts';

/**
 * Type guard to check if a run has tracked change metadata.
 *
 * This utility provides a type-safe way to narrow a generic Run to a TextRun
 * with tracked change metadata, enabling proper type inference in consuming code.
 *
 * @param run - The run to check for tracked change metadata
 * @returns True if the run has tracked change metadata, with type narrowing
 *
 * @example
 * ```typescript
 * if (hasTrackedChange(run)) {
 *   // TypeScript now knows run.trackedChange exists
 *   console.log(run.trackedChange.kind);
 * }
 * ```
 */
export const hasTrackedChange = (run: Run): run is TextRun & { trackedChange: TrackedChangeMeta } => {
  return 'trackedChange' in run && run.trackedChange !== undefined && run.trackedChange !== null;
};

/**
 * Resolves whether tracked changes are enabled for a paragraph block.
 *
 * Provides consistent handling of undefined/false/true states across the codebase.
 * When the `trackedChangesEnabled` attribute is not present or undefined, the
 * function returns the provided default value.
 *
 * @param attrs - The paragraph block attributes to check
 * @param defaultEnabled - Default value when attribute is not present (default: true)
 * @returns True if tracked changes are enabled for this block
 *
 * @example
 * ```typescript
 * const enabled = resolveTrackedChangesEnabled(block.attrs);
 * if (enabled) {
 *   // Process tracked changes for this block
 * }
 * ```
 */
export const resolveTrackedChangesEnabled = (
  attrs: ParagraphBlock['attrs'] | undefined,
  defaultEnabled = true,
): boolean => {
  if (!attrs || !('trackedChangesEnabled' in attrs)) {
    return defaultEnabled;
  }
  return attrs.trackedChangesEnabled !== false;
};
