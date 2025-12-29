<script setup>
import { onMounted, ref, computed } from 'vue';
import { useHighContrastMode } from '../../composables/use-high-contrast-mode';
import { numberingIcons } from './numbering-icons.js';

const { isHighContrastMode } = useHighContrastMode();
const emit = defineEmits(['select']);

const props = defineProps({
  selectedType: {
    type: String,
    default: 'decimal',
  },
});

const numberingButtonsRefs = ref([]);

// Define the numbering type options with their SVG icons
// Ordered as specified: plain, period, paren, then letters, then roman
const numberingButtons = [
  {
    key: 'decimalPlain',
    ariaLabel: 'Decimal without period (1, 2, 3)',
    icon: numberingIcons.decimalPlain,
  },
  {
    key: 'decimal',
    ariaLabel: 'Decimal with period (1., 2., 3.)',
    icon: numberingIcons.decimal,
  },
  {
    key: 'decimalParen',
    ariaLabel: 'Decimal with parenthesis (1), 2), 3))',
    icon: numberingIcons.decimalParen,
  },
  {
    key: 'upperLetter',
    ariaLabel: 'Uppercase letter with period (A., B., C.)',
    icon: numberingIcons.upperLetter,
  },
  {
    key: 'lowerLetter',
    ariaLabel: 'Lowercase letter with period (a., b., c.)',
    icon: numberingIcons.lowerLetter,
  },
  {
    key: 'letterParen',
    ariaLabel: 'Lowercase letter with parenthesis (a), b), c))',
    icon: numberingIcons.letterParen,
  },
  {
    key: 'upperRoman',
    ariaLabel: 'Uppercase Roman numeral with period (I., II., III.)',
    icon: numberingIcons.upperRoman,
  },
  {
    key: 'lowerRoman',
    ariaLabel: 'Lowercase Roman numeral with period (i., ii., iii.)',
    icon: numberingIcons.lowerRoman,
  },
];

const isSelected = (key) => {
  return key === props.selectedType;
};

const select = (numberingType) => {
  emit('select', numberingType);
};

const moveToNextButton = (index) => {
  if (index === numberingButtonsRefs.value.length - 1) return;
  const nextButton = numberingButtonsRefs.value[index + 1];
  if (nextButton) {
    nextButton.setAttribute('tabindex', '0');
    nextButton.focus();
  }
};

const moveToPreviousButton = (index) => {
  if (index === 0) return;
  const previousButton = numberingButtonsRefs.value[index - 1];
  if (previousButton) {
    previousButton.setAttribute('tabindex', '0');
    previousButton.focus();
  }
};

const ITEMS_PER_ROW = 4;

const handleKeyDown = (e, index) => {
  const totalItems = numberingButtons.length;
  const currentRow = Math.floor(index / ITEMS_PER_ROW);
  const currentCol = index % ITEMS_PER_ROW;

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      if (currentRow > 0) {
        const newIndex = index - ITEMS_PER_ROW;
        const prevButton = numberingButtonsRefs.value[newIndex];
        if (prevButton) {
          prevButton.setAttribute('tabindex', '0');
          prevButton.focus();
        }
      }
      break;
    case 'ArrowDown':
      e.preventDefault();
      const newIndex = index + ITEMS_PER_ROW;
      if (newIndex < totalItems) {
        const nextButton = numberingButtonsRefs.value[newIndex];
        if (nextButton) {
          nextButton.setAttribute('tabindex', '0');
          nextButton.focus();
        }
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (currentCol > 0) {
        moveToPreviousButton(index);
      }
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (currentCol < ITEMS_PER_ROW - 1 && index < totalItems - 1) {
        moveToNextButton(index);
      }
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      select(numberingButtons[index].key);
      break;
    default:
      break;
  }
};

onMounted(() => {
  // Focus on the first button
  const firstButton = numberingButtonsRefs.value[0];
  if (firstButton) {
    firstButton.setAttribute('tabindex', '0');
    firstButton.focus();
  }
});
</script>

<template>
  <div class="numbering-type-buttons" :class="{ 'high-contrast': isHighContrastMode }">
    <div
      v-for="(button, index) in numberingButtons"
      :key="button.key"
      class="numbering-option"
      :class="{ selected: isSelected(button.key) }"
      @click="select(button.key)"
      :data-item="`btn-numbering-type-${button.key}`"
      role="menuitem"
      :aria-label="button.ariaLabel"
      :aria-checked="isSelected(button.key)"
      ref="numberingButtonsRefs"
      tabindex="-1"
      @keydown="(event) => handleKeyDown(event, index)"
    >
      <div class="numbering-icon" v-html="button.icon"></div>
    </div>
  </div>
</template>

<style scoped>
.numbering-type-buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 8px;
  box-sizing: border-box;
  width: 100%;

  .numbering-option {
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    transition: background-color 0.15s ease;
    user-select: none;
    aspect-ratio: 4 / 3;

    &:hover {
      background-color: #d8dee5;
    }

    &:focus {
      outline: 2px solid #0078d4;
      outline-offset: -2px;
    }

    &.selected {
      background-color: #c8d0d8;
      font-weight: 600;
    }

    .numbering-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;

      /* SVG scales to fit container */
      :deep(svg) {
        width: 100%;
        height: 100%;
        max-width: 100px;
        max-height: 75px;
        display: block;
      }
    }
  }

  &.high-contrast {
    .numbering-option {
      border: 1px solid transparent;

      &:hover {
        background-color: #000;
        border-color: #fff;
      }

      &:focus {
        outline: 2px solid #fff;
      }

      /* Invert colors in high contrast mode */
      .numbering-icon :deep(svg) {
        .list-text {
          fill: currentColor;
        }

        .list-line {
          stroke: currentColor;
        }
      }

      &:hover .numbering-icon :deep(svg) {
        .list-text {
          fill: #fff;
        }

        .list-line {
          stroke: #fff;
        }
      }
    }
  }
}
</style>
