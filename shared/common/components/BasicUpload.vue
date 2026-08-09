<script setup lang="ts">
const emit = defineEmits<{
  'file-change': [file: File];
}>();

const props = withDefaults(
  defineProps<{
    accept?: string;
  }>(),
  {
    accept: '.docx, .pdf, .html, .md',
  },
);

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files?.[0]) {
    emit('file-change', target.files[0]);
  }
};
</script>

<template>
  <div>
    <input type="file" id="fileInput" @change="onFileChange" :accept="accept" />
  </div>
</template>

<style scoped></style>
