import type { PageMargins } from '@superdoc/contracts';

const SEMANTIC_RESIZE_DEBOUNCE_MS = 120;
const MIN_SEMANTIC_CONTENT_WIDTH_PX = 1;

interface SemanticOptions {
  marginsMode?: 'firstSection' | 'none' | 'custom';
  customMargins?: { left?: number; right?: number; top?: number; bottom?: number };
  footnotesMode?: string;
}

export interface SemanticFlowDeps {
  visibleHost: HTMLElement;
  getFlowMode: () => string | undefined;
  getSemanticOptions: () => SemanticOptions | undefined;
  requestRerender: () => void;
  defaultPageWidth: number;
  defaultMargins: { left: number; right: number; top: number; bottom: number };
}

/**
 * Manages semantic (non-paginated) flow mode behavior:
 * - ResizeObserver on visibleHost to trigger relayout when container width changes
 * - Margin resolution for semantic mode (firstSection / none / custom)
 * - Container inner width calculation
 */
export class SemanticFlowController {
  #deps: SemanticFlowDeps;
  #resizeObserver: ResizeObserver | null = null;
  #resizeRaf: number | null = null;
  #resizeDebounce: number | null = null;
  #lastContainerWidth: number | null = null;

  constructor(deps: SemanticFlowDeps) {
    this.#deps = deps;
  }

  get lastContainerWidth(): number | null {
    return this.#lastContainerWidth;
  }

  set lastContainerWidth(value: number | null) {
    this.#lastContainerWidth = value;
  }

  isActive(): boolean {
    return this.#deps.getFlowMode() === 'semantic';
  }

  setup(): void {
    if (!this.isActive()) return;
    const view = this.#deps.visibleHost.ownerDocument?.defaultView ?? window;
    const ResizeObs = view.ResizeObserver;
    if (typeof ResizeObs !== 'function') return;

    this.#lastContainerWidth = this.resolveContainerInnerWidth();
    this.#resizeObserver = new ResizeObs(() => {
      this.#scheduleRelayout();
    });
    this.#resizeObserver.observe(this.#deps.visibleHost);
  }

  resolveMargins(margins: PageMargins): { left: number; right: number; top: number; bottom: number } {
    const mode = this.#deps.getSemanticOptions()?.marginsMode ?? 'firstSection';
    const defaults = this.#deps.defaultMargins;

    if (mode === 'none') {
      return { left: 0, right: 0, top: 0, bottom: 0 };
    }

    const clamp = (value: number | undefined, fallback: number): number => {
      const v = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
      return v >= 0 ? v : fallback;
    };

    if (mode === 'custom') {
      const custom = this.#deps.getSemanticOptions()?.customMargins;
      return {
        left: clamp(custom?.left, clamp(margins.left, defaults.left)),
        right: clamp(custom?.right, clamp(margins.right, defaults.right)),
        top: clamp(custom?.top, clamp(margins.top, defaults.top)),
        bottom: clamp(custom?.bottom, clamp(margins.bottom, defaults.bottom)),
      };
    }

    return {
      left: clamp(margins.left, defaults.left),
      right: clamp(margins.right, defaults.right),
      top: 0,
      bottom: 0,
    };
  }

  resolveContainerInnerWidth(): number {
    const host = this.#deps.visibleHost;
    if (!host) return this.#deps.defaultPageWidth;
    const win = host.ownerDocument?.defaultView ?? window;
    const style = win.getComputedStyle(host);
    const paddingLeft = Number.parseFloat(style.paddingLeft ?? '0');
    const paddingRight = Number.parseFloat(style.paddingRight ?? '0');
    const horizontalPadding =
      (Number.isFinite(paddingLeft) ? paddingLeft : 0) + (Number.isFinite(paddingRight) ? paddingRight : 0);
    const clientWidth = host.clientWidth;
    if (Number.isFinite(clientWidth) && clientWidth > 0) {
      return Math.max(MIN_SEMANTIC_CONTENT_WIDTH_PX, clientWidth - horizontalPadding);
    }
    const rectWidth = host.getBoundingClientRect().width;
    if (Number.isFinite(rectWidth) && rectWidth > 0) {
      return Math.max(MIN_SEMANTIC_CONTENT_WIDTH_PX, rectWidth - horizontalPadding);
    }
    return Math.max(MIN_SEMANTIC_CONTENT_WIDTH_PX, this.#deps.defaultPageWidth - horizontalPadding);
  }

  resolveSemanticLayout(
    margins: PageMargins,
    pageSize: { w: number; h: number },
    hiddenHost: HTMLElement,
  ): {
    contentWidth: number;
    pageWidth: number;
    margins: { left: number; right: number; top: number; bottom: number };
  } {
    const semanticMargins = this.resolveMargins(margins);
    const containerWidth = this.resolveContainerInnerWidth();
    const contentWidth = Math.max(
      MIN_SEMANTIC_CONTENT_WIDTH_PX,
      containerWidth - semanticMargins.left - semanticMargins.right,
    );
    const pageWidth = contentWidth + semanticMargins.left + semanticMargins.right;
    hiddenHost.style.width = `${contentWidth}px`;
    this.#lastContainerWidth = containerWidth;
    return { contentWidth, pageWidth, margins: semanticMargins };
  }

  #scheduleRelayout(): void {
    if (!this.isActive()) return;
    const view = this.#deps.visibleHost.ownerDocument?.defaultView ?? window;
    if (this.#resizeRaf == null) {
      this.#resizeRaf = view.requestAnimationFrame(() => {
        this.#resizeRaf = null;
        this.#applyRelayout();
      });
    }
    if (this.#resizeDebounce != null) {
      view.clearTimeout(this.#resizeDebounce);
    }
    this.#resizeDebounce = view.setTimeout(() => {
      this.#resizeDebounce = null;
      this.#applyRelayout();
    }, SEMANTIC_RESIZE_DEBOUNCE_MS);
  }

  #applyRelayout(): void {
    if (!this.isActive()) return;
    const nextWidth = this.resolveContainerInnerWidth();
    const prevWidth = this.#lastContainerWidth;
    if (prevWidth != null && Math.abs(nextWidth - prevWidth) < 1) {
      return;
    }
    this.#lastContainerWidth = nextWidth;
    this.#deps.requestRerender();
  }

  destroy(): void {
    const win = this.#deps.visibleHost?.ownerDocument?.defaultView ?? window;
    if (this.#resizeRaf != null) {
      win.cancelAnimationFrame(this.#resizeRaf);
      this.#resizeRaf = null;
    }
    if (this.#resizeDebounce != null) {
      win.clearTimeout(this.#resizeDebounce);
      this.#resizeDebounce = null;
    }
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
  }
}
