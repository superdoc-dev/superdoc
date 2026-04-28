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
  /**
   * Toolbar snapshot — `{ context, commands }`. Sourced from the
   * internal headless-toolbar instance. Domain consumers normally read
   * this through `ui.toolbar` (aggregate) or `ui.commands.<id>`
   * (fine-grained per-command observables).
   */
  toolbar: ToolbarSnapshotSlice;
}

/**
 * Toolbar snapshot exposed on `state.toolbar`. Aliased to the existing
 * `ToolbarSnapshot` type from `headless-toolbar` so downstream consumers
 * see the same shape they would from the standalone controller.
 */
export type ToolbarSnapshotSlice = import('../headless-toolbar/types.js').ToolbarSnapshot;

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
   * Aggregate toolbar surface. Mirrors the `HeadlessToolbarController`
   * shape from `superdoc/headless-toolbar`, sourced from the same
   * internal controller. Equivalent to subscribing to the toolbar slice
   * via `ui.select((s) => s.toolbar, ...)` plus a passthrough
   * `execute` and `getSnapshot`.
   */
  toolbar: ToolbarHandle;

  /**
   * Per-command observables and executors — one handle per
   * {@link import('../headless-toolbar/types.js').PublicToolbarItemId}.
   * Pattern lifted from CKEditor 5's per-command `Observable`s: each
   * button binds to its own command's state, so unrelated state
   * changes don't trigger a re-render.
   */
  commands: CommandsHandle;

  /**
   * Tear down all internal subscriptions to the editor / SuperDoc
   * instance / presentation editor. After destroy, no listeners will
   * fire and `select(...)` should not be called.
   */
  destroy(): void;
}

/**
 * Aggregate toolbar handle exposed on `ui.toolbar`. Compatible with
 * `HeadlessToolbarController` from `superdoc/headless-toolbar` so the
 * built-in `SuperToolbar.vue` (and any external consumer using the
 * standalone controller today) can be migrated without API churn.
 */
export interface ToolbarHandle {
  /** Snapshot the current `{ context, commands }` payload synchronously. */
  getSnapshot(): ToolbarSnapshotSlice;
  /**
   * Subscribe to toolbar snapshot changes. Listener receives an event
   * with the latest snapshot. Returns an unsubscribe.
   */
  subscribe(listener: (event: { snapshot: ToolbarSnapshotSlice }) => void): () => void;
  /**
   * Execute a built-in toolbar command. Type-safe payload is enforced
   * via the existing `ToolbarPayloadMap`.
   */
  execute<Id extends import('../headless-toolbar/types.js').PublicToolbarItemId>(
    ...args: import('../headless-toolbar/types.js').ToolbarPayloadMap[Id] extends never
      ? [id: Id]
      : [id: Id, payload: import('../headless-toolbar/types.js').ToolbarPayloadMap[Id]]
  ): boolean;
}

/**
 * Per-command handle: state observation + execution for a single
 * toolbar command id.
 */
export type CommandHandle<Id extends import('../headless-toolbar/types.js').PublicToolbarItemId> = {
  /**
   * Subscribe to changes in this command's state. The listener fires
   * once synchronously with the current state, then again whenever the
   * state changes by shallow equality. Returns unsubscribe.
   */
  observe(listener: (state: ToolbarCommandHandleState<Id>) => void): () => void;
  /** Execute this command. Payload is type-checked per-command. */
  execute(
    ...args: import('../headless-toolbar/types.js').ToolbarPayloadMap[Id] extends never
      ? []
      : [payload: import('../headless-toolbar/types.js').ToolbarPayloadMap[Id]]
  ): boolean;
};

/**
 * Stable per-command state shape. `value` is omitted (`undefined`) when
 * the underlying command has no value (e.g., bold), and typed
 * per-command via `ToolbarValueMap` otherwise (e.g., `font-size`
 * resolves to `string | undefined`).
 */
export type ToolbarCommandHandleState<Id extends import('../headless-toolbar/types.js').PublicToolbarItemId> = {
  active: boolean;
  disabled: boolean;
  value: import('../headless-toolbar/types.js').ToolbarValueMap[Id] | undefined;
};

/**
 * Map of every toolbar command id to its handle. Indexed via
 * `ui.commands.bold.observe(...)` etc. The runtime exposes a Proxy so
 * any `PublicToolbarItemId` key works without pre-enumerating.
 */
export type CommandsHandle = {
  [Id in import('../headless-toolbar/types.js').PublicToolbarItemId]: CommandHandle<Id>;
};
