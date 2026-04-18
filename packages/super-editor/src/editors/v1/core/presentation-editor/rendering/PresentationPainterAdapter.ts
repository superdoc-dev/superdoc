import { createDomPainter } from '@superdoc/painter-dom';
import type {
  DomPainterHandle,
  DomPainterInput,
  DomPainterOptions,
  PageDecorationProvider,
  PaintSnapshotAnnotationEntity,
  PaintSnapshot,
  PositionMapping,
} from '@superdoc/painter-dom';
import type { Layout } from '@superdoc/contracts';
import { PresentationPaintIndex } from './PresentationPaintIndex.js';

function normalizePinnedPageIndices(pageIndices: number[] | null | undefined): number[] {
  return Array.from(new Set((pageIndices ?? []).filter((pageIndex) => Number.isInteger(pageIndex)))).sort(
    (a, b) => a - b,
  );
}

function areNumberListsEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Owns the DomPainter lifecycle and render-surface control state on behalf of
 * PresentationEditor.
 *
 * This adapter is intentionally stateful:
 * - painter control inputs such as zoom, providers, scroll container, and
 *   virtualization pins are cached here rather than pushed ad hoc from
 *   PresentationEditor into the live painter instance
 * - paint snapshots are captured and indexed here so editor code can query
 *   mounted painted elements without scraping the DOM
 */
export class PresentationPainterAdapter {
  #painter: DomPainterHandle | null = null;
  #lastPaintSnapshot: PaintSnapshot | null = null;
  #paintIndex = new PresentationPaintIndex();
  #headerProvider: PageDecorationProvider | undefined;
  #footerProvider: PageDecorationProvider | undefined;
  #zoom = 1;
  #scrollContainer: HTMLElement | null = null;
  #virtualizationPins: number[] = [];

  // ── Lifecycle ───────────────────────────────────────────────────────

  get hasPainter(): boolean {
    return this.#painter !== null;
  }

  ensurePainter(options: DomPainterOptions): void {
    if (!this.#painter) {
      this.#painter = createDomPainter({
        ...options,
        onPaintSnapshot: (snapshot) => {
          this.#lastPaintSnapshot = snapshot;
          this.#paintIndex.update(snapshot);
        },
      });
      this.#applyPainterSurfaceState();
    }
  }

  reset(): void {
    this.#painter = null;
    this.#lastPaintSnapshot = null;
    this.#paintIndex.reset();
  }

  // ── Paint orchestration ─────────────────────────────────────────────

  paint(input: DomPainterInput | Layout, mount: HTMLElement, mapping?: PositionMapping): void {
    this.#painter?.paint(input, mount, mapping);
  }

  setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider): void {
    if (this.#headerProvider === header && this.#footerProvider === footer) {
      return;
    }

    this.#headerProvider = header;
    this.#footerProvider = footer;
    this.#applyProviders();
  }

  // ── Zoom / scroll ──────────────────────────────────────────────────

  setZoom(zoom: number): void {
    if (this.#zoom === zoom) return;
    this.#zoom = zoom;
    this.#applyZoom();
  }

  setScrollContainer(el: HTMLElement | null): void {
    if (this.#scrollContainer === el) return;
    this.#scrollContainer = el;
    this.#applyScrollContainer();
  }

  onScroll(): void {
    this.#painter?.onScroll();
  }

  // ── Virtualization ─────────────────────────────────────────────────

  setVirtualizationPins(pageIndices: number[] | null | undefined): void {
    const normalizedPins = normalizePinnedPageIndices(pageIndices);
    if (areNumberListsEqual(this.#virtualizationPins, normalizedPins)) {
      return;
    }

    this.#virtualizationPins = normalizedPins;
    this.#applyVirtualizationPins();
  }

  // ── Snapshot ───────────────────────────────────────────────────────

  getPaintSnapshot(): PaintSnapshot | null {
    return this.#lastPaintSnapshot;
  }

  getMountedPageIndices(): number[] {
    const mountedPageIndices = this.#painter?.getMountedPageIndices();
    if (mountedPageIndices) {
      return [...mountedPageIndices];
    }
    return this.#lastPaintSnapshot?.pages.map((page) => page.index) ?? [];
  }

  getAnnotationElementByPmStart(pmStart: number): HTMLElement | null {
    return this.#paintIndex.getAnnotationElementByPmStart(pmStart);
  }

  getAnnotationEntitiesByType(type: string): PaintSnapshotAnnotationEntity[] {
    return this.#paintIndex.getAnnotationEntitiesByType(type);
  }

  getStructuredContentBlockElementsById(id: string): HTMLElement[] {
    return this.#paintIndex.getStructuredContentBlockElementsById(id);
  }

  getStructuredContentInlineElementsById(id: string): HTMLElement[] {
    return this.#paintIndex.getStructuredContentInlineElementsById(id);
  }

  getInlineImageElementByPmStart(pmStart: number): HTMLElement | null {
    return this.#paintIndex.getInlineImageElementByPmStart(pmStart);
  }

  getImageFragmentElementByPmStart(pmStart: number): HTMLElement | null {
    return this.#paintIndex.getImageFragmentElementByPmStart(pmStart);
  }

  #applyPainterSurfaceState(): void {
    this.#applyProviders();
    this.#applyZoom();
    this.#applyScrollContainer();
    this.#applyVirtualizationPins();
  }

  #applyProviders(): void {
    this.#painter?.setProviders(this.#headerProvider, this.#footerProvider);
  }

  #applyZoom(): void {
    this.#painter?.setZoom(this.#zoom);
  }

  #applyScrollContainer(): void {
    this.#painter?.setScrollContainer(this.#scrollContainer);
  }

  #applyVirtualizationPins(): void {
    this.#painter?.setVirtualizationPins(this.#virtualizationPins);
  }
}
