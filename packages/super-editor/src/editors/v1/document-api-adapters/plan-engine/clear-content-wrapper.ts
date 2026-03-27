/**
 * clearContent wrapper — replaces all document body content with a single
 * empty paragraph via a ProseMirror transaction routed through the plan engine.
 */

import type { ClearContentInput, Receipt, RevisionGuardOptions } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { DocumentApiAdapterError } from '../errors.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { executeDomainCommand } from './plan-wrappers.js';

function isDocumentEmpty(editor: Editor): boolean {
  const { doc } = editor.state;
  if (doc.childCount !== 1) return false;
  const firstChild = doc.firstChild;
  return firstChild?.type.name === 'paragraph' && firstChild.childCount === 0;
}

export function clearContentWrapper(
  editor: Editor,
  _input: ClearContentInput,
  options?: RevisionGuardOptions,
): Receipt {
  const paragraphType = editor.state.schema.nodes.paragraph;
  if (!paragraphType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'clearContent requires the paragraph node type in the schema.',
      { reason: 'missing_schema_node' },
    );
  }

  if (isDocumentEmpty(editor)) {
    return { success: false, failure: { code: 'NO_OP', message: 'Document is already empty.' } };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { state } = editor;
      const emptyParagraph = paragraphType.create();
      const tr = state.tr.replaceWith(0, state.doc.content.size, emptyParagraph);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) {
    return { success: false, failure: { code: 'NO_OP', message: 'Clear command produced no change.' } };
  }

  return { success: true };
}
