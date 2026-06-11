<script setup>
import { computed, getCurrentInstance, nextTick, ref, watch, onBeforeUnmount } from 'vue';
import ToolbarButton from './ToolbarButton.vue';
import ToolbarSeparator from './ToolbarSeparator.vue';
import OverflowMenu from './OverflowMenu.vue';
import ToolbarDropdown from './ToolbarDropdown.vue';
import FontFamilyCombobox from './FontFamilyCombobox.vue';
import SdTooltip from './SdTooltip.vue';
import { useHighContrastMode } from '../../composables/use-high-contrast-mode';
import { prepareSelectionForTextInputHandoff } from '@core/selection-state.js';

const emit = defineEmits(['command', 'item-clicked', 'dropdown-update-show']);
const { proxy } = getCurrentInstance();
const TOOLBAR_TOOLTIP_AUTO_HIDE_MS = 3000;

const toolbarItemRefs = ref([]);
const buttonGroupRef = ref(null);
const props = defineProps({
  toolbarItems: {
    type: Array,
    required: true,
  },
  overflowItems: {
    type: Array,
    default: () => [],
  },
  /**
   * The font-family to use for UI elements like dropdowns and tooltips.
   * This ensures consistent typography across toolbar UI components.
   * @type {string}
   * @default 'Arial, Helvetica, sans-serif'
   */
  uiFontFamily: {
    type: String,
    default: 'Arial, Helvetica, sans-serif',
  },
  position: {
    type: String,
    default: 'left',
  },
  fromOverflow: {
    type: Boolean,
    default: false,
  },
  compactSideGroups: {
    type: Boolean,
    default: false,
  },
});

const currentItem = ref(null);
const { isHighContrastMode } = useHighContrastMode();
// Matches media query from SuperDoc.vue
const isMobile = window.matchMedia('(max-width: 768px)').matches;

const getPositionStyle = computed(() => {
  if (props.position === 'left') {
    return {
      minWidth: props.compactSideGroups ? 'auto' : '120px',
      justifyContent: 'flex-start',
    };
  }

  if (props.position === 'right') {
    return {
      minWidth: props.compactSideGroups ? 'auto' : '120px',
      justifyContent: 'flex-end',
    };
  }

  return {
    // Only grow if not on a mobile device
    flexGrow: isMobile ? 0 : 1,
    justifyContent: 'center',
  };
});

const isButton = (item) => item.type === 'button';
const isDropdown = (item) => item.type === 'dropdown';
const isFontFamily = (item) => item.type === 'dropdown' && item.name?.value === 'fontFamily';
const isSeparator = (item) => item.type === 'separator';
const isOverflow = (item) => item.type === 'overflow';
const hasNestedOptions = (item) => Boolean(item.nestedOptions?.value?.length);

const getExpanded = (item) => {
  if (!item) return false;
  const expand = item.expand;
  if (typeof expand === 'object' && expand !== null && 'value' in expand) {
    return Boolean(expand.value);
  }
  return Boolean(expand);
};

const setExpanded = (item, open) => {
  if (!item?.expand) return;
  item.expand.value = open;
};

const handleToolbarButtonClick = (item, argument = null) => {
  if (item.disabled.value) return;

  if (isOverflow(item)) {
    const willOpen = !getExpanded(item);
    if (willOpen) {
      closeDropdowns();
    }
    setExpanded(item, willOpen);
    currentItem.value = willOpen ? item : null;
    emit('item-clicked');
    return;
  }

  if (isDropdown(item)) {
    return;
  }

  if (currentItem.value && isDropdown(currentItem.value) && getExpanded(currentItem.value)) {
    closeDropdowns();
  }

  emit('item-clicked');
  // Forward the item's static `argument` (set via `useToolbarItem({ argument })`)
  // when no caller-provided argument exists. Lets buttons carry fixed args like
  // `{ direction: 'rtl' }` without needing a dropdown.
  const resolved = argument ?? item.argument?.value ?? null;
  emit('command', { item, argument: resolved });
};

const handleToolbarButtonTextSubmit = (item, argument) => {
  if (item.disabled.value) return;
  currentItem.value = null;
  emit('command', { item, argument });
};

const handleSplitButtonMainClick = (item) => {
  if (item.disabled.value) return;

  closeDropdowns();

  const splitCommand = item.splitButtonCommand;
  const dropdownCommand = item.command;
  const targetCommand = splitCommand || dropdownCommand;
  if (!targetCommand) return;

  const commandItem = { ...item, command: targetCommand };
  emit('item-clicked');
  emit('command', { item: commandItem, argument: null });
};

