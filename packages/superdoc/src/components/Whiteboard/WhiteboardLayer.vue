<script setup>
import WhiteboardPage from './WhiteboardPage.vue';

const props = defineProps({
  whiteboard: {
    type: Object,
    required: true,
  },
  pages: {
    type: Array,
    default: () => [],
  },
  pageSizes: {
    type: Object,
    default: () => ({}),
  },
  pageOffsets: {
    type: Object,
    default: () => ({}),
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  opacity: {
    type: Number,
    default: 1,
  },
});
</script>

<template>
  <div
    class="whiteboard-layer"
    aria-hidden="true"
    :style="{ opacity: opacity, pointerEvents: enabled ? 'auto' : 'none' }"
  >
    <WhiteboardPage
      v-for="page in pages"
      :key="page.pageIndex"
      :page="page"
      :page-size="pageSizes?.[page.pageIndex]"
      :page-offset="pageOffsets?.[page.pageIndex]"
      :whiteboard="whiteboard"
      :enabled="enabled"
    />
  </div>
</template>

<style scoped>
.whiteboard-layer {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}
</style>
