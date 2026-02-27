/**
 * Shared lifecycle primitive for non-PM-command mutations.
 *
 * Operations that mutate OOXML parts directly (e.g., `styles.apply` on
 * `word/styles.xml`) cannot dispatch PM transactions. This primitive
 * ensures the required lifecycle steps execute in the correct order:
 *
 * 1. Revision guard (`checkRevision`)
 * 2. Execute `mutateFn` (which reads/writes XML and returns a result + changed flag)
 * 3. If `changed` and not `dryRun`: mark dirty, promote GUID, increment revision
 *
 * Future non-PM operations (e.g., numbering-part mutations) reuse this
 * primitive without reimplementing lifecycle steps.
 */

import type { Editor } from '../core/Editor.js';
import { checkRevision, incrementRevision } from './plan-engine/revision-tracker.js';

/** Converter shape accessed from the editor for dirty marking and GUID promotion. */
interface ConverterForMutation {
  documentModified: boolean;
  documentGuid: string | null;
  promoteToGuid?: () => string;
}

/** Result returned by the mutation function passed to `executeOutOfBandMutation`. */
export interface OutOfBandMutationResult<T> {
  /** Whether the XML was actually changed (false = no-op, skip lifecycle side effects). */
  changed: boolean;
  /** The operation-specific payload (e.g., receipt data). */
  payload: T;
}

/** Options passed to `executeOutOfBandMutation`. */
export interface OutOfBandMutationOptions {
  dryRun: boolean;
  expectedRevision: string | undefined;
}

/**
 * Executes a non-PM mutation with correct lifecycle ordering.
 *
 * @param editor      - The editor instance providing converter access.
 * @param mutateFn    - The mutation function. Called with `dryRun` so it can
 *                      skip writes when previewing. Must return `changed` flag.
 * @param options     - dryRun and expectedRevision.
 * @returns           - The payload from `mutateFn`.
 */
export function executeOutOfBandMutation<T>(
  editor: Editor,
  mutateFn: (dryRun: boolean) => OutOfBandMutationResult<T>,
  options: OutOfBandMutationOptions,
): T {
  // Step 1: Revision guard (throws REVISION_MISMATCH if stale)
  checkRevision(editor, options.expectedRevision);

  // Step 2: Execute the mutation (or read-only preview for dryRun)
  const result = mutateFn(options.dryRun);

  // Step 3: Lifecycle side effects (only on real, state-changing mutations)
  if (result.changed && !options.dryRun) {
    const converter = (editor as unknown as { converter?: ConverterForMutation }).converter;
    if (converter) {
      converter.documentModified = true;
      if (!converter.documentGuid && typeof converter.promoteToGuid === 'function') {
        converter.promoteToGuid();
      }
    }
    incrementRevision(editor);
  }

  return result.payload;
}
