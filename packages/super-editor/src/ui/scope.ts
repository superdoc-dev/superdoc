/**
 * `SuperDocUIScope`: controller-aware lifecycle helper.
 *
 * Without React's effect lifecycle, every consumer ends up tracking
 * subscriptions, custom-command registrations, and DOM listeners by
 * hand so they can be torn down on hot reload, on tab close, and when
 * the controller is destroyed. `ui.createScope()` collects all three
 * categories and tears them down with one call. Scopes also chain to
 * the controller's own destroy: calling `ui.destroy()` cascades into
 * every live scope before the controller releases its own resources,
 * so consumers do not need to remember a separate teardown.
 *
 * The minimum public surface is intentionally small. Convenience
 * sugar like `scope.subscribe(handle, fn)` / `scope.observe(handle,
 * fn)` is held back until SD-2919 unifies the subscribe and observe
 * shapes across domain handles; until then `scope.add(handle.subscribe(...))`
 * is the canonical pattern.
 *
 * Post-destroy semantics:
 * - `scope.add(teardown)` invokes `teardown()` synchronously. The
 *   typical caller is `scope.add(handle.subscribe(...))`, where the
 *   subscribe call has already happened; running its returned
 *   unsubscribe immediately matches what the consumer would have done
 *   anyway with a `try { ... } finally { off(); }` pattern.
 * - `scope.on(...)` is a no-op. The listener is never installed.
 * - `scope.register(...)` throws. Registering a custom command and
 *   immediately unregistering it would still fire registry
 *   invalidation paths and warning hooks, so the lifecycle error is
 *   surfaced explicitly instead of swallowed.
 * - `scope.child()` returns an already-destroyed child whose own
 *   methods follow the same rules.
 */

import type { CustomCommandRegistration, CustomCommandRegistrationResult, SuperDocUIScope } from './types.js';

/**
 * Internal collaborator the scope needs from its owner (the
 * controller, or a parent scope). Kept narrow so the scope module
 * does not transitively depend on the entire controller surface.
 */
export interface ScopeOwner {
  /**
   * Forward a custom-command registration to whoever owns the
   * underlying registry (always the controller in practice). Child
   * scopes share their parent's `register`, which ultimately points at
   * the same `customCommandsRegistry.register` instance.
   */
  register<TPayload, TValue>(
    registration: CustomCommandRegistration<TPayload, TValue>,
  ): CustomCommandRegistrationResult<TPayload, TValue>;
  /**
   * Tell the owner this scope is alive so the owner can cascade-destroy.
   * Returns an `untrack` function the scope calls during its own
   * teardown so the owner does not hold a stale reference after the
   * scope is gone.
   */
  trackScope(scope: SuperDocUIScope): () => void;
}

/**
 * Create a new {@link SuperDocUIScope}. Internal helper: the public
 * entry point is `ui.createScope()`, which calls this with the
 * controller as the owner.
 */
export function createScope(owner: ScopeOwner): SuperDocUIScope {
  const teardowns: Array<() => void> = [];
  const childScopes = new Set<SuperDocUIScope>();
  let destroyed = false;

  const scope: SuperDocUIScope = {
    get destroyed() {
      return destroyed;
    },

    add(teardown) {
      if (destroyed) {
        runTeardown(teardown);
        return;
      }
      teardowns.push(teardown);
    },

    register(registration) {
      if (destroyed) {
        throw new Error('[superdoc/ui] scope has been destroyed; cannot register a new command.');
      }
      const result = owner.register(registration);
      teardowns.push(() => result.unregister());
      return result;
    },

    on(target, type, listener, options) {
      if (destroyed) return;
      target.addEventListener(type, listener, options);
      teardowns.push(() => target.removeEventListener(type, listener, options));
    },

    child() {
      if (destroyed) {
        // Return an already-destroyed scope so callers don't have to
        // null-check. Its methods follow the destroyed-scope contract.
        const inert = createScope({
          register: owner.register,
          trackScope: () => () => undefined,
        });
        inert.destroy();
        return inert;
      }
      const childScope = createScope({
        register: owner.register,
        trackScope: (s) => {
          childScopes.add(s);
          return () => {
            childScopes.delete(s);
          };
        },
      });
      return childScope;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Children destroy before the parent's own teardowns: a child's
      // teardowns may have read state set up by something this parent
      // owns (event listeners, registrations), so unwinding leaf-first
      // matches typical resource-ownership expectations.
      const childSnapshot = [...childScopes];
      childScopes.clear();
      for (const child of childSnapshot) {
        try {
          child.destroy();
        } catch (err) {
          console.error('[superdoc/ui] child scope destroy threw', err);
        }
      }
      // Reverse order is the standard effect-cleanup convention: most
      // recently added cleanup runs first. Mirrors `useEffect` cleanup
      // order across multiple effects in React.
      for (let i = teardowns.length - 1; i >= 0; i -= 1) {
        runTeardown(teardowns[i]!);
      }
      teardowns.length = 0;
    },
  };

  // Register with the owner so cascade-destroy works. The untrack
  // call goes onto the teardown stack at index 0, which means it runs
  // last in the reverse-order loop in `destroy()` above. Running last
  // matches typical cleanup ordering: consumer-supplied teardowns may
  // still reference `scope` (e.g. through closures) while running, so
  // we hold the owner's reference until all of those have completed.
  const untrack = owner.trackScope(scope);
  teardowns.unshift(untrack);

  return scope;
}

function runTeardown(teardown: () => void): void {
  try {
    teardown();
  } catch (err) {
    console.error('[superdoc/ui] scope teardown threw', err);
  }
}
