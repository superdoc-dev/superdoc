<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed, markRaw } from 'vue';
import { ContextMenuPluginKey } from '../../extensions/context-menu/context-menu.js';
import { getPropsByItemId } from './utils.js';
import { shouldBypassContextMenu } from '../../utils/contextmenu-helpers.js';
import { moveCursorToMouseEvent } from '../cursor-helpers.js';
import { getEditorSurfaceElement } from '../../core/helpers/editorSurface.js';
import { getItems } from './menuItems.js';
import { getEditorContext } from './utils.js';
import { CONTEXT_MENU_HANDLED_FLAG } from './event-flags.js';
import { isMacOS } from '../../core/utilities/isMacOS.js';

const props = defineProps({
  editor: {
    type: Object,
    required: true,
  },
  openPopover: {
    type: Function,
    required: true,
  },
  closePopover: {
    type: Function,
    required: true,
  },
});

const isOpen = ref(false);
const menuPosition = ref({ left: '0px', top: '0px' });
const menuRef = ref(null);
const sections = ref([]);
const selectedId = ref(null);
const searchQuery = ref('');
const currentContext = ref(null);

// --- Filtering ---

const flattenedItems = computed(() => {
  return sections.value.flatMap((section) => section.items);
});

const filteredSections = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return sections.value;

  return sections.value
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(q)),
    }))
    .filter((section) => section.items.length > 0);
});

const filteredItems = computed(() => {
  return filteredSections.value.flatMap((section) => section.items);
});

// Keep selectedId in sync with filtered results
watch(filteredItems, (items) => {
  if (items.length > 0 && !items.find((i) => i.id === selectedId.value)) {
    selectedId.value = items[0].id;
  }
});

// Auto-close when search yields no results (only after sections have loaded)
watch(filteredItems, (items) => {
  if (isOpen.value && searchQuery.value && items.length === 0 && sections.value.length > 0) {
    closeMenu();
  }
});

// --- Custom item rendering ---

const customItemRefs = new Map();

const setCustomItemRef = (el, item) => {
  if (el) {
    customItemRefs.set(item.id, { element: el, item });
    nextTick(() => {
      renderCustomItem(item.id);
    });
  }
};

const defaultRender = (context) => {
  const item = context.item || context.currentItem;
  const container = document.createElement('div');
  container.className = 'context-menu-default-content';

  if (item.icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'context-menu-item-icon';
    iconSpan.innerHTML = item.icon;
    container.appendChild(iconSpan);
  }

  const labelSpan = document.createElement('span');
  labelSpan.textContent = item.label;
  container.appendChild(labelSpan);

  return container;
};

const renderCustomItem = async (itemId) => {
  const refData = customItemRefs.get(itemId);
  if (!refData || refData.element.hasCustomContent) return;

  const { element, item } = refData;

  try {
    if (!currentContext.value) {
      currentContext.value = await getEditorContext(props.editor);
    }

    const contextWithItem = { ...currentContext.value, currentItem: item };
    const renderFunction = item.render || defaultRender;
    const customElement = renderFunction(contextWithItem);

    if (customElement instanceof HTMLElement) {
      element.innerHTML = '';
      element.appendChild(customElement);
      element.hasCustomContent = true;
    }
  } catch (error) {
    console.warn(`[ContextMenu] Error rendering custom item ${itemId}:`, error);
    const fallbackElement = defaultRender({ ...(currentContext.value || {}), currentItem: item });
    element.innerHTML = '';
    element.appendChild(fallbackElement);
    element.hasCustomContent = true;
  }
};

const cleanupCustomItems = () => {
  customItemRefs.forEach((refData) => {
    if (refData.element) {
      refData.element.hasCustomContent = false;
    }
  });
  customItemRefs.clear();
};

// --- Keyboard navigation ---
// The PM plugin emits 'slashMenu:navigate' events for ArrowDown/Up/Enter.
// This avoids relying on DOM event bubbling which is fragile in presentation mode.

const handleNavigate = ({ key }) => {
  if (!isOpen.value) return;

  const currentItems = filteredItems.value;
  const currentIndex = currentItems.findIndex((item) => item.id === selectedId.value);

  switch (key) {
    case 'ArrowDown': {
      if (currentItems.length === 0) break;
      const nextIndex = currentIndex < currentItems.length - 1 ? currentIndex + 1 : 0;
      selectedId.value = currentItems[nextIndex].id;
      break;
    }
    case 'ArrowUp': {
      if (currentItems.length === 0) break;
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : currentItems.length - 1;
      selectedId.value = currentItems[prevIndex].id;
      break;
    }
    case 'Enter': {
      const selectedItem = currentItems.find((item) => item.id === selectedId.value);
      if (selectedItem) {
        executeCommand(selectedItem);
      }
      break;
    }
  }
};

