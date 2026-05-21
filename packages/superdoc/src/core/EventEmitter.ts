/**
 * Default event map: string event names → tuple of payload args.
 *
 * The index-signature value is `unknown[]` (SD-3213 EventEmitter drain).
 * Specific event maps that extend this still type their known events
 * precisely; the index-signature fallback only governs untyped event
 * names. Currently this emitter is consumed by `Whiteboard` (no event
 * map yet — tracked as a follow-up); SuperDoc itself uses the
 * third-party `eventemitter3` and is unaffected by this change.
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
    // Storage erases the per-event tuple type to `EventCallback` (default
    // `unknown[]`); the typed `fn` is sound at runtime because `emit`
    // re-narrows via `EventMap[K]` on the way out.
    if (callbacks) callbacks.push(fn as EventCallback);
    else this.#events.set(name, [fn as EventCallback]);
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
