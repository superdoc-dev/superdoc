import type {
  CustomCommandRegistration,
  CustomCommandRegistrationResult,
  CustomCommandHandle,
  CustomCommandHandleState,
  SuperDocLike,
  SuperDocUIState,
  Subscribable,
  UIToolbarCommandState,
} from './types.js';

const DEFAULT_BUILTIN_COLLISION_MESSAGE = (id: string) =>
  `[superdoc/ui] ui.commands.register(): id '${id}' collides with a built-in command. Pass { override: true } to replace deliberately. Registration refused.`;

const DEFAULT_REPLACEMENT_MESSAGE = (id: string) =>
  `[superdoc/ui] ui.commands.register(): id '${id}' was already registered. Replacing prior registration.`;

/**
 * Static fallback state for a custom command when:
 *  - the registration omits `getState`
 *  - `getState` returns `undefined` / `void`
 *  - `getState` throws
 */
const STATIC_CUSTOM_STATE: Omit<UIToolbarCommandState, 'source'> = {
  active: false,
  disabled: false,
  value: undefined,
};

interface InternalCustomEntry {
  id: string;
  execute: CustomCommandRegistration['execute'];
  getState: CustomCommandRegistration['getState'];
  override: boolean;
  /**
   * Most recent error message thrown from `getState`. Used to dedupe
   * `console.error` calls so a buggy `getState` doesn't flood the console
   * once per snapshot rebuild.
   */
  lastErrorMessage: string | null;
}

export interface CustomCommandsRegistry {
  /**
   * Public `register` surface bound to the controller. The factory exposes
   * this so `createSuperDocUI` can attach it to the `commands` Proxy.
   */
  register<TPayload = unknown, TValue = unknown>(
    registration: CustomCommandRegistration<TPayload, TValue>,
  ): CustomCommandRegistrationResult<TPayload, TValue>;

  /** Whether `id` is currently registered as a custom command. */
  has(id: string): boolean;

  /**
   * Build the per-command snapshot states for every registered custom
   * command, given the current controller state. Errors in `getState`
   * are caught here and folded to the static fallback.
   */
  computeStates(state: SuperDocUIState): Record<string, UIToolbarCommandState>;

  /**
   * Get a stable {@link CustomCommandHandle} for a registered id. The
   * handle is created on first access and cached.
   */
  getHandle<TPayload = unknown, TValue = unknown>(id: string): CustomCommandHandle<TPayload, TValue> | undefined;

  /** Run `execute` for a registered id. Returns false if not registered. */
  execute(id: string, payload?: unknown): boolean | Promise<boolean>;

  /** Drop every registration and tear down per-command Subscribables. */
  destroy(): void;
}

interface CustomCommandsRegistryDeps {
  /**
   * Whether the given id is a built-in. Used to enforce the `override`
   * rule without coupling this module to the toolbar registry directly.
   */
  isBuiltIn(id: string): boolean;
  /** Host superdoc passed to custom `execute` callbacks. */
  superdoc: SuperDocLike;
  /**
   * Re-emit the controller snapshot. Called whenever the registry
   * changes (register / unregister / invalidate) so subscribers see the
   * new custom command state. Should be microtask-coalesced.
   */
  scheduleNotify(): void;
  /**
   * Build a per-id Subscribable that emits this custom command's state
   * from `state.toolbar.commands[id]`. Equivalent to the built-in cache
   * in `create-super-doc-ui.ts`; we delegate so both built-ins and custom
   * commands share the same selector substrate (and the same dedupe
   * posture).
   */
  buildSubscribable(id: string): Subscribable<UIToolbarCommandState | undefined>;
}

/**
 * Stateful registry for custom toolbar commands. Owns the registration
 * map, the per-command Subscribable cache, and the error-dedupe table.
 *
 * Created once per controller; teardown is part of `ui.destroy()`.
 */