// --- Click outside ---

const handleGlobalOutsideClick = (event) => {
  if (isOpen.value && menuRef.value && !menuRef.value.contains(event.target)) {
    const isCtrlClickOnMac = event.ctrlKey && isMacOS();
    const isLeftClick = event.button === 0 && !isCtrlClickOnMac;

    if (isLeftClick) {
      moveCursorToMouseEvent(event, props.editor);
    }
    closeMenu();
  }
};

/**
 * Determines whether the ContextMenu should handle a context menu event.
 * Checks if the editor is editable, context menu is enabled, and the event
 * should not be bypassed (e.g., modifier keys are not pressed).
 *
 * @param {MouseEvent} event - The context menu event to validate
 * @returns {boolean} true if the ContextMenu should handle the event, false otherwise
 */
const shouldHandleContextMenu = (event) => {
  const readOnly = !props.editor?.isEditable;
  const contextMenuDisabled = props.editor?.options?.disableContextMenu;
  const bypass = shouldBypassContextMenu(event);
  return !readOnly && !contextMenuDisabled && !bypass;
};

/**
 * Capture phase handler for context menu events that marks the event as handled by ContextMenu.
 * This flag is used by PresentationInputBridge to skip forwarding the event to the hidden editor,
 * preventing duplicate context menu handling.
 *
 * The capture phase ensures this runs before PresentationInputBridge's bubble phase handler,
 * allowing us to set the flag before the event reaches other handlers.
 *
 * @param {MouseEvent} event - The context menu event in capture phase
 */
const handleRightClickCapture = (event) => {
  try {
    if (shouldHandleContextMenu(event)) {
      event[CONTEXT_MENU_HANDLED_FLAG] = true;
    }
  } catch (error) {
    console.warn('[ContextMenu] Error in capture phase context menu handler:', error);
  }
};

const handleRightClick = async (event) => {
  if (!shouldHandleContextMenu(event)) return;

  event.preventDefault();

  const editorState = props.editor?.state;
  const hasRangeSelection = editorState?.selection?.from !== editorState?.selection?.to;
  let isClickInsideSelection = false;

  if (hasRangeSelection && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    const hit = props.editor?.posAtCoords?.({ left: event.clientX, top: event.clientY });
    if (typeof hit?.pos === 'number') {
      const { from, to } = editorState.selection;
      isClickInsideSelection = hit.pos >= from && hit.pos <= to;
    }
  }

  if (!isClickInsideSelection) {
    moveCursorToMouseEvent(event, props.editor);
  }

  try {
    const context = await getEditorContext(props.editor, event);
    currentContext.value = context;
    sections.value = getItems({ ...context, trigger: 'click' });
    selectedId.value = flattenedItems.value[0]?.id || null;

    const currentState = props.editor.state;
    if (!currentState) return;

    props.editor.dispatch(
      currentState.tr.setMeta(ContextMenuPluginKey, {
        type: 'open',
        pos: context?.pos ?? currentState.selection.from,
        clientX: event.clientX,
        clientY: event.clientY,
        trigger: 'click',
      }),
    );
  } catch (error) {
    console.error('[ContextMenu] Error opening context menu:', error);
  }
};

// --- Commands ---

const executeCommand = async (item) => {
  if (!props.editor) return;

  // Capture references before closing
  const context = currentContext.value;
  const menuElement = menuRef.value;
  const state = props.editor.state;
  const pluginState = ContextMenuPluginKey.getState(state);

  // For slash-triggered menu, delete the /query text from the document
  if (pluginState?.trigger === 'slash' && pluginState.anchorPos !== null) {
    const cursorPos = state.selection.from;
    const tr = state.tr;
    if (cursorPos > pluginState.anchorPos) {
      tr.delete(pluginState.anchorPos, cursorPos);
    }
    tr.setMeta(ContextMenuPluginKey, { type: 'close' });
    props.editor.dispatch(tr);
  } else {
    props.editor.dispatch(state.tr.setMeta(ContextMenuPluginKey, { type: 'close' }));
  }

  // Execute the action
  if (item.action) await item.action(props.editor, context);

  // Open sub-component popover if needed
  if (item.component) {
    // Convert viewport-relative coordinates (used by fixed-position ContextMenu)
    // to container-relative coordinates (used by absolute-position GenericPopover)
    let popoverPosition = { left: menuPosition.value.left, top: menuPosition.value.top };
    if (menuElement) {
      const menuRect = menuElement.getBoundingClientRect();
      const container = menuElement.closest('.super-editor');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        popoverPosition = {
          left: `${menuRect.left - containerRect.left}px`,
          top: `${menuRect.top - containerRect.top}px`,
        };
      }
    }
    props.openPopover(markRaw(item.component), getPropsByItemId(item.id, props), popoverPosition);
  }

  // Reset local state
  resetMenuState();
};

