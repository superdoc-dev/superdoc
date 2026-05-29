<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';

interface CommentItem {
  id: string;
  text?: string;
  anchoredText?: string;
  creatorName?: string;
  creatorEmail?: string;
  createdTime?: number;
  parentCommentId?: string;
  status?: string;
}

const props = defineProps<{
  comment: CommentItem;
  resolved: boolean;
  replies?: CommentItem[];
  active?: boolean;
}>();

const emit = defineEmits<{
  resolve: [];
  reopen: [];
  reply: [text: string];
  click: [];
}>();

const replyOpen = ref(false);
const replyText = ref('');
const replyInputRef = ref<HTMLTextAreaElement | null>(null);

const author = computed(() => props.comment.creatorName ?? props.comment.creatorEmail ?? 'Unknown');
const time = computed(() => {
  if (!props.comment.createdTime) return '';
  return new Date(props.comment.createdTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

function openReplyComposer() {
  replyOpen.value = true;
  replyText.value = '';
  nextTick(() => replyInputRef.value?.focus());
}

function cancelReply() {
  replyOpen.value = false;
  replyText.value = '';
}

function postReply() {
  if (!replyText.value.trim()) return;
  emit('reply', replyText.value.trim());
  cancelReply();
}

function handleReplyKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postReply();
  if (e.key === 'Escape') cancelReply();
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function avatarColor(key: string): string {
  const palette = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
  return palette[hash % palette.length]!;
}

function getReplyAuthor(reply: CommentItem): string {
  return reply.creatorName ?? reply.creatorEmail ?? 'Unknown';
}
</script>

<template>
  <div
    :class="['card', { resolved, active }]"
    :data-card-id="comment.id"
    @click="$emit('click')"
  >
    <div class="card-header">
      <span class="avatar" :style="{ background: avatarColor(author) }">{{ initials(author) }}</span>
      <span class="author">{{ author }}</span>
      <span class="timestamp">{{ time }}</span>
    </div>
    <div v-if="comment.anchoredText" class="quote">"{{ comment.anchoredText }}"</div>
    <div class="body">{{ comment.text }}</div>

    <ul v-if="replies && replies.length > 0" class="thread-replies">
      <li
        v-for="reply in replies"
        :key="reply.id"
        class="thread-reply"
        :data-card-id="reply.id"
      >
        <span
          class="avatar avatar-sm"
          :style="{ background: avatarColor(getReplyAuthor(reply)) }"
        >
          {{ initials(getReplyAuthor(reply)) }}
        </span>
        <div class="thread-reply-body">
          <span class="author">{{ getReplyAuthor(reply) }}</span>
          <span class="thread-reply-text">{{ reply.text }}</span>
        </div>
      </li>
    </ul>

    <div v-if="replyOpen" class="reply-composer" @click.stop>
      <textarea
        ref="replyInputRef"
        class="reply-input"
        rows="2"
        placeholder="Write a reply…"
        v-model="replyText"
        @keydown="handleReplyKeydown"
      />
      <div class="reply-actions">
        <button @click="cancelReply">Cancel</button>
        <button class="primary" :disabled="!replyText.trim()" @click="postReply">
          Reply
        </button>
      </div>
    </div>

    <div class="card-actions" @click.stop>
      <template v-if="resolved">
        <button class="primary" @click="$emit('reopen')">Reopen</button>
      </template>
      <template v-else>
        <button @click="$emit('resolve')">Resolve</button>
        <button v-if="!replyOpen" @click="openReplyComposer">Reply</button>
      </template>
    </div>
  </div>
</template>
