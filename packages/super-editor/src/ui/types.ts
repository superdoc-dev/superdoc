/**
 * Public types for `superdoc/ui` (the browser UI controller).
 *
 * The controller exposes a single observation pipeline (the **selector
 * substrate** at `ui.select(...)`) that the domain namespaces
 * (`ui.toolbar`, `ui.commands`, `ui.comments`, `ui.trackChanges`,
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
   * Optional setter for documentMode. Consumed by `ui.document.setMode`
   * (SD-2816) and reserved for future `ui.<domain>` surfaces (SD-2799)
   * that move other UI-only commands off the toolbar registry.
   */
  setDocumentMode?(mode: 'editing' | 'suggesting' | 'viewing'): unknown;
  /**
   * Optional export bridge. `ui.document.export(options)` forwards
   * here so consumers wiring an Export DOCX button can call it from
   * the controller surface instead of pulling the host instance into
   * their context. The shape mirrors `SuperDoc.export()` from the
   * superdoc package; declared optional and `unknown`-typed so non
   * browser test stubs stay valid without a host implementation.
   */
  export?(options?: DocumentExportInput): Promise<unknown>;
}

export interface SuperDocEditorLike {
  on?(event: string, handler: (...args: unknown[]) => void): unknown;
  off?(event: string, handler: (...args: unknown[]) => void): unknown;
  emit?(event: string, payload: unknown): void;
  /**
   * Replace the current document file. Consumed by `ui.document.replaceFile`
   * to give consumers a typed import path without reaching into the host
   * instance. Optional in the structural typing so SSR / non-browser
   * stubs stay valid.
   */
  replaceFile?(file: File): Promise<unknown>;
  /**
   * Converter handle. The controller reads `converter.comments` after
   * a `replaceFile` to manually re-emit `commentsLoaded` while
   * SD-2839 is open (Editor short-circuits the event when
   * `modules.comments: false`).
   */
  converter?: { comments?: unknown[] };
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
     * `ui.trackChanges.*` for accept/reject and the live feed.
     */
    trackChanges?: {
      list?(query?: unknown): unknown;
      decide?(input: unknown, options?: unknown): unknown;
    };
    /**
     * Insert content at a positional target. Surfaces the typed
     * doc-API signature so custom commands can call
     * `editor.doc.insert(...)` without a structural cast. The control
     * surface needs `editor.doc.insert` for the Custom UI custom-command
     * pattern (Insert clause, AI-generated text); other doc-API
     * mutation methods stay loose unless a similar use case lands.
     */
    insert?(
      input: import('@superdoc/document-api').InsertInput,
      options?: unknown,
    ): import('@superdoc/document-api').SDMutationReceipt;
  };
  /**
   * PresentationEditor handle. Browser-only. The controller calls
   * `presentationEditor.getEntityRects(target)` from `ui.viewport.getRect`
   * to look up the painted-DOM rectangles for an entity (comment or
   * tracked change), and `presentationEditor.getSelectionRects()` /
   * `getRangeRects(from, to)` from `ui.selection.getRects` /
   * `ui.selection.getAnchorRect` to anchor floating UI to the painted
   * selection without consumers reaching for `window.getSelection()`
   * (which reads from the offscreen ProseMirror DOM and returns the
   * wrong coordinates). Optional in the structural typing to keep
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
    getSelectionRects?(relativeTo?: HTMLElement): Array<{
      pageIndex: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    }>;
    getRangeRects?(
      from: number,
      to: number,
      relativeTo?: HTMLElement,
    ): Array<{
      pageIndex: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    }>;
    /**
     * Painted-DOM host element. `ui.viewport.entityAt` reads it to
     * confirm the hit returned by `document.elementFromPoint` lives
     * inside this controller's editor — without that scope check, a
     * page mounting two SuperDoc instances would return entity ids
     * from the wrong instance.
     */
    visibleHost?: HTMLElement;
  } | null;
}