export function createCustomCommandsRegistry(deps: CustomCommandsRegistryDeps): CustomCommandsRegistry {
  const entries = new Map<string, InternalCustomEntry>();
  const handleCache = new Map<string, CustomCommandHandle<unknown, unknown>>();
  const subscribableCache = new Map<string, Subscribable<UIToolbarCommandState | undefined>>();
  // Active observer disposers per command id. Lets `unregister` (and
  // replacement) actively tear down inner subscriptions instead of
  // waiting for the observer wrapper's lazy `!entries.has(id)` check
  // to fire on the next snapshot rebuild.
  const observerDisposers = new Map<string, Set<() => void>>();

  const getOrCreateSubscribable = (id: string) => {
    let sub = subscribableCache.get(id);
    if (sub) return sub;
    sub = deps.buildSubscribable(id);
    subscribableCache.set(id, sub);
    return sub;
  };

  const disposeAllObservers = (id: string) => {
    const set = observerDisposers.get(id);
    if (!set) return;
    // Snapshot then iterate so a disposer that removes itself from the
    // set during teardown doesn't perturb iteration.
    const disposers = [...set];
    observerDisposers.delete(id);
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
        // best-effort; one buggy disposer must not block the rest
      }
    }
  };

  const buildHandle = <TPayload, TValue>(
    id: string,
    ownEntry: InternalCustomEntry,
  ): CustomCommandHandle<TPayload, TValue> => ({
    observe(listener) {
      let innerOff: (() => void) | null = null;
      let stopped = false;
      const dispose = () => {
        if (stopped) return;
        stopped = true;
        innerOff?.();
        innerOff = null;
        observerDisposers.get(id)?.delete(dispose);
      };
      // Track the disposer so `unregister` / replacement can tear this
      // observer down actively. The lazy entry-identity short-circuit
      // below is still kept as a safety net for observers that get
      // notified between unregister and active disposal.
      let set = observerDisposers.get(id);
      if (!set) {
        set = new Set();
        observerDisposers.set(id, set);
      }
      set.add(dispose);

      innerOff = getOrCreateSubscribable(id).subscribe((state) => {
        if (stopped) return;
        // Identity safety net: the Subscribable lives on the
        // controller's selector substrate and outlives the
        // registration. If the entry this handle was built against
        // has been removed OR replaced (custom-vs-custom register
        // calls), stop forwarding to the listener. A consumer that
        // captured `regA.handle` before regA was replaced by regB
        // must NOT see B's state on A's observer.
        if (entries.get(id) !== ownEntry) {
          dispose();
          return;
        }
        const next: CustomCommandHandleState<TValue> = state
          ? {
              active: state.active,
              disabled: state.disabled,
              value: state.value as TValue | undefined,
              source: 'custom',
            }
          : { ...STATIC_CUSTOM_STATE, source: 'custom' as const, value: undefined as TValue | undefined };
        try {
          listener(next);
        } catch {
          // Match the built-in posture: a buggy listener cannot wedge
          // the controller's notify loop.
        }
      });
      return dispose;
    },
    execute: ((payload?: TPayload) => {
      // Identity check (PR #3010 review): a captured handle from
      // registration A must not execute registration B's handler if
      // a later `register({ id })` replaced A with B. The internal
      // `registry.execute(id, ...)` is identity-blind (it looks up
      // the current entry), so the guard lives on this side. Returns
      // `false` so the consumer sees a clean "stale handle" signal
      // matching the no-op handle that built-in collisions return.
      if (entries.get(id) !== ownEntry) {
        return false;
      }
      const result = registry.execute(id, payload);
      return result;
    }) as CustomCommandHandle<TPayload, TValue>['execute'],
  });

  const getHandle = <TPayload, TValue>(id: string) => {
    const entry = entries.get(id);
    if (!entry) return undefined;
    let cached = handleCache.get(id) as CustomCommandHandle<TPayload, TValue> | undefined;
    if (cached) return cached;
    cached = buildHandle<TPayload, TValue>(id, entry);
    handleCache.set(id, cached as CustomCommandHandle<unknown, unknown>);
    return cached;
  };

  const registry: CustomCommandsRegistry = {
    register<TPayload, TValue>(
      registration: CustomCommandRegistration<TPayload, TValue>,
    ): CustomCommandRegistrationResult<TPayload, TValue> {
      const { id, execute, getState, override = false } = registration;

      // Built-in collision: refuse without `override: true`. We return a
      // no-op registration object so the consumer's call site doesn't
      // crash on `result.handle.execute(...)` — they just see a warned
      // disabled command, matching the "warn and refuse" decision.
      if (deps.isBuiltIn(id) && !override) {
        console.warn(DEFAULT_BUILTIN_COLLISION_MESSAGE(id));
        return {
          handle: buildNoOpHandle<TPayload, TValue>(id),
          invalidate() {
            // refused registration — nothing to invalidate
          },
          unregister() {
            // refused registration — nothing to remove
          },
        };
      }

      // Custom-vs-custom replacement: warn, dispose old observers, replace.
      // Existing observers attached to the prior registration must be
      // told their command is gone before we install the new one — the
      // observer's `entries.has(id)` short-circuit will then detach.
      if (entries.has(id)) {
        console.warn(DEFAULT_REPLACEMENT_MESSAGE(id));
        disposeAllObservers(id);
      }

      // Capture the entry by reference so this registration's
      // `unregister()` / `invalidate()` only mutates state for ITS own
      // registration. Without this, a stale `unregister()` from
      // consumer A could delete a *replacement* registration installed
      // by consumer B at the same id — the bug was identity-blind
      // `entries.delete(id)`.
      const ownEntry: InternalCustomEntry = {
        id,
        execute: execute as InternalCustomEntry['execute'],
        getState: getState as InternalCustomEntry['getState'],
        override,
        lastErrorMessage: null,
      };
      entries.set(id, ownEntry);

      // Bust the handle cache so the next `getHandle(id)` rebuilds against
      // the new registration. The Subscribable cache stays valid — the
      // selector reads from `state.toolbar.commands[id]`, which the
      // computeStates pass below repopulates on every rebuild.
      handleCache.delete(id);

      deps.scheduleNotify();

      let unregistered = false;
      return {
        handle: getHandle<TPayload, TValue>(id) as CustomCommandHandle<TPayload, TValue>,
        invalidate() {
          if (unregistered) return;
          // Identity check: if a different registration replaced this id,
          // this `invalidate()` is from a stale owner — silently no-op.
          if (entries.get(id) !== ownEntry) return;
          deps.scheduleNotify();
        },
        unregister() {
          if (unregistered) return;
          unregistered = true;
          // Identity check: only delete if THIS registration is still the
          // owner. A prior `register({ id, override: false })` returning
          // the same id would have replaced ownEntry; calling unregister
          // from the older registration must not nuke the new one.
          if (entries.get(id) !== ownEntry) return;
          entries.delete(id);
          handleCache.delete(id);
          subscribableCache.delete(id);
          // Actively detach every active observer for this id so they
          // stop holding the inner Subscribable. The observer wrapper's
          // lazy `!entries.has(id)` check would otherwise leave the
          // subscriber attached for one extra microtask.
          disposeAllObservers(id);
          deps.scheduleNotify();
        },
      };
    },

    has(id) {
      return entries.has(id);
    },

    computeStates(state) {
      const out: Record<string, UIToolbarCommandState> = {};
      for (const entry of entries.values()) {
        let derived: { active?: boolean; disabled?: boolean; value?: unknown } | undefined;
        if (entry.getState) {
          try {
            const result = entry.getState({ state });
            // `getState` may return `void` (returns nothing) or an object;
            // normalize to undefined so the static fallback path takes over.
            derived = result == null ? undefined : (result as typeof derived);
          } catch (err) {
            derived = undefined;
            const message = err instanceof Error ? err.message : String(err);
            if (entry.lastErrorMessage !== message) {
              entry.lastErrorMessage = message;

              console.error(`[superdoc/ui] custom command '${entry.id}' getState threw: ${message}`);
            }
          }
        }

        out[entry.id] = {
          active: derived?.active ?? STATIC_CUSTOM_STATE.active,
          disabled: derived?.disabled ?? STATIC_CUSTOM_STATE.disabled,
          // Don't use `??` for value: a custom command (matching built-ins
          // like `link` / `text-color`) may legitimately use `null` to mean
          // "no current value", and `null ?? undefined` would silently
          // collapse it to undefined. Only fall through when `getState`
          // itself returned no derived state at all.
          value: derived ? derived.value : STATIC_CUSTOM_STATE.value,
          source: 'custom',
        };
      }
      return out;
    },

    getHandle,

    execute(id, payload) {
      const entry = entries.get(id);
      if (!entry) return false;
      try {
        // `payload` is `unknown` at this internal callsite — the public
        // `register<TPayload>(...)` signature carries the consumer's
        // payload type to the captured handle, but the runtime registry
        // stores entries with the default `void` payload. Cast to bridge.
        const result = (entry.execute as (args: { payload?: unknown; superdoc: SuperDocLike }) => unknown)({
          payload,
          superdoc: deps.superdoc,
        });
        if (result instanceof Promise) {
          return result.then(
            (value) => value !== false,
            (err) => {
              console.error(`[superdoc/ui] custom command '${id}' execute rejected:`, err);
              return false;
            },
          );
        }
        return result !== false;
      } catch (err) {
        console.error(`[superdoc/ui] custom command '${id}' execute threw:`, err);
        return false;
      }
    },

    destroy() {
      // Dispose every active observer before clearing maps so the
      // inner Subscribables release their selector subscriptions; just
      // clearing the caches would leave the substrate listeners alive.
      const ids = [...observerDisposers.keys()];
      for (const id of ids) disposeAllObservers(id);
      entries.clear();
      handleCache.clear();
      subscribableCache.clear();
    },
  };

  return registry;
}

function buildNoOpHandle<TPayload, TValue>(id: string): CustomCommandHandle<TPayload, TValue> {
  return {
    observe() {
      // Refused registration — no state changes will ever fire.
      return () => {};
    },
    execute: ((..._args: unknown[]) => {
      console.warn(
        `[superdoc/ui] ui.commands['${id}'].execute(): registration was refused (built-in collision without override).`,
      );
      return false;
    }) as CustomCommandHandle<TPayload, TValue>['execute'],
  };
}
