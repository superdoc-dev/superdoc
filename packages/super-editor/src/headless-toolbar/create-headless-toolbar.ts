import type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarController,
  PublicToolbarItemId,
  ToolbarSnapshot,
  ToolbarSubscriptionEvent,
} from './types.js';
import { createToolbarSnapshot } from './create-toolbar-snapshot.js';
import { hasContentLockedStructuredContentSelection } from './helpers/context.js';
import { subscribeToolbarEvents } from './subscribe-toolbar-events.js';
import { createToolbarRegistry } from './toolbar-registry.js';
import type { BuiltInToolbarRegistryEntry } from './internal-types.js';

const executeDirectCommand = (
  id: PublicToolbarItemId,
  snapshot: ToolbarSnapshot,
  toolbarRegistry: Partial<Record<PublicToolbarItemId, BuiltInToolbarRegistryEntry>>,
  payload?: unknown,
): boolean => {
  const entry = toolbarRegistry[id];
  const commandName = entry?.directCommandName;
  const command = commandName ? snapshot.context?.target?.commands?.[commandName] : null;
  if (typeof command !== 'function') return false;
  const result = payload === undefined ? command() : command(payload);
  return typeof result === 'boolean' ? result : Boolean(result);
};

const executeRegistryCommand = (
  id: PublicToolbarItemId,
  superdoc: CreateHeadlessToolbarOptions['superdoc'],
  snapshot: ToolbarSnapshot,
  toolbarRegistry: Partial<Record<PublicToolbarItemId, BuiltInToolbarRegistryEntry>>,
  payload?: unknown,
): boolean => {
  const entry = toolbarRegistry[id];
  if (!entry) return false;
  if (typeof entry.execute === 'function') {
    // Prefer explicit registry execute handlers when present.
    // They are where built-in parity-sensitive semantics live.
    return entry.execute({
      context: snapshot.context,
      superdoc,
      payload,
    });
  }
  return executeDirectCommand(id, snapshot, toolbarRegistry, payload);
};

const CONTENT_LOCK_EXECUTION_EXEMPT_IDS = new Set<PublicToolbarItemId>([
  'undo',
  'redo',
  'ruler',
  'formatting-marks',
  'zoom',
  'document-mode',
]);

const isToolbarCommandExecutionDisabled = (
  id: PublicToolbarItemId,
  superdoc: CreateHeadlessToolbarOptions['superdoc'],
  snapshot: ToolbarSnapshot,
  toolbarRegistry: Partial<Record<PublicToolbarItemId, BuiltInToolbarRegistryEntry>>,
): boolean => {
  const snapshotState = snapshot.commands[id];
  if (snapshotState) return snapshotState.disabled;

  if (CONTENT_LOCK_EXECUTION_EXEMPT_IDS.has(id) || !hasContentLockedStructuredContentSelection(snapshot.context)) {
    return false;
  }

  const entry = toolbarRegistry[id];
  if (!entry) return false;

  try {
    return entry.state({ context: snapshot.context, superdoc }).disabled;
  } catch {
    return true;
  }
};

export const createHeadlessToolbar = (options: CreateHeadlessToolbarOptions): HeadlessToolbarController => {
  const listeners = new Set<(event: ToolbarSubscriptionEvent) => void>();
  const toolbarRegistry = createToolbarRegistry();

  const buildSnapshot = () => {
    return createToolbarSnapshot({
      ...options,
      toolbarRegistry,
    });
  };

  let snapshot = buildSnapshot();
  let destroyed = false;
  let unsubscribeEvents: (() => void) | null = null;

  const notifyListeners = () => {
    listeners.forEach((listener) => listener({ snapshot }));
  };

  const rebindEvents = () => {
    unsubscribeEvents?.();
    unsubscribeEvents = subscribeToolbarEvents(options, handleChange);
  };

  const rebuildSnapshot = () => {
    snapshot = buildSnapshot();
  };

  const refreshControllerState = () => {
    rebuildSnapshot();
    rebindEvents();
    notifyListeners();
  };

  // Any relevant source event triggers a full refresh cycle (snapshot
  // rebuild, event rebind, listener notification), COALESCED per microtask:
  // a single keystroke fires both 'transaction' and 'selectionUpdate'
  // synchronously from the same dispatch, and rebuilding the snapshot is the
  // expensive part (~7ms on large documents, SD-3432) — running it twice per
  // keystroke bought nothing. The microtask runs after the dispatch
  // completes and before paint, so subscribers still observe a snapshot that
  // reflects the full transaction; they are simply notified once per burst
  // instead of once per event. `execute()` keeps its synchronous refresh.
  let refreshQueued = false;
  const handleChange = () => {
    if (destroyed || refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      if (destroyed) return;
      refreshControllerState();
    });
  };

  rebindEvents();

  return {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      if (destroyed) {
        return () => {};
      }
      listeners.add(listener);
      listener({ snapshot });
      return () => {
        listeners.delete(listener);
      };
    },

    execute(id: PublicToolbarItemId, payload?: unknown) {
      if (isToolbarCommandExecutionDisabled(id, options.superdoc, snapshot, toolbarRegistry)) {
        return false;
      }

      const result = executeRegistryCommand(id, options.superdoc, snapshot, toolbarRegistry, payload);
      if (result && !destroyed) {
        refreshControllerState();
      }
      return result;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeEvents?.();
      unsubscribeEvents = null;
      listeners.clear();
    },
  } as HeadlessToolbarController;
};
