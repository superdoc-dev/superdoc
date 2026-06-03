import { findRemovedFieldAnnotations } from './findRemovedFieldAnnotations.js';

/**
 * Detect field annotations removed by the transaction and emit a
 * `fieldAnnotationDeleted` event on the editor (deferred via
 * `setTimeout(0)` so the dispatch settles before subscribers run).
 *
 * Failures inside `findRemovedFieldAnnotations` are swallowed so a
 * transaction-shape edge case can't crash the editor.
 *
 * @param {import('./types.js').Editor} editor - The editor instance to
 *   emit the event on.
 * @param {import('./types.js').Transaction} tr - The transaction to inspect.
 * @returns {void}
 */
export function trackFieldAnnotationsDeletion(editor, tr) {
  /** @type {import('./types.js').FieldAnnotationEntry[]} */
  let removedAnnotations = [];
  try {
    removedAnnotations = findRemovedFieldAnnotations(tr);
  } catch {}

  if (removedAnnotations.length > 0) {
    setTimeout(() => {
      editor.emit('fieldAnnotationDeleted', {
        editor,
        removedNodes: removedAnnotations,
      });
    }, 0);
  }
}
