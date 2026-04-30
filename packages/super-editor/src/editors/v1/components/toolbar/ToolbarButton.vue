<script setup>
import ToolbarButtonIcon from './ToolbarButtonIcon.vue';
import { ref, computed, nextTick } from 'vue';
import { toolbarIcons } from './toolbarIcons.js';
import { useHighContrastMode } from '../../composables/use-high-contrast-mode';
const emit = defineEmits(['buttonClick', 'textSubmit', 'mainClick']);

const props = defineProps({
  iconColor: {
    type: String,
    default: null,
  },
  active: {
    type: Boolean,
    default: false,
  },
  isNarrow: {
    type: Boolean,
    default: false,
  },
  isWide: {
    type: Boolean,
    default: false,
  },
  toolbarItem: {
    type: Object,
    required: true,
  },
  defaultLabel: {
    type: String,
    default: null,
  },
  isOverflowItem: {
    type: Boolean,
    default: false,
  },
});

const {
  name,
  active,
  icon,
  label,
  hideLabel,
  iconColor,
  hasCaret,
  splitButton,
  disabled,
  inlineTextInputVisible,
  hasInlineTextInput,
  minWidth,
  style,
  attributes,
} = props.toolbarItem;

const isSplit = computed(() => Boolean(splitButton?.value) && Boolean(hasCaret?.value));

const inlineTextInput = ref(label);
const inlineInput = ref(null);
const { isHighContrastMode } = useHighContrastMode();

const handleClick = () => {
  if (hasInlineTextInput) {
    nextTick(() => {
      inlineInput.value?.focus();
      inlineInput.value?.select();
    });
  }
  emit('buttonClick');
};

const handleSplitMainClick = (event) => {
  if (disabled?.value) return;
  event?.stopPropagation();
  emit('mainClick');
};

const handleOuterClick = () => {
  if (isSplit.value) return;
  handleClick();
};

const handleOuterEnter = (event) => {
  if (isSplit.value) {
    handleSplitMainClick(event);
    return;
  }
  handleClick();
};

const handleInputSubmit = () => {
  const value = inlineTextInput.value;
  const cleanValue = value.match(/^\d+(\.5)?$/) ? value : Math.floor(parseFloat(value)).toString();
  emit('textSubmit', cleanValue);
  inlineTextInput.value = cleanValue;
};

const getStyle = computed(() => {
  if (style.value) return style.value;
  return {
    minWidth: props.minWidth,
  };
});

const onFontSizeInput = (event) => {
  let { value } = event.target;
  inlineTextInput.value = value.replace(/[^0-9]/g, '');
};

const caretIcon = computed(() => {
  return active.value ? toolbarIcons.dropdownCaretUp : toolbarIcons.dropdownCaretDown;
});
</script>

