<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  headlessToolbarConstants,
  headlessToolbarHelpers,
  type HeadlessToolbarController,
  type ToolbarSnapshot,
} from 'superdoc/headless-toolbar';

const props = defineProps<{
  snapshot: ToolbarSnapshot;
  toolbarController: HeadlessToolbarController | null;
}>();

type LinkedStyleOption = ReturnType<typeof headlessToolbarHelpers.getQuickFormatList>[number];
type TableActionId =
  | 'table-add-row-before'
  | 'table-add-row-after'
  | 'table-delete-row'
  | 'table-add-column-before'
  | 'table-add-column-after'
  | 'table-delete-column'
  | 'table-delete'
  | 'table-merge-cells'
  | 'table-split-cell'
  | 'table-remove-borders'
  | 'table-fix';

const fontFamilyOptions = headlessToolbarConstants.DEFAULT_FONT_FAMILY_OPTIONS;
const fontSizeOptions = headlessToolbarConstants.DEFAULT_FONT_SIZE_OPTIONS;
const textAlignOptions = headlessToolbarConstants.DEFAULT_TEXT_ALIGN_OPTIONS;
const lineHeightOptions = headlessToolbarConstants.DEFAULT_LINE_HEIGHT_OPTIONS;
const zoomOptions = headlessToolbarConstants.DEFAULT_ZOOM_OPTIONS;
const documentModeOptions = headlessToolbarConstants.DEFAULT_DOCUMENT_MODE_OPTIONS;

const textColorOptions = [
  { label: 'Black', value: '#000000' },
  { label: 'Red', value: '#ff0000' },
  { label: 'Blue', value: '#0000ff' },
];
const highlightColorOptions = [
  { label: 'Yellow', value: '#ffff00' },
  { label: 'Green', value: '#00ff00' },
  { label: 'Cyan', value: '#00ffff' },
  { label: 'None', value: 'none' },
];
const tableActionOptions: Array<{ label: string; value: TableActionId }> = [
  { label: 'Row Above', value: 'table-add-row-before' },
  { label: 'Row Below', value: 'table-add-row-after' },
  { label: 'Delete Row', value: 'table-delete-row' },
  { label: 'Column Left', value: 'table-add-column-before' },
  { label: 'Column Right', value: 'table-add-column-after' },
  { label: 'Delete Column', value: 'table-delete-column' },
  { label: 'Delete Table', value: 'table-delete' },
  { label: 'Merge Cells', value: 'table-merge-cells' },
  { label: 'Split Cell', value: 'table-split-cell' },
  { label: 'Remove Borders', value: 'table-remove-borders' },
  { label: 'Fix Tables', value: 'table-fix' },
];

const isTableActionsOpen = ref(false);
const isLinkedStylesOpen = ref(false);
const isLinkOpen = ref(false);
const linkUrl = ref('');

const activeEditor = computed(() => {
  const context = props.snapshot.context;
  return context?.presentationEditor?.getActiveEditor?.() ?? context?.editor ?? null;
});

const linkedStyleOptions = computed(() => {
  const editor = activeEditor.value;
  return editor ? headlessToolbarHelpers.getQuickFormatList(editor) : [];
});

const selectedLinkedStyleId = computed(() => {
  const value = props.snapshot.commands['linked-style']?.value;
  return typeof value === 'string' ? value : null;
});

const linkedStyleLabel = computed(() => {
  const selectedStyle = linkedStyleOptions.value.find((style) => style.id === selectedLinkedStyleId.value);
  if (!selectedStyle || selectedStyle.id === 'Normal') return 'Format text';
  return selectedStyle.definition?.attrs?.name ?? 'Format text';
});

const currentLinkHref = computed(() => {
  const value = props.snapshot.commands.link?.value;
  return typeof value === 'string' ? value : '';
});

const insertImage = async () => {
  const editor = activeEditor.value;
  if (!editor) return;

  try {
    const open = headlessToolbarHelpers.getFileOpener();
    const result = await open();
    if (!result?.file) return;

    await headlessToolbarHelpers.processAndInsertImageFile({
      file: result.file,
      editor,
      view: editor.view,
      editorOptions: editor.options,
      getMaxContentSize: () => editor.getMaxContentSize(),
    });
  } catch (error) {
    console.error('[headless-toolbar demo] Image upload failed', error);
  }
};

const applyLink = () => {
  if (!linkUrl.value) return;

  props.toolbarController?.execute?.('link', { href: linkUrl.value });
  isLinkOpen.value = false;
};

const removeLink = () => {
  props.toolbarController?.execute?.('link', { href: null });
  isLinkOpen.value = false;
};

