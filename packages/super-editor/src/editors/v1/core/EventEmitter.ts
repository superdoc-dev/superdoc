/**
 * Default event map: string event names → tuple of payload args.
 *
 * The index-signature value is `unknown[]` (SD-3213 EventEmitter drain).
 * Specific event maps that extend this still type their known events
 * precisely (see `EditorEventMap`); the index-signature fallback only
 * governs untyped event names like `editor.on('arbitraryEvent', cb)`,
 * where consumers now get `cb: (...args: unknown[]) => void` instead
 * of `any[]`. That keeps unsafe IntelliSense collapse out of the
 * public surface while leaving typed events untouched.
 */
export type DefaultEventMap = Record<string, unknown[]>;

/**
 * Event callback function type.
 *
 * Default `Args extends unknown[] = unknown[]` (was `any[]`, SD-3213).
 * Variance: when a specific event map provides a tighter tuple via
 * `EventMap[K]`, that flows through to `EventCallback<EventMap[K]>` at
 * the call site, so typed events keep their precise payloads.
 */
export type EventCallback<Args extends unknown[] = unknown[]> = (...args: Args) => void;

/**
 * EventEmitter class is used to emit and subscribe to events.
 * @template EventMap - Map of event names to their argument types
 */
export class EventEmitter<EventMap extends DefaultEventMap = DefaultEventMap> {
  #events = new Map<keyof EventMap, EventCallback[]>();

  /**
   * Subscribe to the event.
   * @param name Event name.
   * @param fn Callback.
   * @returns {void}
   */
  on<K extends keyof EventMap>(name: K, fn: EventCallback<EventMap[K]>): void {
    const callbacks = this.#events.get(name);
    if (callbacks) callbacks.push(fn);
    else this.#events.set(name, [fn]);
  }

  /**
   * Emit event.
   * @param name Event name.
   * @param args Arguments to pass to each listener.
   * @returns {void}
   */
  emit<K extends keyof EventMap>(name: K, ...args: EventMap[K]): void {
    const callbacks = this.#events.get(name);
    if (!callbacks) return;
    for (const fn of callbacks) {
      fn.apply(this, args);
    }
  }

  /**
   * Emit event with per-listener isolation.
   * Every registered listener is invoked even if earlier listeners throw.
   * Exceptions are collected and returned so the caller can log or handle them.
   */
  safeEmit<K extends keyof EventMap>(name: K, ...args: EventMap[K]): Error[] {
    const callbacks = this.#events.get(name);
    if (!callbacks) return [];
    const errors: Error[] = [];
    for (const fn of callbacks) {
      try {
        fn.apply(this, args);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    return errors;
  }

  /**
   * Remove a specific callback from event
   * or all event subscriptions.
   * @param name Event name.
   * @param fn Callback.
   * @returns {void}
   */
  off<K extends keyof EventMap>(name: K, fn?: EventCallback<EventMap[K]>): void {
    const callbacks = this.#events.get(name);
    if (!callbacks) return;
    if (fn) {
      this.#events.set(name, callbacks.filter((cb) => cb !== fn) as EventCallback[]);
    } else {
      this.#events.delete(name);
    }
  }

  /**
   * Subscribe to an event that will be called only once.
   * @param name Event name.
   * @param fn Callback.
   * @returns {void}
   */
  once<K extends keyof EventMap>(name: K, fn: EventCallback<EventMap[K]>): void {
    const wrapper = (...args: EventMap[K]) => {
      this.off(name, wrapper);
      fn.apply(this, args);
    };
    this.on(name, wrapper);
  }

  /**
   * Remove all registered events and subscriptions.
   */
  removeAllListeners(): void {
    this.#events = new Map();
  }
}
