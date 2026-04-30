/**
 * `selection.current` operation — reads the editor's current selection
 * and projects it into the Document API's text-address model.
 *
 * This is the primitive consumers use to build custom comments UIs,
 * floating toolbars, mention popovers, etc., without reaching into
 * ProseMirror internals.
 */

import type { SelectionCurrentInput, SelectionInfo } from './selection.types.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, assertNoUnknownFields } from '../validation-primitives.js';

export type { SelectionCurrentInput, SelectionInfo } from './selection.types.js';

/**
 * Engine-specific adapter for the selection API.
 */
export interface SelectionAdapter {
  /** Read the editor's current selection. */
  current(input: SelectionCurrentInput): SelectionInfo;
}

/**
 * Public selection API exposed on `editor.doc.selection`.
 */
export interface SelectionApi {
  /**
   * Read the editor's current selection as a portable {@link SelectionInfo}.
   *
   * Use to drive custom UIs (toolbars, sidebars, popovers) without
   * reaching into ProseMirror internals. For comment-target construction,
   * pass the resulting `target` directly to `comments.create`.
   */
  current(input?: SelectionCurrentInput): SelectionInfo;
}

const SELECTION_CURRENT_ALLOWED_KEYS = new Set(['includeText']);

function validateSelectionCurrentInput(input: unknown): asserts input is SelectionCurrentInput {
  if (input === undefined) return;
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'selection.current input must be a non-null object.');
  }
  assertNoUnknownFields(input, SELECTION_CURRENT_ALLOWED_KEYS, 'selection.current');
  if (input.includeText !== undefined && typeof input.includeText !== 'boolean') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `includeText must be a boolean, got ${typeof input.includeText}.`,
      { field: 'includeText', value: input.includeText },
    );
  }
}

export function executeSelectionCurrent(adapter: SelectionAdapter, input?: SelectionCurrentInput): SelectionInfo {
  validateSelectionCurrentInput(input);
  return adapter.current(input ?? {});
}
