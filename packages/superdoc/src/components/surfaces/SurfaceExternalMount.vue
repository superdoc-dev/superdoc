<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  surfaceId: { type: String, required: true },
  mode: { type: String, required: true },
  request: { type: Object, required: true },
  render: { type: Function, required: true },
  resolve: { type: Function, required: true },
  close: { type: Function, required: true },
});

const container = ref(null);
let destroyFn = null;

function mount() {
  cleanup();
  if (!container.value || !props.render) return;

  const result = props.render({
    container: container.value,
    surfaceId: props.surfaceId,
    mode: props.mode,
    request: props.request,
    resolve: props.resolve,
    close: props.close,
  });

  destroyFn = result?.destroy ?? null;
}

function cleanup() {
  if (typeof destroyFn === 'function') {
    destroyFn();
  }
  destroyFn = null;

  if (container.value) {
    container.value.innerHTML = '';
  }
}

onMounted(mount);
onBeforeUnmount(cleanup);

watch(
  () => props.surfaceId,
  () => {
    mount();
  },
);
</script>

<template>
  <div ref="container" class="sd-surface-external-mount" />
</template>

<style scoped>
.sd-surface-external-mount {
  width: 100%;
}
</style>
