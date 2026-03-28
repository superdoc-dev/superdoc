import { createDomPainter } from '@superdoc/painter-dom';
import type {
  DomPainterHandle,
  DomPainterInput,
  DomPainterOptions,
  PageDecorationProvider,
  PaintSnapshot,
  PositionMapping,
} from '@superdoc/painter-dom';
import type { Layout } from '@superdoc/contracts';

/**
 * Owns the DomPainter lifecycle on behalf of PresentationEditor.
 *
 * Captures paint snapshots via the `onPaintSnapshot` callback so
 * PresentationEditor can query them without reaching into the painter.
 */
export class PresentationPainterAdapter {
  #painter: DomPainterHandle | null = null;
  #lastPaintSnapshot: PaintSnapshot | null = null;

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
        },
      });
    }
  }

  reset(): void {
    this.#painter = null;
    this.#lastPaintSnapshot = null;
  }

  // ── Paint orchestration ─────────────────────────────────────────────

  paint(input: DomPainterInput | Layout, mount: HTMLElement, mapping?: PositionMapping): void {
    this.#painter?.paint(input, mount, mapping);
  }

  setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider): void {
    this.#painter?.setProviders(header, footer);
  }

  // ── Zoom / scroll ──────────────────────────────────────────────────

  setZoom(zoom: number): void {
    this.#painter?.setZoom(zoom);
  }

  setScrollContainer(el: HTMLElement | null): void {
    this.#painter?.setScrollContainer(el);
  }

  onScroll(): void {
    this.#painter?.onScroll();
  }

  // ── Virtualization ─────────────────────────────────────────────────

  setVirtualizationPins(pageIndices: number[] | null | undefined): void {
    this.#painter?.setVirtualizationPins(pageIndices);
  }

  // ── Snapshot ───────────────────────────────────────────────────────

  getPaintSnapshot(): PaintSnapshot | null {
    return this.#lastPaintSnapshot;
  }
}
