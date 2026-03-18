<script setup>
import { computed, getCurrentInstance, ref, watch, onBeforeUnmount } from 'vue';
import ToolbarButton from './ToolbarButton.vue';
import ToolbarSeparator from './ToolbarSeparator.vue';
import OverflowMenu from './OverflowMenu.vue';
import ToolbarDropdown from './ToolbarDropdown.vue';
import SdTooltip from './SdTooltip.vue';
import { useHighContrastMode } from '../../composables/use-high-contrast-mode';

const emit = defineEmits(['command', 'item-clicked', 'dropdown-update-show']);
const { proxy } = getCurrentInstance();

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
});

const currentItem = ref(null);
const { isHighContrastMode } = useHighContrastMode();
// Matches media query from SuperDoc.vue
const isMobile = window.matchMedia('(max-width: 768px)').matches;
const styleMap = {
  left: {
    minWidth: '120px',
    justifyContent: 'flex-start',
  },
  right: {
    minWidth: '120px',
    justifyContent: 'flex-end',
  },
  default: {
    // Only grow if not on a mobile device
    flexGrow: isMobile ? 0 : 1,
    justifyContent: 'center',
  },
};

const getPositionStyle = computed(() => {
  return styleMap[props.position] || styleMap.default;
});

const isButton = (item) => item.type === 'button';
const isDropdown = (item) => item.type === 'dropdown';
const isSeparator = (item) => item.type === 'separator';
const isOverflow = (item) => item.type === 'overflow';

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
  emit('command', { item, argument });
};

const handleToolbarButtonTextSubmit = (item, argument) => {
  if (item.disabled.value) return;
  currentItem.value = null;
  emit('command', { item, argument });
};

const closeDropdowns = () => {
  const toolbarItems = proxy?.$toolbar?.toolbarItems || [];
  const overflowItems = proxy?.$toolbar?.overflowItems || [];
  const allItems = [...toolbarItems, ...overflowItems];

  const itemsToClose = allItems.length ? allItems : props.toolbarItems;
  itemsToClose.forEach((toolbarItem) => {
    const shouldCloseOverflow = isOverflow(toolbarItem) && !props.fromOverflow;
    if (isDropdown(toolbarItem) || shouldCloseOverflow) {
      setExpanded(toolbarItem, false);
    }
  });
  currentItem.value = null;
};

const handleSelect = (item, option) => {
  closeDropdowns();
  const value = item.dropdownValueKey.value ? option[item.dropdownValueKey.value] : option.label;
  emit('command', { item, argument: value, option });
  item.selectedValue.value = option.key;
};

const dropdownOptions = (item) => {
  if (!item.nestedOptions?.value?.length) return [];
  return item.nestedOptions.value.map((option) => {
    const isSelected = option?.type !== 'render' && item.selectedValue.value === option.key;
    return {
      ...option,
      props: {
        ...option.props,
        class: isSelected ? 'selected' : '',
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
  const nextButton = e.target.closest('.toolbar-item-ctn').nextElementSibling;
  if (nextButton) {
    currentButton.setAttribute('tabindex', '-1');
    nextButton.setAttribute('tabindex', '0');
    nextButton.focus();
  }
};

const moveToPreviousButton = (e) => {
  const currentButton = e.target;
  const previousButton = e.target.closest('.toolbar-item-ctn').previousElementSibling;
  if (previousButton) {
    currentButton.setAttribute('tabindex', '-1');
    previousButton.setAttribute('tabindex', '0');
    previousButton.focus();
  }
};

const moveToNextButtonGroup = (e) => {
  const nextButtonGroup = e.target.closest('.button-group').nextElementSibling;
  if (nextButtonGroup) {
    nextButtonGroup.setAttribute('tabindex', '0');
    nextButtonGroup.focus();
  } else {
    // Move to the editor
    const editor = document.querySelector('.ProseMirror');
    if (editor) {
      editor.focus();
    }
  }
};

const moveToPreviousButtonGroup = (e) => {
  const previousButtonGroup = e.target.closest('.button-group').previousElementSibling;
  if (previousButtonGroup) {
    previousButtonGroup.setAttribute('tabindex', '0');
    previousButtonGroup.focus();
  }
};

// Implement keyboard navigation using Roving Tabindex
// https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex
// Set tabindex to 0 for the current focused button
// Set tabindex to -1 for all other buttons
const handleKeyDown = (e, item) => {
  const isTypingField = e.target.nodeName === 'INPUT' || e.target.nodeName === 'TEXTAREA';
  const isTypingToolbarItem = item.name.value === 'fontSize';
  // If the user is typing in a field or textarea, and the toolbar item is a font size,
  // don't prevent the default behavior. Allow normal typing behavior.
  if (isTypingField && isTypingToolbarItem) {
    return;
  }
  e.preventDefault();

  switch (e.key) {
    case 'Enter':
      handleToolbarButtonClick(item, null, false);
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
  const firstButton = toolbarItemRefs.value.find((item) => !item.classList.contains('disabled'));
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
  if (target.closest('.sd-toolbar-dropdown-menu')) return;
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
  <div :style="getPositionStyle" class="button-group" role="group" @focus="handleFocus" ref="buttonGroupRef">
    <div
      v-for="(item, index) in toolbarItems"
      :key="item.id.value"
      :class="{
        narrow: item.isNarrow.value,
        wide: item.isWide.value,
        disabled: item.disabled.value,
      }"
      @keydown="(e) => handleKeyDown(e, item)"
      class="toolbar-item-ctn"
      ref="toolbarItemRefs"
      :tabindex="index === 0 ? 0 : -1"
      :data-item-id="item.id.value"
    >
      <!-- toolbar separator -->
      <ToolbarSeparator v-if="isSeparator(item)" style="width: 20px" />

      <!-- Toolbar button -->
      <ToolbarDropdown
        v-if="isDropdown(item) && item.nestedOptions?.value?.length"
        :options="dropdownOptions(item)"
        :disabled="item.disabled.value"
        :show="getExpanded(item)"
        :content-style="{ fontFamily: props.uiFontFamily }"
        placement="bottom-start"
        class="toolbar-button sd-editor-toolbar-dropdown"
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
            :content-style="{ fontFamily: props.uiFontFamily }"
          >
            <template #trigger>
              <ToolbarButton
                :toolbar-item="item"
                :disabled="item.disabled.value"
                @textSubmit="handleToolbarButtonTextSubmit(item, $event)"
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
