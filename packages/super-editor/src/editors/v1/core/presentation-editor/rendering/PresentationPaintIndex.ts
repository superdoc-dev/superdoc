import type {
  PaintSnapshot,
  PaintSnapshotAnnotationEntity,
  PaintSnapshotImageEntity,
  PaintSnapshotStructuredContentBlockEntity,
  PaintSnapshotStructuredContentInlineEntity,
} from '@superdoc/painter-dom';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';

function appendToArrayMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
}

function isMountedElement(element: HTMLElement | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected;
}

function isInlineImageWrapperElement(element: HTMLElement): boolean {
  return element.classList.contains(DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER);
}

function shouldReplaceInlineImageEntity(
  existing: PaintSnapshotImageEntity | undefined,
  candidate: PaintSnapshotImageEntity,
): boolean {
  if (!existing) return true;

  const existingIsWrapper = isInlineImageWrapperElement(existing.element);
  const candidateIsWrapper = isInlineImageWrapperElement(candidate.element);

  if (existingIsWrapper && !candidateIsWrapper) {
    return false;
  }

  return true;
}

/**
 * Indexes painter-owned identity entities from the latest paint snapshot.
 *
 * This gives editor code stable lookups for mounted painted elements without
 * repeatedly scraping the live DOM with ad hoc selectors.
 */
export class PresentationPaintIndex {
  #snapshot: PaintSnapshot | null = null;
  #annotationsByPmStart = new Map<number, PaintSnapshotAnnotationEntity>();
  #annotationsByType = new Map<string, PaintSnapshotAnnotationEntity[]>();
  #structuredContentBlocksById = new Map<string, PaintSnapshotStructuredContentBlockEntity[]>();
  #structuredContentInlinesById = new Map<string, PaintSnapshotStructuredContentInlineEntity[]>();
  #inlineImagesByPmStart = new Map<number, PaintSnapshotImageEntity>();
  #imageFragmentsByPmStart = new Map<number, PaintSnapshotImageEntity>();

  reset(): void {
    this.#snapshot = null;
    this.#annotationsByPmStart.clear();
    this.#annotationsByType.clear();
    this.#structuredContentBlocksById.clear();
    this.#structuredContentInlinesById.clear();
    this.#inlineImagesByPmStart.clear();
    this.#imageFragmentsByPmStart.clear();
  }

  update(snapshot: PaintSnapshot | null): void {
    this.reset();
    this.#snapshot = snapshot;
    if (!snapshot?.entities) return;

    for (const annotation of snapshot.entities.annotations) {
      if (!isMountedElement(annotation.element)) continue;

      if (annotation.pmStart != null) {
        this.#annotationsByPmStart.set(annotation.pmStart, annotation);
      }
      if (annotation.type) {
        appendToArrayMap(this.#annotationsByType, annotation.type, annotation);
      }
    }

    for (const block of snapshot.entities.structuredContentBlocks) {
      if (!isMountedElement(block.element)) continue;
      appendToArrayMap(this.#structuredContentBlocksById, block.sdtId, block);
    }

    for (const inline of snapshot.entities.structuredContentInlines) {
      if (!isMountedElement(inline.element)) continue;
      appendToArrayMap(this.#structuredContentInlinesById, inline.sdtId, inline);
    }

    for (const image of snapshot.entities.images) {
      if (!isMountedElement(image.element) || image.pmStart == null) continue;

      if (image.kind === 'inline') {
        const existing = this.#inlineImagesByPmStart.get(image.pmStart);
        if (shouldReplaceInlineImageEntity(existing, image)) {
          this.#inlineImagesByPmStart.set(image.pmStart, image);
        }
        continue;
      }
      this.#imageFragmentsByPmStart.set(image.pmStart, image);
    }
  }

  get snapshot(): PaintSnapshot | null {
    return this.#snapshot;
  }

  getAnnotationElementByPmStart(pmStart: number): HTMLElement | null {
    return this.#annotationsByPmStart.get(pmStart)?.element ?? null;
  }

  getAnnotationEntitiesByType(type: string): PaintSnapshotAnnotationEntity[] {
    return [...(this.#annotationsByType.get(type) ?? [])];
  }

  getStructuredContentBlockElementsById(id: string): HTMLElement[] {
    return (this.#structuredContentBlocksById.get(id) ?? []).map((entity) => entity.element);
  }

  getStructuredContentInlineElementsById(id: string): HTMLElement[] {
    return (this.#structuredContentInlinesById.get(id) ?? []).map((entity) => entity.element);
  }

  getInlineImageElementByPmStart(pmStart: number): HTMLElement | null {
    return this.#inlineImagesByPmStart.get(pmStart)?.element ?? null;
  }

  getImageFragmentElementByPmStart(pmStart: number): HTMLElement | null {
    return this.#imageFragmentsByPmStart.get(pmStart)?.element ?? null;
  }
}
