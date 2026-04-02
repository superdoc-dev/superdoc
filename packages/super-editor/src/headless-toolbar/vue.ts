import { shallowRef, onBeforeUnmount, type ShallowRef } from 'vue';
import { createHeadlessToolbar } from './create-headless-toolbar.js';
import type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarController,
  PublicToolbarItemId,
  ToolbarSnapshot,
} from './types.js';

const EMPTY_SNAPSHOT: ToolbarSnapshot = { context: null, commands: {} };

/**
 * Vue composable for the headless toolbar.
 *
 * Returns `{ snapshot, execute }` — bind `snapshot` in your template and call
 * `execute` from your event handlers. Cleanup is automatic on unmount.
 *
 * `superdoc` must be available when the composable is called. If it depends on
 * the DOM, create it in `onMounted` and use `createHeadlessToolbar` directly
 * instead (see the vue-vuetify example).
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
  superdoc: CreateHeadlessToolbarOptions['superdoc'] | null | undefined,
  commands?: PublicToolbarItemId[],
): {
  snapshot: ShallowRef<ToolbarSnapshot>;
  execute: (id: PublicToolbarItemId, payload?: unknown) => boolean;
} {
  if (!superdoc) {
    return {
      snapshot: shallowRef<ToolbarSnapshot>(EMPTY_SNAPSHOT),
      execute: () => false,
    };
  }

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
