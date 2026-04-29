/**
 * Public types for `superdoc/ui` (the browser UI controller).
 *
 * The controller exposes a single observation pipeline (the **selector
 * substrate** at `ui.select(...)`) that the domain namespaces
 * (`ui.toolbar`, `ui.commands`, `ui.comments`, `ui.review`,
 * `ui.viewport`, `ui.selection`) are implemented on top of. Consumers
 * building their own UI typically reach for the domain handles
 * (`ui.comments.subscribe(...)`, `ui.commands.bold.observe(...)`)
 * and only drop down to `ui.select` for slices the domain handles
 * don't expose.
 *
 * Lifecycle: `createSuperDocUI({ superdoc })` per editor mount;
 * `ui.destroy()` on unmount tears down every internal subscription.
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
  /**
   * Optional setter for documentMode. Reserved for future
   * `ui.<domain>` surfaces (SD-2799) that move document-mode and
   * other UI-only commands off the toolbar registry into dedicated
   * handles. Not consumed by the controller today.
   */
  setDocumentMode?(mode: 'editing' | 'suggesting' | 'viewing'): unknown;
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
        /** Active mark names at the caret / across the selection. */
        activeMarks?: string[];
        /** Present after SD-2792; absent on older builds — controller falls back to []. */
        activeCommentIds?: string[];
        activeChangeIds?: string[];
      };
    };
    /**
     * Comments member on the Document API. The structural typing
     * keeps the controller loose from the real `CommentsApi` interface
     * to allow stub-driven unit tests without pulling in the full
     * adapter graph; runtime calls forward to the real `editor.doc`.
     */
    comments?: {
      list?(query?: unknown): unknown;
      create?(input: unknown, options?: unknown): unknown;
      patch?(input: unknown, options?: unknown): unknown;
      delete?(input: unknown, options?: unknown): unknown;
    };
    /**
     * Tracked-changes member on the Document API. Used by
     * `ui.review.*` for accept/reject and the merged feed.
     */
    trackChanges?: {
      list?(query?: unknown): unknown;
      decide?(input: unknown, options?: unknown): unknown;
    };
  };
  /**
   * PresentationEditor handle. Browser-only. The controller calls
   * `presentationEditor.getEntityRects(target)` from `ui.viewport.getRect`
   * to look up the painted-DOM rectangles for an entity (comment or
   * tracked change) without leaking DOM elements through the public
   * `ui.viewport` surface. Optional in the structural typing to keep
   * SSR / non-browser stubs valid.
   */
  presentationEditor?: {
    getEntityRects?(target: { entityType?: unknown; entityId?: unknown; story?: unknown }): Array<{
      pageIndex: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    }>;
  } | null;
}

/**
 * The unified UI state model.
 *
 * Read individual fields via {@link SuperDocUI.select} or pull whole
 * slices through the domain handles (`ui.selection.subscribe`,
 * `ui.comments.subscribe`, etc.). Each slice is memoized so a typing
 * only transaction (which leaves selection / comments / review
 * unchanged) does not re-fire downstream subscribers.
 *
 * Implementation note: the selector substrate recomputes the full
 * state snapshot on every source event today, then dedups per
 * subscriber via the equality function. Lazy / incremental
 * computation is an optimization that does not change the public API.
 */
export interface SuperDocUIState {
  /** True when SuperDoc has an active editor mounted. */
  ready: boolean;
  /** Mirror of `superdoc.config.documentMode`. */
  documentMode: 'editing' | 'suggesting' | 'viewing' | null;
  /** Selection projection. See {@link SelectionSlice}. */
  selection: SelectionSlice;
  /**
   * Toolbar snapshot — `{ context, commands }`. Sourced from the
   * internal headless-toolbar instance. Domain consumers normally read
   * this through `ui.toolbar` (aggregate) or `ui.commands.<id>`
   * (fine-grained per-command observables).
   */
  toolbar: ToolbarSnapshotSlice;
  /**
   * Comments slice. Sourced from `editor.doc.comments.list()` and
   * cached at the controller level — the list is refreshed on
   * `commentsUpdate` / `commentsLoaded` events, not recomputed per
   * `computeState()` call. `activeIds` mirrors
   * `selection.current().activeCommentIds` so a comment-aware sidebar
   * can highlight the active card without a separate subscription.
   */
  comments: CommentsSlice;
  /**
   * Review slice — merged comments + tracked-changes feed for the
   * Word / Google Docs review sidebar pattern. Cached at controller
   * level alongside the comments slice; refreshes on the same events
   * plus tracked-change events.
   */
  review: ReviewSlice;
}

