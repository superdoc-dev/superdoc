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
  /**
   * Toggle tracked-changes recording. Today flips
   * `superdoc.config.documentMode` between `'suggesting'` and
   * `'editing'`; SD-2667's S4 follow-up will decouple recording from
   * view mode and this routes through the new primitive once
   * available.
   */
  setRecording(enabled: boolean): void;
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
   * The thing to look up. Same target shapes as `viewport.scrollIntoView`:
   *   - `EntityAddress` (comment / tracked change by id)
   *   - `TextAddress` (single-block text range) — deferred
   *   - `TextTarget` (multi-segment text target) — deferred
   *
   * The text-anchored paths land in a follow-up to keep this PR small;
   * the union is widened in the type so consumers can author future-
   * compatible call sites today.
   */
  target:
    | import('@superdoc/document-api').EntityAddress
    | import('@superdoc/document-api').TextAddress
    | import('@superdoc/document-api').TextTarget;
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