/**
 * The unified UI state model.
 *
 * Read individual fields via {@link SuperDocUI.select} or pull whole
 * slices through the domain handles (`ui.selection.subscribe`,
 * `ui.comments.subscribe`, etc.). Each slice is memoized so a typing
 * only transaction (which leaves selection / comments / track-changes
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
  /**
   * Document-level slice exposed on `state.document` (SD-2816). Sugar
   * over the top-level `ready` and `documentMode` fields so a single
   * subscription drives the document-bar / Export button / mode
   * toggle. Kept minimal: dirty-tracking is a follow-up because
   * SuperDoc has no host-side dirty primitive today.
   */
  document: DocumentSlice;
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
   * Tracked-changes slice. Items + activeId for the tracked-changes
   * sidebar pattern. Cached at controller level alongside the comments
   * slice; refreshes on tracked-change events.
   */
  trackChanges: TrackChangesSlice;
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
   *   editor.doc.insert({ target: selectionTarget, value: 'Hello', type: 'text' });
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
   * tracks this. Until it lands, consumers building Custom UI on top of
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
   * `state.trackChanges.activeId` (which picks the first id) for
   * consumers that want the full set.
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
 * One tracked-change item exposed on `state.trackChanges.items`.
 *
 * Mirrors `editor.doc.trackChanges.list()` output (one entry per
 * change). UIs that want a merged comments-and-changes sidebar
 * compose their own feed from `ui.comments.items` and
 * `ui.trackChanges.items`.
 */
export interface TrackChangesItem {
  /** Tracked-change id. */
  id: string;
  /** Full change record from `editor.doc.trackChanges.list()`. */
  change: import('@superdoc/document-api').TrackChangesListResult['items'][number];
}

/**
 * Snapshot of the tracked-changes feed exposed on `state.trackChanges`.
 *
 * `editor.doc.trackChanges.list()` returns items in PM-position order;
 * `items` mirrors that order so next/previous navigation tracks the
 * document.
 */
export interface TrackChangesSlice {
  /** Tracked changes in document order. */
  items: TrackChangesItem[];
  /** Convenience count of `items.length`. */
  total: number;
  /**
   * The currently active change id. Driven by selection
   * (`activeChangeIds[0]`) plus `ui.trackChanges.next/previous/
   * scrollTo` calls. `null` when nothing is focused.
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
   * Tracked-changes domain. Accept/reject and navigation over the
   * tracked-change list. Mirrors `editor.doc.trackChanges` for verbs;
   * `next/previous/scrollTo` are UI-only navigation helpers. UIs that
   * want a merged comments-and-changes sidebar compose
   * `ui.comments.items` and `ui.trackChanges.items` themselves.
   */
  trackChanges: TrackChangesHandle;

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
   * Document domain. Session-level operations a custom toolbar
   * needs (Export DOCX, document-mode toggle, ready state, unsaved-
   * changes indicator). Sugar over `state.document` plus passthroughs
   * to the host SuperDoc instance's `setDocumentMode` / `export` /
   * `replaceFile`. Lifts the operations that previously forced
   * consumers to wire a separate "host" hook through their React
   * context just so a toolbar button could call `superdoc.export(...)`.
   * The slice's `dirty` flag is transaction-driven and cleared on a
   * successful `export` or `replaceFile`; see {@link DocumentSlice}.
   */
  document: DocumentHandle;

  /**
   * Create a {@link SuperDocUIScope} for collecting subscriptions,
   * custom-command registrations, and DOM listeners under one
   * lifecycle. Calling `ui.destroy()` cascades into every live scope
   * before tearing down the controller's own resources, so a typical
   * non-React consumer needs only `scope.destroy()` (or just
   * `ui.destroy()`) to clean up.
   */
  createScope(): SuperDocUIScope;

  /**
   * Tear down all internal subscriptions to the editor / SuperDoc
   * instance / presentation editor, plus every scope created via
   * {@link SuperDocUI.createScope}. After destroy, no listeners will
   * fire and `select(...)` should not be called.
   */
  destroy(): void;
}

/**
 * Lifecycle helper returned by {@link SuperDocUI.createScope}.
 *
 * Collects subscription unsubscribes, custom-command registrations,
 * and DOM event listeners under a single tear-down call. Calling
 * `ui.destroy()` automatically destroys every live scope first, so
 * consumers can either call `scope.destroy()` themselves on unmount /
 * HMR or rely on the cascade.
 *
 * Post-destroy semantics (idempotent: calling `destroy()` twice is
 * a no-op):
 * - `add(teardown)` invokes the teardown synchronously.
 * - `on(target, type, listener)` is a no-op; the listener is never
 *   installed.
 * - `register(registration)` throws.
 * - `child()` returns an already-destroyed scope.
 */
