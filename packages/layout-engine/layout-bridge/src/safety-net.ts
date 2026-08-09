/**
 * Runtime Safety Net
 *
 * Automatic fallback system that monitors for errors and performance degradation.
 * Triggers fallback to legacy behavior when issues are detected, then attempts
 * recovery after a cooldown period.
 *
 * Fallback Triggers:
 * - Consecutive errors exceeding threshold
 * - Latency exceeding configured budgets
 * - Manual fallback request
 *
 * Recovery Strategy:
 * - Cooldown period after fallback
 * - Automatic recovery attempt
 * - Error count reset on successful operations
 *
 * @module safety-net
 */

/**
 * Reason for triggering fallback to legacy behavior.
 */
export type FallbackReason = 'error' | 'latency' | 'budget_exceeded' | 'manual';

/**
 * Configuration for the safety net system.
 */
export interface SafetyConfig {
  /** Maximum consecutive errors before triggering fallback */
  maxConsecutiveErrors: number;
  /** Maximum layout duration in ms before triggering fallback */
  maxLayoutDuration: number;
  /** Maximum cursor update latency in ms before triggering fallback */
  maxCursorLatency: number;
  /** Cooldown period in ms before attempting recovery */
  cooldownPeriod: number;
}

/**
 * Maximum consecutive errors before triggering fallback.
 * After 3 errors in a row, system assumes optimization is broken and falls back to legacy.
 */
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Maximum acceptable layout duration in milliseconds.
 * Layouts taking longer than 100ms are considered too slow and trigger fallback.
 */
const MAX_LAYOUT_DURATION_MS = 100;

/**
 * Maximum acceptable cursor update latency in milliseconds.
 * Cursor updates slower than 5ms degrade typing feel and trigger fallback.
 */
const MAX_CURSOR_LATENCY_MS = 5;

/**
 * Cooldown period before attempting recovery from fallback (milliseconds).
 * After falling back, wait 5 seconds before trying optimizations again.
 */
const COOLDOWN_PERIOD_MS = 5000;

/**
 * Default safety configuration.
 */
const DEFAULT_CONFIG: SafetyConfig = {
  /** Fallback after 3 consecutive errors */
  maxConsecutiveErrors: MAX_CONSECUTIVE_ERRORS,
  /** 100ms layout budget */
  maxLayoutDuration: MAX_LAYOUT_DURATION_MS,
  /** 5ms cursor latency budget */
  maxCursorLatency: MAX_CURSOR_LATENCY_MS,
  /** 5 second cooldown before recovery */
  cooldownPeriod: COOLDOWN_PERIOD_MS,
};

/**
 * Safety net for automatic fallback and recovery.
 *
 * Monitors system health and triggers fallback when performance degrades
 * or errors accumulate. Attempts recovery after cooldown.
 *
 * @example
 * ```typescript
 * const safety = new SafetyNet({
 *   maxConsecutiveErrors: 3,
 *   maxLayoutDuration: 100,
 *   cooldownPeriod: 5000,
 * });
 *
 * // Set fallback handler
 * safety.setFallbackHandler((reason) => {
 *   console.warn(`Fallback triggered: ${reason}`);
 *   // Disable optimizations
 * });
 *
 * // Record errors
 * try {
 *   performOptimizedLayout();
 *   safety.reset(); // Success - clear error count
 * } catch (err) {
 *   safety.recordError(err);
 *   if (safety.isFallbackActive()) {
 *     // Use legacy code path
 *   }
 * }
 *
 * // Record latency
 * safety.recordLatency('layout', layoutDuration);
 * ```
 */
export class SafetyNet {
  private config: SafetyConfig;
  private errorCount: number = 0;
  private fallbackActive: boolean = false;
  private fallbackReason: FallbackReason | null = null;
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private onFallback: ((reason: FallbackReason) => void) | null = null;
  private onRecovery: (() => void) | null = null;

