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
} from '../extensions/diffing/service/index';
import { DocumentApiAdapterError } from './errors.js';

/**
 * Creates a DiffAdapter bound to the given editor instance.
 */
export function createDiffAdapter(editor: Editor): DiffAdapter {
  return {
    capture(): DiffSnapshot {
      return wrapServiceCall(() => captureSnapshot(editor));
    },

    compare(input: DiffCompareInput): DiffPayload {
      return wrapServiceCall(() => compareToSnapshot(editor, input.targetSnapshot));
    },

    apply(input: DiffApplyInput, options?: DiffApplyOptions): DiffApplyResult {
      const { result, tr } = wrapServiceCall(() => applyDiffPayload(editor, input.diff, options));

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
