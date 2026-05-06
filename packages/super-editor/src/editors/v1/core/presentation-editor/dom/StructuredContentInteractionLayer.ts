import { DOM_CLASS_NAMES, DATASET_KEYS } from '@superdoc/dom-contract';

const BLOCK_LABEL_SELECTOR = '.superdoc-structured-content__label';
const INLINE_LABEL_SELECTOR = `.${DOM_CLASS_NAMES.INLINE_SDT_WRAPPER}__label`;
const INTERACTION_EPOCH_KEY = 'structuredContentInteractionEpoch';

export class StructuredContentInteractionLayer {
  #container: HTMLElement | null = null;

  setContainer(container: HTMLElement | null): void {
    this.#container = container;
  }

  apply(layoutEpoch: number): void {
    if (!this.#container) return;

    const labels = Array.from(
      this.#container.querySelectorAll<HTMLElement>(`${BLOCK_LABEL_SELECTOR}, ${INLINE_LABEL_SELECTOR}`),
    );
    for (const label of labels) {
      if (label.dataset[INTERACTION_EPOCH_KEY] === String(layoutEpoch)) continue;

      const sdtElement = label.closest(
        `.${DOM_CLASS_NAMES.BLOCK_SDT}, .${DOM_CLASS_NAMES.INLINE_SDT_WRAPPER}`,
      ) as HTMLElement | null;
      if (!sdtElement?.dataset.sdtId || !sdtElement.dataset.pmStart || !sdtElement.dataset.pmEnd) continue;

      const lockMode = sdtElement.dataset.lockMode ?? 'unlocked';
      if (lockMode !== 'unlocked') {
        label.draggable = false;
        continue;
      }

      const scope =
        sdtElement.dataset.sdtScope ?? (sdtElement.classList.contains(DOM_CLASS_NAMES.BLOCK_SDT) ? 'block' : 'inline');
      const labelText = label.textContent?.trim() || 'Structured content';

      label.dataset[INTERACTION_EPOCH_KEY] = String(layoutEpoch);
      label.draggable = true;
      label.dataset.dragSourceKind = 'structuredContent';
      label.dataset.sdtId = sdtElement.dataset.sdtId;
      label.dataset.pmStart = sdtElement.dataset.pmStart;
      label.dataset.pmEnd = sdtElement.dataset.pmEnd;
      label.dataset.sdtScope = scope;
      label.dataset.lockMode = lockMode;
      label.dataset[DATASET_KEYS.DISPLAY_LABEL] = labelText;
      label.dataset.nodeType = scope === 'block' ? 'structuredContentBlock' : 'structuredContent';
    }
  }

  clear(): void {
    if (!this.#container) return;

    const labels = Array.from(
      this.#container.querySelectorAll<HTMLElement>(`${BLOCK_LABEL_SELECTOR}, ${INLINE_LABEL_SELECTOR}`),
    );
    for (const label of labels) {
      label.removeAttribute('draggable');
      delete label.dataset.dragSourceKind;
      delete label.dataset.sdtId;
      delete label.dataset.pmStart;
      delete label.dataset.pmEnd;
      delete label.dataset.sdtScope;
      delete label.dataset.lockMode;
      delete label.dataset.nodeType;
      delete label.dataset[DATASET_KEYS.DISPLAY_LABEL];
      delete label.dataset[INTERACTION_EPOCH_KEY];
    }
  }
}