/**
 * Toolbar snapshot exposed on `state.toolbar`. Mirrors the headless-toolbar
 * shape with one widening: every command state carries a `source` field
 * so consumers can distinguish built-ins from commands registered via
 * `ui.commands.register(...)` without branching on the id.
 */
export type ToolbarSnapshotSlice = {
  context: import('../headless-toolbar/types.js').ToolbarContext | null;
  /**
   * Per-command snapshot states, keyed by command id. Returns `undefined`
   * for ids that are not currently registered (custom commands before
   * `register` / after `unregister`, typos in built-in ids). Consumers
   * must guard with `snapshot.commands[id]?.disabled` rather than
   * indexing directly.
   */
  commands: { [id: string]: UIToolbarCommandState | undefined };
};

/**
 * Per-command snapshot entry. `active`/`disabled`/`value` match the
 * headless-toolbar contract; `source` is the UI-controller addition that
 * tells consumers whether the command came from the built-in registry or
 * a `ui.commands.register(...)` call.
 */
export type UIToolbarCommandState = {
  active: boolean;
  disabled: boolean;
  value?: unknown;
  source: 'built-in' | 'custom';
};

/**
 * Snapshot of the editor's current selection — the full
 * {@link import('@superdoc/document-api').SelectionInfo} projection
 * mirrored on the controller so a single `ui.select(s => s.selection,
 * shallowEqual)` subscribe gives consumers everything they need to
 * drive a floating bubble menu, format toolbar, mention popover, or
 * "comment here" hint without dipping back into `editor.doc.selection.current()`.
 */
export interface SelectionSlice {
  /** True when the selection is empty (cursor only, no range). */
  empty: boolean;
  /**
   * The selection anchored to text content as a portable
   * {@link import('@superdoc/document-api').TextTarget}, or `null` when
   * the selection is not in text (empty document, node selection, no
   * focus). Multi-segment when the selection spans multiple blocks.
   * Pass directly to `editor.doc.comments.create({ target })` and to
   * range-mutation operations like `editor.doc.format.apply`.
   */
  target: import('@superdoc/document-api').TextTarget | null;
  /**
   * The same selection in {@link import('@superdoc/document-api').SelectionTarget}
   * shape — explicit start/end {@link import('@superdoc/document-api').SelectionPoint}s.
   * Pass directly to `editor.doc.insert({ target })` and to other
   * point/range operations that accept a SelectionTarget.
   *
   * ```ts
   * const { selectionTarget } = ui.selection.getSnapshot();
   * if (selectionTarget) {
   *   editor.doc.insert({ target: selectionTarget, content: 'Hello' });
   * }
   * ```
   *
   * Derived from `target`: `null` when `target` is null; otherwise the
   * first segment's `blockId` + `range.start` as the start point and
   * the last segment's `blockId` + `range.end` as the end point. The
   * derivation lives on the slice so consumers don't have to reach for
   * a private conversion helper every time they want to insert text at
   * the cursor.
   *
   * Story field caveat: when `target.story` is present, the derivation
   * preserves it on every {@link import('@superdoc/document-api').SelectionPoint}
   * and the {@link import('@superdoc/document-api').SelectionTarget}
   * root, so non-body selections route correctly. Today the selection
   * resolver does NOT yet stamp `target.story` for non-body surfaces
   * (header / footer / footnote / endnote); a doc-api follow-up
   * tracks this. Until it lands, consumers building BYO UI on top of
   * non-body content should detect the routed surface themselves and
   * stamp the right `StoryLocator` before passing the target into a
   * doc-api operation.
   */
  selectionTarget: import('@superdoc/document-api').SelectionTarget | null;
  /**
   * Active marks at the caret or across the selection. Names are
   * ProseMirror mark type names (`'bold'`, `'italic'`, `'link'`).
   * Drives toolbar active-state rendering. Intersection semantics: a
   * mark name is included only if every character in the range carries
   * it (or, when empty, the caret/stored marks).
   */
  activeMarks: string[];
  /**
   * Comment ids whose `commentMark` overlaps the selection (or sits
   * under the caret when empty). Union semantics: an id is included
   * when *any* character in the range carries the mark. Use to
   * highlight the active sidebar card or render a "comment here" hint.
   * Same array as `state.comments.activeIds` — duplicated for the
   * single-subscribe ergonomic.
   */
  activeCommentIds: string[];
  /**
   * Tracked-change ids whose mark (`trackInsert` / `trackDelete` /
   * `trackFormat`) overlaps the selection. Union semantics. Mirrors
   * `state.review.activeId` (which picks the first id) for consumers
   * that want the full set.
   */
  activeChangeIds: string[];
  /**
   * Quoted text of the selection. Always present on the slice;
   * empty string when the selection is collapsed. Equivalent to
   * `editor.doc.selection.current({ includeText: true }).text ?? ''`.
   */
  quotedText: string;
}

