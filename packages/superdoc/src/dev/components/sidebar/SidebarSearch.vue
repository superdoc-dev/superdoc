<script setup>
import { ref } from 'vue';

const query = ref('');
const results = ref([]);
const hasSearched = ref(false);

const emit = defineEmits(['close']);

const runSearch = () => {
  if (!query.value) {
    results.value = [];
    hasSearched.value = false;
    return;
  }
  const editor = window.editor;
  const matches = editor?.commands?.search?.(query.value);
  results.value = Array.isArray(matches) ? matches : [];
  hasSearched.value = true;
  console.log('[superdoc-dev] Search results', results.value);
};

const closeSidebar = () => {
  emit('close');
};

const goToResult = (match) => {
  const editor = window.editor;
  if (!editor) return;
  if (editor?.commands?.goToSearchResult) {
    editor.commands.goToSearchResult(match);
    return;
  }
};
</script>

<template>
  <div class="dev-sidebar">
    <div class="dev-sidebar__header">
      <div class="dev-sidebar__title-row">
        <h3 class="dev-sidebar__title">Search</h3>
        <button class="dev-sidebar__close" type="button" aria-label="Close sidebar" @click="closeSidebar">×</button>
      </div>
    </div>
    <div class="dev-sidebar__body">
      <label class="dev-sidebar__label" for="dev-sidebar-search">Query</label>
      <div class="dev-sidebar__search-row">
        <input
          id="dev-sidebar-search"
          v-model="query"
          class="dev-sidebar__input"
          type="text"
          placeholder="Search the document"
        />
        <button class="dev-sidebar__button" type="button" @click="runSearch">Search</button>
      </div>
      <div class="dev-sidebar__results">
        <p v-if="!hasSearched" class="dev-sidebar__hint">Search results will appear here.</p>
        <p v-else-if="results.length === 0" class="dev-sidebar__hint">No results found.</p>
        <button
          v-for="(result, index) in results"
          :key="result.id || `${result.from}-${result.to}`"
          class="dev-sidebar__result"
          type="button"
          @click="goToResult(result)"
        >
          <span class="dev-sidebar__result-index">{{ index + 1 }}.</span>
          <span class="dev-sidebar__result-text">{{ result.text }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dev-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #0f172a;
}

.dev-sidebar__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dev-sidebar__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dev-sidebar__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.dev-sidebar__close {
  border: none;
  background: transparent;
  color: #475569;
  font-size: 18px;
  font-weight: 700;
  padding: 0;
  line-height: 1;
  cursor: pointer;
}

.dev-sidebar__close:hover {
  color: #0f172a;
}

.dev-sidebar__body {
  display: grid;
  gap: 10px;
}

.dev-sidebar__label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.dev-sidebar__input {
  border: 1px solid rgba(148, 163, 184, 0.6);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}

.dev-sidebar__input:focus {
  outline: 2px solid rgba(59, 130, 246, 0.4);
  border-color: rgba(59, 130, 246, 0.6);
}

.dev-sidebar__search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.dev-sidebar__button {
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.12);
  color: #1e3a8a;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}

.dev-sidebar__button:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.6);
}

.dev-sidebar__button:active {
  transform: translateY(1px);
}

.dev-sidebar__results {
  display: grid;
  gap: 8px;
}

.dev-sidebar__result {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  background: #ffffff;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.dev-sidebar__result:hover {
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 6px 12px rgba(15, 23, 42, 0.1);
}

.dev-sidebar__result-index {
  font-size: 12px;
  font-weight: 700;
  color: #2563eb;
}

.dev-sidebar__result-text {
  font-size: 13px;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-sidebar__hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}
</style>