const closeDropdowns = (exceptItem = null) => {
  const toolbarItems = proxy?.$toolbar?.toolbarItems || [];
  const overflowItems = proxy?.$toolbar?.overflowItems || [];
  const allItems = [...toolbarItems, ...overflowItems];

  const itemsToClose = allItems.length ? allItems : props.toolbarItems;
  itemsToClose.forEach((toolbarItem) => {
    if (toolbarItem === exceptItem) return;
    const shouldCloseOverflow = isOverflow(toolbarItem) && !props.fromOverflow;
    if (isDropdown(toolbarItem) || shouldCloseOverflow) {
      setExpanded(toolbarItem, false);
    }
  });
  if (!exceptItem || currentItem.value !== exceptItem) {
    currentItem.value = null;
  }
};

const handleSelect = (item, option) => {
  closeDropdowns();
  const value = item.dropdownValueKey.value ? option[item.dropdownValueKey.value] : option.label;
  emit('command', { item, argument: value, option });
  item.selectedValue.value = option.key;
};

const handleComboboxItemClicked = (item) => {
  closeDropdowns(item);
  emit('item-clicked');
};

const handleComboboxCommand = (payload) => {
  emit('command', payload);
};

const waitForFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const flushPendingToolbarMarks = () => Boolean(proxy?.$toolbar?.flushPendingMarkCommands?.());

const handleEditorTextInputHandoff = () => {
  flushPendingToolbarMarks();
  prepareSelectionForTextInputHandoff(proxy?.$toolbar?.activeEditor);
  focusEditor();
};

const handleComboboxTabOut = (startIndex, event) => {
  closeDropdowns();
  flushPendingToolbarMarks();
  if (event.shiftKey) {
    focusAdjacentToolbarControlAfterUpdate(startIndex, -1, () => focusPreviousButtonGroup() || focusEditor());
  } else {
    focusAdjacentToolbarControlAfterUpdate(startIndex, 1, true);
  }
};

const handleToolbarButtonTabOut = (item, event) => {
  closeDropdowns();
  if (item.name.value === 'fontSize' && !event.shiftKey) {
    handleEditorTextInputHandoff();
    return;
  }
  if (event.shiftKey) {
    moveToAdjacentToolbarControl(event, -1);
  } else {
    moveToAdjacentToolbarControl(event, 1) || focusEditor();
  }
};

const dropdownOptions = (item) => {
  if (!item.nestedOptions?.value?.length) return [];
  return item.nestedOptions.value.map((option) => {
    const isSelected = option?.type !== 'render' && item.selectedValue.value === option.key;
    return {
      ...option,
      props: {
        ...option.props,
        class: isSelected ? 'sd-selected' : '',
      },
    };
  });
};

const getDropdownAttributes = (option, item) => {
  return {
    role: 'menuitem',
    ariaLabel: `${item.attributes.value.ariaLabel} - ${option.label}`,
  };
};

const moveToNextButton = (e) => {
  const currentButton = e.target;
  const nextButton = e.target.closest('.sd-toolbar-item-ctn').nextElementSibling;
  if (nextButton) {
    currentButton.setAttribute('tabindex', '-1');
    nextButton.setAttribute('tabindex', '0');
    nextButton.focus();
  }
};

const moveToPreviousButton = (e) => {
  const currentButton = e.target;
  const previousButton = e.target.closest('.sd-toolbar-item-ctn').previousElementSibling;
  if (previousButton) {
    currentButton.setAttribute('tabindex', '-1');
    previousButton.setAttribute('tabindex', '0');
    previousButton.focus();
  }
};

const focusEditor = () => {
  const editor = proxy?.$toolbar?.activeEditor;
  if (editor && typeof editor.focus === 'function') {
    editor.focus();
    return true;
  }

  const editorDom = editor?.view?.dom;
  if (editorDom instanceof HTMLElement) {
    editorDom.focus();
    return true;
  }
  return false;
};

const getToolbarItemFocusTarget = (container) => {
  if (!(container instanceof HTMLElement)) return null;
  if (container.classList.contains('sd-disabled')) return null;
  const target =
    container.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])') ||
    container.querySelector(
      'button:not([disabled]), [role="button"]:not(.sd-disabled), [tabindex]:not([tabindex="-1"])',
    );
  return target;
};

const getCurrentToolbarItemContainers = () => {
  if (toolbarItemRefs.value.length) return toolbarItemRefs.value;
  const group = document.querySelector(`.button-group[data-toolbar-position="${props.position}"]`);
  if (!group) return [];
  return Array.from(group.querySelectorAll(':scope > .sd-toolbar-item-ctn'));
};

const focusToolbarControlFromIndex = (startIndex, direction) => {
  if (startIndex < 0) return false;
  const containers = getCurrentToolbarItemContainers();

  let index = startIndex + direction;
  while (index >= 0 && index < containers.length) {
    const container = containers[index];
    const target = getToolbarItemFocusTarget(container);
    if (target instanceof HTMLElement) {
      containers[startIndex]?.setAttribute('tabindex', '-1');
      container.setAttribute('tabindex', '0');
      target.focus();
      return true;
    }
    index += direction;
  }

  return false;
};