/**
 * Snapshot of the comments collection exposed on `state.comments`.
 *
 * Items use the same shape `editor.doc.comments.list()` returns
 * (`DiscoveryItem<CommentDomain>`), so consumers that already consume
 * that contract see no shape mismatch. `activeIds` is a denormalized
 * convenience driven by `selection.current().activeCommentIds`.
 */
export interface CommentsSlice {
  /** Total count from the list result (before pagination, if any). */
  total: number;
  /** Items from `editor.doc.comments.list()`. Empty array on error or no editor. */
  items: import('@superdoc/document-api').CommentsListResult['items'];
  /**
   * Comment IDs whose `commentMark` overlaps the current selection
   * (or covers the caret when empty). Empty array when the editor's
   * `selection.current()` predates SD-2792 (no `activeCommentIds`
   * field) — the controller falls back gracefully.
   */
  activeIds: string[];
}

/**
 * One item in the merged review feed (comments + tracked changes).
 *
 * Discriminated by `kind`. `documentOrder` is a dense rank within the
 * snapshot — comparing two items' `documentOrder` tells you which
 * appears first; consuming UIs don't need to recompute it.
 */
export type ReviewItem =
  | {
      kind: 'comment';
      id: string;
      documentOrder: number;
      comment: import('@superdoc/document-api').CommentsListResult['items'][number];
    }
  | {
      kind: 'change';
      id: string;
      documentOrder: number;
      change: import('@superdoc/document-api').TrackChangesListResult['items'][number];
    };

/**
 * Snapshot of the merged review feed exposed on `state.review`.
 *
 * Document-order ranking note (per SD-2791 ticket): both
 * `editor.doc.trackChanges.list()` and tracked-change groupings are
 * already returned in PM-position order, but cross-list interleaving
 * between comments and tracked changes is *not* fully resolved
 * because public `TrackChangeInfo` lacks a positional `target` today
 * (separate ticket). The initial implementation interleaves comments
 * (in their `comments.list()` order) ahead of tracked changes (in
 * their `list()` order); migration-guide consumers get a stable
 * iteration order and dense `documentOrder` ranks for next/previous
 * navigation. When `TrackChangeInfo.target` lands, the merge sort
 * gets refined transparently.
 */
export interface ReviewSlice {
  /** Merged feed, sorted by `documentOrder`. */
  items: ReviewItem[];
  /**
   * Number of unresolved review items (open comments + every tracked
   * change). Drives sidebar-header counts.
   */
  openCount: number;
  /**
   * The currently active item id — driven by selection
   * (`activeCommentIds[0] ?? activeChangeIds[0]`) plus
   * `ui.review.next/previous/scrollTo` calls. `null` when nothing is
   * focused.
   */
  activeId: string | null;
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
   * Comments domain — single subscription + actions surface. Subscribe
   * to receive snapshot updates (items + activeIds + total); call
   * action methods to mutate. All mutations route through
   * `editor.doc.comments.*` (the Document API contract); this handle
   * exists to give UI consumers a stable surface, not to be a parallel
   * mutation contract.
   */
  comments: CommentsHandle;

