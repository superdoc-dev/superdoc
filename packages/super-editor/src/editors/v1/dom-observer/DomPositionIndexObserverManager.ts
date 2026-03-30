/**
 * Manages automatic rebuilding of the DomPositionIndex when the painter host's children change.
 *
 * @remarks
 * This class uses a MutationObserver to watch for changes to the painter host's immediate children
 * (page elements that are virtualized by mounting/unmounting). When changes are detected, it
 * schedules a debounced rebuild of the DomPositionIndex via requestAnimationFrame.
 *
 * The observer can be paused and resumed to avoid unnecessary rebuilds during known periods of
 * rapid DOM changes (e.g., during layout updates).
 *
 * Key design decisions:
 * - Only observes childList changes (not attributes or subtree) for performance
 * - Debounces rebuilds using requestAnimationFrame to batch multiple mutations
 * - Gracefully handles environments without MutationObserver support
 * - Skips rebuilds if the painter host becomes disconnected from the DOM
 */
export class DomPositionIndexObserverManager {
  #windowRoot: Window & typeof globalThis;
  #getPainterHost: () => HTMLElement | null;
  #onRebuild: () => void;
  #observer: MutationObserver | null = null;
  #rebuildScheduled = false;
  #rebuildRafId: number | null = null;

  /**
   * Creates a new DomPositionIndexObserverManager.
   *
   * @param options - Configuration options
   * @param options.windowRoot - The window object to use for MutationObserver and requestAnimationFrame
   * @param options.getPainterHost - Function that returns the current painter host element (may change over time)
   * @param options.onRebuild - Callback invoked when a rebuild should occur
   */
  constructor(options: {
    windowRoot: Window & typeof globalThis;
    getPainterHost: () => HTMLElement | null;
    onRebuild: () => void;
  }) {
    this.#windowRoot = options.windowRoot;
    this.#getPainterHost = options.getPainterHost;
    this.#onRebuild = options.onRebuild;
  }

  /**
   * Initializes the MutationObserver and begins observing the painter host.
   *
   * @remarks
   * Creates a new MutationObserver that watches for child list changes and schedules
   * rebuilds when mutations occur. Automatically calls resume() to start observing.
   *
   * If the environment does not support MutationObserver, this method returns early
   * without error. If an observer already exists, it is disconnected before creating
   * a new one.
   *
   * Safe to call multiple times (e.g., when the painter host changes).
   */
  setup(): void {
    if (typeof this.#windowRoot.MutationObserver !== 'function') {
      return;
    }

    this.#observer?.disconnect();
    this.#observer = new this.#windowRoot.MutationObserver(() => {
      // The DOM painter virtualizes pages by mounting/unmounting page elements as direct
      // children of the painter host; rebuild the index (debounced) when that happens.
      this.scheduleRebuild();
    });

    this.resume();
  }

  /**
   * Pauses observation by disconnecting the MutationObserver.
   *
   * @remarks
   * Use this during periods of known rapid DOM changes (e.g., layout updates) to avoid
   * unnecessary rebuild scheduling. The observer can be reactivated by calling resume().
   *
   * Safe to call when no observer exists or when already paused.
   */
  pause(): void {
    this.#observer?.disconnect();
  }

  /**
   * Resumes observation by reconnecting the MutationObserver to the painter host.
   *
   * @remarks
   * Attempts to observe the painter host's childList changes. If the observer doesn't exist,
   * the painter host is not available, or the observe() call fails, this method returns
   * gracefully without throwing.
   *
   * Safe to call multiple times or when already observing.
   */
  resume(): void {
    const observer = this.#observer;
    if (!observer) return;
    const painterHost = this.#getPainterHost();
    if (!painterHost) return;
    try {
      observer.observe(painterHost, { childList: true });
    } catch {
      // Ignore observer setup failures (e.g., in non-DOM environments)
    }
  }

  /**
   * Permanently tears down the observer and cancels any scheduled rebuilds.
   *
   * @remarks
   * After calling destroy(), this instance should not be used again. The observer is
   * disconnected, all references are cleared, and any pending rebuild is cancelled.
   *
   * Safe to call multiple times.
   */
  destroy(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#rebuildScheduled = false;
    if (this.#rebuildRafId != null && typeof this.#windowRoot.cancelAnimationFrame === 'function') {
      this.#windowRoot.cancelAnimationFrame(this.#rebuildRafId);
    }
    this.#rebuildRafId = null;
  }

  /**
   * Schedules a debounced rebuild of the DomPositionIndex.
   *
   * @remarks
   * Uses requestAnimationFrame to debounce multiple rapid mutations into a single rebuild.
   * If a rebuild is already scheduled, this method returns early without scheduling another.
   *
   * The rebuild callback is only invoked if:
   * - The painter host still exists
   * - The painter host is still connected to the DOM
   *
   * This prevents unnecessary rebuilds when the painter host has been removed or is being
   * torn down.
   */
  scheduleRebuild(): void {
    if (this.#rebuildScheduled) return;
    this.#rebuildScheduled = true;

    this.#rebuildRafId = this.#windowRoot.requestAnimationFrame(() => {
      this.#rebuildScheduled = false;
      this.#rebuildRafId = null;
      const painterHost = this.#getPainterHost();
      if (!painterHost?.isConnected) return;
      this.#onRebuild();
    });
  }
}
