import { normalizeShortcut } from './keyboard-shortcuts.js';
import { isViewportContextBundle } from './viewport-context.js';
import type {
  ContextMenuContribution,
  ContextMenuItem,
  CustomCommandRegistration,
  CustomCommandRegistrationResult,
  CustomCommandHandle,
  CustomCommandHandleState,
  SuperDocEditorLike,
  SuperDocLike,
  SuperDocUIState,
  Subscribable,
  UIToolbarCommandState,
  ViewportContext,
  ViewportEntityHit,
} from './types.js';

const DEFAULT_SHORTCUT_COLLISION_MESSAGE = (shortcut: string, oldId: string, newId: string) =>
  `[superdoc/ui] ui.commands.register(): shortcut '${shortcut}' was already bound to '${oldId}'. Replacing with '${newId}'.`;

const DEFAULT_INVALID_SHORTCUT_MESSAGE = (id: string, raw: string) =>
  `[superdoc/ui] ui.commands.register(): id '${id}' carries an invalid shortcut '${raw}' — ignored. Use a string like 'Mod-Shift-K'.`;

/**
 * Built-in group ids in the order they render in the context menu.
 * Custom groups land after these, ranked by the smallest registration
 * seq currently contributing to the group — see `groupRank` below.
 */
const BUILTIN_CONTEXT_MENU_GROUPS = ['format', 'clipboard', 'review', 'comment', 'link'] as const;
const BUILTIN_GROUP_ORDER: ReadonlyMap<string, number> = new Map(
  BUILTIN_CONTEXT_MENU_GROUPS.map((g, i) => [g, i] as const),
);
const DEFAULT_CONTEXT_MENU_GROUP = 'custom';

const DEFAULT_BUILTIN_COLLISION_MESSAGE = (id: string) =>
  `[superdoc/ui] ui.commands.register(): id '${id}' collides with a built-in command. Pass { override: true } to replace deliberately. Registration refused.`;

const DEFAULT_REPLACEMENT_MESSAGE = (id: string) =>
  `[superdoc/ui] ui.commands.register(): id '${id}' was already registered. Replacing prior registration.`;

/**
 * Property names the `ui.commands` Proxy intercepts before the
 * registry lookup. A custom command registered with one of these ids
 * would still be reachable through `ui.commands.get(id)` /
 * `ui.commands.require(id)`, but indexing `ui.commands[id]` would
 * return the surface helper instead of the consumer's handle. To keep
 * the surface consistent, we refuse these ids at registration time.
 *
 * `override: true` does not bypass this list. Index access on a Proxy
 * is not something registration semantics can route around; the only
 * fix is to choose a different id (a namespaced one like
 * `'company.has'` is the canonical workaround).
 */
const RESERVED_PROXY_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  'register',
  'get',
  'has',
  'require',
  'getContextMenuItems',
]);

