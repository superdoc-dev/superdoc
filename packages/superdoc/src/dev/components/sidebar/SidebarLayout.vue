<script setup>
import { computed } from 'vue';

const props = defineProps({
  useWordOverlay: {
    type: Boolean,
    default: false,
  },
  isGeneratingWordBaseline: {
    type: Boolean,
    default: false,
  },
  generatedCount: {
    type: Number,
    default: 0,
  },
  wordOverlayOpacity: {
    type: Number,
    default: 0.45,
  },
  wordOverlayOpacityLabel: {
    type: String,
    default: '45%',
  },
  wordOverlayBlendMode: {
    type: String,
    default: 'difference',
  },
  wordBaselineStatus: {
    type: String,
    default: '',
  },
  wordBaselineError: {
    type: String,
    default: '',
  },
  wordOverlayAvailable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'close',
  'toggle-overlay',
  'generate-baseline',
  'clear-generated-baseline',
  'update:wordOverlayOpacity',
  'update:wordOverlayBlendMode',
]);

const opacityModel = computed({
  get: () => props.wordOverlayOpacity,
  set: (value) => emit('update:wordOverlayOpacity', Number(value)),
});

const blendModeModel = computed({
  get: () => props.wordOverlayBlendMode,
  set: (value) => emit('update:wordOverlayBlendMode', value),
});

const hasWordReference = computed(() => props.generatedCount > 0);

const closeSidebar = () => {
  emit('close');
};
</script>

<template>
  <div class="dev-sidebar">
    <div class="dev-sidebar__header">
      <div class="dev-sidebar__title-row">
        <h3 class="dev-sidebar__title">Layout</h3>
        <button class="dev-sidebar__close" type="button" aria-label="Close sidebar" @click="closeSidebar">×</button>
      </div>
    </div>

    <div class="dev-sidebar__body">
      <div class="dev-sidebar__actions">
        <button
          class="dev-sidebar__button"
          type="button"
          :disabled="isGeneratingWordBaseline"
          @click="emit('generate-baseline')"
        >
          {{ isGeneratingWordBaseline ? 'Generating Word Reference...' : 'Generate Word Reference' }}
        </button>
        <button class="dev-sidebar__button" type="button" :disabled="!hasWordReference" @click="emit('toggle-overlay')">
          Word Overlay: {{ useWordOverlay ? 'ON' : 'OFF' }}
        </button>
        <button
          v-if="generatedCount > 0"
          class="dev-sidebar__button"
          type="button"
          :disabled="isGeneratingWordBaseline"
          @click="emit('clear-generated-baseline')"
        >
          Clear Generated Reference
        </button>
      </div>

      <label class="dev-sidebar__label">
        <span>Opacity {{ wordOverlayOpacityLabel }}</span>
        <input v-model.number="opacityModel" type="range" min="0" max="1" step="0.01" />
      </label>

      <label class="dev-sidebar__label">
        <span>Blend</span>
        <select v-model="blendModeModel">
          <option value="difference">difference</option>
          <option value="normal">normal</option>
          <option value="multiply">multiply</option>
          <option value="screen">screen</option>
          <option value="overlay">overlay</option>
        </select>
      </label>

      <p v-if="wordBaselineStatus" class="dev-sidebar__status">{{ wordBaselineStatus }}</p>
      <p v-else-if="wordBaselineError" class="dev-sidebar__error">{{ wordBaselineError }}</p>
      <p v-else-if="!wordOverlayAvailable" class="dev-sidebar__hint">
        Overlay inactive (generate reference + layout engine).
      </p>
    </div>
  </div>
</template>

<style scoped>
.dev-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #0f172a;
}

.dev-sidebar__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dev-sidebar__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dev-sidebar__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.dev-sidebar__close {
  border: none;
  background: transparent;
  color: #475569;
  font-size: 18px;
  font-weight: 700;
  padding: 0;
  line-height: 1;
  cursor: pointer;
}

.dev-sidebar__close:hover {
  color: #0f172a;
}

.dev-sidebar__body {
  display: grid;
  gap: 12px;
}

.dev-sidebar__actions {
  display: grid;
  gap: 8px;
}

.dev-sidebar__button {
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.12);
  color: #1e3a8a;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}

.dev-sidebar__button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.6);
}

.dev-sidebar__button:active:not(:disabled) {
  transform: translateY(1px);
}

.dev-sidebar__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dev-sidebar__label {
  display: grid;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.dev-sidebar__label input[type='range'] {
  width: 100%;
}

.dev-sidebar__label select {
  border: 1px solid rgba(148, 163, 184, 0.6);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  background: #ffffff;
  color: #1e293b;
}

.dev-sidebar__status {
  margin: 0;
  font-size: 12px;
  color: #166534;
  font-weight: 600;
}

.dev-sidebar__error {
  margin: 0;
  font-size: 12px;
  color: #b91c1c;
  font-weight: 600;
  white-space: pre-wrap;
}

.dev-sidebar__hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}
</style>
