import type { SourceAnchor } from '@superdoc/contracts';

export function applySourceAnchorDataset(element: HTMLElement, sourceAnchor?: SourceAnchor): void {
  if (!sourceAnchor) {
    delete element.dataset.sourceAnchor;
    delete element.dataset.sourceNodeId;
    delete element.dataset.sourceOccurrenceId;
    return;
  }

  try {
    element.dataset.sourceAnchor = JSON.stringify(sourceAnchor);
  } catch {
    delete element.dataset.sourceAnchor;
  }
  if (sourceAnchor.sourceNodeId) {
    element.dataset.sourceNodeId = sourceAnchor.sourceNodeId;
  } else {
    delete element.dataset.sourceNodeId;
  }
  if (sourceAnchor.occurrenceId) {
    element.dataset.sourceOccurrenceId = sourceAnchor.occurrenceId;
  } else {
    delete element.dataset.sourceOccurrenceId;
  }
}
