<script setup lang="ts">
import { computed } from 'vue';
import {
  headlessToolbarConstants,
  type ToolbarSnapshot,
} from 'superdoc/headless-toolbar';

const props = defineProps<{ snapshot: ToolbarSnapshot }>();
const emit = defineEmits<{ execute: [id: string, payload?: unknown] }>();

const cmd = computed(() => props.snapshot.commands);

const fontFamilies = headlessToolbarConstants.DEFAULT_FONT_FAMILY_OPTIONS.map(
  (o) => ({ title: o.label, value: o.value }),
);
const fontSizes = headlessToolbarConstants.DEFAULT_FONT_SIZE_OPTIONS.map(
  (o) => ({ title: o.label, value: o.value }),
);
const lineHeights = headlessToolbarConstants.DEFAULT_LINE_HEIGHT_OPTIONS.map(
  (o) => ({ title: o.label, value: o.value }),
);
const zoomLevels = headlessToolbarConstants.DEFAULT_ZOOM_OPTIONS.map(
  (o) => ({ title: o.label, value: o.value }),
);

const currentFontFamily = computed({
  get: () => (cmd.value['font-family']?.value as string) ?? '',
  set: (v: string) => emit('execute', 'font-family', v),
});
const currentFontSize = computed({
  get: () => (cmd.value['font-size']?.value as string) ?? '',
  set: (v: string) => emit('execute', 'font-size', v),
});
const currentLineHeight = computed({
  get: () => (cmd.value['line-height']?.value as number) ?? 1.15,
  set: (v: number) => emit('execute', 'line-height', v),
});
const currentZoom = computed({
  get: () => (cmd.value['zoom']?.value as number) ?? 100,
  set: (v: number) => emit('execute', 'zoom', v),
});
const currentAlign = computed(() => (cmd.value['text-align']?.value as string) ?? 'left');

const exec = (id: string, payload?: unknown) => emit('execute', id, payload);
</script>

<template>
  <v-navigation-drawer permanent :width="260" color="grey-lighten-5">
    <div class="pa-3">
      <!-- History -->
      <div class="d-flex ga-1 mb-3">
        <v-btn icon="mdi-undo" size="small" variant="text" :disabled="cmd['undo']?.disabled" @click="exec('undo')" />
        <v-btn icon="mdi-redo" size="small" variant="text" :disabled="cmd['redo']?.disabled" @click="exec('redo')" />
        <v-spacer />
        <v-btn icon="mdi-format-clear" size="x-small" variant="text" title="Clear formatting" @click="exec('clear-formatting')" />
      </div>

      <!-- Font -->
      <div class="section-label">Font</div>
      <v-select
        :model-value="currentFontFamily"
        @update:model-value="currentFontFamily = $event"
        :items="fontFamilies"
        density="compact"
        variant="outlined"
        hide-details
        class="mb-2"
      />
      <div class="d-flex ga-2 align-center mb-3">
        <v-select
          :model-value="currentFontSize"
          @update:model-value="currentFontSize = $event"
          :items="fontSizes"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 100px"
        />
        <input
          type="color"
          :value="(cmd['text-color']?.value as string) ?? '#000000'"
          @input="exec('text-color', ($event.target as HTMLInputElement).value)"
          class="color-input"
          title="Text color"
        />
      </div>

      <!-- Format -->
      <div class="section-label">Format</div>
      <div class="d-flex ga-1 mb-3">
        <v-btn icon="mdi-format-bold" size="small" :variant="cmd['bold']?.active ? 'tonal' : 'text'" @click="exec('bold')" />
        <v-btn icon="mdi-format-italic" size="small" :variant="cmd['italic']?.active ? 'tonal' : 'text'" @click="exec('italic')" />
        <v-btn icon="mdi-format-underline" size="small" :variant="cmd['underline']?.active ? 'tonal' : 'text'" @click="exec('underline')" />
        <v-btn icon="mdi-format-strikethrough-variant" size="small" :variant="cmd['strikethrough']?.active ? 'tonal' : 'text'" @click="exec('strikethrough')" />
      </div>

      <!-- Alignment + spacing -->
      <div class="section-label">Paragraph</div>
      <div class="d-flex ga-1 mb-2">
        <v-btn
          v-for="opt in headlessToolbarConstants.DEFAULT_TEXT_ALIGN_OPTIONS"
          :key="opt.value"
          :icon="'mdi-format-align-' + opt.value"
          size="small"
          :variant="currentAlign === opt.value ? 'tonal' : 'text'"
          @click="exec('text-align', opt.value)"
        />
      </div>
      <v-select
        :model-value="currentLineHeight"
        @update:model-value="currentLineHeight = $event"
        :items="lineHeights"
        label="Line height"
        density="compact"
        variant="outlined"
        hide-details
        class="mb-3"
      />

      <!-- Lists -->
      <div class="section-label">Lists</div>
      <div class="d-flex ga-1 mb-3">
        <v-btn icon="mdi-format-list-bulleted" size="small" :variant="cmd['bullet-list']?.active ? 'tonal' : 'text'" @click="exec('bullet-list')" />
        <v-btn icon="mdi-format-list-numbered" size="small" :variant="cmd['numbered-list']?.active ? 'tonal' : 'text'" @click="exec('numbered-list')" />
        <v-btn icon="mdi-format-indent-increase" size="small" variant="text" @click="exec('indent-increase')" />
        <v-btn icon="mdi-format-indent-decrease" size="small" variant="text" @click="exec('indent-decrease')" />
      </div>

      <!-- Insert -->
      <div class="section-label">Insert</div>
      <v-btn prepend-icon="mdi-image-plus" size="small" variant="text" class="mb-3" @click="exec('image')">
        Image
      </v-btn>

      <v-divider class="mb-3" />

      <!-- Zoom -->
      <v-select
        :model-value="currentZoom"
        @update:model-value="currentZoom = $event"
        :items="zoomLevels"
        label="Zoom"
        density="compact"
        variant="outlined"
        hide-details
      />
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.5);
  margin-bottom: 6px;
}
.color-input {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  padding: 2px;
  cursor: pointer;
  background: transparent;
}
</style>