  /**
   * Review domain — merged comments + tracked-changes feed for
   * Word/Google-Docs review sidebars. Same shape as `comments` but
   * with accept/reject/next/previous semantics.
   */
  review: ReviewHandle;

  /**
   * Selection domain — single subscription + read surface for
   * floating bubble menus, format toolbars, mention popovers, and
   * "comment here" hints. The handle is sugar over
   * `ui.select((s) => s.selection, shallowEqual)` plus a synchronous
   * `getSnapshot()`; the lower-level selector substrate stays
   * available for finer-grained slices.
   *
   * The slice mirrors `editor.doc.selection.current()` —
   * `target` (TextTarget | null), `activeMarks`, `activeCommentIds`,
   * `activeChangeIds`, `quotedText`, `empty` — memoized at the
   * controller so subscribers don't re-fire on transactions that
   * leave the projection unchanged.
   */
  selection: SelectionHandle;

  /**
   * Viewport domain — imperative geometry queries for sticky-card /
   * floating-toolbar placement against painted entities and ranges.
   * No subscription substrate — viewport rects are read on-demand by
   * the consumer (e.g. on hover, on scroll, on layout-change events
   * the consumer already listens to). Browser-only by definition.
   */
  viewport: ViewportHandle;

  /**
   * Tear down all internal subscriptions to the editor / SuperDoc
   * instance / presentation editor. After destroy, no listeners will
   * fire and `select(...)` should not be called.
   */
  destroy(): void;
}

/**
 * Selection domain handle exposed on `ui.selection`. Same shape as
 * `CommentsHandle` / `ReviewHandle`: snapshot + subscription. Mirrors
 * the full `SelectionInfo` projection through the memoized
 * `state.selection` slice.
 */
export interface SelectionHandle {
  /** Snapshot the current selection slice synchronously. */
  getSnapshot(): SelectionSlice;
  /**
   * Subscribe to selection slice changes. The listener fires once
   * with the initial snapshot, then again only when the projected
   * selection state actually changes (memoized — no re-fire on
   * typing-only transactions). Returns an unsubscribe.
   */
  subscribe(listener: (event: { snapshot: SelectionSlice }) => void): () => void;
  /**
   * Capture the current selection as a portable handle.
   *
   * The pattern: a sidebar composer or floating menu opens, takes
   * focus into its own input element, and the editor's selection
   * visually clears (browser focus moved away). Without this
   * primitive every consumer reaches for an ad-hoc closure that
   * snapshots the selection at click-time and races to use it
   * before focus moves. Capture freezes the portable address
   * shapes (target / selectionTarget / activeMarks / etc.) so the
   * consumer can pass `captured.target` or
   * `captured.selectionTarget` directly into `editor.doc.*` calls
   * (`comments.create`, `text.replace`, `format.apply`, etc.) when
   * the composer submits, regardless of where browser focus is.
   *
   * Returns `null` when there is no addressable selection (no
   * editor mounted, selection collapsed in a non-text node, etc.).
   * The returned handle is a frozen value object, safe to store
   * on a React ref or in component state across renders.
   *
   * Visual restore (re-focus the editor and highlight the captured
   * range when the composer closes) is intentionally NOT on this
   * surface today: the public Document API has no `selection.set`
   * primitive yet, and `editor.doc.*` is the contract this
   * controller routes through. A `restore()` method lands once the
   * doc-api primitive does.
   */
  capture(): SelectionCapture | null;
}

