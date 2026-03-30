import { EventEmitter } from '../../EventEmitter.js';

/**
 * Payload emitted with the 'render' event when selection rendering should occur.
 */
export type SelectionSyncRenderPayload = {
  /** The current document epoch at render time */
  docEpoch: number;
  /** The layout epoch that was painted and is now available for rendering */
  layoutEpoch: number;
};

/**
 * Event map for SelectionSyncCoordinator events.
 */
export type SelectionSyncEventMap = {
  /** Emitted when conditions are safe for selection rendering (layout caught up to document) */
  render: [SelectionSyncRenderPayload];
};

/**
 * Abstraction for scheduling animation frame callbacks.
 *
 * @remarks
 * Allows dependency injection for testing and non-browser environments.
 */
export type SelectionSyncScheduler = {
  /** Schedules a callback to run before the next repaint */
  requestAnimationFrame: (cb: FrameRequestCallback) => number;
  /** Cancels a previously scheduled animation frame callback */
  cancelAnimationFrame: (handle: number) => void;
};

/**
 * Creates a scheduler using the environment's requestAnimationFrame implementation.
 *
 * @returns A scheduler that uses window.requestAnimationFrame if available, or falls back to setTimeout
 *
 * @remarks
 * Falls back gracefully for non-browser environments (Node.js tests, server-side rendering) by
 * using setTimeout as a last resort.
 */
const createDefaultScheduler = (): SelectionSyncScheduler => {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return {
      requestAnimationFrame: (cb) => window.requestAnimationFrame(cb),
      cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
    };
  }

  const anyGlobal = globalThis as unknown as {
    requestAnimationFrame?: (cb: FrameRequestCallback) => number;
    cancelAnimationFrame?: (handle: number) => void;
    setTimeout?: (cb: () => void, ms: number) => unknown;
    clearTimeout?: (handle: unknown) => void;
  };

  if (typeof anyGlobal.requestAnimationFrame === 'function' && typeof anyGlobal.cancelAnimationFrame === 'function') {
    return {
      requestAnimationFrame: (cb) => anyGlobal.requestAnimationFrame!(cb),
      cancelAnimationFrame: (handle) => anyGlobal.cancelAnimationFrame!(handle),
    };
  }

  return {
    requestAnimationFrame: (cb) => {
      const handle = anyGlobal.setTimeout?.(() => cb(Date.now()), 0);
      return handle as unknown as number;
    },
    cancelAnimationFrame: (handle) => {
      anyGlobal.clearTimeout?.(handle);
    },
  };
};

/**
 * Coordinates selection rendering to ensure it only occurs when layout has caught up to the document state.
 *
 * @remarks
 * This class solves a fundamental synchronization problem: the layout engine paints asynchronously,
 * so the DOM may represent a stale document epoch. Selection rendering (highlights, carets, cursors)
 * must only occur when the layout reflects the current document, otherwise positions will be incorrect.
 *
 * The coordinator tracks two epochs:
 * - docEpoch: The current document version (increments on each transaction)
 * - layoutEpoch: The document version currently painted in the DOM
 *
 * Selection rendering is only safe when: layoutEpoch >= docEpoch && !layoutUpdating
 *
 * Key behaviors:
 * - Render requests are debounced using requestAnimationFrame
 * - Rendering is blocked while layout is updating (onLayoutStart/onLayoutComplete lifecycle)
 * - Rendering is blocked when layout is behind the document (layoutEpoch < docEpoch)
 * - The 'render' event is emitted when conditions become safe for rendering
 *
 * Typical usage pattern:
 * 1. Call setDocEpoch() when the document changes
 * 2. Call onLayoutStart() when layout computation begins
 * 3. Call onLayoutComplete() when layout painting finishes
 * 4. Call requestRender() when selection changes
 * 5. Listen to 'render' event to actually render selection overlays
 *
 * The coordinator ensures that render events only fire when it's safe, preventing visual
 * glitches from stale position data.
 */
export class SelectionSyncCoordinator extends EventEmitter<SelectionSyncEventMap> {
  #docEpoch = 0;
  #layoutEpoch = 0;
  #layoutUpdating = false;

  #pending = false;
  #scheduled = false;
  #rafHandle: number | null = null;
  #scheduler: SelectionSyncScheduler;

  /**
   * Creates a new SelectionSyncCoordinator.
   *
   * @param options - Configuration options
   * @param options.scheduler - Custom scheduler for animation frames (useful for testing), defaults to platform scheduler
   */
  constructor(options?: { scheduler?: SelectionSyncScheduler }) {
    super();
    this.#scheduler = options?.scheduler ?? createDefaultScheduler();
  }

  /**
   * Gets the current document epoch.
   *
   * @returns The document epoch (increments on each document-changing transaction)
   */
  getDocEpoch(): number {
    return this.#docEpoch;
  }

  /**
   * Gets the current layout epoch.
   *
   * @returns The epoch of the document version currently painted in the DOM
   */
  getLayoutEpoch(): number {
    return this.#layoutEpoch;
  }

  /**
   * Checks if a layout update is currently in progress.
   *
   * @returns True if between onLayoutStart() and onLayoutComplete(), false otherwise
   */
  isLayoutUpdating(): boolean {
    return this.#layoutUpdating;
  }

