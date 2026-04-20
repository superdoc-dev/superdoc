<script setup>
import { onMounted, ref } from 'vue';
import { useHighContrastMode } from '../../composables/use-high-contrast-mode';
import { toolbarIcons } from './toolbarIcons.js';

const { isHighContrastMode } = useHighContrastMode();
const emit = defineEmits(['select']);

const props = defineProps({
  selectedStyle: {
    type: String,
    default: null,
  },
});

const buttonRefs = ref([]);
const numberedButtons = [
  { key: 'decimal', icon: toolbarIcons.numberedListDecimal, ariaLabel: '1. 2. 3.' },
  { key: 'decimal-paren', icon: toolbarIcons.numberedListDecimalParen, ariaLabel: '1) 2) 3)' },
  { key: 'upper-roman', icon: toolbarIcons.numberedListUpperRoman, ariaLabel: 'I. II. III.' },
  { key: 'lower-roman', icon: toolbarIcons.numberedListLowerRoman, ariaLabel: 'i. ii. iii.' },
  { key: 'upper-alpha', icon: toolbarIcons.numberedListUpperAlpha, ariaLabel: 'A. B. C.' },
  { key: 'lower-alpha', icon: toolbarIcons.numberedListLowerAlpha, ariaLabel: 'a. b. c.' },
  { key: 'lower-alpha-paren', icon: toolbarIcons.numberedListLowerAlphaParen, ariaLabel: 'a) b) c)' },
];

const select = (key) => {
  emit('select', key);
};

const moveToNextButton = (index) => {
  if (index === buttonRefs.value.length - 1) return;
  const next = buttonRefs.value[index + 1];
  if (next) {
    next.setAttribute('tabindex', '0');
    next.focus();
  }
};

const moveToPreviousButton = (index) => {
  if (index === 0) return;
  const prev = buttonRefs.value[index - 1];
  if (prev) {
    prev.setAttribute('tabindex', '0');
    prev.focus();
  }
};

const handleKeyDown = (e, index) => {
  switch (e.key) {
    case 'ArrowLeft':
      moveToPreviousButton(index);
      break;
    case 'ArrowRight':
      moveToNextButton(index);
      break;
    case 'Enter':
      select(numberedButtons[index].key);
      break;
    default:
      break;
  }
};

onMounted(() => {
  const first = buttonRefs.value[0];
  if (first) {
    first.setAttribute('tabindex', '0');
    first.focus();
  }
});
</script>

<template>
  <div class="numbered-style-buttons" :class="{ 'high-contrast': isHighContrastMode }">
    <div
      v-for="(button, index) in numberedButtons"
      :key="button.key"
      class="button-icon"
      :class="{ selected: props.selectedStyle === button.key }"
      @click="select(button.key)"
      v-html="button.icon"
      role="menuitem"
      :aria-label="button.ariaLabel"
      ref="buttonRefs"
      @keydown.prevent="(event) => handleKeyDown(event, index)"
    ></div>
  </div>
</template>

<style scoped>
.numbered-style-buttons {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 8px;
  box-sizing: border-box;

  .button-icon {
    cursor: pointer;
    padding: 5px;
    font-size: var(--sd-ui-font-size-600, 16px);
    color: var(--sd-ui-dropdown-text, #47484a);
    width: 40px;
    height: 40px;
    border-radius: var(--sd-ui-dropdown-option-radius, 3px);
    display: flex;
    justify-content: center;
    align-items: center;
    box-sizing: border-box;

    &:hover {
      background-color: var(--sd-ui-dropdown-hover-bg, #d8dee5);
      color: var(--sd-ui-dropdown-hover-text, #47484a);
    }

    :deep(svg) {
      width: 100%;
      height: 100%;
      display: block;
      fill: currentColor;
    }

    &.selected {
      background-color: var(--sd-ui-dropdown-active-bg, #d8dee5);
      color: var(--sd-ui-dropdown-selected-text, #47484a);
    }
  }

  &.high-contrast {
    .button-icon {
      &:hover,
      &.selected {
        background-color: #000;
        color: #fff;
      }
    }
  }
}
</style>
