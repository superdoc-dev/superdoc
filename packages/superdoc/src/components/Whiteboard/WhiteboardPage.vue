<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  whiteboard: {
    type: Object,
    required: true,
  },
  page: {
    type: Object,
    required: true,
  },
  pageSize: {
    type: Object,
    default: null,
  },
  pageOffset: {
    type: Object,
    default: null,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
});

const containerRef = ref(null);

// Mount Konva stage and apply current size.
const mountPage = () => {
  const container = containerRef.value;
  if (!container || !props.page) return;
  props.page.mount(container);
  if (props.pageSize) {
    props.page.resize(props.pageSize.width, props.pageSize.height);
  }
};

// Handle drop of stickers, images, comments, or text.
const handleDrop = (event) => {
  if (!props.page || !event?.dataTransfer) {
    return;
  }
  if (!props.enabled || props.whiteboard.getTool() !== 'select') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const container = containerRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (handleStickerDrop(event, x, y)) {
    return;
  }
  if (handleFileImageDrop(event, x, y)) {
    return;
  }
  if (handleCommentDrop(event, x, y)) {
    return;
  }
  handlePlainTextDrop(event, x, y);
};

// Drop sticker by id (from registry).
const handleStickerDrop = (event, x, y) => {
  const stickerId = event.dataTransfer.getData('application/sticker');
  if (!stickerId) return false;
  const stickers = props.whiteboard.getType('stickers') || [];
  const sticker = stickers.find((item) => item.id === stickerId);
  if (!sticker?.src) return false;
  props.page.addImage({
    stickerId: sticker.id,
    x,
    y,
    src: sticker.src,
    width: sticker.width,
    height: sticker.height,
    type: 'sticker',
  });
  return true;
};

// Drop local image file (base64).
const handleFileImageDrop = (event, x, y) => {
  const files = Array.from(event.dataTransfer.files || []);
  const imageFile = files.find((file) => file.type.startsWith('image/'));
  if (!imageFile) return false;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string') return;
    props.page.addImage({ x, y, src: reader.result, type: 'image' });
  };
  reader.readAsDataURL(imageFile);
  return true;
};

// Drop a predefined comment (text).
const handleCommentDrop = (event, x, y) => {
  const commentId = event.dataTransfer.getData('application/comment');
  if (!commentId) return false;
  const comments = props.whiteboard.getType('comments') || [];
  const comment = comments.find((item) => item.id === commentId);
  if (!comment?.text) return false;
  props.page.addText({ x, y, content: comment.text });
  return true;
};

// Drop raw text.
const handlePlainTextDrop = (event, x, y) => {
  const text = event.dataTransfer.getData('text/plain');
  if (!text) return false;
  props.page.addText({ x, y, content: text });
  return true;
};

// Re-mount when page or size changes.
watch(
  () => [props.page, props.pageSize?.width, props.pageSize?.height],
  () => {
    nextTick(mountPage);
  },
);

onMounted(() => {
  mountPage();
});

onBeforeUnmount(() => {
  props.page?.destroy();
});
</script>

<template>
  <div
    ref="containerRef"
    class="whiteboard-page"
    :data-page-index="page.pageIndex"
    @dragover.prevent
    @drop.prevent="handleDrop"
    :style="{
      width: (pageSize?.width ?? page.size?.width) + 'px',
      height: (pageSize?.height ?? page.size?.height) + 'px',
      transform: `translate(${pageOffset?.left ?? 0}px, ${pageOffset?.top ?? 0}px)`,
    }"
  ></div>
</template>

<style scoped>
.whiteboard-page {
  position: absolute;
  left: 0;
  top: 0;
}
</style>
