import { createHeadlessToolbar } from '../headless-toolbar/index.js';
import { resolveToolbarSources } from '../headless-toolbar/resolve-toolbar-sources.js';
import { createToolbarRegistry } from '../headless-toolbar/toolbar-registry.js';
import type {
  HeadlessToolbarController,
  HeadlessToolbarSuperdocHost,
  PublicToolbarItemId,
  ToolbarSnapshot,
} from '../headless-toolbar/types.js';
import type {
  CommentsListResult,
  Receipt,
  ScrollIntoViewInput,
  ScrollIntoViewOutput,
  TrackChangesListResult,
} from '@superdoc/document-api';
import { shallowEqual } from './equality.js';
import { scrollRangeIntoView } from './scroll-into-view.js';
import { createCustomCommandsRegistry } from './custom-commands.js';
import type {
  CommandHandle,
  CommandsHandle,
  CommentsHandle,
  DocumentExportInput,
  DocumentHandle,
  DocumentSlice,
  DynamicCommandHandle,
  EqualityFn,
  ReviewHandle,
  ReviewItem,
  ReviewSlice,
  SelectionHandle,
  SelectionSlice,
  SelectorFn,
  SuperDocEditorLike,
  SuperDocUI,
  SuperDocUIOptions,
  SuperDocUIState,
  Subscribable,
  ToolbarCommandHandleState,
  ToolbarHandle,
  ToolbarSnapshotSlice,
  UIToolbarCommandState,
  ViewportGetRectInput,
  ViewportHandle,
  ViewportRect,
  ViewportRectResult,
} from './types.js';

/**
 * Source events the controller listens to today. Domain tickets may
 * widen this list as they land — the only invariant is that every
 * event listed here triggers at most one snapshot rebuild per
 * microtask via {@link scheduleNotify}.
 *
 * Multiple internal event names exist for the same domain (e.g.
 * `commentsUpdate`, `commentsLoaded`, `comment-positions`); the
 * controller normalizes them all into a single state-change signal so
 * consumers never see editor-internal vocabulary.
 */
const EDITOR_EVENTS = [
  'transaction',
  'selectionUpdate',
  'commentsUpdate',
  'commentsLoaded',
  'comment-positions',
  'tracked-changes-changed',
] as const;

/**
 * Editor events that should trigger a refresh of the cached
 * `comments.list()` / `trackChanges.list()` results before notifying
 * subscribers. The base `EDITOR_EVENTS` list also fires
 * `scheduleNotify` for these, but we need the cache invalidation to
 * happen *first* so `computeState()` sees fresh items.
 *
 * `tracked-changes-changed` is the canonical broadcast emitted by the
 * tracked-change index whenever a transaction adds, removes, or
 * invalidates tracked changes (including remote / collaborator-driven
 * mutations). Without it, the cache only refreshes when the
 * controller's own action methods call `refreshAndNotify`, leaving
 * `ui.review` subscribers stale after normal editing.
 */
const LIST_REFRESH_EVENTS = ['commentsUpdate', 'commentsLoaded', 'tracked-changes-changed'] as const;

const SUPERDOC_EVENTS = ['editorCreate', 'document-mode-change', 'zoomChange'] as const;

/**
 * Presentation-editor events the controller listens to. These signal
 * routing changes (the user moved focus into a header/footer/note) and
 * presentation-layer mutations that don't surface as `transaction` on
 * the body editor. Mirrors the `subscribe-toolbar-events` set so the
 * toolbar registry's snapshot rebuilds and the unified UI state
 * recompute on the same triggers.
 */
const PRESENTATION_EVENTS = [
  'headerFooterEditingContext',
  'headerFooterUpdate',
  'headerFooterTransaction',
  'activeSurfaceChange',
  'historyStateChange',
] as const;

/** Default state for an unknown / missing toolbar command. */
const FALLBACK_COMMAND_STATE: ToolbarCommandHandleState<PublicToolbarItemId> = {
  active: false,
  disabled: true,
  value: undefined,
};

/**
 * Default state emitted from a {@link DynamicCommandHandle} when the
 * command has no entry in `state.toolbar.commands` yet (e.g. the
 * snapshot has not populated, or the command was unregistered between
 * subscribe and the first emit). Carries `source: 'built-in'` because
 * the dynamic handle for a built-in id reaches this branch only for
 * built-ins. Customs never produce `undefined` here (the registry's
 * computeStates always returns a state for every entry).
 */
const FALLBACK_DYNAMIC_STATE: UIToolbarCommandState = {
  active: false,
  disabled: true,
  value: undefined,
  source: 'built-in',
};

/**
 * Full set of registered toolbar command ids, used to seed the
 * internal `createHeadlessToolbar` call. Without this the controller
 * defaults to `commands = []`, leaving `snapshot.commands` empty and
 * every per-command observer (`ui.commands.bold.observe`) reporting
 * the fallback `{ active: false, disabled: true }` forever.
 *
 * Computed once at module load by walking the registry returned from
 * `createToolbarRegistry()`. Future custom-command registration
 * (FRICTION S3) will need to extend this dynamically.
 */
const ALL_TOOLBAR_COMMAND_IDS: PublicToolbarItemId[] = Object.keys(createToolbarRegistry()) as PublicToolbarItemId[];

/**
 * Frozen empty-array sentinel for `state.comments.activeIds` when
 * `selection.current()` predates SD-2792 (no `activeCommentIds`
 * field). Allocating a fresh `[]` per `computeState()` would change
 * the array reference every call and defeat `shallowEqual` on the
 * comments snapshot — every selection event would re-fire
 * `ui.comments.subscribe` even when nothing in the slice changed.
 */
const EMPTY_ACTIVE_IDS: readonly string[] = Object.freeze<string[]>([]);

/**
 * Recursive structural clone for `ui.selection.capture()` (SD-2821).
 * The captured handle is consumer-facing; it must not share array
 * or object references with the controller's memoized selection
 * slice. Without this, a `captured.target.segments[0].range.start =
 * 99` from consumer code would corrupt the shared snapshot every
 * other subscriber sees. JSON-clone is sufficient because the
 * selection slice is plain data (strings, numbers, booleans, null,
 * arrays, plain objects) with no functions, Dates, Maps, or cycles.
 */
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as object)) {
    out[key] = deepClone((value as Record<string, unknown>)[key]);
  }
  return out as T;
}

/**
 * Recursive `Object.freeze` for `ui.selection.capture()` (SD-2821).
 * `Object.freeze({ ...slice })` only freezes the top level; nested
 * arrays / objects (target, target.segments, activeMarks) stay
 * mutable. Walking the structure here makes
 * `captured.activeMarks.push(...)` and
 * `captured.target.segments[0].range.start = 99` throw in strict
 * mode, matching the public API's "captured handle is opaque"
 * promise. Cycle-safe: we check `Object.isFrozen(value)` before
 * recursing so already-frozen sentinels (e.g.
 * {@link EMPTY_ACTIVE_IDS}) don't loop back through this helper.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

/**
 * Resolve the **routed** editor — the body, header, footer, or note
 * editor that PresentationEditor currently routes input/selection to.
 * Falls back to `superdoc.activeEditor` when no presentation layer is
 * active (e.g., simple non-paginated mounts, server-side stubs in
 * tests).
 *
 * Reusing `resolveToolbarSources` keeps routing logic in one place;
 * the toolbar registry and the UI controller agree on which editor
 * owns the current selection at any moment.
 */
function resolveRoutedEditor(superdoc: SuperDocUIOptions['superdoc']): SuperDocEditorLike | null {
  try {
    const sources = resolveToolbarSources(superdoc as never);
    return (sources.activeEditor as unknown as SuperDocEditorLike | null) ?? null;
  } catch {
    return (superdoc.activeEditor ?? null) as SuperDocEditorLike | null;
  }
}