export interface SuperDocUIScope {
  /**
   * Add a teardown function. Typically the unsubscribe returned by a
   * domain handle's `subscribe()` / `observe()` call:
   *
   * ```ts
   * scope.add(ui.commands.bold.observe((state) => render(state)));
   * scope.add(ui.comments.subscribe(({ snapshot }) => renderList(snapshot)));
   * ```
   *
   * Calling `add` after `destroy` invokes the teardown immediately:
   * the canonical caller has already executed the side-effecting
   * subscribe call, so running the unsubscribe right away matches
   * what a `try { ... } finally { off(); }` pattern would do.
   */
  add(teardown: () => void): void;

  /**
   * Register a custom toolbar command. Returns the full
   * {@link CustomCommandRegistrationResult} so consumers retain access
   * to `handle.observe(...)` and `invalidate()`. The scope retains
   * the `unregister()` callback and runs it when the scope is
   * destroyed; consumers may still call `result.unregister()`
   * manually before that, which is idempotent on the registry side.
   *
   * Throws when called on a destroyed scope. A register-then-unregister
   * cycle would still fire the registry's invalidation paths and any
   * collision-warning hooks, so we surface the lifecycle error
   * explicitly instead of swallowing it.
   */
  register<TPayload = void, TValue = unknown>(
    registration: CustomCommandRegistration<TPayload, TValue>,
  ): CustomCommandRegistrationResult<TPayload, TValue>;

  /**
   * Add a DOM event listener. Calls `target.addEventListener(type,
   * listener, options)` and queues a `removeEventListener` with the
   * same arguments for scope teardown. No-op when called on a
   * destroyed scope.
   */
  on(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ): void;

  /**
   * Create a child scope. Destroying the parent destroys every child
   * first; child scopes share the controller's command registry so
   * `child.register(...)` registers against the same surface as
   * `ui.commands.register(...)`. Returns an already-destroyed scope
   * when called on a destroyed parent.
   */
  child(): SuperDocUIScope;

  /**
   * Tear down every collected teardown and child scope. Idempotent.
   * Errors thrown by individual teardowns are caught and logged to
   * `console.error`; one failure does not prevent the rest from
   * running.
   */
  destroy(): void;

  /** True after {@link destroy} has been called. */
  readonly destroyed: boolean;
}

/**
 * Document slice exposed on `state.document` and through
 * {@link DocumentHandle}.
 *
 * Mirrors the `ready` / `documentMode` top-level fields as a single
 * memoized object so a Document Bar / Export button / mode toggle can
 * subscribe once instead of subscribing to two separate substrate
 * selectors.
 */
export interface DocumentSlice {
  /** True when SuperDoc has an active editor mounted. */
  ready: boolean;
  /** Mirror of `superdoc.config.documentMode`. */
  mode: 'editing' | 'suggesting' | 'viewing' | null;
  /**
   * True when the document has unsaved changes. Flips to `true` on any
   * editor transaction that mutates the document (`tr.docChanged`).
   * Selection-only transactions (cursor moves, range adjustments) do
   * not flip the flag.
   *
   * Cleared back to `false` when:
   * - `ui.document.export(...)` resolves successfully, or
   * - `ui.document.replaceFile(...)` swaps the document.
   *
   * Undo-to-clean is not tracked: hitting undo until the document
   * matches its on-open state still reads as dirty. Apps that need
   * the Word/GDocs-style "no unsaved changes" semantics should layer
   * their own edit-count diff on top.
   */
  dirty: boolean;
}

/**
 * Input shape for {@link DocumentHandle.export}. Mirrors the public
 * `SuperDoc.export()` signature from the superdoc package; declared
 * here on the controller so consumers don't have to import the host
 * type to type their Export button. Every field is optional and the
 * runtime defaults match `SuperDoc.export()`.
 */
