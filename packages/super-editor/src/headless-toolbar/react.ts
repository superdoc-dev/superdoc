import { useCallback, useEffect, useRef, useState } from 'react';
import { createHeadlessToolbar } from './create-headless-toolbar.js';
import type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarController,
  PublicToolbarItemId,
  ToolbarSnapshot,
} from './types.js';

const EMPTY_SNAPSHOT: ToolbarSnapshot = { context: null, commands: {} };

/**
 * React hook for the headless toolbar.
 *
 * Returns `{ snapshot, execute }` — bind `snapshot` to your UI and call
 * `execute` from your button handlers. Cleanup is automatic.
 *
 * ```tsx
 * const { snapshot, execute } = useHeadlessToolbar(superdoc, ['bold', 'italic', 'undo', 'redo']);
 *
 * <button onClick={() => execute('bold')} data-active={snapshot.commands.bold?.active}>
 *   Bold
 * </button>
 * ```
 */
export function useHeadlessToolbar(
  superdoc: CreateHeadlessToolbarOptions['superdoc'] | null | undefined,
  commands?: PublicToolbarItemId[],
) {
  const [snapshot, setSnapshot] = useState<ToolbarSnapshot>(EMPTY_SNAPSHOT);
  const controllerRef = useRef<HeadlessToolbarController | null>(null);

  useEffect(() => {
    if (!superdoc) return;

    const controller = createHeadlessToolbar({ superdoc, commands });
    controllerRef.current = controller;

    setSnapshot(controller.getSnapshot());
    const unsub = controller.subscribe(({ snapshot: s }) => setSnapshot(s));

    return () => {
      unsub();
      controller.destroy();
      controllerRef.current = null;
    };
  }, [superdoc]);

  const execute = useCallback((id: PublicToolbarItemId, payload?: unknown) => {
    return controllerRef.current?.execute(id, payload as any) ?? false;
  }, []);

  return { snapshot, execute };
}
