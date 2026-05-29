<script setup lang="ts">
import { ref, onMounted, inject, computed } from 'vue';
import type { SuperDocUI, SelectionCapture } from 'superdoc/ui';

const emit = defineEmits<{
  cancel: [];
  posted: [commentId: string | null];
}>();

// Inject the UI controller from parent
const ui = inject<{ value: SuperDocUI | null }>('superdoc-ui');

const text = ref('');
const posting = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

// Capture selection at mount time - must happen before textarea takes focus
let captured: SelectionCapture | null = null;
onMounted(() => {
  if (ui?.value) {
    captured = ui.value.selection.capture();
  }
  textareaRef.value?.focus();
});

const quotedText = computed(() => captured?.quotedText ?? null);
const canPost = computed(() => !!ui?.value && !!captured && !posting.value && text.value.trim().length > 0);

function post() {
  if (!ui?.value || !canPost.value || !captured) return;
  posting.value = true;
  try {
    const receipt = ui.value.comments.createFromCapture(captured, { text: text.value.trim() });
    posting.value = false;
    if (!receipt.success) {
      emit('posted', null);
      return;
    }
    // Restore selection
    ui.value.selection.restore(captured);
    const entity = (receipt.inserted as Array<{ entityId?: string }> | undefined)?.[0];
    emit('posted', entity?.entityId ?? null);
  } catch (err) {
    console.error('[CommentComposer] createFromCapture threw', err);
    posting.value = false;
  }
}

function cancel() {
  // Restore selection on cancel too
  if (ui?.value && captured) {
    ui.value.selection.restore(captured);
  }
  emit('cancel');
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
  if (e.key === 'Escape') cancel();
}
</script>

<template>
  <div class="composer">
    <div class="composer-quote">
      <template v-if="quotedText">"{{ quotedText }}"</template>
      <em v-else>No selection</em>
    </div>
    <textarea
      ref="textareaRef"
      class="composer-input"
      rows="3"
      placeholder="Write a comment…"
      v-model="text"
      @keydown="handleKeydown"
    />
    <div class="composer-actions">
      <button @click="cancel">Cancel</button>
      <button class="primary" :disabled="!canPost" @click="post">
        {{ posting ? 'Posting…' : 'Comment' }}
      </button>
    </div>
  </div>
</template>