export interface DocumentExportInput {
  /**
   * Output formats. `['docx']` (default) downloads the active document
   * as DOCX. Multiple formats produce a zip.
   */
  exportType?: string[];
  /**
   * How comments are written to the export. `'external'` (default)
   * preserves comments as Word-style comment nodes; `'internal'` keeps
   * them on the SuperDoc internal channel; `'clean'` strips comments
   * from the export.
   */
  commentsType?: 'internal' | 'external' | 'clean';
  /** Override the default document title used as the file name. */
  exportedName?: string;
  /** Additional binary blobs to bundle with the export (zipped). */
  additionalFiles?: unknown[];
  /** File names paired with `additionalFiles` (same length). */
  additionalFileNames?: string[];
  /**
   * When true, accepted/rejected tracked changes are flattened into
   * the export so the recipient sees the final document instead of
   * the working copy with revision history.
   */
  isFinalDoc?: boolean;
  /**
   * When true (default), the browser triggers a download for the
   * resulting blob; when false, the blob is returned for the consumer
   * to handle (upload, preview, attach, etc.).
   */
  triggerDownload?: boolean;
  /**
   * Optional CSS color for highlighting form fields in the export.
   * `null` (default) leaves fields unhighlighted.
   */
  fieldsHighlightColor?: string | null;
}

/**
 * Document domain handle exposed on `ui.document`. Snapshot +
 * subscription mirror the other domain handles; `setMode` and
 * `export` are imperative passthroughs to the host. Construction is
 * cheap: every method routes through the controller's existing
 * substrate / host references, no new caching needed.
 */
export interface DocumentHandle {
  /** Snapshot the current document slice synchronously. */
  getSnapshot(): DocumentSlice;
  /**
   * Subscribe to document-slice changes. Listener fires once
   * synchronously with the current snapshot, then again whenever
   * `ready` or `mode` changes by shallow equality. Returns an
   * unsubscribe.
   */
  subscribe(listener: (event: { snapshot: DocumentSlice }) => void): () => void;
  /**
   * Value-shaped alias of {@link subscribe}: listener receives the
   * snapshot directly instead of an event wrapper. Matches the
   * per-command `observe(state => ...)` shape on
   * {@link CommandHandle.observe}, so a single listener style works
   * across the whole controller surface. Same emission semantics as
   * `subscribe`: fires once synchronously, then on shallow-equality
   * change. Returns an unsubscribe.
   */
  observe(listener: (snapshot: DocumentSlice) => void): () => void;
  /**
   * Set the document mode. Routes through `superdoc.setDocumentMode`
   * which fires the existing `document-mode-change` event and updates
   * the per-editor mode. No-op when the host stub omits the setter
   * (e.g. SSR / non-browser test stubs).
   */
  setMode(mode: 'editing' | 'suggesting' | 'viewing'): void;
  /**
   * Export the document. Routes through `superdoc.export(options)`
   * with the same defaults as the host method (DOCX, external
   * comments, browser-triggered download). Returns the resulting
   * blob (or zip) when `triggerDownload: false`, or `undefined`
   * when the download was triggered. Rejects if the host's export
   * fails; consumers should wrap their toolbar Export button in a
   * try/catch and surface the error inline.
   */
  export(options?: DocumentExportInput): Promise<unknown>;
  /**
   * Replace the current document file. Routes through
   * `superdoc.activeEditor.replaceFile(file)` and re-emits
   * `commentsLoaded` once the swap completes so consumers running
   * `modules.comments: false` (SD-2839) still see imported comments
   * refresh in `ui.comments`. Resolves when the swap and the
   * post-swap event have both fired. Rejects if the host has no
   * active editor or the engine swap throws.
   */
  replaceFile(file: File): Promise<void>;
}