/**
 * Frozen snapshot returned by {@link SelectionHandle.capture}.
 *
 * Same shape as {@link SelectionSlice} but `DeepReadonly` so the
 * type signal matches the runtime deep-freeze: assigning into
 * `captured.target.segments[0].range.start` or
 * `captured.activeMarks[0]` is a TypeScript error AND a runtime
 * throw in strict mode. Declared as its own named type so
 * consumers can name the captured value in their component state
 * (`useState<SelectionCapture | null>(null)`) and so the planned
 * `restore(capture)` follow-up has a stable input type.
 */
export type SelectionCapture = DeepReadonly<SelectionSlice>;

/**
 * Recursively mark every property and array element as `readonly`.
 * Mirrors the runtime `Object.freeze` walk performed by
 * `ui.selection.capture()` so the static type matches reality.
 *
 * Kept module-local: this is an implementation detail of the
 * captured selection contract, not a generic helper consumers
 * should reach for.
 */
type DeepReadonly<T> =
  T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

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
 *
 * `register(...)` extends the surface with consumer-defined commands —
 * see {@link CustomCommandRegistration}.
 */
export type CommandsHandle = {
  [Id in import('../headless-toolbar/types.js').PublicToolbarItemId]: CommandHandle<Id>;
} & {
  /**
   * Register a custom toolbar command at runtime so consumers migrating
   * from TipTap / CKEditor / TinyMCE can wire their own toolbar buttons
   * (AI Rewrite, Insert Mention, custom workflow actions, etc.) without
   * forking the built-in registry.
   *
   * Returns a {@link CustomCommandRegistration} with three members:
   *
   * - `handle`: typed `{ observe, execute }` surface for this command.
   *   Equivalent to `ui.commands[id]` but carries the consumer's payload
   *   and value types — capture the registration to keep that typing.
   * - `invalidate()`: re-runs `getState` and re-emits the snapshot.
   *   Use when external app state (permissions, AI quota, upload status,
   *   etc.) changes — SuperDoc has no other way to know about it.
   *   Microtask-coalesced; safe to call from any external signal handler
   *   but call it on *bucket* state changes, not per-keystroke.
   * - `unregister()`: idempotent. Removes the command and tears down its
   *   per-command Subscribable so observers stop firing.
   *
   * Built-in collisions are refused by default with a console warning.
   * Pass `override: true` on the registration to deliberately replace a
   * built-in (e.g. swap `bold` for a tracked-changes-aware variant).
   * Custom-vs-custom collisions warn and replace the prior registration.
   */
  register<TPayload = void, TValue = unknown>(
    registration: CustomCommandRegistration<TPayload, TValue>,
  ): CustomCommandRegistrationResult<TPayload, TValue>;

  /**
   * Look up a command handle by string id at runtime.
   *
   * Returns a {@link DynamicCommandHandle} for any registered id,
   * built-in (`'bold'`, `'italic'`, etc.) or custom (registered via
   * {@link CommandsHandle.register}), and `undefined` for unknown ids.
   *
   * Use this instead of indexing `ui.commands[id]` when the id is only
   * known at runtime: a toolbar driven by a `string[]` config, a
   * keyboard-shortcut router, a plugin loop. Indexing the surface with
   * a generic `string` type-errors today because the surface mixes
   * per-command handles with the `register` method, so consumers
   * otherwise reach for an unsafe `as` cast on every dispatch site.
   *
   * The returned handle's `observe` listener receives the full
   * {@link UIToolbarCommandState} (active / disabled / value / source),
   * so a single render path can drive built-in *and* custom buttons
   * uniformly without branching on the id.
   */
  get(id: string): DynamicCommandHandle | undefined;
};

/**
 * Type-erased command handle returned from {@link CommandsHandle.get}.
 *
 * Bridges built-ins ({@link CommandHandle}) and customs
 * ({@link CustomCommandHandle}) into one observe/execute surface so
 * consumers iterating `string[]` ids don't have to branch. The emitted
 * state carries `source` so a uniform renderer can still distinguish
 * the two when it wants.
 *
 * `execute` accepts an optional `unknown` payload and returns
 * `boolean | Promise<boolean>` (built-ins are sync, customs may be
 * async). Capture the typed registration result for type-safe
 * payloads. `get(id)` is the dynamic-lookup fallback, not a
 * replacement for the per-id typing of `ui.commands.bold`.
 */
