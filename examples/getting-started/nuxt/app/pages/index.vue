<script setup lang="ts">
import { SuperDoc } from 'superdoc'

const editor = ref<HTMLDivElement | null>(null);
const file = ref<File | null>(null)

let superdoc: SuperDoc | null = null;

const handleFile = (e: Event) => {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) file.value = input.files[0]
}

const initEditor = () => {
  if (!editor.value || !file.value) return
  superdoc?.destroy()
  superdoc = new SuperDoc({
    selector: editor.value,
    documentMode: 'editing',
    document: file.value,
  })
}

watch(file, initEditor)
onBeforeUnmount(() => superdoc?.destroy())
</script>

<template>
  <div>
    <div style="padding: 1rem; background: #f5f5f5">
      <input type="file" accept=".docx" @change="handleFile" />
    </div>
    <ClientOnly>
      <div ref="editor" style="height: calc(100vh - 60px); overflow: auto;" />
    </ClientOnly>
  </div>
</template>