/**
 * Selection domain handle exposed on `ui.selection`. Same shape as
 * `CommentsHandle` / `TrackChangesHandle`: snapshot + subscription. Mirrors
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
   * Value-shaped alias of {@link subscribe}: listener receives the
   * snapshot directly. See {@link DocumentHandle.observe} for why
   * this exists alongside `subscribe`.
   */
  observe(listener: (snapshot: SelectionSlice) => void): () => void;
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
   * Pair with {@link restore} to put the visible selection back when
   * the composer closes.
   */
  capture(): SelectionCapture | null;
  /**
   * Look up the painted rectangles of the current selection (or a
   * captured one) in viewport coordinates.
   *
   * SuperDoc renders the visible page through the layout engine, not
   * the hidden ProseMirror DOM. `window.getSelection().getRangeAt(0)
   * .getBoundingClientRect()` reads from the offscreen PM and returns
   * coordinates that don't match what the user sees — every consumer
   * who reaches for it ships a broken bubble menu. This method asks
   * the painter directly so the rects align with what's painted.
   *
   * Multi-line selections produce one rect per painted line in
   * document order. Empty selections, no-editor state, or captures
   * whose target no longer resolves return `[]`.
   *
   * Pass a `SelectionCapture` (from {@link capture}) to query rects
   * for a frozen selection — useful when a composer has stolen focus
   * and the editor's live selection is gone but you still want to
   * position UI relative to where the user originally selected.
   *
   * The live path (no capture) handles all surfaces — body, header,
   * footer, footnote, endnote — because `PresentationEditor` routes
   * selection-rect lookups through its currently active editor.
   *
   * The captured path resolves block ids against the currently routed
   * editor, so captures taken in a non-body story still produce the
   * right rects while the user remains in that story (the common case
   * for a bubble menu or composer that opens a sidebar). When focus
   * has moved to a different story (or the body) by call time, the
   * captured block ids no longer resolve and the call returns `[]`
   * rather than rects from the wrong surface — fully cross-surface
   * captured rects need a story-keyed lookup that doesn't yet exist
   * publicly on `PresentationEditor`.
   */
  getRects(capture?: SelectionCapture | null): ViewportRect[];
  /**
   * Single anchor rect for floating UI (bubble menu, link popover,
   * mention list). Sugar over {@link getRects}: returns the first
   * line rect when `placement` is `'start'` (default), the last when
   * `'end'`, or the union bounding box across all line rects when
   * `'union'`. Returns `null` when there are no rects.
   */
  getAnchorRect(options?: SelectionAnchorRectOptions, capture?: SelectionCapture | null): ViewportRect | null;
  /**
   * Inverse of {@link capture}. Set the editor's visible selection to
   * the range a capture froze. Closes the round-trip a sidebar
   * composer needs: capture on open, post on submit, restore on close
   * so the user sees the editor with the same range highlighted.
   *
   * Returns a result object rather than `void` because captures go
   * stale: an edit between capture-time and call-time can move or
   * delete the captured block, the editor can switch into viewing
   * mode, or the captured target may have been a non-text selection
   * with no addressable range. The `reason` discriminator lets
   * consumers distinguish "the editor hasn't mounted yet" from "the
   * doc has changed under us" without inspecting state separately.
   *
   * Side effect: a successful restore also moves browser focus into
   * the editor's painted host (via the underlying `setTextSelection`
   * command). That is the right behavior for the canonical composer
   * flow — the user submits and expects to keep typing — but it does
   * mean callers triggering `restore` from contexts where focus
   * shouldn't move (e.g. a "preview" toggle that should leave focus
   * on a sidebar control) need to gate the call themselves.
   *
   * Cross-surface limitation: a capture taken in a header / footer /
   * footnote / endnote restores correctly while the user remains in
   * that story (the routed editor still owns the captured block ids).
   * Once focus has moved to the body, the routed editor falls back
   * and the captured non-body block ids no longer resolve there;
   * `restore` returns `{ success: false, reason: 'stale' }` rather
   * than placing the selection on the wrong surface. Same posture as
   * {@link getRects}.
   */
  restore(capture: SelectionCapture): SelectionRestoreResult;
}

/**
 * Result of {@link SelectionHandle.restore}.
 *
 * `'not-ready'` — no editor mounted (SSR, post-destroy).
 * `'read-only'` — editor is in viewing mode; selection mutation refused.
 * `'missing-target'` — capture had no addressable text target.
 * `'stale'` — captured block ids don't resolve in the current document
 * (the doc was edited or swapped between capture and restore).
 */
export type SelectionRestoreResult =
  | { success: true }
  | { success: false; reason: 'not-ready' | 'read-only' | 'missing-target' | 'stale' };

/**
 * Options for {@link SelectionHandle.getAnchorRect}.
 */
export interface SelectionAnchorRectOptions {
  /**
   * Which line of a multi-line selection to anchor to.
   *
   * - `'start'` (default): top-most line. Matches Word / Google Docs
   *    bubble menu placement.
   * - `'end'`: bottom-most line. Useful when the popover lives below.
   * - `'union'`: bounding rect across every line. Useful for selection
   *    overlays / shaded backgrounds.
   */
  placement?: 'start' | 'end' | 'union';
}