  /**
   * Updates the document epoch and triggers conditional rendering.
   *
   * @param epoch - The new document epoch (must be finite and non-negative)
   *
   * @remarks
   * When the document epoch changes:
   * 1. Any scheduled render is cancelled (layout will be out of sync)
   * 2. If layout has already caught up, rendering is rescheduled
   *
   * Calling with the same epoch as the current value is a no-op.
   * Invalid epoch values are silently ignored.
   */
  setDocEpoch(epoch: number): void {
    if (!Number.isFinite(epoch) || epoch < 0) return;
    if (epoch === this.#docEpoch) return;
    this.#docEpoch = epoch;
    this.#cancelScheduledRender();
    this.#maybeSchedule();
  }

  /**
   * Notifies the coordinator that layout computation has started.
   *
   * @remarks
   * Marks the layout as updating and cancels any scheduled renders, since the DOM
   * is about to change and current position data will be stale.
   *
   * Safe to call multiple times (e.g., if layouts overlap) - subsequent calls are ignored
   * until onLayoutComplete() is called.
   */
  onLayoutStart(): void {
    if (this.#layoutUpdating) return;
    this.#layoutUpdating = true;
    this.#cancelScheduledRender();
  }

  /**
   * Notifies the coordinator that layout painting has completed.
   *
   * @param layoutEpoch - The document epoch that was just painted to the DOM
   *
   * @remarks
   * Marks the layout as no longer updating, records the new layout epoch, and attempts
   * to schedule rendering if conditions are now safe.
   *
   * If the layoutEpoch is invalid (not a finite non-negative number), it is ignored and
   * the previous layoutEpoch value is retained.
   *
   * This method is the primary trigger for selection rendering - if there's a pending
   * render request and layoutEpoch >= docEpoch, a render event will be scheduled.
   */
  onLayoutComplete(layoutEpoch: number): void {
    this.#layoutUpdating = false;
    if (Number.isFinite(layoutEpoch) && layoutEpoch >= 0) {
      this.#layoutEpoch = layoutEpoch;
    }
    this.#maybeSchedule();
  }

  /**
   * Notifies the coordinator that layout was aborted without completing.
   *
   * @remarks
   * Marks the layout as no longer updating (without updating layoutEpoch) and attempts
   * to schedule rendering if conditions are safe.
   *
   * Use this when layout computation is cancelled or fails partway through.
   */
  onLayoutAbort(): void {
    this.#layoutUpdating = false;
    this.#maybeSchedule();
  }

  /**
   * Requests that selection rendering occur when conditions become safe.
   *
   * @param options - Rendering options
   * @param options.immediate - If true, attempts to render immediately (synchronously) if safe, defaults to false
   *
   * @remarks
   * Marks a render as pending and schedules it to occur on the next animation frame if
   * conditions are safe (layout not updating, layoutEpoch >= docEpoch).
   *
   * If options.immediate is true, also attempts a synchronous render before scheduling.
   * Use immediate rendering sparingly, as it can cause multiple renders per frame.
   *
   * Multiple calls are coalesced - only one render will occur per animation frame.
   */
  requestRender(options?: { immediate?: boolean }): void {
    this.#pending = true;
    if (options?.immediate) {
      this.flushNow();
    }
    this.#maybeSchedule();
  }

  /**
   * Attempts to render selection immediately (synchronously) if conditions are safe.
   *
   * @remarks
   * If there's a pending render request and conditions are safe (layout not updating,
   * layoutEpoch >= docEpoch), this method:
   * 1. Cancels any scheduled asynchronous render
   * 2. Clears the pending flag
   * 3. Emits the 'render' event synchronously
   *
   * If no render is pending or conditions are not safe, this is a no-op.
   *
   * Use this for immediate selection updates in response to user actions (e.g., click
   * handlers) where waiting for the next animation frame would cause noticeable lag.
   */
  flushNow(): void {
    if (!this.#pending) return;
    if (!this.#isSafeToRender()) return;

    this.#cancelScheduledRender();
    this.#pending = false;
    this.emit('render', { docEpoch: this.#docEpoch, layoutEpoch: this.#layoutEpoch });
  }

  /**
   * Permanently tears down the coordinator, cancelling pending renders and removing all listeners.
   *
   * @remarks
   * After calling destroy(), this instance should not be used again. All scheduled renders
   * are cancelled and all event listeners are removed.
   *
   * Safe to call multiple times.
   */
  destroy(): void {
    this.#cancelScheduledRender();
    this.removeAllListeners();
  }

  #isSafeToRender(): boolean {
    return !this.#layoutUpdating && this.#layoutEpoch >= this.#docEpoch;
  }

  #maybeSchedule(): void {
    if (!this.#pending) return;
    if (!this.#isSafeToRender()) return;
    if (this.#scheduled) return;

    this.#scheduled = true;
    this.#rafHandle = this.#scheduler.requestAnimationFrame(() => {
      this.#scheduled = false;
      this.#rafHandle = null;

      if (!this.#pending) return;
      if (!this.#isSafeToRender()) return;

      this.#pending = false;
      this.emit('render', { docEpoch: this.#docEpoch, layoutEpoch: this.#layoutEpoch });
    });
  }

  #cancelScheduledRender(): void {
    if (this.#rafHandle != null) {
      try {
        this.#scheduler.cancelAnimationFrame(this.#rafHandle);
      } finally {
        this.#rafHandle = null;
      }
    }
    this.#scheduled = false;
  }
}