const DEFAULT_RESERVED_NAME_MESSAGE = (id: string) =>
  `[superdoc/ui] ui.commands.register(): id '${id}' shadows a Proxy method on ui.commands and would be unreachable through index access. Use a namespaced id (e.g. 'company.${id}') instead. Registration refused.`;

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
   * Normalized shortcut strings claimed by this registration.
   * Tracked so unregister/replacement can drop them from the
   * shortcut → id index in one pass.
   */
  shortcuts: string[];
  contextMenu: ContextMenuContribution | null;
  /**
   * Monotonic counter at registration time; ties in `(group, order)`
   * are broken by this so the rendered menu is stable across
   * snapshots and across re-registrations of unrelated commands.
   */
  registrationSeq: number;
  /**
   * Most recent error message thrown from `getState`. Used to dedupe
   * `console.error` calls so a buggy `getState` doesn't flood the console
   * once per snapshot rebuild.
   */
  lastErrorMessage: string | null;
  /**
   * Most recent error message thrown from `contextMenu.when`. Same
   * dedupe posture as `lastErrorMessage`.
   */
  lastContextMenuErrorMessage: string | null;
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

  /**
   * Run `execute` for a registered id. Returns false if not registered.
   * `context` (SD-2945) forwards the {@link ViewportContext} bundle when
   * the dispatch came from a `ContextMenuItem.invoke()`; direct
   * controller calls leave it `undefined`.
   */
  execute(id: string, payload?: unknown, context?: ViewportContext): boolean | Promise<boolean>;

  /**
   * Collect context-menu items contributed by registered customs.
   * Filtered by each contribution's `when` predicate against the
   * supplied entities + the current selection slice; sorted by
   * `(group, order, registrationSeq)`. Errors from `when` are
   * caught and the item is hidden for that query.
   *
   * SD-2945: when `input` is the full {@link ViewportContext} bundle,
   * predicates receive `point` / `position` / `insideSelection` and
   * each returned item carries an `invoke()` closure that fires
   * execute with the bundle bound. Pass an entities array for the
   * legacy "entities only" call shape.
   */
  getContextMenuItems(state: SuperDocUIState, input: ViewportEntityHit[] | ViewportContext): ContextMenuItem[];

  /**
   * Look up the custom command id (if any) bound to a normalized
   * shortcut string. Used by the controller's keydown listener to
   * dispatch matched shortcuts. Returns `undefined` when nothing is
   * registered for that combo.
   */
  resolveShortcut(shortcut: string): string | undefined;

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
   * Resolve the routed editor at execute-time. Passed to custom
   * `execute` callbacks alongside `superdoc` so registrations can
   * reach `editor.doc.*` without a structural cast. Late-bound (a
   * function, not a captured value) so the registry sees whichever
   * story editor is active when the command runs, matching the
   * routing the rest of `ui.*` uses.
   */
  getEditor(): SuperDocEditorLike | null;
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
  // Monotonic counter so `(group, order)` ties in context-menu sort
  // are broken by registration time. Stable across snapshots, doesn't
  // reuse values when entries are unregistered + re-registered.
  let nextRegistrationSeq = 0;
  // Normalized shortcut string → command id. Replacement / unregister
  // mutate this through `releaseShortcuts` / `claimShortcuts` so a
  // stale registration's shortcuts can never dispatch into a removed
  // entry.
  const shortcutIndex = new Map<string, string>();

  const releaseShortcuts = (entry: InternalCustomEntry) => {
    for (const sc of entry.shortcuts) {
      if (shortcutIndex.get(sc) === entry.id) shortcutIndex.delete(sc);
    }
  };

  const claimShortcuts = (id: string, raw: string | string[] | undefined): string[] => {
    if (raw === undefined) return [];
    const list = Array.isArray(raw) ? raw : [raw];
    const claimed: string[] = [];
    for (const item of list) {
      const normalized = normalizeShortcut(item);
      if (!normalized) {
        console.warn(DEFAULT_INVALID_SHORTCUT_MESSAGE(id, item));
        continue;
      }
      const prior = shortcutIndex.get(normalized);
      if (prior && prior !== id) {
        console.warn(DEFAULT_SHORTCUT_COLLISION_MESSAGE(normalized, prior, id));
      }
      shortcutIndex.set(normalized, id);
      claimed.push(normalized);
    }
    return claimed;
  };
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

      // Reserved Proxy property names refuse unconditionally. Even
      // `override: true` cannot route around index access on the
      // `ui.commands` Proxy; the surface helper always wins. Returning
      // a no-op result here keeps the call site safe (handle.execute
      // still callable) and warns once.
      if (RESERVED_PROXY_PROPERTY_NAMES.has(id)) {
        console.warn(DEFAULT_RESERVED_NAME_MESSAGE(id));
        return {
          handle: buildNoOpHandle<TPayload, TValue>(id),
          invalidate() {
            // refused registration: nothing to invalidate
          },
          unregister() {
            // refused registration: nothing to remove
          },
        };
      }

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
      const priorEntry = entries.get(id);
      if (priorEntry) {
        console.warn(DEFAULT_REPLACEMENT_MESSAGE(id));
        disposeAllObservers(id);
        // Drop the prior registration's shortcuts before claiming the
        // new ones so a re-registration that drops a binding doesn't
        // leave a stale shortcut → id mapping.
        releaseShortcuts(priorEntry);
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
        shortcuts: claimShortcuts(id, registration.shortcut),
        contextMenu: registration.contextMenu ?? null,
        registrationSeq: nextRegistrationSeq++,
        lastErrorMessage: null,
        lastContextMenuErrorMessage: null,
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
          releaseShortcuts(ownEntry);
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

    execute(id, payload, context) {
      const entry = entries.get(id);
      if (!entry) return false;
      try {
        // `payload` is `unknown` at this internal callsite — the public
        // `register<TPayload>(...)` signature carries the consumer's
        // payload type to the captured handle, but the runtime registry
        // stores entries with the default `void` payload. Cast to bridge.
        // `context` (SD-2945) is forwarded only when the dispatch came
        // from a `ContextMenuItem.invoke()`; direct
        // `ui.commands.execute` and `commands.get(id).execute()` calls
        // pass it through as `undefined`, leaving the prior payload
        // shape untouched for handlers that don't care about clicks.
        const result = (
          entry.execute as (args: {
            payload?: unknown;
            superdoc: SuperDocLike;
            editor: SuperDocEditorLike | null;
            context?: ViewportContext;
          }) => unknown
        )({
          payload,
          superdoc: deps.superdoc,
          editor: deps.getEditor(),
          context,
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

    // SD-2945: input is either an entities array (consumer built the
    // menu via `viewport.entityAt(...)` only) or a full
    // {@link ViewportContext} bundle from `viewport.contextAt(...)`.
    // Routed through the same `isViewportContextBundle` guard the
    // controller proxy uses so the two layers can't disagree on
    // ambiguous inputs (e.g. `{ point: null }`, `undefined`).
    // Bundle inputs surface `point` / `position` / `insideSelection`
    // on the `when` predicate AND wire `invoke()` on each returned
    // item so consumers can fire execute with context bound.
    getContextMenuItems(state, input) {
      const context = isViewportContextBundle(input) ? input : null;
      const entities: ViewportEntityHit[] = context ? context.entities : Array.isArray(input) ? input : [];

      const items: ContextMenuItem[] = [];
      for (const entry of entries.values()) {
        const contribution = entry.contextMenu;
        if (!contribution) continue;

        if (contribution.when) {
          let applies = true;
          try {
            const whenInput = context
              ? {
                  entities,
                  selection: state.selection,
                  point: context.point,
                  position: context.position,
                  insideSelection: context.insideSelection,
                }
              : { entities, selection: state.selection };
            applies = contribution.when(whenInput) === true;
          } catch (err) {
            // Same dedupe posture as `getState` errors: log once per
            // distinct message so a buggy `when` predicate doesn't
            // flood the console on every right-click.
            const message = err instanceof Error ? err.message : String(err);
            if (entry.lastContextMenuErrorMessage !== message) {
              entry.lastContextMenuErrorMessage = message;
              console.error(`[superdoc/ui] custom command '${entry.id}' contextMenu.when threw:`, err);
            }
            applies = false;
          }
          if (!applies) continue;
        } else {
          entry.lastContextMenuErrorMessage = null;
        }

        // Identity-guarded `invoke()` mirrors the captured-handle
        // pattern at `buildHandle.execute`: the closure refuses to
        // dispatch when a later `register({ id })` has replaced this
        // entry between menu open and click. Without that guard, a
        // menu held open across a re-registration would fire the new
        // owner's handler with the old item's label / predicate /
        // bundle, which is exactly the stale-handle class of bug the
        // prior pattern was added to prevent.
        const ownEntry = entry;
        const itemId = entry.id;
        const invoke = context
          ? (): boolean | Promise<boolean> => {
              if (entries.get(itemId) !== ownEntry) return false;
              return registry.execute(itemId, undefined, context);
            }
          : undefined;
        items.push({
          id: entry.id,
          label: contribution.label,
          group: contribution.group ?? DEFAULT_CONTEXT_MENU_GROUP,
          order: contribution.order ?? 0,
          ...(invoke ? { invoke } : {}),
        });
      }

      // Rank each custom group by the smallest registration seq
      // currently contributing to it. Two corners that drive this:
      //
      // - Skip entries with no `contextMenu` set. Otherwise a plain
      //   custom command (no contribution) would default to the
      //   `'custom'` fallback group via `?? DEFAULT_CONTEXT_MENU_GROUP`
      //   and silently anchor that group's rank from a non-contribution.
      // - Use the *minimum* current seq, not the first one encountered.
      //   `entries` is a Map; replacement keeps the key at its original
      //   insertion index but stores the new (higher) seq, so reading
      //   the first encountered seq for a group's lone re-registered
      //   contributor would use the new seq and reorder the group.
      //   Min-of-current is stable: while *any* original-seq contributor
      //   remains in the group, the group's rank stays anchored.
      const customGroupSeq = new Map<string, number>();
      for (const entry of entries.values()) {
        if (!entry.contextMenu) continue;
        const group = entry.contextMenu.group ?? DEFAULT_CONTEXT_MENU_GROUP;
        if (BUILTIN_GROUP_ORDER.has(group)) continue;
        const existing = customGroupSeq.get(group);
        if (existing === undefined || entry.registrationSeq < existing) {
          customGroupSeq.set(group, entry.registrationSeq);
        }
      }

      const groupRank = (group: string): number => {
        const builtin = BUILTIN_GROUP_ORDER.get(group);
        if (builtin !== undefined) return builtin;
        return BUILTIN_CONTEXT_MENU_GROUPS.length + (customGroupSeq.get(group) ?? 0);
      };

      const seqById = new Map<string, number>();
      for (const entry of entries.values()) seqById.set(entry.id, entry.registrationSeq);

      items.sort((a, b) => {
        const ga = groupRank(a.group);
        const gb = groupRank(b.group);
        if (ga !== gb) return ga - gb;
        if (a.order !== b.order) return a.order - b.order;
        return (seqById.get(a.id) ?? 0) - (seqById.get(b.id) ?? 0);
      });
      return items;
    },

    resolveShortcut(shortcut) {
      return shortcutIndex.get(shortcut);
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
      shortcutIndex.clear();
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