/**
 * Frozen snapshot returned by {@link SelectionHandle.capture}.
 *
 * Same shape as {@link SelectionSlice}; declared as its own type
 * so consumers can name the captured value in their component
 * state (`useState<SelectionCapture | null>(null)`) and so
 * {@link SelectionHandle.restore} has a stable input type.
 *
 * The runtime value is recursively `Object.freeze`d, so assigning
 * into `captured.target.segments[0].range.start` or
 * `captured.activeMarks[0]` throws in strict mode. We do NOT
 * encode that as a `readonly` type because the canonical use case
 * is passing `captured.target` straight to `editor.doc.*`
 * operations whose parameters are typed as mutable shapes (the
 * doc-api doesn't mutate them, but its types don't say `readonly`).
 * Adding `readonly` here would force a cast at every doc-api
 * boundary; the runtime guard plus this JSDoc carry the "do not
 * mutate" contract instead.
 */
export type SelectionCapture = SelectionSlice;

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
   * Value-shaped alias of {@link subscribe}: listener receives the
   * snapshot directly. See {@link DocumentHandle.observe} for why
   * this exists alongside `subscribe`.
   */
  observe(listener: (snapshot: ToolbarSnapshotSlice) => void): () => void;
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

  /**
   * Returns `true` when `id` is currently registered: a built-in
   * (member of `BUILT_IN_COMMAND_IDS`) or a custom registered via
   * {@link CommandsHandle.register}. Returns `false` for unknown
   * strings, including custom ids that have been unregistered.
   *
   * Use to validate config-driven toolbars at startup. The runtime
   * lookup `ui.commands.get(id)` returns `undefined` for unknown ids
   * silently; `has` makes the check explicit and short.
   */
  has(id: string): boolean;

  /**
   * Like {@link CommandsHandle.get} but throws when `id` is not
   * registered. Use at trusted dispatch sites where an unknown id
   * indicates a bug, not a user error: keyboard shortcut routers,
   * tests, internal command pipelines.
   */
  require(id: string): DynamicCommandHandle;

  /**
   * Collect the right-click context-menu items contributed by custom
   * commands, filtered by their `when` predicate and sorted by
   * `(group, order, registration time)`. Returns `[]` when no
   * registered command carries a `contextMenu` field or none survives
   * the predicate.
   *
   * The consumer renders the menu themselves. The typical flow:
   *
   * ```ts
   * scope.on(editorHost, 'contextmenu', (event) => {
   *   event.preventDefault();
   *   const entities = ui.viewport.entityAt({ x: event.clientX, y: event.clientY });
   *   const items = ui.commands.getContextMenuItems({ entities });
   *   renderMenu(items, event.clientX, event.clientY);
   * });
   * ```
   *
   * `entities` defaults to `[]` so menus that aren't point-anchored
   * (keyboard shortcut, app-bar trigger) still resolve a useful
   * subset. The current selection slice is read from controller state
   * automatically.
   *
   * Built-in items are NOT in this list: SuperDoc's built-in
   * context-menu extension still owns Bold / Italic / Copy / Paste
   * when enabled. This surface exists for apps that disable that
   * extension (`disableContextMenu: true`) and roll their own menu —
   * built-in entries belong to the consumer's renderer at that point.
   */
  getContextMenuItems(input?: { entities?: ViewportEntityHit[] }): ContextMenuItem[];
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
   * Execute the command. Receives:
   *
   * - `payload` (typed per registration),
   * - the host `superdoc` instance, and
   * - the routed `editor` — the same editor `ui.commands.*` mutations
   *   target. Use `editor.doc.*` for direct Document API access without
   *   reaching `superdoc.activeEditor`. `editor` is `null` before the
   *   editor has reported ready, so guard early.
   *
   * Return value is normalized to `boolean` for the synchronous result;
   * async commands return a Promise the runtime awaits internally.
   */
  execute: (args: {
    payload?: TPayload;
    superdoc: SuperDocLike;
    editor: SuperDocEditorLike | null;
  }) => boolean | void | Promise<boolean | void>;
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
  /**
   * Optional contribution to the right-click context menu. When set,
   * the command shows up in {@link CommandsHandle.getContextMenuItems}
   * results (filtered by `when`) so a custom context-menu UI can
   * render and dispatch it. Consumers using SuperDoc's built-in
   * context-menu extension keep using that — this surface is for
   * apps that turn the built-in off (`disableContextMenu`) and roll
   * their own menu without losing the contribution model.
   */
  contextMenu?: ContextMenuContribution;
};