const focusPreviousButtonGroup = () => {
  const previousButtonGroup = buttonGroupRef.value?.previousElementSibling;
  if (previousButtonGroup instanceof HTMLElement) {
    previousButtonGroup.setAttribute('tabindex', '0');
    previousButtonGroup.focus();
    return true;
  }
  return false;
};

const focusAdjacentToolbarControlAfterUpdate = async (startIndex, direction, fallback = false) => {
  await nextTick();
  await waitForFrame();
  if (focusToolbarControlFromIndex(startIndex, direction)) {
    return;
  }
  if (typeof fallback === 'function') {
    fallback();
    return;
  }
  if (fallback) {
    focusEditor();
  }
};

const moveToAdjacentToolbarControl = (event, direction) => {
  const current = event.target.closest('.sd-toolbar-item-ctn');
  if (!(current instanceof HTMLElement)) return false;

  let candidate = direction > 0 ? current.nextElementSibling : current.previousElementSibling;
  while (candidate) {
    const target = getToolbarItemFocusTarget(candidate);
    if (target instanceof HTMLElement) {
      current.setAttribute('tabindex', '-1');
      candidate.setAttribute('tabindex', '0');
      target.focus();
      return true;
    }
    candidate = direction > 0 ? candidate.nextElementSibling : candidate.previousElementSibling;
  }

  return false;
};

const moveToNextButtonGroup = (e) => {
  const nextButtonGroup = e.target.closest('.button-group').nextElementSibling;
  if (nextButtonGroup) {
    nextButtonGroup.setAttribute('tabindex', '0');
    nextButtonGroup.focus();
  } else {
    focusEditor();
  }
};

const moveToPreviousButtonGroup = (e) => {
  const previousButtonGroup = e.target.closest('.button-group').previousElementSibling;
  if (previousButtonGroup) {
    previousButtonGroup.setAttribute('tabindex', '0');
    previousButtonGroup.focus();
  }
};

const activateToolbarItem = (item) => {
  if (item.disabled.value) return;

  if (isDropdown(item)) {
    handleDropdownUpdateShowForItem(!getExpanded(item), item);
    return;
  }

  handleToolbarButtonClick(item, null, false);
};

// Implement keyboard navigation using Roving Tabindex
// https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex
// Set tabindex to 0 for the current focused button
// Set tabindex to -1 for all other buttons
const handleKeyDown = (e, item) => {
  const isTypingField = e.target.nodeName === 'INPUT' || e.target.nodeName === 'TEXTAREA';
  const isTypingToolbarItem = item.name.value === 'fontSize' || item.name.value === 'fontFamily';
  // When typing in a font input (size or the family combobox), let the field own its
  // keyboard (Enter/Tab/Escape/Space/arrows) instead of the roving-tabindex handler.
  if (isTypingField && isTypingToolbarItem) {
    return;
  }

  const handledKeys = ['Enter', ' ', 'Spacebar', 'Escape', 'ArrowRight', 'ArrowLeft', 'Tab'];
  if (!handledKeys.includes(e.key)) return;
  e.preventDefault();

  switch (e.key) {
    case 'Enter':
    case ' ':
    case 'Spacebar':
      activateToolbarItem(item);
      break;
    case 'Escape':
      closeDropdowns();
      break;
    case 'ArrowRight':
      closeDropdowns();
      moveToNextButton(e);
      break;
    case 'ArrowLeft':
      closeDropdowns();
      moveToPreviousButton(e);
      break;
    case 'Tab':
      if (e.shiftKey) {
        moveToPreviousButtonGroup(e);
      } else {
        moveToNextButtonGroup(e);
      }
      break;
    default:
      break;
  }
};
const handleFocus = (e) => {
  // Set the focus to the first button inside the button group that is not disabled
  const firstButton = toolbarItemRefs.value.find((item) => !item.classList.contains('sd-disabled'));
  if (firstButton) {
    firstButton.setAttribute('tabindex', '0');
    firstButton.focus();
  }
};

const handleDropdownUpdateShowForItem = (open, item) => {
  emit('item-clicked');

  if (!open) {
    closeDropdowns();
    emit('dropdown-update-show', false);
    return;
  }

  closeDropdowns();
  currentItem.value = item;
  setExpanded(item, true);

  emit('dropdown-update-show', true);
};

const handleDocumentPointerDown = (event) => {
  if (!currentItem.value) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  // Dropdown content is teleported outside the toolbar group.
  // Treat menu clicks as "inside" so option clicks do not close before selection.
  if (target.closest('.sd-toolbar-dropdown-menu, .sd-font-combobox__listbox')) return;
  if (buttonGroupRef.value?.contains(target)) return;

  closeDropdowns();
};