const closeMenu = () => {
  if (!props.editor) return;
  const state = props.editor.state;
  if (!state) return;

  const pluginState = ContextMenuPluginKey.getState(state);
  if (pluginState?.open) {
    props.editor.dispatch(state.tr.setMeta(ContextMenuPluginKey, { type: 'close' }));
  }

  resetMenuState();
};

const resetMenuState = () => {
  isOpen.value = false;
  searchQuery.value = '';
  sections.value = [];
  cleanupCustomItems();
  currentContext.value = null;
};

// --- Transaction listener: sync search query from document state ---

const handleTransaction = () => {
  if (!isOpen.value) return;

  const state = props.editor?.state;
  if (!state) return;

  const pluginState = ContextMenuPluginKey.getState(state);

  // Plugin closed the menu (auto-close when cursor left /query range)
  if (!pluginState?.open) {
    resetMenuState();
    return;
  }

  // Compute search query from document content after the '/'
  // Use robust extraction: get full text from anchor to cursor, strip leading '/'
  // This handles position shifts from appendTransactions (e.g. wrapTextInRunsPlugin)
  if (pluginState.trigger === 'slash' && pluginState.anchorPos !== null) {
    const cursorPos = state.selection.from;
    if (cursorPos > pluginState.anchorPos) {
      const fullText = state.doc.textBetween(pluginState.anchorPos, cursorPos);
      searchQuery.value = fullText.startsWith('/') ? fullText.slice(1) : '';
    } else {
      searchQuery.value = '';
    }
  }
};

// --- Lifecycle ---

let contextMenuTarget = null;
let contextMenuOpenHandler = null;
let contextMenuCloseHandler = null;
let contextMenuNavigateHandler = null;
let updateHandler = null;

onMounted(() => {
  if (!props.editor) return;

  document.addEventListener('pointerdown', handleGlobalOutsideClick);

  // Close menu if editor becomes read-only
  updateHandler = () => {
    if (!props.editor?.isEditable && isOpen.value) {
      closeMenu();
    }
  };
  props.editor.on('update', updateHandler);

  // Sync search query on every transaction
  props.editor.on('transaction', handleTransaction);

  // Handle menu open events (carries menuPosition from plugin)
  contextMenuOpenHandler = async (event) => {
    const readOnly = !props.editor?.isEditable;
    if (readOnly) return;

    isOpen.value = true;
    menuPosition.value = event.menuPosition;
    searchQuery.value = '';

    // Load context and menu items if not already set (right-click sets them before dispatch)
    if (!currentContext.value) {
      const context = await getEditorContext(props.editor);
      currentContext.value = context;
      const pluginState = ContextMenuPluginKey.getState(props.editor.state);
      const trigger = pluginState?.trigger === 'click' ? 'click' : 'slash';
      sections.value = getItems({ ...context, trigger });
      selectedId.value = flattenedItems.value[0]?.id || null;
    } else if (sections.value.length === 0) {
      const pluginState = ContextMenuPluginKey.getState(props.editor.state);
      const trigger = pluginState?.trigger === 'click' ? 'click' : 'slash';
      sections.value = getItems({ ...currentContext.value, trigger });
      selectedId.value = flattenedItems.value[0]?.id || null;
    }
  };
  props.editor.on('contextMenu:open', contextMenuOpenHandler);

  // Handle menu close events
  contextMenuCloseHandler = () => {
    resetMenuState();
  };
  props.editor.on('contextMenu:close', contextMenuCloseHandler);

  // Handle navigation events from PM plugin (ArrowDown/Up/Enter)
  contextMenuNavigateHandler = handleNavigate;
  props.editor.on('contextMenu:navigate', contextMenuNavigateHandler);

  // Attach context menu to the active surface
  contextMenuTarget = getEditorSurfaceElement(props.editor);
  if (contextMenuTarget) {
    contextMenuTarget.addEventListener('contextmenu', handleRightClickCapture, true);
    contextMenuTarget.addEventListener('contextmenu', handleRightClick);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalOutsideClick);

  cleanupCustomItems();

  if (props.editor) {
    try {
      if (contextMenuOpenHandler) {
        props.editor.off('contextMenu:open', contextMenuOpenHandler);
      }
      if (contextMenuCloseHandler) {
        props.editor.off('contextMenu:close', contextMenuCloseHandler);
      }
      if (contextMenuNavigateHandler) {
        props.editor.off('contextMenu:navigate', contextMenuNavigateHandler);
      }
      if (updateHandler) {
        props.editor.off('update', updateHandler);
      }
      props.editor.off('transaction', handleTransaction);
      contextMenuTarget?.removeEventListener('contextmenu', handleRightClickCapture, true);
      contextMenuTarget?.removeEventListener('contextmenu', handleRightClick);
    } catch (error) {
      console.warn('[ContextMenu] Error during cleanup:', error);
    }
  }
});
</script>

