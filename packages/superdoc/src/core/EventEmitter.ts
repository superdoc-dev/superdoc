/**
 * Default event map with string keys and any arguments.
 * Using `any[]` is necessary here to allow flexible event argument types
 * while maintaining type safety through generic constraints in EventEmitter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DefaultEventMap = Record<string, any[]>;

/**
 * Event callback function type.
 * Using `any[]` default is necessary for variance and compatibility with event handlers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventCallback<Args extends any[] = any[]> = (...args: Args) => void;

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