export interface DynamicCommandHandle {
  /**
   * Subscribe to the command's state. The listener fires once
   * synchronously with the current state, then again whenever the
   * state changes by shallow equality. Returns an unsubscribe.
   *
   * For ids in the built-in registry that haven't received a
   * snapshot yet (or whose value has gone stale), the listener is
   * still called with a deterministic disabled fallback so consumer
   * code can render without a null check on every emit.
   */
  observe(listener: (state: UIToolbarCommandState) => void): () => void;
  /**
   * Execute the command. Forwards to the same dispatch path as
   * `ui.toolbar.execute(id, payload)` for built-ins and the
   * registered `execute` handler for customs.
   *
   * The payload is `unknown` because `get(id)` erases per-command
   * payload typing. Pass the value the command expects (e.g. the
   * `string` for `'font-size'`). The returned Promise resolves to
   * `false` when a custom command's handler rejects or returns
   * `false`; built-ins return synchronously.
   */
  execute(payload?: unknown): boolean | Promise<boolean>;
}

/**
 * Input shape for {@link CommandsHandle.register}.
 *
 * `getState` is sync and should be cheap (it runs on every snapshot
 * rebuild). Async work — fetching, uploading, prompting — belongs in
 * `execute`. If app state changes outside the editor (the app's auth
 * provider says permissions changed; an AI quota counter ticks down)
 * call the registration's `invalidate()` to re-derive `getState`.
 *
 * Errors thrown from `getState` are caught and the command falls back
 * to a static `{ active: false, disabled: false }` for that snapshot.
 * The error is reported via `console.error` once per error message
 * (not once per snapshot rebuild) so a buggy custom command can't
 * flood the console or wedge the toolbar.
 */
export type CustomCommandRegistration<TPayload = void, TValue = unknown> = {
  /**
   * Command id. Use a namespaced convention like `'company.aiRewrite'`
   * to avoid future collisions with built-in commands. Collides with a
   * built-in by default → warns and refuses (pass `override: true` to
   * replace deliberately).
   */
  id: string;
  /**
   * Execute the command. Receives `payload` (typed per registration)
   * and the host `superdoc` instance. Return value is normalized to
   * `boolean` for the synchronous result; async commands return a
   * Promise that the runtime awaits internally.
   */
  execute: (args: { payload?: TPayload; superdoc: SuperDocLike }) => boolean | void | Promise<boolean | void>;
  /**
   * Optional state deriver. Runs on every snapshot rebuild. If omitted,
   * the command's state stays static at `{ active: false, disabled: false, value: undefined }`.
   *
   * `state` is the controller's current `SuperDocUIState` so the
   * deriver can read `state.selection`, `state.documentMode`, etc.
   * without needing a separate selector subscription.
   */
  getState?: (args: { state: SuperDocUIState }) =>
    | {
        active?: boolean;
        disabled?: boolean;
        value?: TValue;
      }
    | undefined
    | void;
  /**
   * Set to `true` to deliberately replace a built-in command id. Without
   * this flag, registrations colliding with a built-in are refused with
   * a console warning.
   */
  override?: boolean;
};

/** Return value from {@link CommandsHandle.register}. */
export type CustomCommandRegistrationResult<TPayload, TValue> = {
  /**
   * Typed `{ observe, execute }` handle for this registration. Equivalent
   * to indexing `ui.commands[id]` at runtime, but the captured handle
   * carries the consumer's `TPayload` / `TValue` types — index access
   * with a string key cannot.
   */
  handle: CustomCommandHandle<TPayload, TValue>;
  /**
   * Re-runs `getState` and re-emits the snapshot. Use when external app
   * state (not editor state) changes. Microtask-coalesced.
   */
  invalidate(): void;
  /**
   * Idempotent. Removes the command and tears down per-command
   * Subscribables. Calling twice is a no-op.
   */
  unregister(): void;
};

