import type { Editor } from '../../core/Editor.js';
import { DocumentApiAdapterError } from '../errors.js';

/**
 * Asserts that the editor has a configured user, which is required for
 * force-tracked mutations that set `forceTrackChanges` on the transaction.
 *
 * @param editor - The editor instance to validate.
 * @param operation - Human-readable operation name for the error message.
 * @throws {DocumentApiAdapterError} `TRACK_CHANGE_COMMAND_UNAVAILABLE` when user is missing.
 */
export function ensureTrackedUser(editor: Editor, operation: string): void {
  if (!editor.options.user) {
    throw new DocumentApiAdapterError(
      'TRACK_CHANGE_COMMAND_UNAVAILABLE',
      `${operation} requires a user to be configured on the editor instance.`,
    );
  }
}
