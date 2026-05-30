<script setup>
import {
  ref,
  getCurrentInstance,
  onMounted,
  onActivated,
  onDeactivated,
  onBeforeUnmount,
  nextTick,
  computed,
} from 'vue';
import { throttle } from './helpers.js';
import ButtonGroup from './ButtonGroup.vue';
import { RESPONSIVE_BREAKPOINTS } from './constants.js';

/**
 * The default font-family to use for toolbar UI surfaces when no custom font is configured.
 * This constant ensures consistency across the toolbar application.
 * @constant {string}
 */
const DEFAULT_UI_FONT_FAMILY = 'Arial, Helvetica, sans-serif';

const { proxy } = getCurrentInstance();
const emit = defineEmits(['command', 'toggle', 'select']);

let toolbarKey = ref(1);
const compactSideGroups = ref(false);
let containerResizeObserver = null;

/**
 * Computed property that determines the font-family to use for toolbar UI surfaces.
 * Retrieves the configured font from the toolbar instance's config and validates it.
 * Falls back to the default if no valid font is configured.
 */
const uiFontFamily = computed(() => {
  const configured = proxy?.$toolbar?.config?.uiDisplayFallbackFont;

  // Validate that the configured value is a non-empty string
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }

  // Fall back to the default font family
  return DEFAULT_UI_FONT_FAMILY;
});

const showLeftSide = proxy.$toolbar.config?.toolbarGroups?.includes('left');
const showRightSide = proxy.$toolbar.config?.toolbarGroups?.includes('right');
const excludeButtonsList = proxy.$toolbar.config?.toolbarButtonsExclude || [];

const getFilteredItems = (position) => {
  return proxy.$toolbar.getToolbarItemByGroup(position).filter((item) => !excludeButtonsList.includes(item.name.value));
};

const updateCompactSideGroups = () => {
  compactSideGroups.value = proxy.$toolbar.getAvailableWidth() <= RESPONSIVE_BREAKPOINTS.lg;
};
const onKeyDown = async (e) => {
  if (e.metaKey && e.key === 'f') {
    const searchItem = proxy.$toolbar.getToolbarItemByName('search');
    if (searchItem) {
      e.preventDefault();
      searchItem.expand.value = true;
      await nextTick();
      if (searchItem.inputRef.value) {
        searchItem.inputRef.value.focus();
      }
    }
  }
};

const onWindowResized = async () => {
  await proxy.$toolbar.onToolbarResize();
  updateCompactSideGroups();
  toolbarKey.value += 1;
};
const onResizeThrottled = throttle(onWindowResized, 300);

function teardownWindowListeners() {
  window.removeEventListener('resize', onResizeThrottled);
  window.removeEventListener('keydown', onKeyDown);
  containerResizeObserver?.disconnect();
  containerResizeObserver = null;
}

function setupWindowListeners() {
  teardownWindowListeners();
  window.addEventListener('resize', onResizeThrottled);
  window.addEventListener('keydown', onKeyDown);
  if (
    typeof ResizeObserver !== 'undefined' &&
    proxy.$toolbar.config?.responsiveToContainer &&
    proxy.$toolbar.toolbarContainer
  ) {
    containerResizeObserver = new ResizeObserver(() => {
      onResizeThrottled();
    });
    containerResizeObserver.observe(proxy.$toolbar.toolbarContainer);
  }
  updateCompactSideGroups();
}

onMounted(setupWindowListeners);
onActivated(setupWindowListeners);
onDeactivated(teardownWindowListeners);
onBeforeUnmount(teardownWindowListeners);

const handleCommand = ({ item, argument, option }) => {
  proxy.$toolbar.emitCommand({ item, argument, option });
};

const restoreSelection = () => {
  const editor = proxy.$toolbar.activeEditor;
  if (!editor) return;
  if (editor.options?.isHeaderOrFooter) return;
  editor.commands?.restoreSelection();
};

/**
 * Prevents the browser's default focus-transfer behavior when clicking toolbar buttons.
 *
 * Without this, clicking a toolbar button moves focus from the hidden ProseMirror editor
 * to the toolbar button element. The subsequent refocus of the PM editor can trigger
 * browser-native scroll adjustments that jump the page to the top — especially when
 * the window (not a div) is the scroll container.
 *
 * Input elements are excluded so they still receive native focus and cursor placement.
 */
const handleToolbarMousedown = (e) => {
  if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
  e.preventDefault();
};
</script>

<template>
  <div
    class="superdoc-toolbar"
    :key="toolbarKey"
    role="toolbar"
    aria-label="Toolbar"
    data-sd-part="toolbar"
    data-editor-ui-surface
    @mousedown="handleToolbarMousedown"
  >
    <ButtonGroup
      tabindex="0"
      v-if="showLeftSide"
      :toolbar-items="getFilteredItems('left')"
      :compact-side-groups="compactSideGroups"
      :ui-font-family="uiFontFamily"
      position="left"
      @command="handleCommand"
      @item-clicked="restoreSelection"
      class="superdoc-toolbar-group-side"
    />
    <ButtonGroup
      tabindex="0"
      :toolbar-items="getFilteredItems('center')"
      :overflow-items="proxy.$toolbar.overflowItems"
      :compact-side-groups="compactSideGroups"
      :ui-font-family="uiFontFamily"
      position="center"
      @command="handleCommand"
      @item-clicked="restoreSelection"
    />
    <ButtonGroup
      tabindex="0"
      v-if="showRightSide"
      :toolbar-items="getFilteredItems('right')"
      :compact-side-groups="compactSideGroups"
      :ui-font-family="uiFontFamily"
      position="right"
      @command="handleCommand"
      @item-clicked="restoreSelection"
      class="superdoc-toolbar-group-side"
    />
  </div>
</template>

<style scoped>
.superdoc-toolbar {
  display: flex;
  width: 100%;
  justify-content: space-between;
  background: var(--sd-ui-toolbar-bg, var(--sd-ui-bg, #ffffff));
  padding: var(--sd-ui-toolbar-padding-y, 4px) var(--sd-ui-toolbar-padding-x, 16px);
  box-sizing: border-box;
  font-family: var(--sd-ui-font-family, Arial, Helvetica, sans-serif);
  position: relative;
  z-index: var(--sd-ui-toolbar-z-index, 10);
}

@media (max-width: 768px) {
  .superdoc-toolbar {
    padding: 4px 10px;
    justify-content: inherit;
  }
}
</style>