/** Typed handle returned for a custom registration. */
export type CustomCommandHandle<TPayload = void, TValue = unknown> = {
  observe(listener: (state: CustomCommandHandleState<TValue>) => void): () => void;
  execute(...args: TPayload extends void | undefined ? [] : [payload: TPayload]): boolean | Promise<boolean>;
};

/** Stable per-custom-command state shape. */
export type CustomCommandHandleState<TValue = unknown> = {
  active: boolean;
  disabled: boolean;
  value: TValue | undefined;
  source: 'custom';
};

/**
 * Comments domain handle exposed on `ui.comments`. The execute
 * methods are convenience facades over `editor.doc.comments.*` —
 * they produce identical document mutations to direct doc-API calls.
 */
export interface CommentsHandle {
  /** Snapshot the current comments slice synchronously. */
  getSnapshot(): CommentsSlice;
  /**
   * Subscribe to comments-snapshot changes. Listener fires once
   * synchronously with the current snapshot, then again whenever
   * items, activeIds, or total change (shallow equality).
   * Returns an unsubscribe.
   */
  subscribe(listener: (event: { snapshot: CommentsSlice }) => void): () => void;
  /**
   * Create a comment anchored to the current selection. Reads the
   * routed editor's `selection.current().target` and routes through
   * `editor.doc.comments.create`. Returns the operation receipt.
   */
  createFromSelection(input: { text: string }): import('@superdoc/document-api').Receipt;
  /** Resolve a comment via `editor.doc.comments.patch`. */
  resolve(commentId: string): import('@superdoc/document-api').Receipt;
  /**
   * Reopen a resolved comment via `editor.doc.comments.patch({ status:
   * 'active' })`. The doc-api lifecycle inverse shipped in SD-2789;
   * the call resolves cleanly when the comment exists and is
   * currently resolved, and returns a failure receipt otherwise.
   */
  reopen(commentId: string): import('@superdoc/document-api').Receipt;
  /** Delete a comment via `editor.doc.comments.delete`. */
  delete(commentId: string): import('@superdoc/document-api').Receipt;
  /**
   * Scroll the viewport to the comment's anchor via
   * `ui.viewport.scrollIntoView({ target: EntityAddress })`. Resolves
   * to a `{ success: boolean }` receipt.
   */
  scrollTo(commentId: string): Promise<import('@superdoc/document-api').ScrollIntoViewOutput>;
}

/**
 * Review domain handle exposed on `ui.review`. Same architectural
 * posture as `CommentsHandle`: every mutation routes through
 * `editor.doc.trackChanges.*` (the Document API contract); next /
 * previous / scrollTo are UI-only navigation helpers.
 */
export interface ReviewHandle {
  /** Snapshot the merged review feed synchronously. */
  getSnapshot(): ReviewSlice;
  /**
   * Subscribe to review-snapshot changes (items, openCount, activeId).
   * Listener fires once synchronously with the current snapshot, then
   * again whenever the slice changes by shallow equality. Returns an
   * unsubscribe.
   */
  subscribe(listener: (event: { snapshot: ReviewSlice }) => void): () => void;
  /** Accept a single tracked change via `trackChanges.decide`. */
  accept(changeId: string): import('@superdoc/document-api').Receipt;
  /** Reject a single tracked change via `trackChanges.decide`. */
  reject(changeId: string): import('@superdoc/document-api').Receipt;
  /** Accept every tracked change via `trackChanges.decide({ scope: 'all' })`. */
  acceptAll(): import('@superdoc/document-api').Receipt;
  /** Reject every tracked change via `trackChanges.decide({ scope: 'all' })`. */
  rejectAll(): import('@superdoc/document-api').Receipt;
  /**
   * Move `activeId` to the next item in the merged feed (document
   * order). Wraps to the first item past the last. Returns the new
   * active id, or `null` if the feed is empty.
   */
  next(): string | null;
  /**
   * Move `activeId` to the previous item in the merged feed. Wraps
   * to the last item past the first. Returns the new active id, or
   * `null` if the feed is empty.
   */
  previous(): string | null;
  /**
   * Scroll the viewport to the given item (comment or tracked
   * change) and set it as `activeId`. Routes through
   * `ui.viewport.scrollIntoView({ target: EntityAddress })`.
   */
  scrollTo(id: string): Promise<import('@superdoc/document-api').ScrollIntoViewOutput>;
}