/**
 * Resolve the **host** (body) editor — the one that owns the document
 * scope. Always `superdoc.activeEditor`, never the routed
 * header/footer/note story editor.
 *
 * Document-wide operations (`trackChanges.decide`,
 * `presentation.navigateTo`, `presentation.scrollToPositionAsync`)
 * must run against the host so the adapter treats the body as the
 * scope and routes to the right story via the target's `story`
 * field. Calling these on a child story editor (when focus is in a
 * header/footer) would scope the decision/scroll to that story
 * instead of the document.
 */
function resolveHostEditor(superdoc: SuperDocUIOptions['superdoc']): SuperDocEditorLike | null {
  return (superdoc.activeEditor ?? null) as SuperDocEditorLike | null;
}

/**
 * Resolve the PresentationEditor (when one exists), so we can
 * subscribe to its events and re-route the active editor on surface
 * changes.
 */
function resolvePresentationEditor(superdoc: SuperDocUIOptions['superdoc']): {
  on?: (event: string, handler: (...args: unknown[]) => void) => unknown;
  off?: (event: string, handler: (...args: unknown[]) => void) => unknown;
} | null {
  try {
    const sources = resolveToolbarSources(superdoc as never);
    return (sources.presentationEditor as never) ?? null;
  } catch {
    return null;
  }
}

/**
 * Lift a {@link import('@superdoc/document-api').TextTarget} into the
 * {@link import('@superdoc/document-api').SelectionTarget} shape that
 * point/range Document API operations (`editor.doc.insert`,
 * `editor.doc.text.replace`, etc.) accept directly.
 *
 * - `null` in → `null` out (no selection means no insert anchor).
 * - Single-segment selection: start/end share `blockId`.
 * - Multi-segment selection: first segment supplies the start point,
 *   last segment the end point. Inner segments are dropped — they're
 *   reachable from the {start,end} pair via the same block traversal
 *   the doc-api adapter already does internally.
 * - `story` is preserved on every level (root, start, end). When the
 *   selection lives in a non-body story (header/footer/footnote/
 *   endnote) the doc-api routes mutations from the target's `story`
 *   field; dropping it here would silently route inserts into the
 *   body and either fail to resolve the block or edit the wrong
 *   story.
 *
 * The helper sits next to the controller so consumers don't have to
 * reach into a private adapter to convert. Doc-api ops will eventually
 * accept TextTarget directly (separate ticket); until then,
 * `selectionSlice.selectionTarget` is the consumer-facing shortcut.
 */
function textTargetToSelectionTarget(
  textTarget: import('@superdoc/document-api').TextTarget | null,
): import('@superdoc/document-api').SelectionTarget | null {
  if (!textTarget) return null;
  const segments = textTarget.segments;
  if (!segments || segments.length === 0) return null;
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  const story = (textTarget as { story?: import('@superdoc/document-api').SelectionTarget['story'] }).story;
  const start: import('@superdoc/document-api').SelectionPoint = story
    ? { kind: 'text', blockId: first.blockId, offset: first.range.start, story }
    : { kind: 'text', blockId: first.blockId, offset: first.range.start };
  const end: import('@superdoc/document-api').SelectionPoint = story
    ? { kind: 'text', blockId: last.blockId, offset: last.range.end, story }
    : { kind: 'text', blockId: last.blockId, offset: last.range.end };
  return story ? { kind: 'selection', start, end, story } : { kind: 'selection', start, end };
}

