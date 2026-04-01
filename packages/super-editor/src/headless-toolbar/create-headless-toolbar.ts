import type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarController,
  PublicToolbarItemId,
  ToolbarSnapshot,
  ToolbarSubscriptionEvent,
} from './types.js';
import { createToolbarSnapshot } from './create-toolbar-snapshot.js';
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

  // Current behavior: any relevant source event triggers a full refresh cycle
  // (snapshot rebuild, event rebind, listener notification).
  // This is intentionally conservative for now; later we may rebind only when
  // the subscribed source identities actually change.
  const handleChange = () => {
    if (destroyed) return;
    refreshControllerState();
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
