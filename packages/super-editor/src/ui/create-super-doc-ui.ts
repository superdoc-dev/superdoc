import { createHeadlessToolbar } from '../headless-toolbar/index.js';
import { resolveToolbarSources } from '../headless-toolbar/resolve-toolbar-sources.js';
import { createToolbarRegistry } from '../headless-toolbar/toolbar-registry.js';
import type {
  HeadlessToolbarController,
  HeadlessToolbarSuperdocHost,
  PublicToolbarItemId,
  ToolbarSnapshot,
} from '../headless-toolbar/types.js';
import { shallowEqual } from './equality.js';
import type {
  CommandHandle,
  CommandsHandle,
  EqualityFn,
  SelectorFn,
  SuperDocEditorLike,
  SuperDocUI,
  SuperDocUIOptions,
  SuperDocUIState,
  Subscribable,
  ToolbarCommandHandleState,
  ToolbarHandle,
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
  'trackedChangesUpdate',
] as const;

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
const ALL_TOOLBAR_COMMAND_IDS: PublicToolbarItemId[] = Object.keys(
  createToolbarRegistry(),
) as PublicToolbarItemId[];

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
  // same selector substrate as the rest of the controller. The Vue UI
  // and any external `superdoc/headless-toolbar` consumer can keep
  // using their existing entry points; this is the single source of
  // truth at runtime.
  //
  // The structural cast is safe at runtime: the SuperDoc Vue instance
  // satisfies HeadlessToolbarSuperdocHost (with `Editor` for
  // activeEditor) at runtime; we accept the looser SuperDocLike at the
  // public boundary so this controller can be unit-tested with stubs.
  // Internal headless-toolbar instance. Feeds `state.toolbar` so
  // `ui.toolbar.subscribe` and `ui.commands.<id>.observe` ride the
  // same selector substrate as the rest of the controller. Per-command
  // state derivers in the registry are now wrapped to default to
  // disabled on throw, so a partial editor never wedges snapshot
  // construction.
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
    return {
      ready,
      documentMode,
      selection: { empty, quotedText },
      toolbar: toolbarSnapshot,
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
    currentEditorTeardown = () => {
      EDITOR_EVENTS.forEach((name) => next.off?.(name, scheduleNotify));
    };
    // The set of source events changed — recompute state so subscribers
    // see the new routed editor's selection.
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
    getSnapshot: () => toolbarController.getSnapshot(),
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
      // The controller's execute signature is conditionally typed
      // (variadic per-id payload); cast here keeps the consumer-facing
      // type strict while delegating at runtime.
      return (toolbarController.execute as (id: PublicToolbarItemId, payload?: unknown) => boolean)(id, payload);
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
        return (toolbarController.execute as (id: PublicToolbarItemId, payload?: unknown) => boolean)(id, payload);
      }) as CommandHandle<PublicToolbarItemId>['execute'],
    };
  };

  const commands = new Proxy({} as CommandsHandle, {
    get(_, prop) {
      if (typeof prop !== 'string') return undefined;
      let handle = commandHandleCache.get(prop);
      if (handle) return handle;
      handle = buildCommandHandle(prop as PublicToolbarItemId);
      commandHandleCache.set(prop, handle);
      return handle;
    },
  });

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stateChangeListeners.clear();
    commandHandleCache.clear();
    commandSubscribableCache.clear();
    teardown.forEach((fn) => {
      try {
        fn();
      } catch {
        // teardown is best-effort
      }
    });
    teardown.length = 0;
  };

  return { select, toolbar, commands, destroy };
}
