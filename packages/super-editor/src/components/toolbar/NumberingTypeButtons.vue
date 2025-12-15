<script setup>
import { onMounted, ref, computed } from 'vue';
import { useHighContrastMode } from '../../composables/use-high-contrast-mode';

const { isHighContrastMode } = useHighContrastMode();
const emit = defineEmits(['select']);

const props = defineProps({
  selectedType: {
    type: String,
    default: 'decimal',
  },
});

const numberingButtonsRefs = ref([]);

// Define the numbering type options with their visual representations
// Ordered as specified: plain, period, paren, then letters, then roman
const numberingButtons = [
  {
    key: 'decimalPlain',
    ariaLabel: 'Decimal without period (1, 2, 3)',
    display: '1',
  },
  {
    key: 'decimal',
    ariaLabel: 'Decimal with period (1., 2., 3.)',
    display: '1.',
  },
  {
    key: 'decimalParen',
    ariaLabel: 'Decimal with parenthesis (1), 2), 3))',
    display: '1)',
  },
  {
    key: 'upperLetter',
    ariaLabel: 'Uppercase letter with period (A., B., C.)',
    display: 'A.',
  },
  {
    key: 'lowerLetter',
    ariaLabel: 'Lowercase letter with period (a., b., c.)',
    display: 'a.',
  },
  {
    key: 'letterParen',
    ariaLabel: 'Lowercase letter with parenthesis (a), b), c))',
    display: 'a)',
  },
  {
    key: 'upperRoman',
    ariaLabel: 'Uppercase Roman numeral with period (I., II., III.)',
    display: 'I.',
  },
  {
    key: 'lowerRoman',
    ariaLabel: 'Lowercase Roman numeral with period (i., ii., iii.)',
    display: 'i.',
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

const handleKeyDown = (e, index) => {
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      moveToPreviousButton(index);
      break;
    case 'ArrowDown':
      e.preventDefault();
      moveToNextButton(index);
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
      <span class="numbering-display">{{ button.display }}</span>
    </div>
  </div>
</template>

<style scoped>
.numbering-type-buttons {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 4px;
  box-sizing: border-box;
  min-width: 80px;

  .numbering-option {
    cursor: pointer;
    padding: 8px 12px;
    font-size: 14px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    transition: background-color 0.15s ease;
    user-select: none;

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

    .numbering-display {
      font-weight: 500;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      min-width: 24px;
    }
  }

  &.high-contrast {
    .numbering-option {
      border: 1px solid transparent;

      &:hover {
        background-color: #000;
        color: #fff;
        border-color: #fff;
      }

      &:focus {
        outline: 2px solid #fff;
      }
    }
  }
}
</style>
