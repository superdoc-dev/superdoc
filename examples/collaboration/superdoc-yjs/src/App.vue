<script setup>
import 'superdoc/style.css';
import { onMounted, onBeforeUnmount, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';

import sampleDocument from '/sample-document.docx?url';

const superdoc = shallowRef(null);

const USER_COLORS = ['#a11134', '#2a7e34', '#b29d11', '#2f4597', '#ab5b22'];

const initSuperDoc = () => {
  const documentId = 'superdoc-demo';

  superdoc.value = new SuperDoc({
    selector: '#superdoc',
    toolbar: '#superdoc-toolbar',
    document: {
      id: documentId,
      type: 'docx',
      url: sampleDocument,
      isNewFile: true,
    },
    pagination: false,
    colors: USER_COLORS,
    user: generateUserInfo(),
    modules: {
      collaboration: {
        url: `ws://localhost:3050/collaboration`,
        token: 'token',
      },
    },
    onAwarenessUpdate,
  });
};

const onAwarenessUpdate = ({ states }) => {
  console.debug('Awareness states', states);
};

const generateUserInfo = () => {
  const randomUser = Math.random().toString(36).substring(2, 8);
  return {
    name: `SuperDocUser-${randomUser}`,
    email: `${randomUser}@superdoc.dev`,
    color: getRandomUserColor(),
  };
};

const getRandomUserColor = () => {
  const index = Math.floor(Math.random() * USER_COLORS.length);
  return USER_COLORS[index];
};

onMounted(() => {
  initSuperDoc();
});

onBeforeUnmount(() => {
  superdoc.value?.destroy();
  superdoc.value = null;
});
</script>

<template>
  <div class="example-container">
    <h1>SuperDoc - Base collaboration editor</h1>
    <div id="superdoc-toolbar" class="my-custom-toolbar"></div>
    <div class="editor-container">
      <div id="superdoc" class="main-editor"></div>
    </div>
  </div>
</template>

<style>
.editor-container {
  border: 1px solid #ccc;
  border-radius: 8px;
}
</style>
