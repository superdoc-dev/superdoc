<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useCommentsStore } from '@stores/comments-store';
import CommentDialog from '../CommentDialog.vue';

const props = defineProps({
  item: { type: Object, required: true },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
  tabIndex: { type: Number, default: -1 },
});
const emit = defineEmits(['focus-item', 'navigate']);

const commentsStore = useCommentsStore();
const { activeComment, editingCommentId, pendingComment } = storeToRefs(commentsStore);
const shell = ref(null);
const measuredHeight = ref(112);
const intersects = ref(typeof IntersectionObserver === 'undefined');
const containsFocus = ref(false);
let intersectionObserver = null;
let resizeObserver = null;

const threadIds = computed(
  () =>
    new Set(
      (props.item.threadComments ?? [])
        .flatMap((comment) => [comment?.commentId, comment?.importedId, comment?.trackedChangeCanonicalId])
        .filter((id) => id != null)
        .map(String),
    ),
);
const isPinned = computed(() => {
  const pendingId = pendingComment.value?.commentId;
  return (
    containsFocus.value ||
    (activeComment.value != null && threadIds.value.has(String(activeComment.value))) ||
    (editingCommentId.value != null && threadIds.value.has(String(editingCommentId.value))) ||
    (pendingId != null && threadIds.value.has(String(pendingId)))
  );
});
const materialized = computed(() => intersects.value || isPinned.value);
const placeholderStyle = computed(() =>
  materialized.value ? undefined : { minHeight: `${Math.max(1, measuredHeight.value)}px` },
);
const accessibleSummary = computed(() => {
  const comment = props.item.comment;
  const text = comment?.trackedChangeLabel ?? comment?.commentText ?? comment?.trackedChangeText ?? 'Review item';
  return (
    String(text)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160) || 'Review item'
  );
});

const measure = () => {
  const height = shell.value?.getBoundingClientRect?.().height;
  if (Number.isFinite(height) && height > 0) measuredHeight.value = height;
};

const onFocusIn = () => {
  containsFocus.value = true;
  emit('focus-item', props.index);
};

const onKeydown = (event) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  if (event.target?.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
  event.preventDefault();
  emit('navigate', { index: props.index, key: event.key });
};

onMounted(() => {
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        intersects.value = entry.isIntersecting;
        if (entry.isIntersecting) void nextTick(measure);
      },
      { root: null, rootMargin: '600px 0px' },
    );
    intersectionObserver.observe(shell.value);
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(shell.value);
  }
  void nextTick(measure);
});

onBeforeUnmount(() => {
  intersectionObserver?.disconnect();
  resizeObserver?.disconnect();
});
</script>

<template>
  <div
    ref="shell"
    class="comment-item"
    role="listitem"
    :tabindex="tabIndex"
    :aria-posinset="index + 1"
    :aria-setsize="total"
    :aria-label="accessibleSummary"
    :style="placeholderStyle"
    :data-comment-instance-id="item.floatingInstanceId ?? ''"
    :data-comment-thread-id="item.comment.commentId ?? ''"
    :data-comment-position-key="item.comment.trackedChangeAnchorKey ?? ''"
    :data-comment-page-index="Number.isFinite(item.floatingPageIndex) ? item.floatingPageIndex : ''"
    :data-review-directory-index="index"
    @focusin="onFocusIn"
    @focusout="containsFocus = shell?.contains?.($event.relatedTarget) === true"
    @keydown="onKeydown"
  >
    <CommentDialog
      v-if="materialized"
      :comment="item.comment"
      :thread-comments="item.threadComments"
      :floating-instance-id="item.floatingInstanceId"
      :floating-page-index="item.floatingPageIndex"
      :floating-position-entry="item.floatingPositionEntry"
      :is-floating-instance-active="item.isFloatingInstanceActive"
      @resize="measure"
    />
  </div>
</template>

<style scoped>
.comment-item {
  margin-bottom: 10px;
}
</style>
