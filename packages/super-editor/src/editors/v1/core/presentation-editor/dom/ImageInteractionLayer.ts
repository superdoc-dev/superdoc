import { DATASET_KEYS, DOM_CLASS_NAMES } from '@superdoc/dom-contract';

const INTERACTION_EPOCH_KEY = 'imageInteractionEpoch';

function parsePmNumber(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}

function collectImageRoots(container: HTMLElement): HTMLElement[] {
  const roots: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const add = (element: HTMLElement | null | undefined) => {
    if (!element || seen.has(element)) return;
    seen.add(element);
    roots.push(element);
  };

  for (const fragment of Array.from(container.querySelectorAll<HTMLElement>(`.${DOM_CLASS_NAMES.IMAGE_FRAGMENT}`))) {
    if (!fragment.hasAttribute('data-image-metadata') && fragment.querySelector?.(`[data-image-metadata]`) == null) {
      continue;
    }
    add(fragment);
  }

  for (const wrapper of Array.from(
    container.querySelectorAll<HTMLElement>(`.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}`),
  )) {
    if (wrapper.querySelector?.(`[data-image-metadata]`) == null) continue;
    add(wrapper);
  }

  for (const inlineImage of Array.from(container.querySelectorAll<HTMLElement>(`.${DOM_CLASS_NAMES.INLINE_IMAGE}`))) {
    if (
      inlineImage.hasAttribute('data-image-metadata') &&
      inlineImage.closest(`.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}`) == null
    ) {
      add(inlineImage);
    }
  }

  return roots;
}

function resolveImageLabel(root: HTMLElement): string {
  const directLabel = root.dataset[DATASET_KEYS.DISPLAY_LABEL];
  if (directLabel) return directLabel;

  const img = root.tagName === 'IMG' ? root : root.querySelector('img');
  const alt = img?.getAttribute('alt')?.trim();
  if (alt) return alt;

  const title = img?.getAttribute('title')?.trim();
  if (title) return title;

  const blockId = root.getAttribute('data-block-id') ?? root.getAttribute('data-sd-block-id');
  return blockId ?? 'Image';
}

function resolveImageKind(root: HTMLElement): 'inline' | 'block' {
  return root.classList.contains(DOM_CLASS_NAMES.IMAGE_FRAGMENT) ? 'block' : 'inline';
}

export class ImageInteractionLayer {
  #container: HTMLElement | null = null;

  setContainer(container: HTMLElement | null): void {
    this.#container = container;
  }

  apply(layoutEpoch: number): void {
    if (!this.#container) return;

    const epochStr = String(layoutEpoch);
    for (const root of collectImageRoots(this.#container)) {
      if (root.dataset[INTERACTION_EPOCH_KEY] === epochStr) continue;

      const pmStart = parsePmNumber(root.dataset.pmStart);
      const pmEnd = parsePmNumber(root.dataset.pmEnd);
      if (!pmStart || !pmEnd) continue;

      root.dataset[INTERACTION_EPOCH_KEY] = epochStr;
      root.draggable = true;
      root.dataset.dragSourceKind = 'existingImage';
      root.dataset.imageKind = resolveImageKind(root);
      root.dataset.nodeType = 'image';
      root.dataset.displayLabel = resolveImageLabel(root);
      root.dataset.pmStart = pmStart;
      root.dataset.pmEnd = pmEnd;
    }
  }

  clear(): void {
    if (!this.#container) return;

    for (const root of collectImageRoots(this.#container)) {
      root.removeAttribute('draggable');
      delete root.dataset.dragSourceKind;
      delete root.dataset.imageKind;
      delete root.dataset.nodeType;
      delete root.dataset.displayLabel;
      delete root.dataset[INTERACTION_EPOCH_KEY];
    }
  }
}