/**
 * Plain value rectangle in viewport coordinates. Always a snapshot,
 * never a live `DOMRect`. Coordinates measure from the top-left of
 * the user's viewport, not the editor host, so consumers can position
 * fixed/absolute elements directly with the returned `top` / `left`.
 */
export interface ViewportRect {
  top: number;
  left: number;
  width: number;
  height: number;
  /**
   * Page index of the painted page that contains this rect. Useful
   * for per-page sidebars or footers that render once per page.
   */
  pageIndex: number;
}

export interface ViewportGetRectInput {
  /**
   * Entity to look up — comment or tracked change by id. Today
   * `getRect` resolves rects via the painter's data attributes
   * (`data-comment-ids`, `data-track-change-id`) which only stamp
   * entity addresses, not text-anchored ranges. Text targets
   * (`TextAddress` / `TextTarget`) are intentionally not in the
   * union: surface should match real behavior so a typed call site
   * isn't lying about what works at runtime. They land via a
   * follow-up that adds story-aware text resolution to the rect
   * helper.
   */
  target: import('@superdoc/document-api').EntityAddress;
}

export type ViewportRectResult =
  | {
      success: true;
      /**
       * Primary anchor rect — the first painted occurrence of the
       * target, suitable as the anchor point for a sidebar card or
       * floating toolbar. For multi-page / multi-line targets,
       * `rects` carries the full set in document order.
       */
      rect: ViewportRect;
      /** Every painted occurrence of the target, in document order. */
      rects: ViewportRect[];
      /** Page index of the primary anchor (`rect.pageIndex`). */
      pageIndex: number;
    }
  | {
      success: false;
      reason: /**
       * Editor / presentation editor not initialized yet — no
       * active editor, or layout has not bootstrapped. The caller
       * can retry after `editorCreate` fires.
       */
      | 'not-ready'
        /**
         * Caller-shape error: `target` is missing, has the wrong
         * `kind`, or refers to an `entityType` the controller does
         * not handle. Indicates a programming mistake, not a
         * transient state.
         */
        | 'invalid-target'
        /**
         * Target's referenced block / entity is not in the model
         * (e.g. a stale id from a closed snapshot). Reserved for the
         * text-anchored paths once they land; the entity-anchored
         * path returns `not-mounted` for unknown ids since the DOM
         * lookup can't distinguish "doesn't exist" from "currently
         * virtualized".
         */
        | 'unresolved'
        /**
         * Valid target but currently virtualized / offscreen — the
         * page or story isn't painted in the DOM. Caller can call
         * `viewport.scrollIntoView` first to mount it, then retry.
         * Same posture as the underlying scroll path for non-body
         * stories on virtualized pages (SD-2750).
         */
        | 'not-mounted';
    };

/**
 * Imperative viewport-geometry surface. No subscription primitive —
 * rects are read on demand. Consumers who need to reflow on layout
 * change typically already listen to a `transaction` / `paint` /
 * `scroll` event upstream and call `getRect` from there.
 */
export interface ViewportHandle {
  /**
   * Look up the painted rectangle(s) of an entity or text range in
   * viewport coordinates. Synchronous — no DOM mutation required.
   */
  getRect(input: ViewportGetRectInput): ViewportRectResult;
  /**
   * Scroll the viewport so the target is visible. Browser-only by
   * definition: drives `presentation.navigateTo()` for entity targets
   * (story-aware) and `presentation.scrollToPositionAsync()` for text
   * targets. Lives on `ui.*` rather than `editor.doc.*` because
   * viewport scroll is a UI side-effect, not a request/response
   * Document API operation.
   */
  scrollIntoView(
    input: import('@superdoc/document-api').ScrollIntoViewInput,
  ): Promise<import('@superdoc/document-api').ScrollIntoViewOutput>;
}
