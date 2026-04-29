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

  const getOrCreateSubscribable = (id: string) => {
    let sub = subscribableCache.get(id);
    if (sub) return sub;
    sub = deps.buildSubscribable(id);
    subscribableCache.set(id, sub);
    return sub;
  };

  const buildHandle = <TPayload, TValue>(id: string): CustomCommandHandle<TPayload, TValue> => ({
    observe(listener) {
      let innerOff: (() => void) | null = null;
      let stopped = false;
      innerOff = getOrCreateSubscribable(id).subscribe((state) => {
        if (stopped) return;
        // The Subscribable lives on the controller's selector substrate
        // and outlives the registration; if the command was unregistered
        // since the last emit, stop forwarding to the listener and
        // detach the inner subscription. Without this, a button bound
        // to `reg.handle.observe(...)` would keep receiving the static
        // fallback state (disabled: false) after `reg.unregister()`,
        // leaving stale buttons enabled.
        if (!entries.has(id)) {
          stopped = true;
          innerOff?.();
          innerOff = null;
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
      return () => {
        stopped = true;
        innerOff?.();
        innerOff = null;
      };
    },
    execute: ((payload?: TPayload) => {
      const result = registry.execute(id, payload);
      return result;
    }) as CustomCommandHandle<TPayload, TValue>['execute'],
  });

  const getHandle = <TPayload, TValue>(id: string) => {
    if (!entries.has(id)) return undefined;
    let cached = handleCache.get(id) as CustomCommandHandle<TPayload, TValue> | undefined;
    if (cached) return cached;
    cached = buildHandle<TPayload, TValue>(id);
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

      // Custom-vs-custom replacement: warn and replace.
      if (entries.has(id)) {
        console.warn(DEFAULT_REPLACEMENT_MESSAGE(id));
      }

      entries.set(id, {
        id,
        execute: execute as InternalCustomEntry['execute'],
        getState: getState as InternalCustomEntry['getState'],
        override,
        lastErrorMessage: null,
      });

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
          deps.scheduleNotify();
        },
        unregister() {
          if (unregistered) return;
          unregistered = true;
          entries.delete(id);
          handleCache.delete(id);
          subscribableCache.delete(id);
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
