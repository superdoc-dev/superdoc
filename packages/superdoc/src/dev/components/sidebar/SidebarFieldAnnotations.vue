<script setup>
import { ref, computed } from 'vue';

const emit = defineEmits(['close']);

const filterQuery = ref('');
const activeCategory = ref('popular');

const categories = [
  { id: 'popular', label: 'Popular' },
  { id: 'text', label: 'Text' },
  { id: 'date', label: 'Date' },
  { id: 'other', label: 'Other' },
];

// Field definitions with webapp inputtiletype mapping
const fields = [
  {
    id: 'signature',
    icon: '✍',
    title: 'Signature',
    description: 'Signature capture field',
    fieldType: 'SIGNATUREINPUT',
    type: 'signature',
    groups: ['popular'],
    color: '#6366f1',
  },
  {
    id: 'name',
    icon: '👤',
    title: 'Name',
    description: 'Full name text field',
    fieldType: 'NAMETEXTINPUT',
    type: 'text',
    groups: ['popular', 'text'],
    color: '#3b82f6',
  },
  {
    id: 'email',
    icon: '✉',
    title: 'Email',
    description: 'Email address field',
    fieldType: 'EMAILTEXTINPUT',
    type: 'text',
    groups: ['popular', 'text'],
    color: '#0ea5e9',
  },
  {
    id: 'date',
    icon: '📅',
    title: 'Date',
    description: 'Date picker field',
    fieldType: 'DATEINPUT',
    type: 'text',
    groups: ['popular', 'date'],
    color: '#f59e0b',
  },
  {
    id: 'text',
    icon: '✎',
    title: 'Text Field',
    description: 'Single line text input',
    fieldType: 'TEXTINPUT',
    type: 'text',
    groups: ['text'],
    color: '#64748b',
  },
  {
    id: 'paragraph',
    icon: '¶',
    title: 'Paragraph',
    description: 'Multi-line HTML content',
    fieldType: 'HTMLINPUT',
    type: 'html',
    groups: ['text'],
    color: '#8b5cf6',
  },
  {
    id: 'checkbox',
    icon: '☑',
    title: 'Checkbox',
    description: 'Boolean checkbox field',
    fieldType: 'CHECKBOXINPUT',
    type: 'checkbox',
    groups: ['other'],
    color: '#22c55e',
  },
  {
    id: 'image',
    icon: '🖼',
    title: 'Image',
    description: 'Image upload field',
    fieldType: 'IMAGEINPUT',
    type: 'image',
    groups: ['other'],
    color: '#ec4899',
  },
  {
    id: 'url',
    icon: '🔗',
    title: 'URL',
    description: 'Website link field',
    fieldType: 'URLTEXTINPUT',
    type: 'link',
    groups: ['other'],
    color: '#14b8a6',
  },
  {
    id: 'dropdown',
    icon: '▼',
    title: 'Dropdown',
    description: 'Selection dropdown',
    fieldType: 'DROPDOWNINPUT',
    type: 'text',
    groups: ['other'],
    color: '#f97316',
  },
];

// Generate unique field ID for each annotation
const generateFieldId = () => `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const filteredFields = computed(() => {
  let result = fields;

  // Filter by category
  if (activeCategory.value !== 'all') {
    result = result.filter((field) => field.groups.includes(activeCategory.value));
  }

  // Filter by search query
  if (filterQuery.value.trim()) {
    const query = filterQuery.value.toLowerCase();
    result = result.filter(
      (field) => field.title.toLowerCase().includes(query) || field.description.toLowerCase().includes(query),
    );
  }

  return result;
});

const closeSidebar = () => {
  emit('close');
};

const onDragStart = (event, field) => {
  const fieldId = generateFieldId();
  const dragData = {
    attributes: {
      type: field.type,
      fieldId,
      fieldType: field.fieldType,
      displayLabel: field.title,
      fieldColor: field.color,
    },
  };

  event.dataTransfer.setData('fieldAnnotation', JSON.stringify(dragData));
  event.dataTransfer.effectAllowed = 'copy';
  event.target.classList.add('is-dragging');
};

const onDragEnd = (event) => {
  event.target.classList.remove('is-dragging');
};
</script>

<template>
  <div class="dev-sidebar">
    <div class="dev-sidebar__header">
      <div class="dev-sidebar__title-row">
        <h3 class="dev-sidebar__title">Field Annotations</h3>
        <button class="dev-sidebar__close" type="button" aria-label="Close sidebar" @click="closeSidebar">×</button>
      </div>
    </div>

    <div class="dev-sidebar__body">
      <label class="dev-sidebar__label" for="field-filter">Filter fields</label>
      <input
        id="field-filter"
        v-model="filterQuery"
        class="dev-sidebar__input"
        type="text"
        placeholder="Search fields..."
      />

      <div class="field-tabs">
        <button
          v-for="category in categories"
          :key="category.id"
          class="field-tabs__tab"
          :class="{ 'field-tabs__tab--active': activeCategory === category.id }"
          type="button"
          @click="activeCategory = category.id"
        >
          {{ category.label }}
        </button>
      </div>

      <div class="field-list">
        <p v-if="filteredFields.length === 0" class="dev-sidebar__hint">No fields match your filter.</p>
        <div
          v-for="field in filteredFields"
          :key="field.id"
          class="field-tile"
          draggable="true"
          @dragstart="onDragStart($event, field)"
          @dragend="onDragEnd"
        >
          <span class="field-tile__icon" :style="{ backgroundColor: field.color }">{{ field.icon }}</span>
          <div class="field-tile__content">
            <span class="field-tile__title">{{ field.title }}</span>
            <span class="field-tile__description">{{ field.description }}</span>
          </div>
        </div>
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
  gap: 12px;
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

.dev-sidebar__hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.field-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.3);
  padding-bottom: 8px;
}

.field-tabs__tab {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.field-tabs__tab:hover {
  background: rgba(148, 163, 184, 0.15);
  color: #475569;
}

.field-tabs__tab--active {
  background: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}

.field-list {
  display: grid;
  gap: 8px;
}

.field-tile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  background: #ffffff;
  padding: 10px;
  cursor: grab;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease,
    transform 0.15s ease;
  user-select: none;
}

.field-tile:hover {
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.1);
}

.field-tile:active {
  cursor: grabbing;
}

.field-tile.is-dragging {
  opacity: 0.5;
  transform: scale(0.98);
}

.field-tile__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  font-size: 18px;
  color: #ffffff;
  flex-shrink: 0;
}

.field-tile__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.field-tile__title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.field-tile__description {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
