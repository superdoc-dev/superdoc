<script setup lang="ts">
import { computed } from 'vue';
import {
  headlessToolbarConstants,
  type ToolbarSnapshot,
} from 'superdoc/headless-toolbar';

const props = defineProps<{ snapshot: ToolbarSnapshot }>();
const emit = defineEmits<{ execute: [id: string, payload?: unknown] }>();

const cmd = computed(() => props.snapshot.commands);

// Font options
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
  get: () => (cmd.value['font-family']?.value as string) ?? 'Aptos',
  set: (v: string) => emit('execute', 'font-family', v),
});

const currentFontSize = computed({
  get: () => (cmd.value['font-size']?.value as string) ?? '11pt',
  set: (v: string) => emit('execute', 'font-size', v),
});

const currentAlign = computed(() => (cmd.value['text-align']?.value as string) ?? 'left');

const currentLineHeight = computed({
  get: () => (cmd.value['line-height']?.value as number) ?? 1.15,
  set: (v: number) => emit('execute', 'line-height', v),
});

const currentZoom = computed({
  get: () => (cmd.value['zoom']?.value as number) ?? 100,
  set: (v: number) => emit('execute', 'zoom', v),
});

const alignIcons: Record<string, string> = {
  left: 'mdi-format-align-left',
  center: 'mdi-format-align-center',
  right: 'mdi-format-align-right',
  justify: 'mdi-format-align-justify',
};
</script>

<template>
  <v-navigation-drawer permanent :width="240">
    <v-list density="compact" class="pa-2">
      <!-- Undo / Redo -->
      <div class="d-flex ga-1 mb-2">
        <v-btn
          icon="mdi-undo"
          size="small"
          variant="text"
          :disabled="cmd['undo']?.disabled"
          @click="emit('execute', 'undo')"
        />
        <v-btn
          icon="mdi-redo"
          size="small"
          variant="text"
          :disabled="cmd['redo']?.disabled"
          @click="emit('execute', 'redo')"
        />
      </div>

      <v-divider class="mb-2" />

      <!-- Text Formatting -->
      <v-expansion-panels variant="accordion" :model-value="[0, 1, 2, 3]" multiple>
        <v-expansion-panel title="Text">
          <v-expansion-panel-text>
            <v-select
              :model-value="currentFontFamily"
              @update:model-value="currentFontFamily = $event"
              :items="fontFamilies"
              label="Font"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-2"
            />
            <v-select
              :model-value="currentFontSize"
              @update:model-value="currentFontSize = $event"
              :items="fontSizes"
              label="Size"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-2"
            />

            <v-btn-toggle
              density="compact"
              multiple
              class="mb-2"
            >
              <v-btn
                icon="mdi-format-bold"
                size="small"
                :active="cmd['bold']?.active"
                @click="emit('execute', 'bold')"
              />
              <v-btn
                icon="mdi-format-italic"
                size="small"
                :active="cmd['italic']?.active"
                @click="emit('execute', 'italic')"
              />
              <v-btn
                icon="mdi-format-underline"
                size="small"
                :active="cmd['underline']?.active"
                @click="emit('execute', 'underline')"
              />
              <v-btn
                icon="mdi-format-strikethrough"
                size="small"
                :active="cmd['strikethrough']?.active"
                @click="emit('execute', 'strikethrough')"
              />
            </v-btn-toggle>

            <div class="d-flex align-center ga-1">
              <label class="text-caption text-medium-emphasis">Color</label>
              <input
                type="color"
                :value="(cmd['text-color']?.value as string) ?? '#000000'"
                @input="emit('execute', 'text-color', ($event.target as HTMLInputElement).value)"
                class="color-input"
              />
            </div>

            <v-btn
              prepend-icon="mdi-format-clear"
              size="small"
              variant="text"
              class="mt-1"
              @click="emit('execute', 'clear-formatting')"
            >
              Clear formatting
            </v-btn>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- Paragraph -->
        <v-expansion-panel title="Paragraph">
          <v-expansion-panel-text>
            <v-btn-toggle
              :model-value="currentAlign"
              mandatory
              density="compact"
              class="mb-2"
            >
              <v-btn
                v-for="opt in headlessToolbarConstants.DEFAULT_TEXT_ALIGN_OPTIONS"
                :key="opt.value"
                :icon="alignIcons[opt.value]"
                :value="opt.value"
                size="small"
                @click="emit('execute', 'text-align', opt.value)"
              />
            </v-btn-toggle>

            <v-select
              :model-value="currentLineHeight"
              @update:model-value="currentLineHeight = $event"
              :items="lineHeights"
              label="Line height"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-2"
            />

            <div class="d-flex ga-1">
              <v-btn
                icon="mdi-format-list-bulleted"
                size="small"
                :active="cmd['bullet-list']?.active"
                @click="emit('execute', 'bullet-list')"
              />
              <v-btn
                icon="mdi-format-list-numbered"
                size="small"
                :active="cmd['numbered-list']?.active"
                @click="emit('execute', 'numbered-list')"
              />
              <v-btn
                icon="mdi-format-indent-increase"
                size="small"
                variant="text"
                @click="emit('execute', 'indent-increase')"
              />
              <v-btn
                icon="mdi-format-indent-decrease"
                size="small"
                variant="text"
                @click="emit('execute', 'indent-decrease')"
              />
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- Insert -->
        <v-expansion-panel title="Insert">
          <v-expansion-panel-text>
            <v-btn
              prepend-icon="mdi-image-plus"
              size="small"
              variant="text"
              @click="emit('execute', 'image')"
            >
              Image
            </v-btn>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- View -->
        <v-expansion-panel title="View">
          <v-expansion-panel-text>
            <v-select
              :model-value="currentZoom"
              @update:model-value="currentZoom = $event"
              :items="zoomLevels"
              label="Zoom"
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-list>
  </v-navigation-drawer>
</template>

<style scoped>
.color-input {
  width: 28px;
  height: 28px;
  border: none;
  padding: 0;
  cursor: pointer;
  background: transparent;
}
</style>