const isCurrentItemExpanded = () => {
  return getExpanded(currentItem.value);
};

watch(
  isCurrentItemExpanded,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    } else {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
});
</script>

<template>
  <div
    :style="getPositionStyle"
    class="button-group"
    role="group"
    @focus="handleFocus"
    ref="buttonGroupRef"
    :data-toolbar-position="props.position"
  >
    <div
      v-for="(item, index) in toolbarItems"
      :key="item.id.value"
      :class="{
        narrow: item.isNarrow.value,
        wide: item.isWide.value,
        'sd-disabled': item.disabled.value,
      }"
      @keydown="(e) => handleKeyDown(e, item)"
      class="sd-toolbar-item-ctn"
      ref="toolbarItemRefs"
      :tabindex="index === 0 ? 0 : -1"
      :data-item-id="item.id.value"
    >
      <!-- toolbar separator -->
      <ToolbarSeparator v-if="isSeparator(item)" style="width: 20px" />

      <SdTooltip
        v-if="isFontFamily(item) && hasNestedOptions(item)"
        trigger="hover"
        :disabled="!item.tooltip?.value"
        :auto-hide-duration="TOOLBAR_TOOLTIP_AUTO_HIDE_MS"
        :content-style="{ fontFamily: props.uiFontFamily }"
      >
        <template #trigger>
          <FontFamilyCombobox
            :item="item"
            :ui-font-family="props.uiFontFamily"
            class="sd-toolbar-button sd-editor-toolbar-dropdown"
            @command="handleComboboxCommand"
            @item-clicked="handleComboboxItemClicked(item)"
            @tab-out="handleComboboxTabOut(index, $event)"
            @editor-handoff="handleEditorTextInputHandoff"
          />
        </template>
        <div>
          {{ item.tooltip }}
          <span v-if="item.disabled.value">(disabled)</span>
        </div>
      </SdTooltip>

      <!-- Toolbar button -->
      <ToolbarDropdown
        v-else-if="isDropdown(item) && hasNestedOptions(item)"
        :options="dropdownOptions(item)"
        :disabled="item.disabled.value"
        :show="getExpanded(item)"
        :content-style="{ fontFamily: props.uiFontFamily }"
        placement="bottom-start"
        class="sd-toolbar-button sd-editor-toolbar-dropdown"
        @select="(key, option) => handleSelect(item, option)"
        @update:show="(open) => handleDropdownUpdateShowForItem(open, item)"
        :style="item.dropdownStyles.value"
        :menu-props="
          () => ({
            role: 'menu',
            style: { fontFamily: props.uiFontFamily },
            class: ['sd-toolbar-dropdown-menu', { 'high-contrast': isHighContrastMode }],
          })
        "
        :node-props="(option) => getDropdownAttributes(option, item)"
      >
        <template #trigger>
          <SdTooltip
            trigger="hover"
            :disabled="!item.tooltip?.value"
            :auto-hide-duration="TOOLBAR_TOOLTIP_AUTO_HIDE_MS"
            :content-style="{ fontFamily: props.uiFontFamily }"
          >
            <template #trigger>
              <ToolbarButton
                :toolbar-item="item"
                :disabled="item.disabled.value"
                :allow-enter-propagation="true"
                @textSubmit="handleToolbarButtonTextSubmit(item, $event)"
                @mainClick="handleSplitButtonMainClick(item)"
                @tabOut="handleToolbarButtonTabOut(item, $event)"
              />
            </template>
            <div>
              {{ item.tooltip }}
              <span v-if="item.disabled.value">(disabled)</span>
            </div>
          </SdTooltip>
        </template>
      </ToolbarDropdown>

      <SdTooltip
        trigger="hover"
        v-else-if="isButton(item)"
        class="sd-editor-toolbar-tooltip"
        :auto-hide-duration="TOOLBAR_TOOLTIP_AUTO_HIDE_MS"
        :content-style="{ fontFamily: props.uiFontFamily }"
      >
        <template #trigger>
          <ToolbarButton
            :toolbar-item="item"
            :is-overflow-item="fromOverflow"
            @textSubmit="handleToolbarButtonTextSubmit(item, $event)"
            @buttonClick="handleToolbarButtonClick(item)"
          />
        </template>
        <div v-if="item.tooltip">
          {{ item.tooltip }}
          <span v-if="item.disabled.value">(disabled)</span>
        </div>
      </SdTooltip>

      <!-- Overflow menu -->
      <OverflowMenu
        v-if="isOverflow(item) && overflowItems.length"
        :toolbar-item="item"
        @buttonClick="handleToolbarButtonClick(item)"
        :overflow-items="overflowItems"
        @close="closeDropdowns"
      />
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.button-group {
  display: flex;
}
</style>
