import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSuperDocUI, type SuperDocUI, type Subscribable } from 'superdoc/ui';

/**
 * React context wrapping the `superdoc/ui` browser controller.
 *
 * Construction is deferred until SuperDoc reports ready — the editor
 * mount path calls `setSuperDoc(instance)` once `<SuperDocEditor>`
 * dispatches `onReady`, and this provider creates exactly one
 * `createSuperDocUI({ superdoc })` and stores it in state. Re-renders
 * never recreate the controller; unmount calls `ui.destroy()` so
 * every subscriber is torn down deterministically.
 *
 * Components consume the controller via {@link useSuperDocUI} and the
 * {@link useSuperDocSlice} subscription helper.
 */

/**
 * Minimal structural type for the host SuperDoc instance — the example
 * only reaches it for things the controller doesn't expose (currently:
 * `export({...})` which produces a downloadable DOCX). Everything
 * else routes through `ui.*`.
 */
export interface SuperDocHost {
  export(options: { exportType: string[]; commentsType?: 'internal' | 'external'; triggerDownload?: boolean }): Promise<unknown>;
}

interface SuperDocUIContextValue {
  /** The controller, or null until SuperDoc reports ready. */
  ui: SuperDocUI | null;
  /**
   * The host SuperDoc instance. Most components should reach for
   * {@link useSuperDocUI} (and `ui.*`) instead — the host exists in
   * context only because operations like `export(...)` aren't on the
   * controller surface today.
   */
  host: SuperDocHost | null;
  /** Set the SuperDoc instance once the React wrapper says it's ready. */
  setSuperDoc(instance: unknown): void;
}

const SuperDocUIContext = createContext<SuperDocUIContextValue | null>(null);

export function SuperDocUIProvider({ children }: { children: ReactNode }) {
  const [ui, setUI] = useState<SuperDocUI | null>(null);
  const [host, setHost] = useState<SuperDocHost | null>(null);

  // Track the latest controller in a ref so the unmount cleanup can
  // tear it down. Using `[ui]` deps on the cleanup effect would
  // destroy the controller every time it changes (immediately after
  // we create it); using `[]` would capture the initial null. A ref
  // sidesteps both pitfalls.
  const uiRef = useRef<SuperDocUI | null>(null);
  uiRef.current = ui;

  // Create the controller exactly once per SuperDoc lifetime and tear
  // it down on unmount. `setSuperDoc` is stable so the editor wrapper
  // can call it from `onReady` without re-running effects.
  const setSuperDoc = useCallback((instance: unknown) => {
    setUI((prev) => {
      // SuperDoc emits `onReady` once per mount. If it ever fires twice
      // for the same instance, drop the prior controller before creating
      // the new one so subscriptions don't accumulate.
      prev?.destroy();
      return createSuperDocUI({ superdoc: instance as never });
    });
    setHost(instance as SuperDocHost);
  }, []);

  useEffect(() => {
    return () => {
      uiRef.current?.destroy();
      uiRef.current = null;
    };
  }, []);

  return (
    <SuperDocUIContext.Provider value={{ ui, host, setSuperDoc }}>{children}</SuperDocUIContext.Provider>
  );
}

/**
 * Read the host SuperDoc instance from context. Reach for
 * {@link useSuperDocUI} first — host access is reserved for
 * operations that aren't on the controller surface today
 * (e.g. `export()`).
 */
export function useSuperDocHost(): SuperDocHost | null {
  const ctx = useContext(SuperDocUIContext);
  if (!ctx) throw new Error('useSuperDocHost must be used inside <SuperDocUIProvider>.');
  return ctx.host;
}

/**
 * Read the controller from context. Returns null until the editor
 * reports ready — components either wait for non-null or render a
 * pending state.
 */
export function useSuperDocUI(): SuperDocUI | null {
  const ctx = useContext(SuperDocUIContext);
  if (!ctx) throw new Error('useSuperDocUI must be used inside <SuperDocUIProvider>.');
  return ctx.ui;
}

/**
 * Setter exposed for the `<EditorMount>` wrapper that owns the
 * `<SuperDocEditor>` lifecycle. Most components do NOT need this —
 * use {@link useSuperDocUI} to read the controller instead.
 */
export function useSetSuperDoc() {
  const ctx = useContext(SuperDocUIContext);
  if (!ctx) throw new Error('useSetSuperDoc must be used inside <SuperDocUIProvider>.');
  return ctx.setSuperDoc;
}

/**
 * Bind a React component to a slice of controller state.
 *
 *   const toolbar = useSuperDocSlice(
 *     (ui) => ui.select((state) => state.toolbar, shallowEqual),
 *     { context: null, commands: {} },
 *   );
 *
 * The selector returns a `Subscribable<T>`; pass anything from
 * `ui.select(...)` (the canonical substrate) or any other API on
 * the controller that exposes the same shape. Domain handles
 * (`ui.toolbar.subscribe`, `ui.comments.subscribe`, etc.) emit a
 * `{ snapshot }` event instead of the raw value, so prefer
 * `ui.select(...)` when you need a single field.
 *
 * The hook re-emits the most recent value on every change. While
 * the controller is null (before `<EditorMount>` reports onReady)
 * the hook returns the `initial` value so the first render is
 * coherent.
 *
 * This helper exists so the demo doesn't repeat the same
 * `useEffect + setState + cleanup` pattern in every consumer
 * component. It's the kind of glue real consumers will copy.
 */
export function useSuperDocSlice<T>(
  pickSubscribable: (ui: SuperDocUI) => Subscribable<T>,
  initial: T,
): T {
  const ui = useSuperDocUI();
  const [value, setValue] = useState<T>(() => initial);

  useEffect(() => {
    if (!ui) return;
    const sub = pickSubscribable(ui);
    return sub.subscribe((next) => setValue(next));
    // `pickSubscribable` is treated as stable. Pass a function that
    // closes only over `ui` (e.g. `(ui) => ui.select(...)`) so a new
    // function reference per render does not retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui]);

  return value;
}