/**
 * Right-click context-menu contribution attached to a custom command.
 *
 * The consumer renders the menu themselves; SuperDoc just collects the
 * items, applies `when`, and sorts. Click handling stays on the
 * consumer's side and dispatches via `ui.commands.get(id).execute()`.
 */
export interface ContextMenuContribution {
  /** Display label for the item. */
  label: string;
  /**
   * Logical group for sorting. Lets a contribution slot next to
   * related built-ins. Custom group names are accepted; unknown groups
   * are placed after the built-in groups in registration order. Built-in
   * group ids: `'format'`, `'clipboard'`, `'review'`, `'comment'`,
   * `'link'`.
   */
  group?: string;
  /**
   * Sort order within the group. Lower runs earlier. Defaults to `0`;
   * ties are broken by registration order so the rendered menu is
   * stable across snapshots.
   */
  order?: number;
  /**
   * Predicate scoping the item to specific contexts (the click landed
   * on a tracked change, the selection is non-empty, etc.). Receives
   * the entities under the click coordinate (call
   * {@link ViewportHandle.entityAt} to populate them) and the current
   * selection slice. Omitted predicate means "always applicable".
   *
   * Errors thrown from `when` are caught and the item is hidden for
   * that query — same posture as `getState` on a custom command.
   */
  when?: (input: ContextMenuWhenInput) => boolean;
}

/** Input passed to {@link ContextMenuContribution.when}. */
export interface ContextMenuWhenInput {
  /**
   * Entities under the right-click point, from
   * {@link ViewportHandle.entityAt}. Empty array when the consumer
   * didn't pass entities (e.g. the menu opens from a keyboard shortcut
   * rather than a click) or when the point is over no painted entity.
   */
  entities: ViewportEntityHit[];
  /** Current selection slice. Mirrors `state.selection`. */
  selection: SelectionSlice;
}

/**
 * One item returned by {@link CommandsHandle.getContextMenuItems}.
 *
 * The `id` matches a registered custom command; consumers dispatch on
 * click via `ui.commands.get(item.id).execute()`. `group` and `order`
 * are surfaced (rather than collapsed) so the consumer's renderer can
 * insert separators between groups.
 */
export interface ContextMenuItem {
  id: string;
  label: string;
  group: string;
  order: number;
}

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
   * Value-shaped alias of {@link subscribe}: listener receives the
   * snapshot directly. See {@link DocumentHandle.observe} for why
   * this exists alongside `subscribe`.
   */
  observe(listener: (snapshot: CommentsSlice) => void): () => void;
  /**
   * Create a comment anchored to the current selection. Reads the
   * routed editor's `selection.current().target` and routes through
   * `editor.doc.comments.create`. Returns the operation receipt.
   */
  createFromSelection(input: { text: string }): import('@superdoc/document-api').Receipt;
  /**
   * Create a comment anchored to a captured selection snapshot.
   * Use when the live selection is gone by the time the user submits
   * (the canonical case: a composer textarea takes focus, the editor
   * loses its visible selection, and `createFromSelection` would see
   * a null target). Capture the selection at composer-open via
   * `ui.selection.capture()`, hold it across the user's typing, then
   * pass it here. Routes through `editor.doc.comments.create` with
   * the captured `target`. Returns a `NO_OP` receipt when the capture
   * lacks a positional target.
   */
  createFromCapture(capture: SelectionCapture, input: { text: string }): import('@superdoc/document-api').Receipt;
  /**
   * Post a reply to an existing thread. Routes through
   * `editor.doc.comments.create({ parentCommentId, text })`; the
   * reply inherits the parent's anchor, so callers don't pass a
   * target. The next `useSuperDocComments()` snapshot includes the
   * reply with `parentCommentId` set, which sidebars can group under
   * the thread root.
   *
   * Returns a `NO_OP` receipt when `text` is empty or whitespace-only,
   * matching the doc-api's text-required contract for top-level
   * comments. Returns a failure receipt when the parent id has been
   * deleted between the time the user opened the reply composer and
   * pressed Send.
   */
  reply(parentCommentId: string, input: { text: string }): import('@superdoc/document-api').Receipt;
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
 * Tracked-changes domain handle exposed on `ui.trackChanges`. Same
 * architectural posture as `CommentsHandle`: every mutation routes
 * through `editor.doc.trackChanges.*` (the Document API contract);
 * `next` / `previous` / `scrollTo` are UI-only navigation helpers.
 */
