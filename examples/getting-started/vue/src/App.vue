<template>
  <div>
    <div style="padding: 1rem; background: #f5f5f5">
      <input type="file" accept=".docx" @change="handleFile" />
    </div>
    <div ref="container" style="height: calc(100vh - 60px)" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const container = ref<HTMLDivElement>();
const file = ref<File | null>(null);
let superdoc: SuperDoc | null = null;

const handleFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) file.value = input.files[0];
};

const initEditor = () => {
  if (!container.value) return;

  superdoc?.destroy();
  superdoc = new SuperDoc({
    selector: container.value,
    document: file.value,
  });
};

onMounted(initEditor);
watch(file, initEditor);
</script>
