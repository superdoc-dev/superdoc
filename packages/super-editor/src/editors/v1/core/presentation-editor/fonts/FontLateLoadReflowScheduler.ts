/**
 * Bounded late-load reflow scheduler.
 *
 * When a required font face loads after the readiness gate's first-paint timeout, the
 * document must re-measure + reflow so it stops rendering against a fallback. On a slow
 * network a font-heavy document's faces arrive in many waves over tens of seconds (a probe
 * measured ~38 waves over ~103s for 40 fonts on Slow 3G). Reflowing on every wave is a
 * full-document re-measure storm.
 *
 * Policy: leading flush + throttled trailing (a cooldown). The FIRST late face flushes
 * after a short quiet window (coalescing the initial parallel batch). After ANY flush a
 * `cooldownMs` window opens during which further arrivals are deferred; at the cooldown's
 * end a single trailing flush drains them, then the cooldown reopens if more arrive. This
 * bounds the flush RATE to ~once per cooldown REGARDLESS of arrival spacing - unlike a
 * plain debounce (which fires once per wave when waves are farther apart than the window)
 * or a per-batch max-wait (which the quiet flush resets before it can bite).
 *
 * Honest floor: arrivals spaced WIDER than `cooldownMs` reflow per arrival - you cannot
 * coalesce a wave that lands after the document already corrected without delaying every
 * correction by at least the gap. `cooldownMs` is therefore the max correction lag.
 *
 * First paint is untouched - the gate's per-font timeout bounds that; this only governs
 * the after-the-fact corrections. Timer hooks are injectable so the policy is unit-testable
 * without real time.
 */

export type FontReflowFlushReason = 'quiet' | 'throttle';

export interface FontReflowFlushDetails {
  reason: FontReflowFlushReason;
  /** The face keys batched into this flush (diagnostic; the gate reflows the whole doc). */
  faceKeys: string[];
}

export interface FontLateLoadReflowSchedulerOptions {
  /** Quiet window before the FIRST flush of an idle scheduler (coalesces the initial burst). */
  quietMs?: number;
  /** Minimum interval between flushes; the max correction lag for deferred arrivals. */
  cooldownMs?: number;
  /** Perform the actual one-shot reflow (bump epoch + invalidate caches + request reflow). */
  flush: (details: FontReflowFlushDetails) => void;
  /** Timer hooks (injectable for tests); default to the globals. */
  scheduleTimeout?: (cb: () => void, ms: number) => unknown;
  cancelTimeout?: (handle: unknown) => void;
}

export const DEFAULT_REFLOW_QUIET_MS = 250;
export const DEFAULT_REFLOW_COOLDOWN_MS = 2000;

export class FontLateLoadReflowScheduler {
  readonly #quietMs: number;
  readonly #cooldownMs: number;
  readonly #flush: (details: FontReflowFlushDetails) => void;
  readonly #scheduleTimeout: (cb: () => void, ms: number) => unknown;
  readonly #cancelTimeout: (handle: unknown) => void;

  readonly #pending = new Set<string>();
  /** Pending leading flush (idle -> quiet window). */
  #quietHandle: unknown = null;
  /** Active cooldown after a flush; arrivals during it are deferred to its end. */
  #cooldownHandle: unknown = null;
  /** A face arrived during the cooldown, so a trailing flush is owed at cooldown end. */
  #trailing = false;

  constructor(options: FontLateLoadReflowSchedulerOptions) {
    this.#quietMs = options.quietMs ?? DEFAULT_REFLOW_QUIET_MS;
    this.#cooldownMs = options.cooldownMs ?? DEFAULT_REFLOW_COOLDOWN_MS;
    this.#flush = options.flush;
    this.#scheduleTimeout = options.scheduleTimeout ?? ((cb, ms) => globalThis.setTimeout(cb, ms));
    this.#cancelTimeout =
      options.cancelTimeout ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /**
   * Record newly-available required face keys. A call adding no new key is a no-op. If a
   * cooldown is active, the arrival is deferred to its end (rate stays bounded); otherwise
   * a quiet-window leading flush is armed. Repeated `loadingdone` for the same face cannot
   * open a new batch or cause an extra flush.
   */
  schedule(changedFaceKeys: Iterable<string>): void {
    let added = false;
    for (const key of changedFaceKeys) {
      if (!this.#pending.has(key)) {
        this.#pending.add(key);
        added = true;
      }
    }
    if (!added) return;

    if (this.#cooldownHandle !== null) {
      // In cooldown: defer to its end so the flush rate stays bounded.
      this.#trailing = true;
      return;
    }
    if (this.#quietHandle !== null) return; // leading flush already armed
    this.#quietHandle = this.#scheduleTimeout(() => this.#onQuietElapsed(), this.#quietMs);
  }

  /** Drop pending work + timers without flushing, and reset cooldown (call on teardown / config change). */
  cancel(): void {
    this.#clearTimers();
    this.#pending.clear();
    this.#trailing = false;
  }

  #onQuietElapsed(): void {
    this.#quietHandle = null;
    this.#doFlush('quiet');
  }

  #onCooldownElapsed(): void {
    this.#cooldownHandle = null;
    if (this.#trailing && this.#pending.size > 0) {
      this.#doFlush('throttle'); // drain arrivals deferred during the cooldown
    }
    // else: idle - the next schedule() arms a fresh quiet window.
  }

  /** Emit one reflow for the current batch, then open a cooldown that bounds the next flush. */
  #doFlush(reason: FontReflowFlushReason): void {
    this.#trailing = false;
    try {
      if (this.#pending.size > 0) {
        const faceKeys = [...this.#pending];
        this.#pending.clear();
        this.#flush({ reason, faceKeys });
      }
    } catch {
      // #doFlush runs inside a timer callback, so a throwing flush would surface as an
      // uncaught exception. Font readiness must not break layout - swallow it; the correction
      // self-heals on the next schedule().
    } finally {
      // Always arm the cooldown, even when a flush throws, so the flush rate stays bounded.
      this.#cooldownHandle = this.#scheduleTimeout(() => this.#onCooldownElapsed(), this.#cooldownMs);
    }
  }

  #clearTimers(): void {
    if (this.#quietHandle !== null) {
      this.#cancelTimeout(this.#quietHandle);
      this.#quietHandle = null;
    }
    if (this.#cooldownHandle !== null) {
      this.#cancelTimeout(this.#cooldownHandle);
      this.#cooldownHandle = null;
    }
  }
}
