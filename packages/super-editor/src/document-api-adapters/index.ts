import type { DocumentApiAdapters } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { assembleDocumentApiAdapters } from './assemble-adapters.js';

/**
 * Backward-compatible adapter entry point used by Editor.
 * Delegates to assembleDocumentApiAdapters so both construction paths stay in lockstep.
 */
export function getDocumentApiAdapters(editor: Editor): DocumentApiAdapters {
  return assembleDocumentApiAdapters(editor);
}
