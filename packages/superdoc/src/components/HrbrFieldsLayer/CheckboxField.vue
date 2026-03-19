<script setup>
import { computed } from 'vue';

const props = defineProps({
  field: {
    type: Object,
    required: true,
  },
  isEditing: {
    type: Boolean,
    required: false,
    default: false,
  },
  optionId: {
    type: String,
    required: true,
  },
  styleOverride: {
    type: Object,
    required: false,
    default: () => ({}),
  },
});

const getValue = computed(() => {
  const match = props.field.options.find((o) => o.annotationId.includes(props.optionId));
  return match?.checked;
});

const getPreviewStyle = computed(() => {
  const borderWidth = 2;
  const width = Number.parseFloat(props.styleOverride?.coordinates?.minWidth || 0) - borderWidth + 'px';
  const height = Number.parseFloat(props.styleOverride?.coordinates?.minHeight || 0) - borderWidth + 'px';
  const fontSize = parseFloat(width) + 'pt';
  return {
    width,
    height,
    fontSize,
  };
});
</script>

<template>
  <div class="checkbox-container">
    <!-- TODO: check when migrating CLM -->
    <div v-if="props.isEditing" class="checkbox-editing-placeholder"></div>
    <div v-else class="checkbox-preview" :style="getPreviewStyle">{{ getValue ? 'x' : '' }}</div>
  </div>
</template>

<style scoped>
.checkbox-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  width: 100%;
  height: 100%;
}

.checkbox-preview {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  line-height: 1.2;
  width: 100%;
  height: 100%;
}

.checkbox-editing-placeholder {
  width: 100%;
  height: 100%;
}
</style>
