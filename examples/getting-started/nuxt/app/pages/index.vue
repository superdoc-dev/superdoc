<script setup lang="ts">
const file = ref<File | null>(null);

const handleFile = (event: Event) => {
  const input = event.target as HTMLInputElement;

  const selected = input.files?.[0];

  if (selected) {
    file.value = selected;
  }
}
</script>

<template>
  <div>
    <input
      type="file"
      accept=".docx"
      @change="handleFile"
    >
    <ClientOnly>
      <DocEditor
        v-if="file"
        :document="file"
        :user="{ name: 'Vue User', email: 'user@company.com' }"
      />
    </ClientOnly>
  </div>
</template>
