import { useCallback, useEffect, useRef, useState } from 'react';
import { createHeadlessToolbar } from '@superdoc/super-editor';

const EMPTY_SNAPSHOT = { context: null, commands: {} };

/**
 * React hook for the headless toolbar.
 *
 * @param {import('@superdoc/super-editor').HeadlessToolbarSuperdocHost | null | undefined} superdoc
 * @param {import('@superdoc/super-editor').PublicToolbarItemId[]} [commands]
 */
export function useHeadlessToolbar(superdoc, commands) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const controllerRef = useRef(null);

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

  const execute = useCallback((id, payload) => controllerRef.current?.execute(id, payload) ?? false, []);

  return { snapshot, execute };
}