export interface TrackChangesHandle {
  /** Snapshot the tracked-changes feed synchronously. */
  getSnapshot(): TrackChangesSlice;
  /**
   * Subscribe to track-changes snapshot updates (items, total,
   * activeId). Listener fires once synchronously with the current
   * snapshot, then again whenever the slice changes by shallow
   * equality. Returns an unsubscribe.
   */
  subscribe(listener: (event: { snapshot: TrackChangesSlice }) => void): () => void;
  /**
   * Value-shaped alias of {@link subscribe}: listener receives the
   * snapshot directly. See {@link DocumentHandle.observe} for why
   * this exists alongside `subscribe`.
   */
  observe(listener: (snapshot: TrackChangesSlice) => void): () => void;
  /** Accept a single tracked change via `trackChanges.decide`. */
  accept(changeId: string): import('@superdoc/document-api').Receipt;
  /** Reject a single tracked change via `trackChanges.decide`. */
  reject(changeId: string): import('@superdoc/document-api').Receipt;
  /** Accept every tracked change via `trackChanges.decide({ scope: 'all' })`. */
  acceptAll(): import('@superdoc/document-api').Receipt;
  /** Reject every tracked change via `trackChanges.decide({ scope: 'all' })`. */
  rejectAll(): import('@superdoc/document-api').Receipt;
  /**
   * Move `activeId` to the next tracked change in document order.
   * Wraps to the first item past the last. Returns the new active
   * id, or `null` when there are no changes.
   */
  next(): string | null;
  /**
   * Move `activeId` to the previous tracked change in document order.
   * Wraps to the last item past the first. Returns the new active id,
   * or `null` when there are no changes.
   */
  previous(): string | null;
  /**
   * Scroll the viewport to the given tracked change and set it as
   * `activeId`. Routes through
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
  /**
   * Look up entities painted under a viewport coordinate. Used by
   * right-click menus and hover tooltips to ask "what's at this point?"
   * without consumers reading `data-track-change-id` /
   * `data-comment-ids` off the painted DOM themselves; the
   * data-attribute layout is an implementation detail of the painter
   * that consumers shouldn't depend on.
   *
   * Returns an ordered array of {@link ViewportEntityHit}, innermost
   * first. A point can sit inside several entities at once (a tracked
   * change inside a comment highlight, for example); every match is
   * surfaced, not just the topmost. Empty array when the point isn't
   * over any painted entity, when called outside a browser, or when no
   * editor is mounted.
   *
   * Scoped to the controller's own editor: hits are only returned when
   * the point lands inside this editor's painted host. A page mounting
   * two SuperDoc instances therefore can't have one controller return
   * ids from the other's DOM, and post-destroy calls return `[]`
   * rather than stale ids from cached painted nodes.
   *
   * Today the supported entity types are `comment` and `trackedChange`.
   * `link`, `image`, and `tableCell` are reserved for follow-ups;
   * adding them is purely additive (new union members), so callers can
   * `switch` on `hit.type` and the default branch remains forward
   * compatible.
   */
  entityAt(input: ViewportEntityAtInput): ViewportEntityHit[];
}

/**
 * Input shape for {@link ViewportHandle.entityAt}. Coordinates are
 * viewport-relative (the same space `MouseEvent.clientX` /
 * `clientY` produce, and the same space {@link ViewportRect} reports
 * back), so a `contextmenu` handler can pass `event.clientX` /
 * `event.clientY` directly.
 */
export interface ViewportEntityAtInput {
  x: number;
  y: number;
}

/**
 * One hit returned by {@link ViewportHandle.entityAt}.
 *
 * The union is intentionally narrow today (`comment` /
 * `trackedChange`); other entity types land via additive union
 * members so a `switch` on `hit.type` with a default branch stays
 * forward compatible.
 */
export type ViewportEntityHit = { type: 'comment'; id: string } | { type: 'trackedChange'; id: string };