  /**
   * Creates a new safety net instance.
   *
   * @param config - Safety configuration
   */
  constructor(config?: Partial<SafetyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Records an error occurrence.
   *
   * Increments error count and triggers fallback if threshold exceeded.
   *
   * @param error - Error that occurred
   *
   * @example
   * ```typescript
   * try {
   *   dangerousOperation();
   * } catch (err) {
   *   safety.recordError(err);
   * }
   * ```
   */
  recordError(error: Error): void {
    this.errorCount++;

    // Log error for debugging
    if (this.config.maxConsecutiveErrors > 0) {
      console.error(`SafetyNet: Error ${this.errorCount}/${this.config.maxConsecutiveErrors}:`, error.message);
    }

    // Trigger fallback if threshold exceeded
    if (this.errorCount >= this.config.maxConsecutiveErrors) {
      this.triggerFallback('error');
    }
  }

  /**
   * Records a latency measurement.
   *
   * Triggers fallback if latency exceeds configured budget.
   *
   * @param metric - Metric name ('layout' or 'cursor')
   * @param value - Measured latency in ms
   *
   * @example
   * ```typescript
   * const duration = measureLayoutDuration();
   * safety.recordLatency('layout', duration);
   * ```
   */
  recordLatency(metric: string, value: number): void {
    let exceeded = false;

    if (metric === 'layout' && value > this.config.maxLayoutDuration) {
      exceeded = true;
      console.warn(
        `SafetyNet: Layout duration ${value.toFixed(2)}ms exceeds budget ${this.config.maxLayoutDuration}ms`,
      );
    } else if (metric === 'cursor' && value > this.config.maxCursorLatency) {
      exceeded = true;
      console.warn(`SafetyNet: Cursor latency ${value.toFixed(2)}ms exceeds budget ${this.config.maxCursorLatency}ms`);
    }

    if (exceeded) {
      this.triggerFallback('latency');
    }
  }

  /**
   * Checks if fallback mode is currently active.
   *
   * @returns True if system is in fallback mode
   *
   * @example
   * ```typescript
   * if (safety.isFallbackActive()) {
   *   // Use legacy code path
   * } else {
   *   // Use optimized code path
   * }
   * ```
   */
  isFallbackActive(): boolean {
    return this.fallbackActive;
  }

  /**
   * Gets the reason for current fallback state.
   *
   * @returns Fallback reason, or null if not in fallback
   *
   * @example
   * ```typescript
   * const reason = safety.getFallbackReason();
   * if (reason) {
   *   console.log(`System in fallback due to: ${reason}`);
   * }
   * ```
   */
  getFallbackReason(): FallbackReason | null {
    return this.fallbackReason;
  }

  /**
   * Manually triggers fallback mode.
   *
   * Useful for testing or manual intervention.
   *
   * @param reason - Reason for manual fallback
   *
   * @example
   * ```typescript
   * // Force fallback for testing
   * safety.triggerFallback('manual');
   * ```
   */
  triggerFallback(reason: FallbackReason): void {
    if (this.fallbackActive) {
      return; // Already in fallback
    }

    this.fallbackActive = true;
    this.fallbackReason = reason;

    console.warn(`SafetyNet: Triggering fallback (reason: ${reason})`);

    // Notify handler
    if (this.onFallback) {
      this.onFallback(reason);
    }

    // Schedule recovery attempt
    this.scheduleRecovery();
  }

  /**
   * Attempts to recover from fallback state.
   *
   * Returns true if recovery successful, false if still in cooldown.
   *
   * @returns True if recovered, false if still in cooldown
   *
   * @example
   * ```typescript
   * if (safety.attemptRecovery()) {
   *   console.log('Recovery successful');
   * }
   * ```
   */
  attemptRecovery(): boolean {
    if (!this.fallbackActive) {
      return true; // Already recovered
    }

    if (this.cooldownTimer !== null) {
      return false; // Still in cooldown
    }

    console.log('SafetyNet: Attempting recovery from fallback');

    this.fallbackActive = false;
    this.fallbackReason = null;
    this.errorCount = 0;

    // Notify handler
    if (this.onRecovery) {
      this.onRecovery();
    }

    return true;
  }

  /**
   * Sets the fallback handler callback.
   *
   * Called when fallback is triggered.
   *
   * @param handler - Callback function to handle fallback
   *
   * @example
   * ```typescript
   * safety.setFallbackHandler((reason) => {
   *   // Disable optimizations and use legacy path
   *   console.warn('Fallback triggered:', reason);
   * });
   * ```
   */
  setFallbackHandler(handler: (reason: FallbackReason) => void): void {
    this.onFallback = handler;
  }

  /**
   * Sets the recovery handler callback.
   *
   * Called when recovery from fallback is attempted.
   *
   * @param handler - Callback function to handle recovery
   *
   * @example
   * ```typescript
   * safety.setRecoveryHandler(() => {
   *   // Re-enable optimizations
   *   console.log('Recovered from fallback');
   * });
   * ```
   */
  setRecoveryHandler(handler: () => void): void {
    this.onRecovery = handler;
  }

  /**
   * Resets the error count.
   *
   * Call this after successful operations to prevent false positives.
   *
   * @example
   * ```typescript
   * try {
   *   performLayout();
   *   safety.reset(); // Success - clear errors
   * } catch (err) {
   *   safety.recordError(err);
   * }
   * ```
   */
  reset(): void {
    this.errorCount = 0;
  }

  /**
   * Schedules automatic recovery after cooldown period.
   */
  private scheduleRecovery(): void {
    if (this.cooldownTimer !== null) {
      clearTimeout(this.cooldownTimer);
    }

    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      this.attemptRecovery();
    }, this.config.cooldownPeriod);
  }

  /**
   * Cleans up timers and resources.
   *
   * Call this when destroying the safety net.
   */
  destroy(): void {
    if (this.cooldownTimer !== null) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }
}
