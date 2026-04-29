import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSuperDocUI } from '../create-super-doc-ui.js';
import type { Subscribable, SuperDocUI } from '../types.js';

/**
 * Minimal structural type for the host SuperDoc instance — exposed
 * through {@link useSuperDocHost} so components can call methods that
 * aren't on the controller surface (currently: `export({...})`).
 *
 * Most components should never reach for the host; prefer
 * {@link useSuperDocUI} and the domain hooks. The host is only here
 * for the small set of operations the controller doesn't yet bridge.
 */
export interface SuperDocHost {
  export(options: {
    exportType: string[];
    commentsType?: 'internal' | 'external';
    triggerDownload?: boolean;
  }): Promise<unknown>;
}

interface SuperDocUIContextValue {
  /** The controller, or null until the editor reports ready. */
  ui: SuperDocUI | null;
  /** The host SuperDoc instance, or null until the editor reports ready. */
  host: SuperDocHost | null;
  /**
   * Setter the editor mount calls from the React wrapper's `onReady`
   * callback. Most components never use this directly.
   */
  setSuperDoc(instance: unknown): void;
}

const SuperDocUIContext = createContext<SuperDocUIContextValue | null>(null);

/**
 * React context wrapping the `superdoc/ui` browser controller.
 *
 * Construction is deferred until SuperDoc reports ready — the editor
 * mount path calls `setSuperDoc(instance)` once the wrapper dispatches
 * `onReady`, and this provider creates exactly one
 * `createSuperDocUI({ superdoc })` and stores it in state. Re-renders
 * never recreate the controller; unmount calls `ui.destroy()` so every
 * subscriber is torn down deterministically.
 *
 * ```tsx
 * <SuperDocUIProvider>
 *   <Toolbar />
 *   <SuperDocEditor onReady={({ superdoc }) => setSuperDoc(superdoc)} />
 *   <ActivitySidebar />
 * </SuperDocUIProvider>
 * ```
 *
 * Implementation note: the unmount cleanup uses a ref to the latest
 * controller. Doing the obvious `useEffect(() => () => ui?.destroy(),
 * [])` would capture the initial null value (controllers are created
 * on `onReady`, after the first render), and changing the deps to
 * `[ui]` would destroy the controller every time it's created. The
 * ref sidesteps both pitfalls.
 */
export function SuperDocUIProvider({ children }: { children: ReactNode }) {
  const [ui, setUI] = useState<SuperDocUI | null>(null);
  const [host, setHost] = useState<SuperDocHost | null>(null);

  // Tracks the latest controller for the unmount cleanup effect and
  // for prior-controller teardown on re-init. Maintained imperatively
  // by `setSuperDoc`, never assigned during render: a render-time
  // assignment would run twice under React StrictMode and could mask
  // the controller that was actually live at unmount time.
  const uiRef = useRef<SuperDocUI | null>(null);

  const setSuperDoc = useCallback((instance: unknown) => {
    // Construct (and tear down the prior) controller in the callback
    // body, NOT inside a `setUI((prev) => ...)` updater. React's
    // StrictMode invokes state-updater functions twice in development
    // to find non-pure updaters: a second invocation here would call
    // `createSuperDocUI` again, producing a controller React then
    // discards but whose subscriptions stay attached to the SuperDoc
    // / editor instance. The body of `setSuperDoc` runs once per call
    // so the side effects (destroy + create) stay in lockstep with
    // the value React records as the new state.
    uiRef.current?.destroy();
    const next = createSuperDocUI({ superdoc: instance as never });
    uiRef.current = next;
    setUI(next);
    setHost(instance as SuperDocHost);
  }, []);

  useEffect(() => {
    return () => {
      uiRef.current?.destroy();
      uiRef.current = null;
    };
  }, []);

  return <SuperDocUIContext.Provider value={{ ui, host, setSuperDoc }}>{children}</SuperDocUIContext.Provider>;
}

/**
 * Read the controller from context. Returns `null` until the editor
 * reports ready — components either wait for non-null or render a
 * pending state.
 */
export function useSuperDocUI(): SuperDocUI | null {
  const ctx = useContext(SuperDocUIContext);
  if (!ctx) {
    throw new Error('useSuperDocUI must be used inside <SuperDocUIProvider>.');
  }
  return ctx.ui;
}

/**
 * Read the host SuperDoc instance from context. Reach for
 * {@link useSuperDocUI} first — host access is reserved for
 * operations that aren't on the controller surface today
 * (e.g. `export()`).
 */
export function useSuperDocHost(): SuperDocHost | null {
  const ctx = useContext(SuperDocUIContext);
  if (!ctx) {
    throw new Error('useSuperDocHost must be used inside <SuperDocUIProvider>.');
  }
  return ctx.host;
}

/**
 * Setter exposed for the editor mount component that owns the React
 * wrapper's `onReady` callback. Most components do NOT need this —
 * use {@link useSuperDocUI} to read the controller instead.
 */
export function useSetSuperDoc() {
  const ctx = useContext(SuperDocUIContext);
  if (!ctx) {
    throw new Error('useSetSuperDoc must be used inside <SuperDocUIProvider>.');
  }
  return ctx.setSuperDoc;
}

/**
 * Bind a React component to a slice of controller state.
 *
 * ```tsx
 * const toolbar = useSuperDocSlice(
 *   (ui) => ui.select((state) => state.toolbar, shallowEqual),
 *   { context: null, commands: {} },
 * );
 * ```
 *
 * The selector returns a `Subscribable<T>`; pass anything from
 * `ui.select(...)` (the canonical substrate) or any other API on the
 * controller that exposes the same shape.
 *
 * Domain handles (`ui.toolbar.subscribe`, `ui.comments.subscribe`,
 * etc.) emit a `{ snapshot }` event instead of the raw value — prefer
 * `ui.select(...)` when you need a single field, or use the typed
 * domain hooks (`useSuperDocSelection`, `useSuperDocComments`,
 * `useSuperDocReview`).
 *
 * The hook re-emits the most recent value on every change. While the
 * controller is null (before the editor reports ready), the hook
 * returns the `initial` value so the first render is coherent.
 */
export function useSuperDocSlice<T>(pickSubscribable: (ui: SuperDocUI) => Subscribable<T>, initial: T): T {
  const ui = useSuperDocUI();
  const [value, setValue] = useState<T>(() => initial);

  // `pickSubscribable` is treated as stable — pass a function that
  // closes only over `ui` (e.g. `(ui) => ui.select(...)`) so a new
  // function reference per render does not retrigger the effect.
  useEffect(() => {
    if (!ui) return;
    const sub = pickSubscribable(ui);
    return sub.subscribe((next) => setValue(next));
  }, [ui]);

  return value;
}
