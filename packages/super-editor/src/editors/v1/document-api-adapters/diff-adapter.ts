/**
 * Document API adapter for the diff namespace.
 *
 * Maps and delegates to the shared diff service in
 * `extensions/diffing/service/`. Contains no diff logic of its own.
 */

import type {
  DiffAdapter,
  DiffSnapshot,
  DiffPayload,
  DiffApplyResult,
  DiffCompareInput,
  DiffApplyInput,
  DiffApplyOptions,
} from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import {
  captureSnapshot,
  compareToSnapshot,
  applyDiffPayload,
  DiffServiceError,
  type DiffServiceEditor,
} from '../extensions/diffing/service/index';
import { DocumentApiAdapterError } from './errors.js';

/**
 * Creates a DiffAdapter bound to the given editor instance.
 */
export function createDiffAdapter(editor: Editor): DiffAdapter {
  // SD-3240: DiffServiceEditor narrows `converter` to specific diff-
  // related shapes (StylesDocumentProperties, NumberingProperties)
  // that overlap with, but don't structurally match,
  // EditorConverterSurface. Cast at the boundary; runtime shape is
  // identical.
  const diffEditor = editor as unknown as DiffServiceEditor;
  return {
    capture(): DiffSnapshot {
      return wrapServiceCall(() => captureSnapshot(diffEditor));
    },

    compare(input: DiffCompareInput): DiffPayload {
      return wrapServiceCall(() => compareToSnapshot(diffEditor, input.targetSnapshot));
    },

    apply(input: DiffApplyInput, options?: DiffApplyOptions): DiffApplyResult {
      const { result, tr } = wrapServiceCall(() => applyDiffPayload(diffEditor, input.diff, options));

      if (tr.docChanged || result.appliedOperations > 0) {
        editor.dispatch(tr);
      }

      editor.emit('commentsUpdate', { type: 'replayCompleted' });
      return result;
    },
  };
}

/**
 * Translates DiffServiceError codes into DocumentApiAdapterError codes.
 */
function wrapServiceCall<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof DiffServiceError) {
      throw new DocumentApiAdapterError(error.code, error.message);
    }
    throw error;
  }
}
