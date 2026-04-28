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
  /**
   * Optional setter for documentMode. Used by `ui.review.setRecording`
   * as the temporary path until S4 ships an independent
   * `trackChanges.setRecording` primitive.
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
    /** Ranges member on the Document API. Used for `ui.comments.scrollTo`. */
    ranges?: {
      scrollIntoView?(input: unknown): Promise<unknown>;
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
   * 'active' })`. Currently throws `INVALID_INPUT` on the doc-API
   * because the patch input only accepts `'resolved'`; SD-2789 adds
   * the lifecycle inverse and reroutes this method to succeed.
   */
  reopen(commentId: string): import('@superdoc/document-api').Receipt;
  /** Delete a comment via `editor.doc.comments.delete`. */
  delete(commentId: string): import('@superdoc/document-api').Receipt;
  /**
   * Scroll the viewport to the comment's anchor via
   * `editor.doc.ranges.scrollIntoView({ target: EntityAddress })`.
   * Resolves to the receipt the doc-API returns.
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
   * `editor.doc.ranges.scrollIntoView({ target: EntityAddress })`.
   */
  scrollTo(id: string): Promise<import('@superdoc/document-api').ScrollIntoViewOutput>;
  /**
   * Toggle tracked-changes recording. Today flips
   * `superdoc.config.documentMode` between `'suggesting'` and
   * `'editing'`; SD-2667's S4 follow-up will decouple recording from
   * view mode and this routes through the new primitive once
   * available.
   */
  setRecording(enabled: boolean): void;
}
