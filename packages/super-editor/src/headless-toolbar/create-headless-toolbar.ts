import type { CreateHeadlessToolbarOptions, HeadlessToolbarController, ToolbarSnapshot } from './types.js';
import { createToolbarSnapshot } from './create-toolbar-snapshot.js';
import { subscribeToolbarEvents } from './subscribe-toolbar-events.js';

export const createHeadlessToolbar = (options: CreateHeadlessToolbarOptions): HeadlessToolbarController => {
  const listeners = new Set<(snapshot: ToolbarSnapshot) => void>();

  let snapshot = createToolbarSnapshot(options);
  let destroyed = false;
  let unsubscribeEvents: (() => void) | null = null;

  const notifyListeners = () => {
    listeners.forEach((listener) => listener(snapshot));
  };

  const rebindEvents = () => {
    unsubscribeEvents?.();
    unsubscribeEvents = subscribeToolbarEvents(options, handleChange);
  };

  // POC behavior: any relevant source event triggers a full snapshot rebuild
  // and event rebind. This keeps the controller simple and reliable.
  // Later we may split pure recompute from full rebind if needed.
  const handleChange = () => {
    if (destroyed) return;
    snapshot = createToolbarSnapshot(options);
    rebindEvents();
    notifyListeners();
  };

  rebindEvents();

  // Keep the public controller surface intentionally small for the POC.
  // `execute()` and manual `refresh()` may be added later if production needs justify them.
  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (destroyed) {
        return () => {};
      }
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeEvents?.();
      unsubscribeEvents = null;
      listeners.clear();
    },
  };
};
