<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useCommentsStore } from '@stores/comments-store';
import CommentHeader from './CommentHeader.vue';

const TEXTAREA_MIN_HEIGHT = 28;
const TEXTAREA_MAX_HEIGHT = 132;

const emit = defineEmits(['focus']);
const props = defineProps({
  users: {
    type: Array,
    required: false,
    default: () => [],
  },
  config: {
    type: Object,
    required: true,
  },
  isFocused: {
    type: Boolean,
    default: false,
  },
  includeHeader: {
    type: Boolean,
    default: true,
  },
  comment: {
    type: Object,
    required: false,
  },
});
const commentsStore = useCommentsStore();
const { currentCommentText } = storeToRefs(commentsStore);
const inputRef = ref(null);

const handleFocusChange = (focused) => emit('focus', focused);

const focus = () => {
  inputRef.value?.focus?.();
};

const syncInputHeight = () => {
  const input = inputRef.value;
  if (!input) return;

  input.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
  const scrollHeight = input.scrollHeight || TEXTAREA_MIN_HEIGHT;
  const nextHeight = Math.min(Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT);
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
};

const scheduleInputHeightSync = () => {
  nextTick(syncInputHeight);
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const htmlToText = (html) => {
  const value = String(html ?? '');
  if (!value || value === '<p></p>') return '';
  if (typeof document === 'undefined') {
    return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  }
  const element = document.createElement('div');
  element.innerHTML = value;
  return element.innerText || element.textContent || '';
};

const textToHtml = (value) => {
  const normalized = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!normalized) return '<p></p>';
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

const commentDraft = computed({
  get: () => htmlToText(currentCommentText.value),
  set: (value) => {
    currentCommentText.value = textToHtml(value);
  },
});

onMounted(scheduleInputHeightSync);
watch(currentCommentText, scheduleInputHeightSync);

defineExpose({ focus });
</script>

<template>
  <div class="input-section">
    <CommentHeader v-if="includeHeader" :config="config" :comment="comment" :is-pending-input="true" />

    <div class="comment-entry" :class="{ 'sd-input-active': isFocused }">
      <textarea
        ref="inputRef"
        class="superdoc-field"
        placeholder="Add a comment"
        v-model="commentDraft"
        rows="1"
        @input="syncInputHeight"
        @focus="handleFocusChange(true)"
        @blur="handleFocusChange(false)"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.comment-entry {
  box-sizing: border-box;
  border-radius: 8px;
  width: 100%;
  max-width: 100%;
  transition: all 250ms ease;
}

.superdoc-field {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 28px;
  height: 28px;
  max-height: 132px;
  padding: 10px 12px;
  resize: none;
  border: 1px solid #d7d7d7;
  border-radius: 8px;
  color: #1f1f1f;
  background: #fff;
  font: inherit;
  line-height: 1.4;
  overflow-y: hidden;
}

.superdoc-field:focus {
  outline: none;
  border-color: #4f7cff;
  box-shadow: 0 0 0 2px rgba(79, 124, 255, 0.16);
}
</style>