<template>
  <div v-if="isOpen" ref="menuRef" class="context-menu" :style="menuPosition" @pointerdown.stop>
    <!-- Filter header -->
    <div v-if="searchQuery" class="context-menu-header">Filtered results</div>

    <div class="context-menu-items">
      <template v-if="filteredItems.length > 0">
        <template v-for="(section, sectionIndex) in filteredSections" :key="section.id">
          <div v-if="sectionIndex > 0 && section.items.length > 0" class="context-menu-divider"></div>
          <template v-for="item in section.items" :key="item.id">
            <div
              class="context-menu-item"
              :class="{ 'is-selected': item.id === selectedId }"
              @click="executeCommand(item)"
            >
              <div :ref="(el) => setCustomItemRef(el, item)" class="context-menu-custom-item">
                <template v-if="!item.render">
                  <span v-if="item.icon" class="context-menu-item-icon" v-html="item.icon"></span>
                  <span class="context-menu-item-label">{{ item.label }}</span>
                </template>
              </div>
            </div>
          </template>
        </template>
      </template>
      <div v-else class="context-menu-no-results">No results</div>
    </div>

    <!-- Footer -->
    <div class="context-menu-footer">
      <span>Close menu</span>
      <kbd>esc</kbd>
    </div>
  </div>
</template>

<style>
.context-menu {
  position: fixed;
  z-index: 50;
  width: 220px;
  color: #37352f;
  background: white;
  border-radius: 6px;
  box-shadow:
    0 0 0 1px rgba(15, 15, 15, 0.05),
    0 3px 6px rgba(15, 15, 15, 0.1),
    0 9px 24px rgba(15, 15, 15, 0.2);
  margin-top: 0.25rem;
  font-size: 14px;
  overflow: hidden;
}

.context-menu-header {
  padding: 6px 14px 2px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(55, 53, 47, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.context-menu-items {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
}

.context-menu-item {
  padding: 4px 14px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  min-height: 28px;
  transition: background 80ms ease-in;
}

.context-menu-item:hover {
  background: rgba(55, 53, 47, 0.08);
}

.context-menu-item.is-selected {
  background: rgba(35, 131, 226, 0.14);
}

.context-menu-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 8px;
  color: rgba(55, 53, 47, 0.85);
}

.context-menu .context-menu-item-icon svg {
  height: 14px;
  width: 14px;
}

.context-menu-item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-menu-no-results {
  padding: 8px 14px;
  color: rgba(55, 53, 47, 0.5);
  font-size: 12px;
}

.context-menu-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 14px;
  border-top: 1px solid rgba(55, 53, 47, 0.09);
  font-size: 12px;
  color: rgba(55, 53, 47, 0.5);
}

.context-menu-footer kbd {
  font-family: inherit;
  font-size: 11px;
  padding: 1px 5px;
  border: 1px solid rgba(55, 53, 47, 0.16);
  border-radius: 3px;
  background: rgba(55, 53, 47, 0.04);
  color: rgba(55, 53, 47, 0.5);
}

.context-menu-divider {
  height: 1px;
  background: rgba(55, 53, 47, 0.09);
  margin: 4px 0;
}

.context-menu-custom-item {
  display: flex;
  align-items: center;
  width: 100%;
}

.context-menu-default-content {
  display: flex;
  align-items: center;
  width: 100%;
}

.popover {
  background: white;
  border-radius: 6px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.05),
    0px 10px 20px rgba(0, 0, 0, 0.1);
  z-index: 100;
}
</style>
