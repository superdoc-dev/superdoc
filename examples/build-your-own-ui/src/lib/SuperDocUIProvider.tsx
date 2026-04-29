import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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

interface SuperDocUIContextValue {
  /** The controller, or null until SuperDoc reports ready. */
  ui: SuperDocUI | null;
  /** Set the SuperDoc instance once the React wrapper says it's ready. */
  setSuperDoc(instance: unknown): void;
}

const SuperDocUIContext = createContext<SuperDocUIContextValue | null>(null);

export function SuperDocUIProvider({ children }: { children: ReactNode }) {
  const [ui, setUI] = useState<SuperDocUI | null>(null);

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
  }, []);

  useEffect(() => {
    return () => {
      ui?.destroy();
    };
    // Tear down on unmount only. Re-running on every `ui` change would
    // immediately destroy the controller we just created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SuperDocUIContext.Provider value={{ ui, setSuperDoc }}>{children}</SuperDocUIContext.Provider>
  );
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