const toggleLinkMenu = () => {
  linkUrl.value = currentLinkHref.value;
  isLinkOpen.value = !isLinkOpen.value;
};

const applyLinkedStyle = (style: LinkedStyleOption) => {
  props.toolbarController?.execute?.('linked-style', style);
  isLinkedStylesOpen.value = false;
};

const runTableAction = (id: TableActionId) => {
  props.toolbarController?.execute?.(id);
  isTableActionsOpen.value = false;
};
</script>

<template>
  <div class="toolbar-floating">
    <div class="toolbar-row">
      <button
        class="toolbar-button"
        :class="{ 'toolbar-button-active': snapshot.commands.bold?.active }"
        :disabled="snapshot.commands.bold?.disabled"
        type="button"
        @click="toolbarController?.execute?.('bold')"
      >
        Bold
      </button>
      <button
        class="toolbar-button"
        :class="{ 'toolbar-button-active': snapshot.commands.italic?.active }"
        :disabled="snapshot.commands.italic?.disabled"
        type="button"
        @click="toolbarController?.execute?.('italic')"
      >
        Italic
      </button>
      <button
        class="toolbar-button"
        :class="{ 'toolbar-button-active': snapshot.commands.underline?.active }"
        :disabled="snapshot.commands.underline?.disabled"
        type="button"
        @click="toolbarController?.execute?.('underline')"
      >
        Underline
      </button>
      <button
        class="toolbar-button"
        :class="{ 'toolbar-button-active': snapshot.commands.strikethrough?.active }"
        :disabled="snapshot.commands.strikethrough?.disabled"
        type="button"
        @click="snapshot.context?.target?.commands?.toggleStrike?.()"
      >
        Strikethrough
      </button>
      <label class="toolbar-field">
        <span class="toolbar-field-label">Font family</span>
        <select
          class="toolbar-select"
          :disabled="snapshot.commands['font-family']?.disabled"
          :value="String(snapshot.commands['font-family']?.value ?? '')"
          @change="(event) => toolbarController?.execute?.('font-family', (event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in fontFamilyOptions" :key="option.value" :value="option.label">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="toolbar-field">
        <span class="toolbar-field-label">Font size</span>
        <select
          class="toolbar-select"
          :disabled="snapshot.commands['font-size']?.disabled"
          :value="String(snapshot.commands['font-size']?.value ?? '')"
          @change="(event) => toolbarController?.execute?.('font-size', (event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in fontSizeOptions" :key="option.value" :value="option.label">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="toolbar-field">
        <span class="toolbar-field-label">Text color</span>
        <select
          class="toolbar-select"
          :disabled="snapshot.commands['text-color']?.disabled"
          :value="String(snapshot.commands['text-color']?.value ?? '').toLowerCase()"
          @change="(event) => toolbarController?.execute?.('text-color', (event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in textColorOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="toolbar-field">
        <span class="toolbar-field-label">Highlight</span>
        <select
          class="toolbar-select"
          :disabled="snapshot.commands['highlight-color']?.disabled"
          :value="String(snapshot.commands['highlight-color']?.value ?? '').toLowerCase()"
          @change="(event) => toolbarController?.execute?.('highlight-color', (event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in highlightColorOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <div class="toolbar-dropdown">
        <button
          class="toolbar-button toolbar-button-compact"
          :class="{ 'toolbar-button-active': snapshot.commands.link?.active }"
          :disabled="snapshot.commands.link?.disabled"
          type="button"
          @click="toggleLinkMenu"
        >
          Link
        </button>
        <div v-if="isLinkOpen" class="toolbar-dropdown-menu toolbar-link-menu">
          <label class="toolbar-link-field">
            <span class="toolbar-field-label">URL</span>
            <input v-model="linkUrl" class="toolbar-link-input" type="text" placeholder="https://example.com" />
          </label>
          <div class="toolbar-link-actions">
            <button class="toolbar-button toolbar-button-compact" type="button" :disabled="!linkUrl" @click="applyLink">
              Apply
            </button>
            <button
              v-if="snapshot.commands.link?.active"
              class="toolbar-button toolbar-button-compact"
              type="button"
              @click="removeLink"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="toolbar-row toolbar-row-secondary">
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands['table-insert']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('table-insert', { rows: 3, cols: 3 })"
      >
        Table 3x3
      </button>
      <div class="toolbar-dropdown">
        <button
          class="toolbar-button toolbar-button-compact"
          :disabled="tableActionOptions.every((option) => snapshot.commands[option.value]?.disabled !== false)"
          type="button"
          @click="isTableActionsOpen = !isTableActionsOpen"
        >
          Table Actions
        </button>
        <div v-if="isTableActionsOpen" class="toolbar-dropdown-menu">
          <button
            v-for="option in tableActionOptions"
            :key="option.value"
            class="toolbar-dropdown-item"
            :disabled="snapshot.commands[option.value]?.disabled"
            type="button"
            @click="runTableAction(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <label class="toolbar-field">
        <span class="toolbar-field-label">Text align</span>
        <select
          class="toolbar-select"
          :disabled="snapshot.commands['text-align']?.disabled"
          :value="String(snapshot.commands['text-align']?.value ?? '')"
          @change="snapshot.context?.target?.commands?.setTextAlign?.((($event.target as HTMLSelectElement).value as 'left' | 'center' | 'right' | 'justify'))"
        >
          <option v-for="option in textAlignOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <button
        class="toolbar-button toolbar-button-compact"
        :class="{ 'toolbar-button-active': snapshot.commands['bullet-list']?.active }"
        :disabled="snapshot.commands['bullet-list']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('bullet-list')"
      >
        Bullet List
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :class="{ 'toolbar-button-active': snapshot.commands['numbered-list']?.active }"
        :disabled="snapshot.commands['numbered-list']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('numbered-list')"
      >
        Numbered List
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands['indent-increase']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('indent-increase')"
      >
        Indent +
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands['indent-decrease']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('indent-decrease')"
      >
        Indent -
      </button>
      <label class="toolbar-field">
        <span class="toolbar-field-label">Line height</span>
        <select
          class="toolbar-select"
          :disabled="snapshot.commands['line-height']?.disabled"
          :value="String(snapshot.commands['line-height']?.value ?? '')"
          @change="snapshot.context?.target?.commands?.setLineHeight?.(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="option in lineHeightOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <div class="toolbar-dropdown">
        <button
          class="toolbar-button toolbar-button-compact"
          :disabled="snapshot.commands['linked-style']?.disabled || linkedStyleOptions.length === 0"
          type="button"
          @click="isLinkedStylesOpen = !isLinkedStylesOpen"
        >
          {{ linkedStyleLabel }}
        </button>
        <div v-if="isLinkedStylesOpen" class="toolbar-dropdown-menu toolbar-dropdown-menu-wide">
          <button
            v-for="style in linkedStyleOptions"
            :key="style.id"
            class="toolbar-dropdown-item toolbar-dropdown-item-linked-style"
            :class="{ 'toolbar-dropdown-item-active': selectedLinkedStyleId === style.id }"
            type="button"
            @click="applyLinkedStyle(style)"
          >
            <span
              class="toolbar-linked-style-name"
              :style="headlessToolbarHelpers.generateLinkedStyleString(style, null, null, false)"
            >
              {{ style.definition?.attrs?.name ?? style.id }}
            </span>
          </button>
        </div>
      </div>
    </div>
    <div class="toolbar-row toolbar-row-secondary">
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands.undo?.disabled"
        type="button"
        @click="toolbarController?.execute?.('undo')"
      >
        Undo
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands.redo?.disabled"
        type="button"
        @click="toolbarController?.execute?.('redo')"
      >
        Redo
      </button>
      <label class="toolbar-field">
        <span class="toolbar-field-label">Zoom</span>
        <select
          class="toolbar-select"
          :disabled="snapshot.commands.zoom?.disabled"
          :value="String(snapshot.commands.zoom?.value ?? '')"
          @change="toolbarController?.execute?.('zoom', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="option in zoomOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <button
        class="toolbar-button toolbar-button-compact"
        :class="{ 'toolbar-button-active': snapshot.commands.ruler?.active }"
        :disabled="snapshot.commands.ruler?.disabled"
        type="button"
        @click="toolbarController?.execute?.('ruler')"
      >
        Ruler
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands['copy-format']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('copy-format')"
      >
        Copy Format
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands['track-changes-accept-selection']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('track-changes-accept-selection')"
      >
        Accept Change
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands['track-changes-reject-selection']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('track-changes-reject-selection')"
      >
        Reject Change
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands.image?.disabled"
        type="button"
        @click="insertImage"
      >
        Image
      </button>
      <button
        class="toolbar-button toolbar-button-compact"
        :disabled="snapshot.commands['clear-formatting']?.disabled"
        type="button"
        @click="toolbarController?.execute?.('clear-formatting')"
      >
        Clear Formatting
      </button>
      <label class="toolbar-field">
        <span class="toolbar-field-label">Document mode</span>
        <select
          class="toolbar-select"
          :disabled="snapshot.commands['document-mode']?.disabled"
          :value="String(snapshot.commands['document-mode']?.value ?? '')"
          @change="toolbarController?.execute?.('document-mode', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in documentModeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>
