import { shallowRef, onBeforeUnmount } from 'vue';
import { createHeadlessToolbar } from '@superdoc/super-editor';

/**
 * Vue composable for the headless toolbar.
 *
 * @param {import('@superdoc/super-editor').HeadlessToolbarSuperdocHost} superdoc
 * @param {import('@superdoc/super-editor').PublicToolbarItemId[]} [commands]
 */
export function useHeadlessToolbar(superdoc, commands) {
  const controller = createHeadlessToolbar({ superdoc, commands });

  const snapshot = shallowRef(controller.getSnapshot());
  const unsub = controller.subscribe(({ snapshot: s }) => {
    snapshot.value = s;
  });

  onBeforeUnmount(() => {
    unsub();
    controller.destroy();
  });

  const execute = (id, payload) => controller.execute(id, payload);

  return { snapshot, execute };
}
