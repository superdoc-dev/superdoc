import { ReplaceStep } from 'prosemirror-transform';
import { findChildren } from '@core/helpers/findChildren';
import { CustomSelectionPluginKey } from '@core/selection-state.js';

const ALLOWED_META_KEYS = ['inputType', 'uiEvent', 'paste', CustomSelectionPluginKey.key];

/**
 * Find field annotations that were removed by a transaction.
 *
 * Inspects the transaction's `ReplaceStep`s against `tr.before` and
 * returns annotations whose positions were deleted (and that didn't
 * reappear elsewhere in `tr.doc` under the same `fieldId`).
 *
 * Skips when:
 * - the transaction has no steps,
 * - it carries unexpected meta keys,
 * - it's an undo / redo / drop / fieldAnnotationUpdate / tableGeneration tx.
 *
 * @param {import('./types.js').Transaction} tr - The transaction to inspect.
 * @returns {import('./types.js').FieldAnnotationEntry[]} Removed
 *   `{ node, pos }` entries. Empty array when nothing was removed or the
 *   transaction is skipped.
 */
export function findRemovedFieldAnnotations(tr) {
  /** @type {import('./types.js').FieldAnnotationEntry[]} */
  let removedNodes = [];

  if (
    !tr.steps.length ||
    (tr.meta && !Object.keys(tr.meta).every((meta) => ALLOWED_META_KEYS.includes(meta))) ||
    ['historyUndo', 'historyRedo'].includes(tr.getMeta('inputType')) ||
    ['drop'].includes(tr.getMeta('uiEvent')) ||
    tr.getMeta('fieldAnnotationUpdate') === true ||
    tr.getMeta('tableGeneration') === true
  ) {
    return removedNodes;
  }

  const hasDeletion = transactionDeletedAnything(tr);
  if (!hasDeletion) return removedNodes;

  tr.steps.forEach((step, stepIndex) => {
    if (step instanceof ReplaceStep && step.from !== step.to) {
      let mapping = tr.mapping.maps[stepIndex];
      let originalDoc = tr.before;

      originalDoc.nodesBetween(step.from, step.to, (node, pos) => {
        if (node.type.name === 'fieldAnnotation') {
          let mappedPos = mapping.mapResult(pos);

          if (mappedPos.deleted) {
            removedNodes.push({ node, pos });
          }
        }
      });
    }
  });

  if (removedNodes.length) {
    const removedNodesIds = removedNodes.map((item) => item.node.attrs.fieldId);
    const found = findChildren(
      tr.doc,
      (node) => node.type.name === 'fieldAnnotation' && removedNodesIds.includes(node.attrs.fieldId),
    );
    const foundSet = new Set(found.map((item) => item.node.attrs.fieldId));
    const removedNodesFiltered = removedNodes.filter((item) => !foundSet.has(item.node.attrs.fieldId));
    removedNodes = removedNodesFiltered;
  }

  return removedNodes;
}

/**
 * @param {import('./types.js').Transaction} tr
 * @returns {boolean}
 */
function transactionDeletedAnything(tr) {
  return tr.steps.some((step) => {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      return step.from !== step.to;
    }
    return false;
  });
}
