/**
 * Public types for `superdoc/ui` (the browser UI controller).
 *
 * The controller exposes a single observation pipeline (the **selector
 * substrate**) that domain namespaces — `ui.toolbar`, `ui.commands`,
 * `ui.comments`, `ui.review`, `ui.viewport`, `ui.selection` — are
 * implemented on top of in sibling tickets.
 *
 * The skeleton in this package ships only:
 *   - `createSuperDocUI({ superdoc })` factory
 *   - `ui.select(selector, equality)` substrate
 *   - `ui.destroy()` lifecycle
 *
 * Consumers building custom UI layer their state on top of `ui.select`.
 * Domain namespaces are added by sibling tickets.
 */

export type EqualityFn<T> = (a: T, b: T) => boolean;

export type SelectorFn<TState, TSlice> = (state: TState) => TSlice;

/**
 * A read-only signal. `get()` is synchronous; `subscribe()` invokes the
 * listener once with the current value, then again whenever the value
 * changes by the controller's equality function.
 */
export interface Subscribable<T> {
  /** Snapshot the current value. */
  get(): T;
  /**
   * Subscribe to value changes. The listener fires once synchronously
   * with the current value, then again whenever the value changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: (value: T) => void): () => void;
}

/**
 * Structural typing for the SuperDoc instance — keeps the UI controller
 * loose from the SuperDoc Vue package's specific class type. The
 * controller only needs an event bus and an `activeEditor` reference.
 */
export interface SuperDocLike {
  on?(event: string, handler: (...args: unknown[]) => void): unknown;
  off?(event: string, handler: (...args: unknown[]) => void): unknown;
  activeEditor?: SuperDocEditorLike | null;
  config?: { documentMode?: 'editing' | 'suggesting' | 'viewing' };
}

export interface SuperDocEditorLike {
  on?(event: string, handler: (...args: unknown[]) => void): unknown;
  off?(event: string, handler: (...args: unknown[]) => void): unknown;
  doc?: {
    selection?: {
      current?(input?: { includeText?: boolean }): {
        empty: boolean;
        text?: string;
        target?: unknown;
      };
    };
  };
}

/**
 * The unified UI state model.
 *
 * The skeleton ships the minimum slice needed to prove the substrate
 * end-to-end. Sibling tickets extend this via TypeScript module
 * augmentation as their domains land:
 *   - SD-2796 adds `commands` (per-command active/disabled state)
 *   - SD-2790 adds `comments`
 *   - SD-2791 adds `trackedChanges`
 *   - SD-2792 reads add `selection.activeCommentIds` / `activeChangeIds`
 *
 * Implementation note: the selector substrate recomputes the full state
 * snapshot on every source event today, then dedups per-subscriber via
 * the equality function. Lazy/incremental computation is an
 * optimization that does not change the public API.
 */
export interface SuperDocUIState {
  /** True when SuperDoc has an active editor mounted. */
  ready: boolean;
  /** Mirror of `superdoc.config.documentMode`. */
  documentMode: 'editing' | 'suggesting' | 'viewing' | null;
  /** Selection slice (minimal in the skeleton). */
  selection: SelectionSlice;
}

export interface SelectionSlice {
  empty: boolean;
  /** The selected text, or '' when the selection is collapsed. */
  quotedText: string;
}

export interface SuperDocUIOptions {
  superdoc: SuperDocLike;
}

export interface SuperDocUI {
  /**
   * Subscribe to a slice of the unified UI state. Returns a {@link
   * Subscribable} that fires whenever the selected slice changes by the
   * given equality function.
   *
   * Default equality is `Object.is`. For object slices, pass
   * {@link shallowEqual} or a custom equality — otherwise every state
   * recompute will re-fire your listener.
   */
  select<TSlice>(selector: SelectorFn<SuperDocUIState, TSlice>, equality?: EqualityFn<TSlice>): Subscribable<TSlice>;

  /**
   * Tear down all internal subscriptions to the editor / SuperDoc
   * instance / presentation editor. After destroy, no listeners will
   * fire and `select(...)` should not be called.
   */
  destroy(): void;
}
