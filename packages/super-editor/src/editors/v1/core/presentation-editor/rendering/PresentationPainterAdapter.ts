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
 * PR3: pure pass-through wrapper. `setActiveComment` and `getPaintSnapshot`
 * are proxied here temporarily and will move to dedicated owners in PR4/PR5.
 */
export class PresentationPainterAdapter {
  #painter: DomPainterHandle | null = null;

  // ── Lifecycle ───────────────────────────────────────────────────────

  get hasPainter(): boolean {
    return this.#painter !== null;
  }

  ensurePainter(options: DomPainterOptions): void {
    if (!this.#painter) {
      this.#painter = createDomPainter(options);
    }
  }

  reset(): void {
    this.#painter = null;
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

  // ── Temporary proxies (move in PR4/PR5) ────────────────────────────

  setActiveComment(commentId: string | null): void {
    this.#painter?.setActiveComment(commentId);
  }

  getPaintSnapshot(): PaintSnapshot | null {
    return this.#painter?.getPaintSnapshot() ?? null;
  }
}
