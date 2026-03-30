/**
 * FieldAnnotationInteractionLayer
 *
 * Upgrades field annotation DOM elements with editing affordances after each
 * paint cycle. The DomPainter renders annotations as inert visual elements with
 * position contract attributes (data-pm-start, data-pm-end, data-type, etc.).
 *
 * This layer adds:
 * - `draggable="true"` and `data-draggable="true"` for native drag-and-drop
 * - `data-display-label` for drag toast text
 * - `data-variant` mirroring `data-type` for drag payload metadata
 * - Caret-anchor `<span>` elements for cursor placement after annotations
 *
 * Called by PresentationEditor after each paint and on virtualization remounts
 * via the centralized `#refreshEditorDomAugmentations()` method.
 */

import { DOM_CLASS_NAMES, DATASET_KEYS, buildAnnotationSelector } from '@superdoc/dom-contract';

const INTERACTION_EPOCH_KEY = 'interactionEpoch';
const DISPLAY_LABEL_SOURCE_KEY = 'displayLabelSource';
const DISPLAY_LABEL_SOURCE = {
  CANONICAL: 'canonical',
  DERIVED: 'derived',
} as const;

type ResolvedDisplayLabel = {
  source: (typeof DISPLAY_LABEL_SOURCE)[keyof typeof DISPLAY_LABEL_SOURCE];
  value: string;
};

function resolveAnnotationDisplayLabel(
  annotation: HTMLElement,
  contentEl: Element | null,
): ResolvedDisplayLabel | null {
  const existingLabel = annotation.dataset[DATASET_KEYS.DISPLAY_LABEL];
  const existingLabelSource = annotation.dataset[DISPLAY_LABEL_SOURCE_KEY];

  if (existingLabel !== undefined && existingLabelSource !== DISPLAY_LABEL_SOURCE.DERIVED) {
    return {
      source: DISPLAY_LABEL_SOURCE.CANONICAL,
      value: existingLabel,
    };
  }

  const derivedLabel = contentEl?.textContent?.trim() ?? '';
  if (derivedLabel.length === 0) {
    return null;
  }

  return {
    source: DISPLAY_LABEL_SOURCE.DERIVED,
    value: derivedLabel,
  };
}

export class FieldAnnotationInteractionLayer {
  #container: HTMLElement | null = null;

  setContainer(container: HTMLElement | null): void {
    this.#container = container;
  }

  /**
   * Apply editing affordances to all annotation elements in the container.
   * Idempotent: skips elements already upgraded for the current layout epoch.
   */
  apply(layoutEpoch: number): void {
    if (!this.#container) return;

    const epochStr = String(layoutEpoch);
    const annotations = this.#container.querySelectorAll(buildAnnotationSelector());

    for (let index = 0; index < annotations.length; index += 1) {
      const annotation = annotations[index] as HTMLElement;

      // Skip if already upgraded for this epoch
      if (annotation.dataset[INTERACTION_EPOCH_KEY] === epochStr) continue;

      // Mark as upgraded
      annotation.dataset[INTERACTION_EPOCH_KEY] = epochStr;

      // Drag affordances
      annotation.draggable = true;
      annotation.dataset[DATASET_KEYS.DRAGGABLE] = 'true';

      // Derive display label from rendered content
      const contentEl = annotation.querySelector(`.${DOM_CLASS_NAMES.ANNOTATION_CONTENT}`);
      const displayLabel = resolveAnnotationDisplayLabel(annotation, contentEl);
      if (displayLabel !== null) {
        annotation.dataset[DATASET_KEYS.DISPLAY_LABEL] = displayLabel.value;
        annotation.dataset[DISPLAY_LABEL_SOURCE_KEY] = displayLabel.source;
      }

      // Mirror data-type as data-variant for drag payload compatibility
      const variantType = annotation.dataset[DATASET_KEYS.TYPE];
      if (variantType) {
        annotation.dataset[DATASET_KEYS.VARIANT] = variantType;
      }

      // Append caret anchor if not already present
      this.#ensureCaretAnchor(annotation);
    }
  }

  /**
   * Remove all editing affordances from annotation elements.
   * Used during teardown.
   */
  clear(): void {
    if (!this.#container) return;

    const annotations = this.#container.querySelectorAll(buildAnnotationSelector());
    for (let index = 0; index < annotations.length; index += 1) {
      const annotation = annotations[index] as HTMLElement;
      annotation.removeAttribute('draggable');
      delete annotation.dataset[DATASET_KEYS.DRAGGABLE];
      delete annotation.dataset[DATASET_KEYS.DISPLAY_LABEL];
      delete annotation.dataset[DATASET_KEYS.VARIANT];
      delete annotation.dataset[INTERACTION_EPOCH_KEY];
      delete annotation.dataset[DISPLAY_LABEL_SOURCE_KEY];

      // Remove caret anchor
      const anchor = annotation.querySelector(`.${DOM_CLASS_NAMES.ANNOTATION_CARET_ANCHOR}`);
      anchor?.remove();
    }
  }

  /**
   * Appends a hidden caret-anchor span so cursor placement after the
   * annotation works correctly. The span carries data-pm-start/end at
   * the annotation's pmEnd position, which DomPositionIndex indexes.
   */
  #ensureCaretAnchor(annotation: HTMLElement): void {
    // Skip if already present (idempotent for virtualization remounts)
    if (annotation.querySelector(`.${DOM_CLASS_NAMES.ANNOTATION_CARET_ANCHOR}`)) return;

    const pmEnd = annotation.dataset[DATASET_KEYS.PM_END];
    const layoutEpoch = annotation.dataset[DATASET_KEYS.LAYOUT_EPOCH];
    if (pmEnd == null) return;

    const doc = this.#container?.ownerDocument;
    if (!doc) return;

    const caretAnchor = doc.createElement('span');
    caretAnchor.dataset[DATASET_KEYS.PM_START] = pmEnd;
    caretAnchor.dataset[DATASET_KEYS.PM_END] = pmEnd;
    caretAnchor.dataset[DATASET_KEYS.LAYOUT_EPOCH] = layoutEpoch ?? '';
    caretAnchor.classList.add(DOM_CLASS_NAMES.ANNOTATION_CARET_ANCHOR);
    caretAnchor.style.position = 'absolute';
    caretAnchor.style.left = '100%';
    caretAnchor.style.top = '0';
    caretAnchor.style.width = '0';
    caretAnchor.style.height = '1em';
    caretAnchor.style.overflow = 'hidden';
    caretAnchor.style.pointerEvents = 'none';
    caretAnchor.style.userSelect = 'none';
    caretAnchor.style.opacity = '0';
    caretAnchor.textContent = '\u200B';
    if (!annotation.style.position) {
      annotation.style.position = 'relative';
    }
    annotation.appendChild(caretAnchor);
  }
}
