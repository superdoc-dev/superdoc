import { shallowRef, onBeforeUnmount, type ShallowRef } from 'vue';
import { createHeadlessToolbar } from './create-headless-toolbar.js';
import type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarController,
  PublicToolbarItemId,
  ToolbarSnapshot,
  ToolbarPayloadMap,
} from './types.js';

/**
 * Vue composable for the headless toolbar.
 *
 * Returns `{ snapshot, execute }` — bind `snapshot` in your template and call
 * `execute` from your event handlers. Cleanup is automatic on unmount.
 *
 * ```vue
 * <script setup>
 * const { snapshot, execute } = useHeadlessToolbar(superdoc, ['bold', 'italic', 'undo', 'redo']);
 * </script>
 *
 * <template>
 *   <button @click="execute('bold')" :data-active="snapshot.commands.bold?.active">Bold</button>
 * </template>
 * ```
 */
export function useHeadlessToolbar(
  superdoc: CreateHeadlessToolbarOptions['superdoc'],
  commands?: PublicToolbarItemId[],
): {
  snapshot: ShallowRef<ToolbarSnapshot>;
  execute: (id: PublicToolbarItemId, payload?: unknown) => boolean;
} {
  const controller: HeadlessToolbarController = createHeadlessToolbar({ superdoc, commands });

  const snapshot = shallowRef<ToolbarSnapshot>(controller.getSnapshot());

  const unsub = controller.subscribe(({ snapshot: s }) => {
    snapshot.value = s;
  });

  onBeforeUnmount(() => {
    unsub();
    controller.destroy();
  });

  const execute: HeadlessToolbarController['execute'] = ((...args: [any, any?]) => {
    return controller.execute(...args);
  }) as HeadlessToolbarController['execute'];

  return { snapshot, execute };
}