export function createSuperDocUI(options: SuperDocUIOptions): SuperDocUI {
  const { superdoc } = options;

  let destroyed = false;
  const stateChangeListeners = new Set<() => void>();
  const teardown: Array<() => void> = [];

  let scheduled = false;
  const scheduleNotify = () => {
    if (scheduled || destroyed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (destroyed) return;
      stateChangeListeners.forEach((listener) => {
        try {
          listener();
        } catch {
          // Subscriber errors do not propagate — one buggy listener
          // must not wedge the editor's event loop or block other
          // listeners. Same posture as the in-flight onChange
          // helpers in plan-engine wrappers.
        }
      });
    });
  };

  // Internal headless-toolbar instance. Feeds `state.toolbar` so
  // `ui.toolbar.subscribe` and `ui.commands.<id>.observe` ride the
  // same selector substrate as the rest of the controller. Per-command
  // state derivers in the registry are wrapped to default to disabled
  // on throw, so a partial editor never wedges snapshot construction.
  const toolbarController: HeadlessToolbarController = createHeadlessToolbar({
    superdoc: superdoc as unknown as HeadlessToolbarSuperdocHost,
    // Pass the full registry so snapshot.commands is populated for
    // every built-in command — without this `ui.commands.<id>.observe`
    // emits only the fallback disabled state.
    commands: ALL_TOOLBAR_COMMAND_IDS,
  });
  let toolbarSnapshot: ToolbarSnapshot = toolbarController.getSnapshot();
  const offToolbarSubscribe = toolbarController.subscribe(({ snapshot }) => {
    toolbarSnapshot = snapshot;
    scheduleNotify();
  });
  teardown.push(() => {
    offToolbarSubscribe();
    try {
      toolbarController.destroy();
    } catch {
      // best-effort
    }
  });

  // Custom-commands registry — built lazily so its hooks (scheduleNotify,
  // buildSubscribable, isBuiltIn) can reference the substrate primitives
  // declared further down. The actual registry instance is created after
  // `select` is in scope.
  const BUILT_IN_COMMAND_ID_SET: Set<string> = new Set(ALL_TOOLBAR_COMMAND_IDS);

  // Comments slice cache. `editor.doc.comments.list()` is O(N) and
  // re-running it on every `computeState()` would tax the hot path —
  // instead we cache the list result and refresh on `commentsUpdate` /
  // `commentsLoaded` editor events. `selection.current().activeCommentIds`
  // is read fresh in `computeState()` since it's already cheap (one
  // selection walk).
  const EMPTY_COMMENTS_LIST: CommentsListResult = {
    evaluatedRevision: '',
    total: 0,
    items: [],
    page: { limit: 0, offset: 0, returned: 0 },
  };
  let commentsListCache: CommentsListResult = EMPTY_COMMENTS_LIST;
  const refreshCommentsListCache = () => {
    const editor = resolveRoutedEditor(superdoc);
    const list = editor?.doc?.comments?.list;
    if (typeof list !== 'function') {
      commentsListCache = EMPTY_COMMENTS_LIST;
      return;
    }
    try {
      const result = list.call(editor.doc!.comments, undefined) as CommentsListResult | undefined;
      commentsListCache = result ?? EMPTY_COMMENTS_LIST;
    } catch {
      // Reset to empty rather than retaining the previous editor's
      // cache. During document / editor swaps the new editor can
      // throw transiently while initializing — keeping the prior
      // value would leak the old document's comments into the new
      // one's snapshot until the next successful refresh, which is a
      // worse failure mode than briefly rendering an empty list.
      commentsListCache = EMPTY_COMMENTS_LIST;
    }
  };
  refreshCommentsListCache();

  // Tracked-changes cache. Same posture as comments — refresh on
  // commentsUpdate / trackedChangesUpdate (track-changes events ride
  // commentsUpdate today; the controller normalizes that for callers).
  // `in: 'all'` is requested so non-body stories (header, footer,
  // footnote, endnote) are included in the merged review feed.
  const EMPTY_TRACK_CHANGES_LIST: TrackChangesListResult = {
    evaluatedRevision: '',
    total: 0,
    items: [],
    page: { limit: 0, offset: 0, returned: 0 },
  };
  let trackChangesListCache: TrackChangesListResult = EMPTY_TRACK_CHANGES_LIST;
  const refreshTrackChangesListCache = () => {
    const editor = resolveRoutedEditor(superdoc);
    const list = editor?.doc?.trackChanges?.list;
    if (typeof list !== 'function') {
      trackChangesListCache = EMPTY_TRACK_CHANGES_LIST;
      return;
    }
    try {
      const result = list.call(editor.doc!.trackChanges, { in: 'all' }) as TrackChangesListResult | undefined;
      trackChangesListCache = result ?? EMPTY_TRACK_CHANGES_LIST;
    } catch {
      // See refreshCommentsListCache rationale: cross-document leakage
      // would be worse than briefly empty.
      trackChangesListCache = EMPTY_TRACK_CHANGES_LIST;
    }
  };
  refreshTrackChangesListCache();

  /**
   * Internal `activeReviewId`. Mirrors selection-driven activity when
   * the user moves the cursor to a different review item, and is
   * updated by explicit `ui.review.next/previous/scrollTo` calls.
   * Tracked separately from `lastSelectionDrivenId` so explicit
   * navigation away from a still-selected item isn't immediately
   * overwritten by the next computeState() call.
   */
  let activeReviewId: string | null = null;
  /**
   * The selection-driven id observed during the last `computeState`.
   * Only when this changes between calls does the controller mirror
   * it onto `activeReviewId`; otherwise the user's `next() /
   * previous() / scrollTo()` choice persists across recomputes.
   */
  let lastSelectionDrivenId: string | null = null;

  /**
   * Memoized review slice. The merged-feed array is rebuilt only when
   * one of its inputs changes — comments items reference, tracked-
   * changes items reference, or `activeReviewId`. Without this,
   * shallowEqual on `state.review` would mismatch every keystroke
   * because we'd allocate a fresh items array per computeState.
   */
  let reviewMemo: {
    commentsRef: CommentsListResult['items'] | null;
    changesRef: TrackChangesListResult['items'] | null;
    activeId: string | null;
    slice: ReviewSlice;
  } | null = null;

  /**
   * Memoized selection slice. Slice identity is stable when the
   * derived shape — empty, target (deep), activeMarks, activeCommentIds,
   * activeChangeIds, quotedText — has not changed since the last
   * computeState. Without this, a typing-only transaction (which leaves
   * the projected SelectionInfo unchanged but allocates fresh arrays
   * inside the resolver) would re-fire every `ui.select(s => s.selection)`
   * subscriber per keystroke.
   */
  let selectionMemo: { key: string; slice: SelectionSlice } | null = null;

  /**
   * Memoized document slice. Object identity stable while `ready`
   * and `mode` are unchanged so `shallowEqual` on `state.document`
   * short-circuits subscribers (typing-only transactions don't move
   * either field, but they do trigger computeState rebuilds).
   */
  let documentMemo: { slice: DocumentSlice } | null = null;

  /**
   * Stable string key over a SelectionInfo for slice memoization. Two
   * infos producing the same key represent the same observable
   * selection state, so the slice can be reused.
   */
  const buildSelectionKey = (
    empty: boolean,
    target: import('@superdoc/document-api').TextTarget | null,
    activeMarks: string[],
    activeCommentIds: string[],
    activeChangeIds: string[],
    quotedText: string,
  ): string => {
    // Story is folded into the key so a header→body cursor change (or
    // any cross-story navigation) busts the memo and re-derives
    // `selectionTarget`. Without this, two selections at the same
    // block/offset in different stories would reuse the prior slice
    // and misroute downstream insert/replace operations.
    //
    // The serialized fields match the real `StoryLocator` discriminated
    // union (storyType + per-variant id), NOT a generic `{ type, id }`
    // shape. Using the wrong field names silently collapses every
    // story to the empty key, defeating the memo bust. Aligned to the
    // doc-api `StoryLocator` shape: `body` carries no extra id;
    // `headerFooterSlot` discriminates by section + kind + variant;
    // `headerFooterPart` by `refId`; `footnote` / `endnote` by `noteId`.
    const story = target ? (target as unknown as { story?: Record<string, unknown> }).story : undefined;
    let storyKey = '';
    if (story) {
      const storyType = typeof story.storyType === 'string' ? story.storyType : '';
      // Capture every discriminating field across the StoryLocator
      // union; absent fields serialize as empty so two stories that
      // differ on any one field produce different keys.
      const refId = typeof story.refId === 'string' ? story.refId : '';
      const noteId = typeof story.noteId === 'string' ? story.noteId : '';
      const section = story.section && typeof story.section === 'object' ? JSON.stringify(story.section) : '';
      const headerFooterKind = typeof story.headerFooterKind === 'string' ? story.headerFooterKind : '';
      const variant = typeof story.variant === 'string' ? story.variant : '';
      storyKey = `s=${storyType}:r=${refId}:n=${noteId}:hf=${headerFooterKind}:v=${variant}:sec=${section}`;
    }
    const targetKey = target
      ? target.segments.map((s) => `${s.blockId}:${s.range.start}-${s.range.end}`).join('|')
      : 'null';
    const marks = [...activeMarks].sort().join(',');
    const comments = [...activeCommentIds].sort().join(',');
    const changes = [...activeChangeIds].sort().join(',');
    return `${empty ? '1' : '0'}:${storyKey}:${targetKey}:m=${marks}:c=${comments}:tc=${changes}:t=${quotedText}`;
  };

  const computeState = (): SuperDocUIState => {
    // Route through PresentationEditor when active so selection state
    // follows the body/header/footer/note editor the user is actually
    // editing — `superdoc.activeEditor` stays on the body editor while
    // `PresentationEditor.getActiveEditor()` follows the routed story.
    const editor = resolveRoutedEditor(superdoc);
    const ready = editor != null;
    const selectionInfo = editor?.doc?.selection?.current?.({ includeText: true });
    const empty = selectionInfo ? selectionInfo.empty : true;
    const quotedText = selectionInfo?.text ?? '';
    const documentMode = superdoc.config?.documentMode ?? null;
    // `activeCommentIds` is post-SD-2792; older builds will have
    // `selectionInfo.activeCommentIds === undefined`. Fall back to a
    // frozen shared array so the array reference is stable across
    // computeState() calls (otherwise shallowEqual on the comments
    // snapshot re-fires every selection event).
    const activeIds = (selectionInfo?.activeCommentIds ?? EMPTY_ACTIVE_IDS) as string[];
    const activeChangeIdsFromSelection = (selectionInfo?.activeChangeIds ?? EMPTY_ACTIVE_IDS) as string[];

    // Reconcile activeReviewId. Mirror selection only when the
    // *selection-driven* id has changed since the last computeState —
    // otherwise an explicit next/previous/scrollTo is preserved across
    // subsequent recomputes (the cursor hasn't moved). Sync logic:
    //   - selection moved to a non-null entity id → mirror it
    //   - selection moved to no entity (caret elsewhere) → keep
    //     activeReviewId so navigation persists, but clear it if the
    //     underlying item dropped out of the feed
    const selectionDrivenActiveId = activeIds[0] ?? activeChangeIdsFromSelection[0] ?? null;
    const selectionMoved = selectionDrivenActiveId !== lastSelectionDrivenId;
    lastSelectionDrivenId = selectionDrivenActiveId;
    if (selectionMoved && selectionDrivenActiveId) {
      activeReviewId = selectionDrivenActiveId;
    }

    // Build (or reuse) the merged review feed. Memo invalidates only
    // when source caches or activeReviewId change, so unrelated
    // transactions / selection events don't allocate a fresh items
    // array and re-fire ui.review subscribers.
    let reviewSlice: ReviewSlice;
    if (
      reviewMemo &&
      reviewMemo.commentsRef === commentsListCache.items &&
      reviewMemo.changesRef === trackChangesListCache.items &&
      reviewMemo.activeId === activeReviewId
    ) {
      reviewSlice = reviewMemo.slice;
    } else {
      const items: ReviewItem[] = [];
      let order = 0;
      for (const comment of commentsListCache.items) {
        // `comments.list()` returns `DiscoveryItem<CommentDomain>` whose
        // canonical identifier lives on `id` (set from the underlying
        // commentId by the adapter). The legacy `commentId` field is
        // only on `CommentInfo` / `comments.get()` — not on this
        // discovery shape. Reading it would emit `undefined` and break
        // active-id matching + next/previous/scrollTo.
        items.push({ kind: 'comment', id: comment.id, documentOrder: order++, comment });
      }
      for (const change of trackChangesListCache.items) {
        items.push({ kind: 'change', id: change.id, documentOrder: order++, change });
      }
      let openCount = trackChangesListCache.total;
      for (const c of commentsListCache.items) {
        if (c.status !== 'resolved') openCount += 1;
      }
      // If the previously active id dropped out of the feed (e.g. an
      // accept/delete/reject), reset to null. Compute *after* items is
      // built so the final slice matches the eventual activeReviewId.
      if (activeReviewId && !items.some((item) => item.id === activeReviewId)) {
        activeReviewId = null;
      }
      reviewSlice = { items, openCount, activeId: activeReviewId };
      reviewMemo = {
        commentsRef: commentsListCache.items,
        changesRef: trackChangesListCache.items,
        activeId: activeReviewId,
        slice: reviewSlice,
      };
    }

    // Build (or reuse) the rich selection slice. Memo key folds in
    // every observable field so a typing-only transaction (which leaves
    // the projected SelectionInfo unchanged but allocates fresh arrays
    // inside the resolver) keeps the slice identity stable and lets
    // `shallowEqual` short-circuit `ui.select(s => s.selection)`
    // subscribers.
    const selectionTextTarget = (selectionInfo?.target ?? null) as import('@superdoc/document-api').TextTarget | null;
    const selectionActiveMarks = (selectionInfo?.activeMarks ?? EMPTY_ACTIVE_IDS) as string[];
    const selectionKey = buildSelectionKey(
      empty,
      selectionTextTarget,
      selectionActiveMarks,
      activeIds,
      activeChangeIdsFromSelection,
      quotedText,
    );
    let selectionSlice: SelectionSlice;
    if (selectionMemo && selectionMemo.key === selectionKey) {
      selectionSlice = selectionMemo.slice;
    } else {
      selectionSlice = {
        empty,
        target: selectionTextTarget,
        // Derived from `target`. Allocated only on memo miss so a
        // typing-only transaction (which leaves the selection
        // unchanged) doesn't churn the SelectionTarget identity.
        selectionTarget: textTargetToSelectionTarget(selectionTextTarget),
        activeMarks: selectionActiveMarks,
        activeCommentIds: activeIds,
        activeChangeIds: activeChangeIdsFromSelection,
        quotedText,
      };
      selectionMemo = { key: selectionKey, slice: selectionSlice };
    }

    // Built-in commands are tagged with `source: 'built-in'` so consumers
    // can render one uniform toolbar without branching on the id.
    // Custom commands (registered via `ui.commands.register`) are merged
    // in below, after the rest of the state is built — their `getState`
    // callback receives the same `SuperDocUIState` we return here so the
    // deriver can read selection, document mode, etc. without dipping
    // back into the controller.
    const builtInCommands: Record<string, UIToolbarCommandState> = {};
    if (toolbarSnapshot.commands) {
      for (const [id, cmdState] of Object.entries(toolbarSnapshot.commands)) {
        if (!cmdState) continue;
        builtInCommands[id] = {
          active: cmdState.active,
          disabled: cmdState.disabled,
          value: cmdState.value,
          source: 'built-in',
        };
      }
    }

    // Memoize the document slice. Reference stays stable while
    // (ready, mode) are unchanged so `shallowEqual` on `state.document`
    // short-circuits ui.document.subscribe per transaction.
    let documentSlice: DocumentSlice;
    if (documentMemo && documentMemo.slice.ready === ready && documentMemo.slice.mode === documentMode) {
      documentSlice = documentMemo.slice;
    } else {
      documentSlice = { ready, mode: documentMode };
      documentMemo = { slice: documentSlice };
    }

    const partial: SuperDocUIState = {
      ready,
      documentMode,
      document: documentSlice,
      selection: selectionSlice,
      toolbar: { context: toolbarSnapshot.context, commands: builtInCommands } as ToolbarSnapshotSlice,
      comments: {
        total: commentsListCache.total,
        items: commentsListCache.items,
        // Plumb from the memoized selection slice so the array
        // reference stays stable across recomputes when the active
        // set hasn't changed. The resolver returns a fresh `[]` (or
        // a fresh non-empty array) every call; without this the
        // `shallowEqual` check on `state.comments` would mismatch
        // every transaction / selectionUpdate even when nothing in
        // the comments slice actually changed, re-firing every
        // `ui.comments.subscribe` listener on the editing hot path.
        activeIds: selectionSlice.activeCommentIds,
      },
      review: reviewSlice,
    };

    const customCommandStates = customCommandsRegistry.computeStates(partial);
    const mergedCommands: Record<string, UIToolbarCommandState> = customCommandStates
      ? { ...builtInCommands, ...customCommandStates }
      : builtInCommands;

    return {
      ...partial,
      toolbar: { context: toolbarSnapshot.context, commands: mergedCommands } as ToolbarSnapshotSlice,
    };
  };

  // Wire SuperDoc-instance events. The wrapper-side bus (editorCreate /
  // document-mode-change / zoomChange) is the only path for some of
  // these signals today; if the wrapper migrates them to the editor
  // later, this is the single seam that needs to move.
  if (typeof superdoc.on === 'function' && typeof superdoc.off === 'function') {
    SUPERDOC_EVENTS.forEach((name) => {
      superdoc.on?.(name, scheduleNotify);
    });
    teardown.push(() => {
      SUPERDOC_EVENTS.forEach((name) => superdoc.off?.(name, scheduleNotify));
    });
  }

  // Editor events: the routed editor swaps when the user moves between
  // body / header / footer / note surfaces (PresentationEditor
  // `activeSurfaceChange`), or when the active document changes
  // (`editorCreate`). Re-attach listeners on either signal.
  let currentEditor: SuperDocEditorLike | null = null;
  let currentEditorTeardown: (() => void) | null = null;

  const refreshAndNotify = () => {
    refreshCommentsListCache();
    refreshTrackChangesListCache();
    scheduleNotify();
  };

  const attachEditorListeners = () => {
    const next = resolveRoutedEditor(superdoc);
    if (next === currentEditor) return;
    currentEditorTeardown?.();
    currentEditorTeardown = null;
    currentEditor = next;
    if (!next || typeof next.on !== 'function' || typeof next.off !== 'function') return;

    EDITOR_EVENTS.forEach((name) => {
      next.on?.(name, scheduleNotify);
    });
    // Comment-list invalidation runs ahead of scheduleNotify so the
    // subsequent state recompute sees the fresh items array. Without
    // this, `state.comments.items` would lag one tick behind a create/
    // patch/delete.
    LIST_REFRESH_EVENTS.forEach((name) => {
      next.on?.(name, refreshAndNotify);
    });
    currentEditorTeardown = () => {
      EDITOR_EVENTS.forEach((name) => next.off?.(name, scheduleNotify));
      LIST_REFRESH_EVENTS.forEach((name) => next.off?.(name, refreshAndNotify));
    };
    // The set of source events changed and the routed editor swapped
    // — refresh the comments cache for the new editor and recompute
    // state so subscribers see the new selection.
    refreshCommentsListCache();
    scheduleNotify();
  };

  // PresentationEditor events: surface changes route the editor; other
  // events surface presentation-layer mutations that don't reach the
  // body editor's `transaction` event. Track presentation editor by
  // identity so we re-attach if the SuperDoc instance swaps documents.
  let currentPresentation: ReturnType<typeof resolvePresentationEditor> = null;
  let currentPresentationTeardown: (() => void) | null = null;

  const attachPresentationListeners = () => {
    const next = resolvePresentationEditor(superdoc);
    if (next === currentPresentation) return;
    currentPresentationTeardown?.();
    currentPresentationTeardown = null;
    currentPresentation = next;
    if (!next || typeof next.on !== 'function' || typeof next.off !== 'function') return;

    const onPresentationChange = () => {
      // Re-route to the (possibly new) active surface, then notify.
      attachEditorListeners();
      scheduleNotify();
    };

    PRESENTATION_EVENTS.forEach((name) => {
      next.on?.(name, onPresentationChange);
    });
    currentPresentationTeardown = () => {
      PRESENTATION_EVENTS.forEach((name) => next.off?.(name, onPresentationChange));
    };
  };

  attachPresentationListeners();
  attachEditorListeners();
  if (typeof superdoc.on === 'function') {
    // editorCreate may bring a new PresentationEditor with a new active
    // surface. Re-attach both layers so the controller follows.
    superdoc.on?.('editorCreate', attachPresentationListeners);
    superdoc.on?.('editorCreate', attachEditorListeners);
  }
  teardown.push(() => {
    if (typeof superdoc.off === 'function') {
      superdoc.off?.('editorCreate', attachPresentationListeners);
      superdoc.off?.('editorCreate', attachEditorListeners);
    }
    currentPresentationTeardown?.();
    currentPresentationTeardown = null;
    currentPresentation = null;
    currentEditorTeardown?.();
    currentEditorTeardown = null;
    currentEditor = null;
  });

  const select = <TSlice>(
    selector: SelectorFn<SuperDocUIState, TSlice>,
    equality: EqualityFn<TSlice> = Object.is,
  ): Subscribable<TSlice> => {
    let last = selector(computeState());
    const listeners = new Set<(value: TSlice) => void>();

    const onStateChange = () => {
      const next = selector(computeState());
      if (equality(last, next)) return;
      last = next;
      listeners.forEach((listener) => {
        try {
          listener(next);
        } catch {
          // see scheduleNotify
        }
      });
    };

    // Refcount the controller-level listener: attach on first
    // subscriber, detach when the last subscriber leaves. Without this
    // each `ui.select(...)` would leak an `onStateChange` closure into
    // `stateChangeListeners` for the lifetime of the controller —
    // long-lived sessions where React/Vue components mount/unmount
    // would accumulate dead closures that still recompute on every
    // editor event.
    return {
      get(): TSlice {
        // No subscribers means `last` isn't being kept fresh by
        // `onStateChange`. Recompute so untracked snapshots stay
        // accurate; tracked snapshots return the cached value.
        if (listeners.size === 0) {
          last = selector(computeState());
        }
        return last;
      },
      subscribe(listener) {
        if (listeners.size === 0) {
          // First subscriber: refresh `last` so the initial emit is
          // not stale (state may have evolved between `select()` and
          // `subscribe()`), then attach the controller-level listener.
          last = selector(computeState());
          stateChangeListeners.add(onStateChange);
        }
        listeners.add(listener);
        // Initial synchronous emit, matching CKEditor's `bind().to()`
        // behavior and useSyncExternalStore semantics. New subscribers
        // get the current value immediately rather than waiting for
        // the next change.
        try {
          listener(last);
        } catch {
          // see scheduleNotify
        }
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) {
            stateChangeListeners.delete(onStateChange);
          }
        };
      },
    };
  };

  // Aggregate toolbar handle. Mirrors HeadlessToolbarController so
  // built-in SuperToolbar.vue (and external standalone-controller
  // consumers) can swap to ui.toolbar without API churn.
  const toolbar: ToolbarHandle = {
    // Pull from `state.toolbar` (post-merge with custom commands and
    // tagged with `source`) rather than the bare headless-toolbar
    // snapshot — the public `ToolbarSnapshotSlice` shape is the merged
    // one, not the underlying built-ins-only shape.
    getSnapshot: () => computeState().toolbar,
    subscribe(listener) {
      // Drives off the same selector substrate so subscribers receive
      // the same coalesced burst pattern as ui.select consumers.
      // Equality is set to "always different" because the headless
      // controller already dedups internally; we want every emit it
      // produces to propagate.
      return select(
        (state) => state.toolbar,
        () => false,
      ).subscribe((snapshot) => {
        try {
          listener({ snapshot });
        } catch {
          // see scheduleNotify
        }
      });
    },
    execute: ((id: PublicToolbarItemId, payload?: unknown): boolean => {
      // Routes through the centralized `dispatchCommand` so a later
      // `register({ id, override: true })` is honored from this
      // surface too. Returns `boolean` for the public type even
      // though the underlying dispatcher may return `Promise<boolean>`
      // for an async custom override; the existing `ToolbarHandle.execute`
      // signature is sync-typed, so an async override called via this
      // path resolves silently. Consumers that need the resolution
      // should use `ui.commands.get(id)?.execute()` (typed as
      // `boolean | Promise<boolean>`) or capture the registration
      // result from `ui.commands.register(...)`.
      const result = dispatchCommand(id, payload);
      return result instanceof Promise ? true : result;
    }) as ToolbarHandle['execute'],
  };

  // Per-command handles. Cached so handle identity is stable across
  // repeated accesses (matters for React `useMemo` deps and consumers
  // comparing handles).
  const commandHandleCache = new Map<string, CommandHandle<PublicToolbarItemId>>();

  // Per-command Subscribable cache. Sharing one Subscribable across
  // every `observe()` call for a given id means N components observing
  // `bold` produce one selector + N downstream listeners, not N
  // selectors. Each editor event recomputes once per command id, not
  // once per active observer.
  const commandSubscribableCache = new Map<
    string,
    Subscribable<ToolbarCommandHandleState<PublicToolbarItemId> | undefined>
  >();
  const getCommandSubscribable = (id: PublicToolbarItemId) => {
    let sub = commandSubscribableCache.get(id);
    if (sub) return sub;
    sub = select(
      (state) => state.toolbar.commands?.[id] as ToolbarCommandHandleState<PublicToolbarItemId> | undefined,
      shallowEqual,
    );
    commandSubscribableCache.set(id, sub);
    return sub;
  };

  const buildCommandHandle = (id: PublicToolbarItemId): CommandHandle<PublicToolbarItemId> => {
    return {
      observe(listener) {
        return getCommandSubscribable(id).subscribe((cmdState) => {
          const next = cmdState ?? FALLBACK_COMMAND_STATE;
          try {
            listener(next as ToolbarCommandHandleState<PublicToolbarItemId>);
          } catch {
            // see scheduleNotify
          }
        });
      },
      execute: ((payload?: unknown): boolean => {
        // Same dispatch path as `ui.toolbar.execute(id)` and
        // `ui.commands.get(id)?.execute()`. See `dispatchCommand`
        // for the override-routing rationale.
        const result = dispatchCommand(id, payload);
        return result instanceof Promise ? true : result;
      }) as CommandHandle<PublicToolbarItemId>['execute'],
    };
  };

  // Custom commands registry. Wires the substrate primitives (selectors
  // for state observation, scheduleNotify for re-emit) to the registry
  // so registered commands ride the same dedupe/coalesce posture as
  // built-ins. Built-in collisions are refused without `override: true`.
  const customCommandsRegistry = createCustomCommandsRegistry({
    superdoc,
    isBuiltIn: (id) => BUILT_IN_COMMAND_ID_SET.has(id),
    scheduleNotify,
    buildSubscribable: (id) => select((state) => state.toolbar.commands?.[id], shallowEqual),
  });
  teardown.push(() => {
    customCommandsRegistry.destroy();
  });

  /**
   * Single dispatch path for every `execute`-shaped surface on the
   * controller (`ui.toolbar.execute(id)`, `ui.commands.bold.execute()`,
   * `ui.commands.get(id)?.execute()`). All three re-resolve through the
   * custom-commands registry FIRST so a `register({ override: true })`
   * call routes dispatch through the override regardless of which
   * surface the consumer happens to call. Without this single path,
   * `state.toolbar.commands.bold` shows `source: 'custom'` while a
   * click via `ui.commands.bold.execute()` runs the built-in,
   * producing a state/action mismatch the consumer can't see.
   *
   * Resolved at call time, not at handle-construction time, so a
   * cached handle (React `useMemo` deps, etc.) survives a later
   * register/unregister cycle without the consumer needing to re-fetch.
   */
  const dispatchCommand = (id: string, payload?: unknown): boolean | Promise<boolean> => {
    if (customCommandsRegistry.has(id)) {
      return customCommandsRegistry.execute(id, payload);
    }
    return (toolbarController.execute as (id: PublicToolbarItemId, payload?: unknown) => boolean)(
      id as PublicToolbarItemId,
      payload,
    );
  };

  // Per-id cache for the type-erased dynamic handles returned by
  // `ui.commands.get(id)`. Cached so handle identity is stable across
  // repeated lookups for the same id (consumers can put the result in
  // a React `useMemo` dep and not re-create observers per render).
  // Caches lazily: entries are created on first `get(id)` call.
  const dynamicHandleCache = new Map<string, DynamicCommandHandle>();

  /**
   * Build a {@link DynamicCommandHandle} for a built-in id. Reuses the
   * per-command Subscribable so dynamic and per-id observers share the
   * same selector subscription against `state.toolbar.commands?.[id]`.
   * The emitted slice already carries `source: 'built-in'` after the
   * computeState merge, so no remapping is needed beyond the fallback.
   */
  const buildBuiltInDynamicHandle = (id: PublicToolbarItemId): DynamicCommandHandle => {
    return {
      observe(listener) {
        return getCommandSubscribable(id).subscribe((cmdState) => {
          // The subscribable's selector returns a value cast to
          // `ToolbarCommandHandleState<Id>` (no `source` field), but the
          // runtime slice is the merged `UIToolbarCommandState` with the
          // discriminator already populated by computeState. Cast back
          // to the public dynamic shape rather than re-allocating a fresh
          // object per emit.
          const next = (cmdState ?? FALLBACK_DYNAMIC_STATE) as UIToolbarCommandState;
          try {
            listener(next);
          } catch {
            // see scheduleNotify
          }
        });
      },
      execute(payload?: unknown): boolean | Promise<boolean> {
        // Same dispatch path as `ui.toolbar.execute(id)` and
        // `ui.commands.bold.execute()`. See `dispatchCommand` for
        // the override-routing rationale; this handle exposes the
        // full `boolean | Promise<boolean>` return type so consumers
        // can `await` an async custom override.
        return dispatchCommand(id, payload);
      },
    };
  };

  /**
   * Bridge a {@link CustomCommandHandle} from the custom-commands
   * registry into the unified {@link DynamicCommandHandle} shape.
   * Custom handles already emit `CustomCommandHandleState` (which
   * carries `source: 'custom'`) and `execute` already accepts an
   * unknown payload, so the wrapper is mostly identity. It exists to
   * satisfy the public type and to keep `dynamicHandleCache` stable.
   */
  const buildCustomDynamicHandle = (id: string): DynamicCommandHandle | undefined => {
    const customHandle = customCommandsRegistry.getHandle(id);
    if (!customHandle) return undefined;
    return {
      observe(listener) {
        return customHandle.observe(listener);
      },
      execute(payload?: unknown) {
        return (customHandle.execute as (payload?: unknown) => boolean | Promise<boolean>)(payload);
      },
    };
  };

  const getDynamicHandle = (id: string): DynamicCommandHandle | undefined => {
    if (typeof id !== 'string' || id.length === 0) return undefined;
    // Custom takes priority: `register({ id, override: true })` lets a
    // custom command shadow a built-in id, and the dynamic-lookup
    // result must follow that shadowing so consumers iterating over
    // mixed id arrays get the override semantics they configured.
    if (customCommandsRegistry.has(id)) {
      // Don't memoize the wrapper: a later `unregister()` followed by a
      // fresh `register()` for the same id swaps the underlying handle,
      // and a stale wrapper would observe / execute against the prior
      // registration. Building on demand is cheap (two closures) and
      // keeps semantics aligned with the Proxy `get` path.
      return buildCustomDynamicHandle(id);
    }
    if (!BUILT_IN_COMMAND_ID_SET.has(id)) return undefined;
    let cached = dynamicHandleCache.get(id);
    if (cached) return cached;
    cached = buildBuiltInDynamicHandle(id as PublicToolbarItemId);
    dynamicHandleCache.set(id, cached);
    return cached;
  };

  const commands = new Proxy({} as CommandsHandle, {
    get(_, prop) {
      if (typeof prop !== 'string') return undefined;
      // `register` is the one non-id key on the Proxy. Delegates to the
      // custom-commands registry; everything else flows through the
      // per-id handle cache below.
      if (prop === 'register') {
        return customCommandsRegistry.register.bind(customCommandsRegistry);
      }
      // `get(id)` is the typed dynamic-lookup escape hatch (see
      // `DynamicCommandHandle`). Returns undefined for unregistered ids
      // instead of producing a fallback handle that emits forever
      // disabled state, which is what the bare proxy lookup does today.
      if (prop === 'get') {
        return getDynamicHandle;
      }
      // Custom-registered ids surface a typed handle from the registry.
      // Built-in ids fall through to the existing per-id cache so they
      // keep the same observe/execute shape they had before SD-2802.
      if (customCommandsRegistry.has(prop)) {
        const customHandle = customCommandsRegistry.getHandle(prop);
        if (customHandle) return customHandle;
      }
      let handle = commandHandleCache.get(prop);
      if (handle) return handle;
      handle = buildCommandHandle(prop as PublicToolbarItemId);
      commandHandleCache.set(prop, handle);
      return handle;
    },
  });

  // ---- ui.comments ---------------------------------------------------------
  //
  // Subscribe is built on the substrate so consumers ride the same
  // microtask-coalesced burst pattern as `ui.select`. Action methods
  // are convenience facades that route through `editor.doc.comments.*`
  // — they do NOT introduce a parallel mutation contract; both
  // `ui.comments.resolve(id)` and `editor.doc.comments.patch({ id,
  // status: 'resolved' })` produce the same document mutation.

  const requireDocComments = () => {
    const editor = resolveRoutedEditor(superdoc);
    const api = editor?.doc?.comments;
    if (!api) {
      throw new Error('ui.comments: no active editor / comments API. Open a document first.');
    }
    return api;
  };

  /**
   * Run `scrollRangeIntoView` against the host editor — the
   * presentation editor lives at the host level and its
   * `navigateTo` is story-aware (the entity target's `story` field
   * tells it which story to activate). Routing through a child story
   * editor would scope navigation to that story instead of the
   * document.
   *
   * Returns `{ success: false }` when no host editor is mounted.
   */
  const runScrollIntoView = async (input: ScrollIntoViewInput): Promise<ScrollIntoViewOutput> => {
    const editor = resolveHostEditor(superdoc);
    if (!editor) return { success: false };
    return scrollRangeIntoView(editor as unknown as Parameters<typeof scrollRangeIntoView>[0], input);
  };

  const comments: CommentsHandle = {
    getSnapshot: () => computeState().comments,
    subscribe(listener) {
      return select((state) => state.comments, shallowEqual).subscribe((snapshot) => {
        try {
          listener({ snapshot });
        } catch {
          // see scheduleNotify
        }
      });
    },
    createFromSelection({ text }) {
      const editor = resolveRoutedEditor(superdoc);
      const target = editor?.doc?.selection?.current?.()?.target;
      if (!target) {
        return {
          success: false,
          failure: { code: 'NO_OP', message: 'ui.comments.createFromSelection: no addressable selection target.' },
        };
      }
      const api = requireDocComments();
      const receipt = (api.create as (input: unknown, options?: unknown) => Receipt).call(api, { target, text });
      // Refresh + notify ourselves: the underlying wrappers don't
      // emit a single canonical event for every comments mutation
      // (some go through `transaction` only, some emit
      // `commentsUpdate` ahead of the entity-store finishing). Doing
      // it here means the next snapshot subscribers see is the
      // post-mutation state, regardless of which event the wrapper
      // happens to fire.
      refreshAndNotify();
      return receipt;
    },
    resolve(commentId) {
      const api = requireDocComments();
      const receipt = (api.patch as (input: unknown, options?: unknown) => Receipt).call(api, {
        commentId,
        status: 'resolved',
      });
      refreshAndNotify();
      return receipt;
    },
    reopen(commentId) {
      // Routes through `comments.patch({ status: 'active' })`. Today
      // doc-api validation rejects anything other than 'resolved' —
      // SD-2789 widens the union and ships the lifecycle inverse.
      // Until then this surfaces an INVALID_INPUT receipt or throws,
      // which is the correct visible behavior for a not-yet-shipped
      // operation rather than a silent no-op.
      const api = requireDocComments();
      const receipt = (api.patch as (input: unknown, options?: unknown) => Receipt).call(api, {
        commentId,
        status: 'active',
      });
      refreshAndNotify();
      return receipt;
    },
    delete(commentId) {
      const api = requireDocComments();
      const receipt = (api.delete as (input: unknown, options?: unknown) => Receipt).call(api, { commentId });
      refreshAndNotify();
      return receipt;
    },
    async scrollTo(commentId) {
      // `CommentAddress` is body-scoped in the contract — it has no
      // `story` field today. Story-aware comment navigation lands as
      // a separate doc-API extension; until then, just route the id
      // and let `presentation.navigateTo` resolve through the comment
      // entity store.
      return runScrollIntoView({
        target: { kind: 'entity', entityType: 'comment', entityId: commentId },
        block: 'center',
        behavior: 'smooth',
      });
    },
  };

  // ---- ui.review ----------------------------------------------------------
  //
  // Same architectural rules as `ui.comments`: every mutation routes
  // through the Document API (`editor.doc.trackChanges.decide`); next
  // / previous / scrollTo are UI-only navigation helpers. Track-changes
  // recording state is intentionally absent here — it lives on
  // documentMode today and lands as a dedicated primitive in
  // SD-2667/S4 (filed separately).

  const requireDocTrackChanges = () => {
    // Always go through the host editor — `trackChanges.decide` is
    // document-wide and the change's own `address.story` (carried in
    // the decide target) tells the adapter which story to operate
    // against. Routing through a child story editor when focus is in
    // a header/footer would scope the decision to that story.
    const editor = resolveHostEditor(superdoc);
    const api = editor?.doc?.trackChanges;
    if (!api?.decide) {
      throw new Error('ui.review: no active editor / trackChanges API. Open a document first.');
    }
    return api;
  };

  /** Determine the entity kind for a given id from the current feed. */
  const entityKindForId = (id: string): 'comment' | 'change' | null => {
    const feed = computeState().review.items;
    const item = feed.find((i) => i.id === id);
    return item?.kind ?? null;
  };

  /**
   * Build the `target` payload for `trackChanges.decide` for a single
   * change id. Looks up the change in the cached feed; when its
   * `address.story` is non-body (header / footer / footnote /
   * endnote), include the story so the doc-API adapter can route
   * the decision to the right story instead of defaulting to body and
   * failing with target-not-found. Body-anchored changes omit the
   * field for parity with the doc-API's body-default contract.
   */
  const buildChangeDecideTarget = (changeId: string): { id: string; story?: unknown } => {
    const item = trackChangesListCache.items.find((c) => c.id === changeId);
    const story = (item as unknown as { address?: { story?: unknown } } | undefined)?.address?.story;
    if (story != null) return { id: changeId, story };
    return { id: changeId };
  };

  /**
   * Look up a review item's `address.story` so navigation /
   * scrollTo can carry it into the EntityAddress target. Without this,
   * `presentation.navigateTo({ entityId: 'tc-header-x' })` defaults
   * to body and either fails with target-not-found or anchors to a
   * same-id body change. Returns `undefined` for body-anchored items
   * so the EntityAddress stays minimal.
   */
  const lookupItemStory = (id: string): unknown | undefined => {
    const change = trackChangesListCache.items.find((c) => c.id === id);
    if (change) {
      return (change as unknown as { address?: { story?: unknown } }).address?.story;
    }
    const comment = commentsListCache.items.find((c) => c.id === id);
    return (comment as unknown as { address?: { story?: unknown } } | undefined)?.address?.story;
  };

  const review: ReviewHandle = {
    getSnapshot: () => computeState().review,
    subscribe(listener) {
      return select((state) => state.review, shallowEqual).subscribe((snapshot) => {
        try {
          listener({ snapshot });
        } catch {
          // see scheduleNotify
        }
      });
    },
    accept(changeId) {
      const api = requireDocTrackChanges();
      const receipt = (api.decide as (input: unknown, options?: unknown) => Receipt).call(api, {
        decision: 'accept',
        target: buildChangeDecideTarget(changeId),
      });
      refreshAndNotify();
      return receipt;
    },
    reject(changeId) {
      const api = requireDocTrackChanges();
      const receipt = (api.decide as (input: unknown, options?: unknown) => Receipt).call(api, {
        decision: 'reject',
        target: buildChangeDecideTarget(changeId),
      });
      refreshAndNotify();
      return receipt;
    },
    acceptAll() {
      const api = requireDocTrackChanges();
      const receipt = (api.decide as (input: unknown, options?: unknown) => Receipt).call(api, {
        decision: 'accept',
        target: { scope: 'all' },
      });
      refreshAndNotify();
      return receipt;
    },
    rejectAll() {
      const api = requireDocTrackChanges();
      const receipt = (api.decide as (input: unknown, options?: unknown) => Receipt).call(api, {
        decision: 'reject',
        target: { scope: 'all' },
      });
      refreshAndNotify();
      return receipt;
    },
    next() {
      const items = computeState().review.items;
      if (items.length === 0) return null;
      const current = activeReviewId ? items.findIndex((i) => i.id === activeReviewId) : -1;
      // Wrap-around: after last → first; null active → first.
      const nextIndex = current < 0 || current >= items.length - 1 ? 0 : current + 1;
      activeReviewId = items[nextIndex]!.id;
      scheduleNotify();
      return activeReviewId;
    },
    previous() {
      const items = computeState().review.items;
      if (items.length === 0) return null;
      const current = activeReviewId ? items.findIndex((i) => i.id === activeReviewId) : -1;
      // Wrap-around: before first → last; null active → last.
      const prevIndex = current <= 0 ? items.length - 1 : current - 1;
      activeReviewId = items[prevIndex]!.id;
      scheduleNotify();
      return activeReviewId;
    },
    async scrollTo(id) {
      const kind = entityKindForId(id);
      activeReviewId = id;
      scheduleNotify();
      // `EntityAddress` is a discriminated union: `CommentAddress`
      // doesn't carry a `story` field, only `TrackedChangeAddress`
      // does. Branch on `kind` so the constructed target matches the
      // right union member exactly.
      let target: import('@superdoc/document-api').EntityAddress;
      if (kind === 'change') {
        const story = lookupItemStory(id) as import('@superdoc/document-api').TrackedChangeAddress['story'];
        target =
          story != null
            ? { kind: 'entity', entityType: 'trackedChange', entityId: id, story }
            : { kind: 'entity', entityType: 'trackedChange', entityId: id };
      } else {
        target = { kind: 'entity', entityType: 'comment', entityId: id };
      }
      return runScrollIntoView({
        target,
        block: 'center',
        behavior: 'smooth',
      });
    },
  };

  // ---- ui.viewport -------------------------------------------------------
  //
  // Imperative geometry surface. No state slice, no subscription —
  // sticky-card / floating-toolbar consumers already listen to a
  // transaction / paint / scroll event upstream and call `getRect`
  // from there. Returns plain value rects, never live `DOMRect`s.
  // The DOM lookup itself lives in `PresentationEditor.getEntityRects`
  // so DOM elements / painter selectors never escape through the UI.
  //
  // Text-anchored paths (TextAddress / TextTarget) are deferred to a
  // follow-up — the type signature accepts them today so consumer
  // call sites are forward-compatible, but those branches return
  // `{ success: false, reason: 'invalid-target' }` until the
  // story-aware text resolver lands.

  const toViewportRect = (rect: {
    pageIndex: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }): ViewportRect => ({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    pageIndex: rect.pageIndex,
  });

  const viewport: ViewportHandle = {
    getRect(input: ViewportGetRectInput): ViewportRectResult {
      const target = input?.target;
      if (!target || typeof target !== 'object') {
        return { success: false, reason: 'invalid-target' };
      }

      // Resolve through the **host** editor — `presentationEditor`
      // lives on the body / host, not the routed child story editor
      // (header / footer / note). When focus is in a child story,
      // `resolveRoutedEditor` returns that child, whose
      // `presentationEditor` is undefined; the rect lookup would
      // wrongly return `not-ready`. Story-aware routing happens
      // through the entity address's `story` field inside
      // `getEntityRects`. Same posture as `runScrollIntoView`.
      const editor = resolveHostEditor(superdoc);
      const presentation = editor?.presentationEditor;
      if (!presentation || typeof presentation.getEntityRects !== 'function') {
        return { success: false, reason: 'not-ready' };
      }

      // Entity-anchored path. Text-anchored paths are deferred — the
      // resolver needs story-aware routing through the active routed
      // editor (header/footer/note vs body) to avoid silently reading
      // body coords for a non-body target. Until that lands, surface
      // an explicit `invalid-target` so consumers don't quietly get
      // wrong rects.
      if (!('kind' in target) || (target as { kind?: unknown }).kind !== 'entity') {
        return { success: false, reason: 'invalid-target' };
      }

      const entity = target as { kind: 'entity'; entityType?: unknown; entityId?: unknown; story?: unknown };
      if (typeof entity.entityType !== 'string' || typeof entity.entityId !== 'string' || !entity.entityId) {
        return { success: false, reason: 'invalid-target' };
      }
      // Reject unsupported entity types up front so a typo or unsupported
      // address (e.g. `bookmark`, `field`) returns `invalid-target` rather
      // than falling through to `getEntityRects` which would emit `[]`
      // and surface as `not-mounted` — that would mislead consumers into
      // retrying / scroll-and-retry loops for a target shape we don't
      // handle. Keep this list aligned with the supported branches in
      // `PresentationEditor.getEntityRects`.
      if (entity.entityType !== 'comment' && entity.entityType !== 'trackedChange') {
        return { success: false, reason: 'invalid-target' };
      }

      const rangeRects = presentation.getEntityRects({
        entityType: entity.entityType,
        entityId: entity.entityId,
        story: entity.story,
      });
      if (!rangeRects || rangeRects.length === 0) {
        return { success: false, reason: 'not-mounted' };
      }

      const rects = rangeRects.map(toViewportRect);
      return {
        success: true,
        rect: rects[0],
        rects,
        pageIndex: rects[0].pageIndex,
      };
    },

    async scrollIntoView(input: ScrollIntoViewInput): Promise<ScrollIntoViewOutput> {
      return runScrollIntoView(input);
    },
  };

  // ---- ui.selection ------------------------------------------------------
  //
  // Same shape as `ui.comments` / `ui.review` / `ui.toolbar`:
  // synchronous `getSnapshot()` + memoized `subscribe()`. Sugar over
  // `ui.select((s) => s.selection, shallowEqual)` so consumers writing
  // floating bubble menus / format toolbars / mention popovers /
  // "comment here" hints have the same ergonomic surface as the
  // other domain handles instead of dipping into the lower-level
  // selector substrate.
  const selection: SelectionHandle = {
    getSnapshot: () => computeState().selection,
    subscribe(listener) {
      return select((state) => state.selection, shallowEqual).subscribe((snapshot) => {
        try {
          listener({ snapshot });
        } catch {
          // see scheduleNotify
        }
      });
    },
    capture() {
      // Capture is sugar over `getSnapshot()` plus a deep clone +
      // deep freeze: the memoized selection slice carries the
      // portable address shapes consumers need (target,
      // selectionTarget, activeMarks, etc.), and shares them with
      // every other live subscriber. A shallow freeze on the
      // top-level snapshot would still let
      // `captured.target.segments[0].range.start = 99` or
      // `captured.activeMarks.push(...)` corrupt the shared slice
      // and feed bad targets into later `editor.doc.*` calls. Clone
      // first so the freeze applies to the consumer's copy alone,
      // not the controller's memo, then freeze recursively.
      const slice = computeState().selection;
      if (!slice.target && !slice.selectionTarget) return null;
      return deepFreeze(deepClone(slice));
    },
  };

  // ---- ui.document -------------------------------------------------------
  //
  // Session-level surface (Export DOCX, document-mode toggle, ready
  // state). Sugar over `state.document` plus passthroughs to the host
  // SuperDoc instance's setDocumentMode / export. Lifts the operations
  // that previously forced consumers to wire a separate "host" hook
  // through their React context (the SuperDocHost interface that
  // SD-2813's React provider exposes today; that becomes a thin
  // backwards-compat shim once consumers migrate to ui.document).
  const document: DocumentHandle = {
    getSnapshot: () => computeState().document,
    subscribe(listener) {
      return select((state) => state.document, shallowEqual).subscribe((snapshot) => {
        try {
          listener({ snapshot });
        } catch {
          // see scheduleNotify
        }
      });
    },
    setMode(mode) {
      // Routes through the host setter; ignored when the stub omits
      // it (test stubs / SSR). The host emits 'document-mode-change'
      // which is already in SUPERDOC_EVENTS, so the next snapshot
      // reflects the new mode without explicit notify here.
      const setter = superdoc.setDocumentMode;
      if (typeof setter !== 'function') return;
      try {
        setter.call(superdoc, mode);
      } catch (err) {
        console.error('[superdoc/ui] ui.document.setMode failed:', err);
      }
    },
    async export(options?: DocumentExportInput): Promise<unknown> {
      const exportFn = superdoc.export;
      if (typeof exportFn !== 'function') {
        // Surface a clear error rather than a silent no-op: a
        // consumer that wired up an Export button has every right
        // to know the host doesn't implement export. Same posture
        // as the requireDocComments helper used by ui.comments.
        throw new Error('ui.document.export: host SuperDoc instance does not implement export().');
      }
      return exportFn.call(superdoc, options);
    },
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stateChangeListeners.clear();
    commandHandleCache.clear();
    commandSubscribableCache.clear();
    dynamicHandleCache.clear();
    teardown.forEach((fn) => {
      try {
        fn();
      } catch {
        // teardown is best-effort
      }
    });
    teardown.length = 0;
  };

  return { select, toolbar, commands, comments, review, selection, viewport, document, destroy };
}