<template>
  <div
    :class="['toolbar-item', attributes.className]"
    :style="getStyle"
    :role="isOverflowItem ? 'menuitem' : 'button'"
    :aria-label="attributes.ariaLabel"
    @click="handleOuterClick"
    @keydown.enter.stop="handleOuterEnter($event)"
    tabindex="0"
  >
    <div
      class="toolbar-button"
      :class="{
        active,
        disabled,
        narrow: isNarrow,
        wide: isWide,
        split: isSplit,
        'has-inline-text-input': hasInlineTextInput,
        'high-contrast': isHighContrastMode,
      }"
      :data-item="`btn-${name || ''}`"
    >
      <div
        v-if="isSplit"
        class="toolbar-button__main"
        :data-item="`btn-${name || ''}-main`"
        @click="handleSplitMainClick($event)"
      >
        <ToolbarButtonIcon v-if="icon" :color="iconColor" class="toolbar-icon" :icon="icon" :name="name">
        </ToolbarButtonIcon>
        <div class="button-label" v-if="label && !hideLabel && !inlineTextInputVisible">
          {{ label }}
        </div>
      </div>
      <div
        v-if="isSplit"
        class="toolbar-button__caret"
        :data-item="`btn-${name || ''}-caret`"
        :aria-label="`${attributes.ariaLabel} options`"
        role="button"
      >
        <div class="dropdown-caret" v-html="caretIcon" :style="{ opacity: disabled ? 0.6 : 1 }"></div>
      </div>

      <template v-else>
        <ToolbarButtonIcon v-if="icon" :color="iconColor" class="toolbar-icon" :icon="icon" :name="name">
        </ToolbarButtonIcon>

        <div class="button-label" v-if="label && !hideLabel && !inlineTextInputVisible">
          {{ label }}
        </div>

        <span v-if="inlineTextInputVisible">
          <input
            v-if="name === 'fontSize'"
            v-model="inlineTextInput"
            @keydown.enter.prevent="handleInputSubmit"
            type="text"
            class="button-text-input button-text-input--font-size"
            :class="{ 'high-contrast': isHighContrastMode }"
            :id="'inlineTextInput-' + name"
            autocomplete="off"
            ref="inlineInput"
          />
          <input
            v-else
            v-model="inlineTextInput"
            :placeholder="label"
            @keydown.enter.prevent="handleInputSubmit"
            type="text"
            class="button-text-input"
            :id="'inlineTextInput-' + name"
            autocomplete="off"
            ref="inlineInput"
          />
        </span>

        <div v-if="hasCaret" class="dropdown-caret" v-html="caretIcon" :style="{ opacity: disabled ? 0.6 : 1 }"></div>
      </template>

      <div aria-live="polite" class="visually-hidden">
        {{ `${attributes.ariaLabel} ${active ? 'selected' : 'unset'}` }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar-item {
  position: relative;
  z-index: 1;
  min-width: 30px;
  margin: 0 calc(var(--sd-ui-toolbar-item-gap, 2px) / 2);
}

.visually-hidden {
  position: absolute;
  left: -9999px;
  height: 1px;
  width: 1px;
  overflow: hidden;
}

.toolbar-button {
  padding: var(--sd-ui-toolbar-item-padding, 5px);
  height: var(--sd-ui-toolbar-height, 32px);
  max-height: var(--sd-ui-toolbar-height, 32px);
  border-radius: var(--sd-ui-radius, 6px);
  overflow-y: visible;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--sd-ui-toolbar-button-text, #47484a);
  transition: all 0.2s ease-out;
  user-select: none;
  position: relative;
  box-sizing: border-box;
}

.toolbar-button:hover {
  background-color: var(--sd-ui-toolbar-button-hover-bg, var(--sd-ui-hover-bg, #dbdbdb));

  .toolbar-icon {
    &.high-contrast {
      color: #fff;
    }
  }

  &.high-contrast {
    background-color: #000;
    color: #fff;
  }
}

.toolbar-button:active,
.active {
  background-color: var(--sd-ui-toolbar-button-active-bg, var(--sd-ui-active-bg, #c8d0d8));
}

.button-label {
  overflow: hidden;
  width: 100%;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
  font-size: var(--sd-ui-font-size-500, 15px);
  margin: 5px;
}

.toolbar-icon + .dropdown-caret {
  margin-left: 4px;
}

.toolbar-button.split {
  padding: 0;
  gap: 0;
}

.toolbar-button.split .toolbar-button__main,
.toolbar-button.split .toolbar-button__caret {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

.toolbar-button.split .toolbar-button__main {
  padding: 0 3px 0 var(--sd-ui-toolbar-item-padding, 5px);
  border-top-left-radius: var(--sd-ui-radius, 6px);
  border-bottom-left-radius: var(--sd-ui-radius, 6px);
}

.toolbar-button.split .toolbar-button__caret {
  padding: 0 4px 0 2px;
  border-top-right-radius: var(--sd-ui-radius, 6px);
  border-bottom-right-radius: var(--sd-ui-radius, 6px);
}

/* Unified hover: hovering anywhere on the split button highlights the whole
   button so it reads as a single grouped item, with a slightly darker tint
   on the half the cursor is actually over. */
.toolbar-button.split:hover {
  background-color: var(--sd-ui-toolbar-button-hover-bg, var(--sd-ui-hover-bg, #dbdbdb));
}

.toolbar-button.split .toolbar-button__main:hover,
.toolbar-button.split .toolbar-button__caret:hover {
  background-color: var(--sd-ui-toolbar-button-active-bg, var(--sd-ui-active-bg, #c8d0d8));
}

/* Subtle divider only appears on hover, hinting at the two affordances
   without making them look like separate buttons at rest. */
.toolbar-button.split .toolbar-button__caret::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background-color: transparent;
  transition: background-color 0.15s ease-out;
}

.toolbar-button.split:hover .toolbar-button__caret::before {
  background-color: var(--sd-ui-border, rgba(71, 72, 74, 0.2));
}

.toolbar-button.split.disabled,
.toolbar-button.split.disabled:hover {
  background-color: initial;
}

.toolbar-button.split.disabled .toolbar-button__main,
.toolbar-button.split.disabled .toolbar-button__caret {
  cursor: default;
}

.toolbar-button.split.disabled .toolbar-button__main:hover,
.toolbar-button.split.disabled .toolbar-button__caret:hover {
  background-color: initial;
}

.toolbar-button.split.disabled .toolbar-button__caret::before {
  background-color: transparent;
}

.left,
.right {
  width: 50%;
  height: 100%;
  background-color: #dbdbdb;
  border-radius: 60%;
}

.has-inline-text-input:hover {
  cursor: text;
}

.disabled {
  cursor: default;
}

.disabled:hover {
  cursor: default;
  background-color: initial;
}

.disabled .toolbar-icon,
.disabled .caret,
.disabled .button-label {
  opacity: 0.35;
}

.caret {
  font-size: 1em;
  padding-left: 2px;
  padding-right: 2px;
}

.button-text-input {
  color: var(--sd-ui-toolbar-button-text, #47484a);
  border-radius: 4px;
  text-align: center;
  width: 30px;
  font-size: var(--sd-ui-font-size-400, 14px);
  margin-right: 5px;
  font-weight: 400;
  background-color: transparent;
  padding: 2px 0;
  outline: none;
  border: 1px solid var(--sd-ui-border, #dbdbdb);
  box-sizing: border-box;

  &.high-contrast {
    background-color: #fff;
  }
}

.button-text-input--font-size {
  width: 36px;
}

.button-text-input::placeholder {
  color: var(--sd-ui-toolbar-button-text, #47484a);
}

.dropdown-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: auto;
  width: 10px;
  height: 10px;
}

.toolbar-item--doc-mode-compact .button-label {
  display: none;
}

.toolbar-item--doc-mode-compact .toolbar-icon {
  margin-right: 5px;
}

.toolbar-item--linked-styles-compact {
  width: auto !important;
}

.toolbar-item--linked-styles-compact .button-label {
  display: none;
}
</style>
