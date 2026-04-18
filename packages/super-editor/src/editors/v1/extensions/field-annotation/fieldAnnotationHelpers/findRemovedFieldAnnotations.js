import { ReplaceStep } from 'prosemirror-transform';
import { findChildren } from '@core/helpers/findChildren';

export function findRemovedFieldAnnotations(tr) {
  let removedNodes = [];

  if (
    !tr.steps.length ||
    (tr.meta && !Object.keys(tr.meta).every((meta) => ['inputType', 'uiEvent', 'paste'].includes(meta))) ||
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

function transactionDeletedAnything(tr) {
  return tr.steps.some((step) => {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      return step.from !== step.to;
    }
    return false;
  });
}
