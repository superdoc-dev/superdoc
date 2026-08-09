/**
 * Focus Watchdog
 *
 * Monitors focus stability of the hidden ProseMirror view.
 * The typing performance system relies on the PM view maintaining focus
 * to receive input events. This watchdog detects focus drift and attempts
 * automatic recovery.
 *
 * Features:
 * - Periodic focus checking
 * - Drift detection with configurable threshold
 * - Automatic focus restoration
 * - Drift count tracking for debugging
 * - Event callbacks for drift and recovery
 *
 * @module focus-watchdog
 */

/**
 * Configuration for focus watchdog.
 */
export interface FocusWatchdogConfig {
  /** Interval between focus checks in ms (default: 1000) */
  checkInterval: number;
  /** Trigger recovery after this many drifts (default: 3) */
  maxDriftCount: number;
  /** Called when focus drift is detected */
  onDrift: (target: Element | null) => void;
  /** Called when focus is successfully restored */
  onRecovery: () => void;
}

/**
 * Default watchdog configuration.
 */
const DEFAULT_CONFIG: Partial<FocusWatchdogConfig> = {
  checkInterval: 1000, // Check every second
  maxDriftCount: 3, // Trigger recovery after 3 drifts
};

/**
 * Focus watchdog for monitoring hidden PM view focus.
 *
 * Periodically checks that focus remains on the expected element (hidden PM view).
 * Detects drift and attempts automatic restoration.
 *
 * @example
 * ```typescript
 * const watchdog = new FocusWatchdog({
 *   checkInterval: 1000,
 *   maxDriftCount: 3,
 *   onDrift: (target) => {
 *     console.warn('Focus drifted to:', target);
 *   },
 *   onRecovery: () => {
 *     console.log('Focus restored');
 *   },
 * });
 *
 * // Set the expected focus element
 * watchdog.setExpectedFocus(hiddenPmView.dom);
 *
 * // Start monitoring
 * watchdog.start();
 *
 * // Later: stop monitoring
 * watchdog.stop();
 * ```
 */
export class FocusWatchdog {
  private config: FocusWatchdogConfig;
  private expectedFocusElement: HTMLElement | null = null;
  private driftCount: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;

  /**
   * Creates a new focus watchdog.
   *
   * @param config - Watchdog configuration
   */
  constructor(config: FocusWatchdogConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as FocusWatchdogConfig;
  }

  /**
   * Sets the expected focus element (hidden PM view).
   *
   * This is the element that should maintain focus during typing.
   *
   * @param element - The element that should have focus
   *
   * @example
   * ```typescript
   * watchdog.setExpectedFocus(pmView.dom);
   * ```
   */
  setExpectedFocus(element: HTMLElement): void {
    this.expectedFocusElement = element;
  }

  /**
   * Starts monitoring focus.
   *
   * Begins periodic checks at the configured interval.
   *
   * @example
   * ```typescript
   * watchdog.start();
   * ```
   */
  start(): void {
    if (this.running) {
      return; // Already running
    }

    if (!this.expectedFocusElement) {
      console.warn('FocusWatchdog: Cannot start without expected focus element');
      return;
    }

    this.running = true;
    this.intervalId = setInterval(() => {
      this.check();
    }, this.config.checkInterval);

    console.log('FocusWatchdog: Started monitoring');
  }

  /**
   * Stops monitoring focus.
   *
   * Clears the periodic check interval.
   *
   * @example
   * ```typescript
   * watchdog.stop();
   * ```
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.running = false;
    console.log('FocusWatchdog: Stopped monitoring');
  }

  /**
   * Checks focus immediately.
   *
   * Returns true if focus is on the expected element, false otherwise.
   *
   * @returns True if focus is correct
   *
   * @example
   * ```typescript
   * if (!watchdog.check()) {
   *   console.warn('Focus is not on PM view');
   * }
   * ```
   */
  check(): boolean {
    if (!this.expectedFocusElement) {
      return true; // No expected element, nothing to check
    }

    const activeElement = document.activeElement;
    const focusCorrect = activeElement === this.expectedFocusElement;

    if (!focusCorrect) {
      this.handleDrift(activeElement);
      return false;
    }

    return true;
  }

  /**
   * Gets the current drift count.
   *
   * @returns Number of times focus has drifted
   *
   * @example
   * ```typescript
   * const drifts = watchdog.getDriftCount();
   * console.log(`Focus has drifted ${drifts} times`);
   * ```
   */
  getDriftCount(): number {
    return this.driftCount;
  }

  /**
   * Resets the drift count.
   *
   * Useful after manual intervention or system restart.
   *
   * @example
   * ```typescript
   * watchdog.resetDriftCount();
   * ```
   */
  resetDriftCount(): void {
    this.driftCount = 0;
  }

  /**
   * Attempts to restore focus to the expected element.
   *
   * @returns True if restoration successful
   *
   * @example
   * ```typescript
   * if (watchdog.restoreFocus()) {
   *   console.log('Focus restored');
   * }
   * ```
   */
  restoreFocus(): boolean {
    if (!this.expectedFocusElement) {
      return false;
    }

    try {
      this.expectedFocusElement.focus();

      // Verify focus was restored
      const restored = document.activeElement === this.expectedFocusElement;

      if (restored) {
        console.log('FocusWatchdog: Focus restored successfully');
        this.config.onRecovery();
        return true;
      } else {
        console.warn('FocusWatchdog: Failed to restore focus');
        return false;
      }
    } catch (err) {
      console.error('FocusWatchdog: Error restoring focus:', err);
      return false;
    }
  }

  /**
   * Handles focus drift detection.
   *
   * @param target - Element that currently has focus
   */
  private handleDrift(target: Element | null): void {
    this.driftCount++;

    console.warn(
      `FocusWatchdog: Focus drift detected (${this.driftCount}/${this.config.maxDriftCount})`,
      'Target:',
      target,
    );

    // Notify handler
    this.config.onDrift(target);

    // Attempt recovery if threshold reached
    if (this.driftCount >= this.config.maxDriftCount) {
      console.warn('FocusWatchdog: Drift threshold reached, attempting recovery');
      this.restoreFocus();
      this.driftCount = 0; // Reset after recovery attempt
    }
  }

  /**
   * Cleans up resources.
   *
   * Call when destroying the watchdog.
   */
  destroy(): void {
    this.stop();
    this.expectedFocusElement = null;
  }
}
